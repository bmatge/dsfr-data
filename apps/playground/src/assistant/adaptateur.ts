/**
 * Adaptateur de révélation du Playground (#1009, epic #992, ADR-143 §6).
 *
 * Deux sortes de repères, deux chemins :
 *
 * 1. **Repères d'interface** (registre généré, `reperes.generated.ts`) :
 *    `creerAdaptateurPlayground()` implémente `AdaptateurReperage` pour
 *    `montrer()`. Il ouvre le volet des exemples quand le repère y vit, rend
 *    le rendu `.CodeMirror` pour `playground.editeur.code` (le textarea
 *    d'origine est masqué par CodeMirror), et ne change JAMAIS le code ni
 *    l'exemple choisi.
 *
 * 2. **Repères de code** : un constat de balisage désigne un endroit du code
 *    édité, `{ ligne, tag, attribut? }` (`RepereCode`). Sérialisé en un
 *    identifiant de la grammaire commune, `playground.ligne.<n>.<balise>
 *    [.<attribut>]`, il passe par le même canal que les autres (bouton « Me
 *    montrer » du volet Diagnostic, `Constat.reperes`) sans être au registre :
 *    le code change à chaque frappe. `montrerCode()` y pose le curseur et une
 *    marque (la ligne, ou l'attribut s'il est nommé), puis fait défiler.
 *
 * Aucune expression régulière : identifiants et code sont lus caractère par
 * caractère (le code vient de l'usager).
 */
import { estIdRepere, selecteurRepere } from '@dsfr-data/shared';
import type { AdaptateurReperage } from '@dsfr-data/shared';
import type { CodeMirrorEditor, MarqueCode, PositionCode } from '../editor.js';

// ─── Repères de code ───────────────────────────────────────────────────

/** Un endroit du code édité, tel que le désigne un constat de balisage. */
export interface RepereCode {
  /** Ligne, 1 = première (celle du `<` de la balise). */
  ligne: number;
  /** Balise concernée : `dsfr-data-query`. */
  tag: string;
  /** Attribut visé, s'il y en a un : `source`. */
  attribut?: string;
}

/** Préfixe des identifiants de repères de code. */
export const PREFIXE_REPERE_CODE = 'playground.ligne';
/** Classe de la marque posée dans CodeMirror. */
export const CLASSE_MARQUE_CODE = 'pg-repere-code';

const CARACTERES_NOM = 'abcdefghijklmnopqrstuvwxyz0123456789-';

/** Un nom de balise ou d'attribut représentable dans un segment d'identifiant. */
function nomValide(nom: string | undefined): nom is string {
  if (!nom || nom.length > 80 || nom[0] === '-') return false;
  for (const c of nom) if (!CARACTERES_NOM.includes(c)) return false;
  return true;
}

function entierPositif(texte: string): number | null {
  if (texte.length === 0 || texte.length > 7 || texte[0] === '0') return null;
  for (const c of texte) if (c < '0' || c > '9') return null;
  return Number(texte);
}

/**
 * Identifiant d'un repère de code : `playground.ligne.12.dsfr-data-query.source`.
 * `null` si la ligne n'est pas un entier positif ou si la balise n'est pas
 * représentable (constat global, balise `-`). Un attribut non représentable
 * (caractères hors grammaire) est omis : la ligne reste désignée.
 */
export function repereCodeVersId(repere: RepereCode): string | null {
  if (!Number.isInteger(repere.ligne) || repere.ligne < 1 || repere.ligne > 9_999_999) return null;
  if (!nomValide(repere.tag)) return null;
  const base = `${PREFIXE_REPERE_CODE}.${repere.ligne}.${repere.tag}`;
  const id = nomValide(repere.attribut) ? `${base}.${repere.attribut}` : base;
  return estIdRepere(id) ? id : null;
}

/** Lecture inverse de `repereCodeVersId` ; `null` pour tout autre identifiant. */
export function lireRepereCode(id: string): RepereCode | null {
  if (typeof id !== 'string' || !id.startsWith(`${PREFIXE_REPERE_CODE}.`)) return null;
  if (!estIdRepere(id)) return null;
  const segments = id.split('.');
  if (segments.length !== 4 && segments.length !== 5) return null;
  const ligne = entierPositif(segments[2]);
  if (ligne === null || !nomValide(segments[3])) return null;
  if (segments.length === 5) {
    if (!nomValide(segments[4])) return null;
    return { ligne, tag: segments[3], attribut: segments[4] };
  }
  return { ligne, tag: segments[3] };
}

