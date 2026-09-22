/**
 * Révélation d'un repère d'interface (#1003, epic #992, ADR-143 §6-7).
 *
 * `montrer(id, { registre, adaptateur, mode })` vérifie les prérequis, révèle
 * le contrôle (l'adaptateur de l'app ouvre le panneau, sélectionne l'onglet,
 * attend le rendu) puis le met en évidence. Deux modes :
 *
 * - « dire » (défaut, conforme RGAA) : surbrillance + annonce `aria-live` du
 *   chemin (« Éléments › Au clic sur un élément › Comportement au clic »), le
 *   focus ne bouge PAS — s'il a bougé pendant la révélation, il est rendu à
 *   l'élément qui l'avait ;
 * - « guider » (choix explicite, mémorisé dans `TourState.reperageMode`) : fait
 *   défiler jusqu'au contrôle et y déplace le focus.
 *
 * Un prérequis manquant n'est jamais un refus : on montre le repère qui le lève,
 * avec le message du prérequis, et on rend la main (`raison: 'prerequis'`).
 * L'appelant rappelle `montrer(id)` quand l'état change (plan pas à pas, #1014).
 *
 * La surbrillance reprend les couleurs de `product-tour.ts` sans dépendre de
 * son voile. Aucune animation sous `prefers-reduced-motion`. Une seule région
 * `aria-live="polite"` par document.
 *
 * Côté app : exporté par `@dsfr-data/shared`, jamais par `@dsfr-data/shared/lib`
 * (frontière #319).
 */

import type { Prerequis, PrerequisParId, RegistreReperes, Repere } from './reperes-types.js';
import { getToursState } from './product-tour.js';
import { saveToStorage, STORAGE_KEYS } from '../storage/local-storage.js';

// ─── Contrat ───────────────────────────────────────────────────────────

/** Mode de révélation : voir l'en-tête du module. */
export type ModeReperage = 'dire' | 'guider';

/**
 * Ce que seule l'app sait faire pour révéler ses repères (#1005 carto, #1006
 * builder…). Le modèle ne produit jamais de sélecteur : il ne donne qu'un id.
 */
export interface AdaptateurReperage<Etat = unknown> {
  /**
   * Ouvre panneau / onglet / `<details>`, attend le re-rendu, résout
   * `[data-repere="<id>"]` (voir `selecteurRepere`) ; `null` si absent du DOM.
   */
  reveler(id: string): Promise<HTMLElement | null>;
  /** État courant de l'app, passé aux `verifier()` des prérequis. */
  etat(): Etat;
  /** Le `PREREQUIS` de l'app (`apps/<app>/src/assistant/prerequis.ts`). */
  prerequis: PrerequisParId<Etat>;
  /** Abonnement aux changements d'état (plan pas à pas, #1014) ; rend le désabonnement. */
  onEtatChange?(cb: () => void): () => void;
}

export interface OptionsMontrer<Etat = unknown> {
  /** Registre généré de l'app : le chemin et les prérequis en dépendent. */
  registre: RegistreReperes;
  adaptateur: AdaptateurReperage<Etat>;
  /** Mode de révélation ; par défaut, celui mémorisé (`getReperageMode()`). */
  mode?: ModeReperage;
  /** Document cible ; par défaut `document`. */
  racine?: Document;
}

export interface ResultatMontrer {
  ok: boolean;
  /** Le contrôle révélé, ou le repère qui lève si `raison === 'prerequis'`. */
  element: HTMLElement | null;
  /**
   * Libellés zone → contrôle du repère montré (le repère qui lève en cas de
   * prérequis), annoncés en `aria-live` joints par ` › `.
   */
  chemin: string[];
  /** `inconnu` : absent du registre ; `introuvable` : registre ok, DOM non. */
  raison?: 'inconnu' | 'introuvable' | 'prerequis';
  /** Id du prérequis manquant montré d'abord (raison `prerequis`). */
  prerequis?: string;
}

// ─── Constantes ────────────────────────────────────────────────────────

/** Séparateur du chemin annoncé. */
export const SEPARATEUR_CHEMIN = ' › ';
/** Id de la région live unique. */
export const ID_REGION_REPERAGE = 'dsfr-data-reperage-live';
/** Classe de surbrillance posée sur l'élément montré. */
export const CLASSE_REPERE_MONTRE = 'dsfr-data-repere--montre';
/** Classe d'animation : jamais posée sous `prefers-reduced-motion: reduce`. */
export const CLASSE_REPERE_ANIME = 'dsfr-data-repere--anime';
/** Durée de la surbrillance. */
export const DUREE_SURBRILLANCE_MS = 4000;

// ─── Préférence de mode (TourState) ────────────────────────────────────

/** Mode mémorisé dans `TourState.reperageMode` ; `dire` tant que l'usager n'a rien choisi. */
export function getReperageMode(): ModeReperage {
  return getToursState().reperageMode === 'guider' ? 'guider' : 'dire';
}

/** Mémorise le mode (synchronisé serveur avec le reste du `TourState`). */
export function setReperageMode(mode: ModeReperage): void {
  const state = getToursState();
  state.reperageMode = mode;
  saveToStorage(STORAGE_KEYS.TOURS, state);
}

