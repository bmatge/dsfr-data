/**
 * Correspondance locale entre une question et le CODE du Playground (#1105,
 * ADR-143 §6).
 *
 * « Comment changer la limite de 15 ? », « où est la ligne pour changer la
 * couleur ? » : la réponse est une ligne du code édité, pas un réglage de
 * l'interface. Le registre (`trouverRepere`) n'en sait rien ; ce module relit
 * le code courant et désigne les lignes dont une balise `dsfr-data-*`, un nom
 * d'attribut ou une valeur correspond à la question — sans modèle.
 *
 * Trois usages, tous branchés par `index.ts` sur `mountAssistant` :
 *
 * - `correspondanceCode()` : la correspondance locale, consultée avant Albert ;
 * - `libelleRepereCode()` : le filtre d'un repère de code cité par le modèle
 *   (la ligne existe et porte cette balise, et l'attribut s'il est nommé) ;
 * - `planDuCode()` : le plan compact du code que reçoit Albert en secours.
 *
 * Sécurité : la question et le code sont des entrées externes. Aucune
 * expression régulière ne leur est appliquée : la question est découpée en
 * mots caractère par caractère, le code est lu par `lireBalises` (linéaire) et
 * `plageAttribut`. Rien n'est rendu en HTML : les textes partent en
 * `textContent` dans le panneau.
 */
import { lireBalises, normalize, type CandidatAssistant } from '@dsfr-data/shared';
import { lireRepereCode, plageAttribut, repereCodeVersId } from './adaptateur.js';

// ─── Lecture du code ───────────────────────────────────────────────────

/** Une balise `dsfr-data-*` du code, ou l'un de ses attributs, et sa ligne. */
export interface OccurrenceCode {
  /** Ligne où c'est écrit (1 = première) : celle de l'attribut s'il est sur une autre. */
  ligne: number;
  /** Ligne du `<` de la balise : celle du repère de code. */
  ligneBalise: number;
  tag: string;
  /** Absent : la balise elle-même. */
  attribut?: string;
  valeur?: string;
}

/** Lignes parcourues après celle de la balise pour trouver un attribut (comme `montrerCode`). */
const LIGNES_BALISE_MAX = 30;

/**
 * Lignes du code, comme CodeMirror les découpe : `\r\n`, `\n` et `\r` seul
 * terminent chacun une ligne. `debuts[n]` : index du premier caractère de la
 * ligne n+1.
 */
function decouperLignes(code: string): { lignes: string[]; debuts: number[] } {
  const lignes: string[] = [];
  const debuts: number[] = [0];
  let debut = 0;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c !== '\n' && c !== '\r') continue;
    lignes.push(code.slice(debut, i));
    if (c === '\r' && code[i + 1] === '\n') i++;
    debut = i + 1;
    debuts.push(debut);
  }
  lignes.push(code.slice(debut));
  return { lignes, debuts };
}

/** Ligne (1 = première) de l'index `offset`, par dichotomie. */
function ligneDe(debuts: readonly number[], offset: number): number {
  let bas = 0;
  let haut = debuts.length - 1;
  while (bas < haut) {
    const milieu = (bas + haut + 1) >> 1;
    if (debuts[milieu] <= offset) bas = milieu;
    else haut = milieu - 1;
  }
  return bas + 1;
}

/** Index de `tag` sur la ligne, sans tenir compte de la casse, ou 0. */
function apresTag(texte: string, tag: string): number {
  for (let i = 0; i + tag.length <= texte.length; i++) {
    if (texte.slice(i, i + tag.length).toLowerCase() === tag) return i;
  }
  return 0;
}

/** Les balises `dsfr-data-*` du code et leurs attributs, chacun avec sa ligne. */
export function lireCode(code: string): OccurrenceCode[] {
  if (typeof code !== 'string' || !code.trim()) return [];
  const { lignes, debuts } = decouperLignes(code);
  const out: OccurrenceCode[] = [];
  for (const balise of lireBalises(code)) {
    const ligneBalise = ligneDe(debuts, balise.offset);
    out.push({ ligne: ligneBalise, ligneBalise, tag: balise.tag });
    for (const [attribut, valeur] of Object.entries(balise.attrs)) {
      let ligne = ligneBalise;
      const derniere = Math.min(lignes.length, ligneBalise + LIGNES_BALISE_MAX);
      for (let n = ligneBalise; n <= derniere; n++) {
        const texte = lignes[n - 1];
        const depart = n === ligneBalise ? apresTag(texte, balise.tag) : 0;
        if (plageAttribut(texte.slice(depart), attribut)) {
          ligne = n;
          break;
        }
      }
      out.push({ ligne, ligneBalise, tag: balise.tag, attribut, valeur });
    }
  }
  return out;
}