/** L'identifiant désigne-t-il un endroit du code (et non un contrôle) ? */
export function estRepereCode(id: string): boolean {
  return lireRepereCode(id) !== null;
}

/**
 * Premier index de `nom` (en minuscules) dans `texte` à partir de `depuis`,
 * sans tenir compte de la casse. Comparaison par tranche plutôt que
 * `texte.toLowerCase()` : certaines majuscules changent de longueur en
 * minuscule, et les index ne correspondraient plus au texte affiché.
 */
function indexSansCasse(texte: string, nom: string, depuis: number): number {
  for (let i = depuis; i + nom.length <= texte.length; i++) {
    if (texte.slice(i, i + nom.length).toLowerCase() === nom) return i;
  }
  return -1;
}

const estEspace = (c: string | undefined) =>
  c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';

/**
 * Plage de l'attribut `nom` sur la ligne `texte` : du début du nom à la fin de
 * sa valeur (guillemets compris) si elle tient sur la ligne. `null` si
 * l'attribut n'y est pas. Le nom doit être précédé d'un blanc et suivi d'un
 * `=`, d'un blanc, d'un `>` ou d'un `/` : `source` ne se trouve pas dans
 * `data-source` ni dans `sources`.
 */
export function plageAttribut(texte: string, nom: string): { debut: number; fin: number } | null {
  for (let i = indexSansCasse(texte, nom, 0); i !== -1; i = indexSansCasse(texte, nom, i + 1)) {
    if (i > 0 && !estEspace(texte[i - 1])) continue;
    let j = i + nom.length;
    const suivant = texte[j];
    if (suivant !== undefined && suivant !== '=' && suivant !== '>' && suivant !== '/') {
      if (!estEspace(suivant)) continue;
    }
    // Valeur : `= "…"`, `= '…'` ou `=nue`, si elle tient sur la ligne.
    let k = j;
    while (estEspace(texte[k])) k++;
    if (texte[k] === '=') {
      k++;
      while (estEspace(texte[k])) k++;
      const guillemet = texte[k];
      if (guillemet === '"' || guillemet === "'") {
        const ferme = texte.indexOf(guillemet, k + 1);
        j = ferme === -1 ? texte.length : ferme + 1;
      } else {
        while (k < texte.length && !estEspace(texte[k]) && texte[k] !== '>') k++;
        j = k;
      }
    }
    return { debut: i, fin: j };
  }
  return null;
}

/** Lignes parcourues après celle de la balise pour trouver un attribut (balise sur plusieurs lignes). */
const LIGNES_BALISE_MAX = 30;

/** Marque courante et abonnement « effacer au changement », par éditeur. */
const marques = new WeakMap<CodeMirrorEditor, MarqueCode | null>();
const abonnes = new WeakSet<CodeMirrorEditor>();

/** Retire la marque de repère de code posée dans cet éditeur, s'il y en a une. */
export function effacerMarqueCode(editor: CodeMirrorEditor): void {
  marques.get(editor)?.clear();
  marques.set(editor, null);
}

export interface ResultatMontrerCode {
  ok: boolean;
  /** Début et fin de la marque posée (positions CodeMirror, 0-based). */
  de?: PositionCode;
  a?: PositionCode;
  /** L'attribut demandé a-t-il été trouvé (sinon, c'est la ligne qui est marquée) ? */
  attributTrouve?: boolean;
}

/**
 * Montre un endroit du code : curseur au début, marque (l'attribut s'il est
 * nommé et trouvé sur la balise, sinon la ligne entière), défilement. La marque
 * précédente est retirée ; celle-ci l'est à la première modification du code.
 * Le focus n'est pas déplacé (mode « dire » par défaut, ADR-143 §7).
 */