// ─── Registre : fonctions pures ────────────────────────────────────────

const CARACTERES_SEGMENT = 'abcdefghijklmnopqrstuvwxyz0123456789-';

/**
 * Grammaire d'un identifiant de repère : au moins deux segments séparés par
 * des points, en minuscules, chiffres et tirets (le premier sans tiret).
 * Vérifiée caractère par caractère, sans expression régulière.
 */
export function estIdRepere(id: string): boolean {
  if (typeof id !== 'string' || id.length === 0 || id.length > 200) return false;
  const segments = id.split('.');
  if (segments.length < 2) return false;
  return segments.every((segment, i) => {
    if (segment.length === 0) return false;
    for (const c of segment) {
      if (!CARACTERES_SEGMENT.includes(c)) return false;
      if (i === 0 && c === '-') return false;
    }
    return true;
  });
}

/**
 * Sélecteur `[data-repere="<id>"]`, construit seulement après validation de la
 * grammaire (sinon erreur) : aucun id externe n'entre brut dans un sélecteur.
 */
export function selecteurRepere(id: string): string {
  if (!estIdRepere(id)) throw new Error(`Identifiant de repère invalide : ${JSON.stringify(id)}`);
  return `[data-repere="${id}"]`;
}

/** Index id → repère du registre. */
export function indexerReperes(registre: RegistreReperes): ReadonlyMap<string, Repere> {
  return new Map(registre.reperes.map((r) => [r.id, r]));
}

/**
 * Libellés zone → contrôle : les zones du registre dont l'id est un préfixe de
 * `id` (de la plus large à la plus proche), puis le repère lui-même. Vide si
 * `id` est absent du registre.
 */
export function chemin(registre: RegistreReperes, id: string): string[] {
  const index = indexerReperes(registre);
  if (!index.has(id)) return [];
  const segments = id.split('.');
  const libelles: string[] = [];
  for (let n = 2; n <= segments.length; n++) {
    const repere = index.get(segments.slice(0, n).join('.'));
    if (repere && (repere.genre === 'zone' || repere.id === id)) libelles.push(repere.libelle);
  }
  return libelles;
}

/**
 * Prérequis de `id` non remplis dans l'état courant de l'app, dans l'ordre du
 * registre. Un prérequis cité par le registre sans règle dans
 * `adaptateur.prerequis` est une erreur levée, jamais ignorée.
 */
export function prerequisManquants<Etat>(
  registre: RegistreReperes,
  adaptateur: AdaptateurReperage<Etat>,
  id: string
): { id: string; regle: Prerequis<Etat> }[] {
  const repere = indexerReperes(registre).get(id);
  if (!repere || repere.prerequis.length === 0) return [];
  const etat = adaptateur.etat();
  const manquants: { id: string; regle: Prerequis<Etat> }[] = [];
  for (const nom of repere.prerequis) {
    if (!Object.prototype.hasOwnProperty.call(adaptateur.prerequis, nom)) {
      throw new Error(`Prérequis « ${nom} » cité par le repère ${id} sans règle dans l'app.`);
    }
    const regle = adaptateur.prerequis[nom];
    if (!regle.verifier(etat)) manquants.push({ id: nom, regle });
  }
  return manquants;
}

// ─── Région live ───────────────────────────────────────────────────────

/** La région `aria-live="polite"` unique du document, créée à la demande. */
export function regionReperage(racine: Document = document): HTMLElement {
  const existante = racine.getElementById(ID_REGION_REPERAGE);
  if (existante) return existante;
  const region = racine.createElement('div');
  region.id = ID_REGION_REPERAGE;
  region.className = 'fr-sr-only';
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('aria-atomic', 'true');
  racine.body.appendChild(region);
  return region;
}