// ─── Mots de la question ───────────────────────────────────────────────

/** Caractère d'un mot : lettre ASCII, chiffre ou tiret (après `normalize`). */
function estCaractereMot(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c === '-';
}

/** Mots de la question, en minuscules et sans accents. Au plus 60 mots. */
export function motsDe(question: string): string[] {
  const texte = normalize(String(question).slice(0, 500));
  const mots: string[] = [];
  let courant = '';
  const pousser = (): void => {
    let mot = courant;
    while (mot.startsWith('-')) mot = mot.slice(1);
    while (mot.endsWith('-')) mot = mot.slice(0, -1);
    if (mot) mots.push(mot);
    courant = '';
  };
  for (const c of texte) {
    if (estCaractereMot(c)) courant += c;
    else pousser();
    if (mots.length >= 60) break;
  }
  pousser();
  return mots.slice(0, 60);
}

/** Le mot, et sa forme au singulier (« couleurs » → « couleur »). */
function formes(mot: string): string[] {
  return mot.length > 3 && (mot.endsWith('s') || mot.endsWith('x'))
    ? [mot, mot.slice(0, -1)]
    : [mot];
}

/**
 * Mots français → attributs réels des composants (`packages/core/custom-elements.json`).
 * Clés en minuscules sans accents, au singulier.
 */
export const SYNONYMES_ATTRIBUTS: Readonly<Record<string, readonly string[]>> = {
  couleur: [
    'color',
    'couleur',
    'color-field',
    'color-map',
    'color-token',
    'selected-palette',
    'tint',
    'fill',
    'fill-field',
  ],
  palette: ['selected-palette', 'color-map', 'color'],
  teinte: ['tint', 'color', 'selected-palette'],
  limite: ['limit', 'max-items', 'max-records', 'max-values', 'page-size'],
  limiter: ['limit', 'max-items', 'max-records', 'max-values', 'page-size'],
  maximum: ['limit', 'max-items', 'max-records', 'max-values'],
  titre: ['heading', 'label', 'databox-title', 'caption', 'title-field'],
  intitule: ['heading', 'label', 'caption'],
  'sous-titre': ['subtitle', 'subtitle-field'],
  libelle: ['label', 'labels', 'label-field', 'count-label'],
  source: ['source', 'sources', 'dataset-id', 'api-type', 'url', 'resource', 'base-url'],
  donnee: ['source', 'dataset-id', 'api-type', 'url', 'resource'],
  jeu: ['dataset-id', 'resource'],
  dataset: ['dataset-id'],
  api: ['api-type', 'url', 'base-url'],
  filtre: ['where', 'filter', 'filters'],
  filtrer: ['where', 'filter', 'filters'],
  condition: ['where'],
  tri: ['order-by', 'sort', 'tri', 'server-sort'],
  trier: ['order-by', 'sort', 'tri'],
  ordre: ['order-by', 'sort', 'column-order'],
  regrouper: ['group-by'],
  regroupement: ['group-by'],
  grouper: ['group-by'],
  agregation: ['aggregate', 'group-by'],
  hauteur: ['height'],
  largeur: ['width'],
  unite: ['unit', 'value-unit', 'radius-unit'],
  champ: ['field', 'fields', 'label-field', 'value-field', 'geo-field'],
  colonne: ['columns', 'column', 'cols', 'colonnes', 'column-order'],
  valeur: ['value', 'value-field', 'valeur'],
  format: ['format', 'column-format', 'var-format'],
  zoom: ['zoom', 'min-zoom', 'max-zoom'],
  centre: ['center'],
  pagination: ['pagination', 'page-size', 'paginate'],
  type: ['type'],
};

/** Mots français → balises (le nom court, `chart`, est reconnu aussi). */
export const SYNONYMES_BALISES: Readonly<Record<string, readonly string[]>> = {
  graphique: ['dsfr-data-chart'],
  diagramme: ['dsfr-data-chart'],
  carte: ['dsfr-data-map'],
  couche: ['dsfr-data-map-layer'],
  tableau: ['dsfr-data-list'],
  liste: ['dsfr-data-list'],
  indicateur: ['dsfr-data-kpi'],
  kpi: ['dsfr-data-kpi'],
  requete: ['dsfr-data-query'],
  recherche: ['dsfr-data-search'],
  facette: ['dsfr-data-facets'],
  jointure: ['dsfr-data-join'],
};

/**
 * Mots qui ne désignent aucune valeur : une valeur `de` ou `ligne` écrite dans
 * le code ne doit pas répondre à « où est la ligne de … ».
 */