export function montrerCode(editor: CodeMirrorEditor, repere: RepereCode): ResultatMontrerCode {
  effacerMarqueCode(editor);
  const total = editor.lineCount();
  if (!Number.isInteger(repere.ligne) || repere.ligne < 1 || repere.ligne > total) {
    return { ok: false };
  }
  const ligne = repere.ligne - 1;
  let de: PositionCode = { line: ligne, ch: 0 };
  let a: PositionCode = { line: ligne, ch: editor.getLine(ligne).length };
  let attributTrouve = false;

  if (repere.attribut) {
    const derniere = Math.min(total - 1, ligne + LIGNES_BALISE_MAX);
    for (let n = ligne; n <= derniere; n++) {
      const texte = editor.getLine(n);
      // Sur la ligne de la balise, on ne cherche qu'après son nom.
      const depart = n === ligne ? Math.max(0, indexSansCasse(texte, repere.tag, 0)) : 0;
      const plage = plageAttribut(texte.slice(depart), repere.attribut);
      if (plage) {
        de = { line: n, ch: depart + plage.debut };
        a = { line: n, ch: depart + plage.fin };
        attributTrouve = true;
        break;
      }
    }
  }

  if (!abonnes.has(editor)) {
    abonnes.add(editor);
    editor.on('change', () => effacerMarqueCode(editor));
  }
  marques.set(editor, editor.markText(de, a, { className: CLASSE_MARQUE_CODE }));
  editor.setCursor(de);
  editor.scrollIntoView(de, 80);
  return { ok: true, de, a, attributTrouve };
}

// ─── Repères d'interface ───────────────────────────────────────────────

/** État lu par les prérequis (le Playground n'en déclare aucun). */
export interface EtatPlayground {
  code: string;
}

export interface OptionsAdaptateurPlayground {
  /** Document cible ; par défaut `document`. */
  racine?: Document;
  /**
   * Ouvre le volet des exemples (`selecteur.basculer(true)`). Sans elle, un
   * clic sur la bascule quand le volet est fermé.
   */
  ouvrirVolet?: () => void;
}

/** Zone dont les repères vivent dans le volet des exemples. */
export const ZONE_VOLET = 'playground.exemples';
/** Repère de l'éditeur : le textarea d'origine, rendu par CodeMirror à côté. */
export const REPERE_EDITEUR = 'playground.editeur.code';

function imageSuivante(racine: Document): Promise<void> {
  const fenetre = racine.defaultView;
  return new Promise((resolve) => {
    if (fenetre && typeof fenetre.requestAnimationFrame === 'function') {
      fenetre.requestAnimationFrame(() => resolve());
    } else setTimeout(resolve, 0);
  });
}

/** Contrôle (`data-repere`) ou zone (`data-zone`) qui porte `id`. */
function trouver(racine: Document, id: string): HTMLElement | null {
  const controle = racine.querySelector<HTMLElement>(selecteurRepere(id));
  if (controle) return controle;
  for (const el of racine.querySelectorAll<HTMLElement>('[data-zone]')) {
    if (el.getAttribute('data-zone') === id) return el;
  }
  return null;
}

/** Affiché : ni `hidden`, ni `inert`, ni `display: none` en ligne, sur lui ou un ancêtre. */
export function estAffiche(el: HTMLElement): boolean {
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    if (n.hidden || n.hasAttribute('inert') || n.style.display === 'none') return false;
  }
  return true;
}

/**
 * L'adaptateur du Playground pour `montrer()`. Un repère de code passé ici est
 * montré par `montrerCode()` et rend le rendu de l'éditeur.
 */
export function creerAdaptateurPlayground(
  editor: CodeMirrorEditor,
  options: OptionsAdaptateurPlayground = {}
): AdaptateurReperage<EtatPlayground> {
  const racine = options.racine ?? document;
  return {
    async reveler(id: string): Promise<HTMLElement | null> {
      const code = lireRepereCode(id);
      if (code) return montrerCode(editor, code).ok ? editor.getWrapperElement() : null;
      if (!estIdRepere(id)) return null;

      if (id === ZONE_VOLET || id.startsWith(`${ZONE_VOLET}.`)) {
        const volet = racine.querySelector<HTMLElement>(`[data-zone="${ZONE_VOLET}"]`);
        if (volet?.hasAttribute('inert')) {
          if (options.ouvrirVolet) options.ouvrirVolet();
          else racine.getElementById('volet-btn')?.click();
          await imageSuivante(racine);
        }
      }
      // Le textarea d'origine est masqué : c'est le rendu de CodeMirror qu'on montre.
      if (id === REPERE_EDITEUR) return editor.getWrapperElement();

      const element = trouver(racine, id);
      return element && estAffiche(element) ? element : null;
    },

    etat: () => ({ code: editor.getValue() }),

    prerequis: {},

    onEtatChange(cb: () => void): () => void {
      let actif = true;
      editor.on('change', () => {
        if (actif) cb();
      });
      // CodeMirror 5 : `off` exige la même fonction ; un drapeau suffit ici.
      return () => {
        actif = false;
      };
    },
  };
}