function imageSuivante(racine: Document): Promise<void> {
  const fenetre = racine.defaultView;
  return new Promise((resolve) => {
    if (fenetre && typeof fenetre.requestAnimationFrame === 'function') {
      fenetre.requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Annonce `texte` dans la région live (`textContent`, jamais de HTML). La
 * région est vidée puis remplie à l'image suivante : un même texte annoncé
 * deux fois de suite est relu par le lecteur d'écran.
 */
export async function annoncerReperage(texte: string, racine: Document = document): Promise<void> {
  const region = regionReperage(racine);
  region.textContent = '';
  await imageSuivante(racine);
  region.textContent = texte;
}

// ─── Mouvement et surbrillance ─────────────────────────────────────────

/** L'usager a-t-il demandé à réduire les animations ? */
export function mouvementReduit(racine: Document = document): boolean {
  const fenetre = racine.defaultView;
  if (!fenetre || typeof fenetre.matchMedia !== 'function') return false;
  return fenetre.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const documentsStyles = new WeakSet<Document>();

/**
 * Styles de la surbrillance, injectés une fois par document. Couleurs et
 * variables DSFR reprises de `injectTourStyles()` (bleu France du contour, voile
 * `rgba(0, 0, 0, 0.5)`, rayon 8px), sans dépendre de son voile.
 */
export function injectReperageStyles(racine: Document = document): void {
  if (documentsStyles.has(racine)) return;
  documentsStyles.add(racine);
  const style = racine.createElement('style');
  style.setAttribute('data-reperage', '');
  style.textContent = `
    .${CLASSE_REPERE_MONTRE} {
      outline: 3px solid var(--border-plain-blue-france, #000091);
      outline-offset: 4px;
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18), 0 0 0 4px var(--background-default-grey, #fff);
      position: relative;
      z-index: 1;
    }
    .${CLASSE_REPERE_MONTRE}.${CLASSE_REPERE_ANIME} {
      animation: dsfr-data-repere-pulsation 1.2s ease 2;
    }
    @keyframes dsfr-data-repere-pulsation {
      0%, 100% { outline-offset: 4px; }
      50% { outline-offset: 8px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .${CLASSE_REPERE_MONTRE},
      .${CLASSE_REPERE_MONTRE}.${CLASSE_REPERE_ANIME} {
        animation: none;
        transition: none;
      }
    }
  `;
  racine.head.appendChild(style);
}

let surbrillance: { element: HTMLElement; minuterie: ReturnType<typeof setTimeout> } | null = null;

/** Retire la surbrillance courante, s'il y en a une. */
export function effacerSurbrillance(): void {
  if (!surbrillance) return;
  clearTimeout(surbrillance.minuterie);
  surbrillance.element.classList.remove(CLASSE_REPERE_MONTRE, CLASSE_REPERE_ANIME);
  surbrillance = null;
}

function surligner(element: HTMLElement, racine: Document): void {
  effacerSurbrillance();
  injectReperageStyles(racine);
  element.classList.add(CLASSE_REPERE_MONTRE);
  if (!mouvementReduit(racine)) element.classList.add(CLASSE_REPERE_ANIME);
  const courante = {
    element,
    minuterie: setTimeout(() => {
      if (surbrillance === courante) effacerSurbrillance();
    }, DUREE_SURBRILLANCE_MS),
  };
  surbrillance = courante;
}

function rendreFocusable(element: HTMLElement): void {
  if (element.tabIndex >= 0 || element.hasAttribute('tabindex')) return;
  element.setAttribute('tabindex', '-1');
}

// ─── montrer() ─────────────────────────────────────────────────────────

/** Jeton : un `montrer` plus récent l'emporte sur une révélation encore en cours. */
let appel = 0;

/**
 * Montre le repère `id` : prérequis, révélation, mise en évidence, annonce.
 * Voir l'en-tête du module pour les deux modes et la séquence.
 */
export async function montrer<Etat>(
  id: string,
  opts: OptionsMontrer<Etat>
): Promise<ResultatMontrer> {
  const { registre, adaptateur } = opts;
  const racine = opts.racine ?? document;
  const mode = opts.mode ?? getReperageMode();
  const jeton = ++appel;
  effacerSurbrillance();

  // 1. Inconnu : pas dans le registre (ou hors grammaire) → rien ne touche au DOM.
  if (!estIdRepere(id) || !indexerReperes(registre).has(id)) {
    return { ok: false, element: null, chemin: [], raison: 'inconnu' };
  }

  // 2. Prérequis manquant → le repère qui le lève, avec le message du prérequis.
  const [manquant] = prerequisManquants(registre, adaptateur, id);
  const cible = manquant ? manquant.regle.repereQuiLeve : id;
  const cheminCible = chemin(registre, cible);

  const focusAvant = racine.activeElement;
  const element = estIdRepere(cible) ? await adaptateur.reveler(cible) : null;
  if (jeton !== appel) {
    // Un autre montrer() a pris la main pendant la révélation : ne rien afficher.
    return manquant
      ? { ok: false, element, chemin: cheminCible, raison: 'prerequis', prerequis: manquant.id }
      : element
        ? { ok: true, element, chemin: cheminCible }
        : { ok: false, element: null, chemin: cheminCible, raison: 'introuvable' };
  }

  if (element) {
    if (mode === 'guider') {
      if (typeof element.scrollIntoView === 'function') {
        element.scrollIntoView({
          block: 'center',
          behavior: mouvementReduit(racine) ? 'auto' : 'smooth',
        });
      }
      rendreFocusable(element);
      element.focus({ preventScroll: true });
    } else if (racine.activeElement !== focusAvant && focusAvant && focusAvant.isConnected) {
      // « Dire » : la révélation ne doit pas déplacer le focus de l'usager.
      (focusAvant as HTMLElement).focus?.({ preventScroll: true });
    }
    surligner(element, racine);
  }

  const texteChemin = cheminCible.join(SEPARATEUR_CHEMIN);
  if (manquant) {
    const message = manquant.regle.message;
    await annoncerReperage(element && texteChemin ? `${message} ${texteChemin}` : message, racine);
    return { ok: false, element, chemin: cheminCible, raison: 'prerequis', prerequis: manquant.id };
  }
  if (!element) {
    return { ok: false, element: null, chemin: cheminCible, raison: 'introuvable' };
  }
  await annoncerReperage(texteChemin, racine);
  return { ok: true, element, chemin: cheminCible };
}