const MOTS_VIDES: ReadonlySet<string> = new Set([
  'les',
  'des',
  'une',
  'pour',
  'par',
  'sur',
  'dans',
  'avec',
  'sans',
  'est',
  'sont',
  'que',
  'qui',
  'quoi',
  'quel',
  'quelle',
  'comment',
  'changer',
  'modifier',
  'mettre',
  'faut',
  'faire',
  'ligne',
  'code',
  'html',
  'balise',
  'attribut',
  'valeur',
  'trouve',
  'trouver',
  'aller',
  'montre',
  'montrer',
  'moi',
  'voir',
  'cette',
  'cet',
  'ces',
  'mon',
  'mes',
  'son',
  'ses',
  'aux',
  'the',
]);

// ─── Correspondance ────────────────────────────────────────────────────

/** Candidats proposés au plus. */
export const MAX_CANDIDATS_CODE = 5;
/** Longueur au plus d'une valeur citée dans un libellé ou dans le plan. */
const VALEUR_MAX = 40;

function court(valeur: string, max = VALEUR_MAX): string {
  return valeur.length > max ? `${valeur.slice(0, max - 1)}…` : valeur;
}

/** « Ligne 12 : limit="15" (dsfr-data-source) », ou « Ligne 3 : <dsfr-data-chart> ». */
export function libelleOccurrence(o: OccurrenceCode): string {
  if (o.attribut === undefined) return `Ligne ${o.ligne} : <${o.tag}>`;
  const valeur = o.valeur ? `="${court(o.valeur)}"` : '';
  return `Ligne ${o.ligne} : ${o.attribut}${valeur} (${o.tag})`;
}

interface Signaux {
  /** Attributs nommés, directement ou par synonyme. */
  attributs: Set<string>;
  /** Balises nommées. */
  balises: Set<string>;
  /** Mots qui peuvent être une valeur citée (nombres, mots de 3 lettres et plus). */
  valeurs: Set<string>;
}

function signauxDe(question: string): Signaux {
  const s: Signaux = { attributs: new Set(), balises: new Set(), valeurs: new Set() };
  for (const mot of motsDe(question)) {
    const chiffres = mot.length > 0 && [...mot].every((c) => c >= '0' && c <= '9');
    if (chiffres || (mot.length >= 3 && !MOTS_VIDES.has(mot))) s.valeurs.add(mot);
    for (const forme of formes(mot)) {
      // Le nom même d'un attribut (`limit`, `order-by`) ou d'une balise ; pas
      // un mot vide : « on » est aussi un attribut.
      if (forme.length >= 3 && !MOTS_VIDES.has(forme)) {
        s.attributs.add(forme);
        s.balises.add(forme.startsWith('dsfr-data-') ? forme : `dsfr-data-${forme}`);
      }
      for (const a of SYNONYMES_ATTRIBUTS[forme] ?? []) s.attributs.add(a);
      for (const b of SYNONYMES_BALISES[forme] ?? []) s.balises.add(b);
    }
  }
  return s;
}

/** Score d'une occurrence : attribut nommé 2, valeur citée 3, balise nommée +1. */
function scoreDe(o: OccurrenceCode, s: Signaux): number {
  const balise = s.balises.has(o.tag);
  if (o.attribut === undefined) return balise ? 1 : 0;
  let score = 0;
  if (s.attributs.has(o.attribut)) score += 2;
  const valeur = normalize(o.valeur ?? '').trim();
  if (valeur && s.valeurs.has(valeur)) score += 3;
  return score > 0 && balise ? score + 1 : score;
}

/** Candidat de l'assistant pour une occurrence ; `null` si l'id n'est pas représentable. */
function candidatDe(o: OccurrenceCode): CandidatAssistant | null {
  const id = repereCodeVersId({ ligne: o.ligneBalise, tag: o.tag, attribut: o.attribut });
  if (!id) return null;
  const libelle = libelleOccurrence(o);
  return { id, libelle, chemin: ['Éditeur de code', libelle] };
}

export interface ResultatCorrespondanceCode {
  candidats: CandidatAssistant[];
  texte: string;
}

/**
 * Lignes du code qui répondent à la question : celles du meilleur score
 * (au plus `MAX_CANDIDATS_CODE`), dans l'ordre du code. `null` si rien ne
 * correspond.
 */
export function correspondanceCode(
  question: string,
  code: string
): ResultatCorrespondanceCode | null {
  const occurrences = lireCode(code);
  if (occurrences.length === 0) return null;
  const s = signauxDe(question);
  let meilleur = 0;
  const notees = occurrences.map((o) => {
    const score = scoreDe(o, s);
    if (score > meilleur) meilleur = score;
    return { o, score };
  });
  if (meilleur === 0) return null;

  const candidats: CandidatAssistant[] = [];
  const vus = new Set<string>();
  for (const { o, score } of notees) {
    if (score !== meilleur) continue;
    const c = candidatDe(o);
    if (!c || vus.has(c.id)) continue;
    vus.add(c.id);
    candidats.push(c);
    if (candidats.length >= MAX_CANDIDATS_CODE) break;
  }
  if (candidats.length === 0) return null;
  const texte =
    candidats.length === 1
      ? `${candidats[0].libelle}.`
      : 'Plusieurs lignes du code peuvent correspondre. Choisissez celle à montrer.';
  return { candidats, texte };
}

// ─── Validation d'un repère de code venu du modèle ─────────────────────

/**
 * Libellé d'un repère de code s'il désigne le code COURANT : la ligne existe,
 * une balise de ce nom y commence, et l'attribut nommé y est écrit.
 * « Ligne 12 — dsfr-data-source (limit) ». Sinon `null` : l'id est refusé.
 */
export function libelleRepereCode(id: string, code: string): string | null {
  const repere = lireRepereCode(id);
  if (!repere) return null;
  const occurrences = lireCode(code);
  const balise = occurrences.find(
    (o) => o.attribut === undefined && o.ligneBalise === repere.ligne && o.tag === repere.tag
  );
  if (!balise) return null;
  if (repere.attribut === undefined) return `Ligne ${repere.ligne} — ${repere.tag}`;
  const attribut = occurrences.find(
    (o) => o.ligneBalise === repere.ligne && o.tag === repere.tag && o.attribut === repere.attribut
  );
  return attribut ? `Ligne ${attribut.ligne} — ${repere.tag} (${repere.attribut})` : null;
}

// ─── Plan du code pour le modèle ───────────────────────────────────────

/** Balises décrites au plus dans le plan envoyé au modèle. */
export const MAX_LIGNES_PLAN = 60;
/** Longueur au plus d'une ligne du plan. */
const LIGNE_PLAN_MAX = 240;

/** Attributs dont la valeur ne sort jamais : elle peut porter un secret. */
function estSensible(attribut: string): boolean {
  return (
    attribut === 'headers' ||
    attribut.includes('token') ||
    attribut.includes('secret') ||
    attribut.includes('password') ||
    (attribut.includes('key') && attribut !== 'key-field' && attribut !== 'api-key-ref')
  );
}

export interface PlanCode {
  texte: string;
  reperes: string[];
}

/**
 * Plan compact du code pour le prompt d'Albert : une ligne par balise
 * (au plus `MAX_LIGNES_PLAN`), avec son numéro de ligne, ses attributs aux
 * valeurs raccourcies, et l'identifiant de son repère de code. Les repères
 * rendus (balise et chaque attribut) forment l'enum de l'outil `montrer`.
 * `null` sans balise `dsfr-data-*`.
 */
export function planDuCode(code: string): PlanCode | null {
  const occurrences = lireCode(code);
  const balises = occurrences.filter((o) => o.attribut === undefined).slice(0, MAX_LIGNES_PLAN);
  if (balises.length === 0) return null;
  const lignes: string[] = [
    'Code de l’éditeur (ligne, balise, attributs — identifiant du repère de code) :',
  ];
  const reperes: string[] = [];
  for (const b of balises) {
    const id = repereCodeVersId({ ligne: b.ligneBalise, tag: b.tag });
    if (!id) continue;
    reperes.push(id);
    const attributs = occurrences.filter(
      (o) => o.attribut !== undefined && o.ligneBalise === b.ligneBalise && o.tag === b.tag
    );
    const decrits: string[] = [];
    for (const a of attributs) {
      const nom = a.attribut ?? '';
      const idAttribut = repereCodeVersId({ ligne: a.ligneBalise, tag: a.tag, attribut: nom });
      if (idAttribut) reperes.push(idAttribut);
      const valeur = estSensible(nom) ? '***' : court(a.valeur ?? '', 30);
      decrits.push(valeur ? `${nom}="${valeur}"` : nom);
    }
    const ligne = `- L${b.ligne} <${b.tag}> ${decrits.join(' ')}`.trimEnd();
    lignes.push(`${court(ligne, LIGNE_PLAN_MAX)} — ${id}`);
  }
  const total = occurrences.filter((o) => o.attribut === undefined).length;
  if (total > balises.length)
    lignes.push(`(${total - balises.length} balises de plus, non listées)`);
  const exemple = reperes.find((r) => r.split('.').length === 5) ?? reperes[0];
  lignes.push(
    'Pour désigner une ligne du code, passe son identifiant à montrer ; pour viser un ' +
      `attribut, ajoute « .<attribut> » à l’identifiant (par exemple ${exemple}).`
  );
  return { texte: lignes.join('\n'), reperes };
}
