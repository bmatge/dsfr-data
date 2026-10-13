/**
 * Cadre officiel (`databox`) de `dsfr-data-chart` — ce qui se DECIDE avant de
 * relayer un attribut au `<data-box>` de DSFR Chart (#1289).
 *
 * Module pur pour ses trois premieres fonctions (aucun DOM) : la decision se
 * teste sans navigateur, le rendu reel se mesure dans
 * `e2e/chart-cadre-html.spec.ts`, sur le vrai DSFR Chart.
 *
 * Quatre defauts mesures dans un navigateur (DSFR Chart 2.1.1) :
 *   1. `modal-content` est pose par `innerHTML`, et la fenetre est rendue des
 *      l'affichage du cadre : un `<img onerror>` s'executait sans aucun clic.
 *      Meme puits pour l'unite des infobulles (`unit-tooltip`), au survol.
 *   2. `actions` passe par `JSON.parse` puis par `libelle.normalize()` : un
 *      JSON mal forme, un tableau qui porte un nombre ou `null`, un objet —
 *      et le cadre ENTIER disparait, sans message.
 *   3. `default-source` et `fullscreen` seul ne rendent rien.
 *   4. Le menu, l'infobulle et la fenetre ne s'ouvrent qu'avec le JavaScript
 *      du DSFR.
 */
import { nettoyerGabarit } from '@dsfr-data/shared/lib';

// ---------------------------------------------------------------------------
// 1. HTML relaye a un puits `innerHTML` de DSFR Chart
// ---------------------------------------------------------------------------

/**
 * HTML simple garde, contenu actif retire (`nettoyerGabarit`, le filtre du
 * Studio — un seul nettoyeur dans le depot). `retire` dit si quelque chose a
 * ete enleve : le composant le signale, il ne le tait pas.
 */
export function nettoyerHtmlRelaye(valeur: string): { html: string; retire: boolean } {
  const html = nettoyerGabarit(valeur);
  return { html, retire: html !== valeur };
}

// ---------------------------------------------------------------------------
// 2. `databox-actions`
// ---------------------------------------------------------------------------

export interface DataboxActionsPlan {
  /** Libelles relayes au cadre (les entrees valides, dans l'ordre). */
  actions: string[];
  /** Erreur de configuration lisible, ou `null`. */
  error: string | null;
}

const EXEMPLE_ACTIONS = `'["Source officielle","Méthode"]'`;

function abreger(texte: string): string {
  return texte.length > 60 ? `${texte.slice(0, 57)}…` : texte;
}

function nature(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'un tableau';
  if (typeof v === 'string') return v.trim() === '' ? 'une chaîne vide' : 'une chaîne';
  if (typeof v === 'number') return 'un nombre';
  if (typeof v === 'boolean') return 'un booléen';
  return 'un objet';
}

/**
 * Valide `databox-actions` avant de le relayer. Forme attendue par DSFR Chart :
 * un TABLEAU JSON de libelles (chaines). Tout le reste y leve une exception qui
 * emporte le cadre ; une chaine JSON, elle, y est lue lettre par lettre.
 *
 * Les entrees valides sont gardees, les fautives ecartees et nommees par leur
 * rang (a partir de 1) : le cadre reste affiche dans tous les cas.
 */
export function parseDataboxActions(raw: string): DataboxActionsPlan {
  const texte = raw.trim();
  if (!texte) return { actions: [], error: null };

  let lu: unknown;
  try {
    lu = JSON.parse(texte);
  } catch {
    return {
      actions: [],
      error:
        `databox-actions="${abreger(texte)}" : JSON invalide — attendu un tableau JSON de ` +
        `libellés, ex. ${EXEMPLE_ACTIONS}. Aucune action n'est affichée.`,
    };
  }
  if (!Array.isArray(lu)) {
    return {
      actions: [],
      error:
        `databox-actions="${abreger(texte)}" : attendu un tableau JSON de libellés, ex. ` +
        `${EXEMPLE_ACTIONS} (reçu : ${nature(lu)}). Aucune action n'est affichée.`,
    };
  }

  const actions: string[] = [];
  const fautives: string[] = [];
  lu.forEach((entree, i) => {
    if (typeof entree === 'string' && entree.trim() !== '') actions.push(entree);
    else fautives.push(`${i + 1} (${nature(entree)})`);
  });
  if (fautives.length === 0) return { actions, error: null };
  return {
    actions,
    error:
      `databox-actions : entrée${fautives.length > 1 ? 's' : ''} ${fautives.join(', ')} ` +
      `écartée${fautives.length > 1 ? 's' : ''} — chaque action est un libellé (chaîne non vide), ` +
      `ex. ${EXEMPLE_ACTIONS}.`,
  };
}

// ---------------------------------------------------------------------------
// 3. Attributs sans effet
// ---------------------------------------------------------------------------

export interface DataboxState {
  fullscreen: boolean;
  modalTitle: string;
  modalContent: string;
  defaultSource: string;
}

export interface DataboxWarning {
  /** Attribut en cause. */
  attr: string;
  message: string;
}

/**
 * Attributs du cadre qui ne peuvent PAS agir, avec ce qui leur manque. Regle
 * des bornes d'axe (#1280) : jamais ignore en silence.
 */
export function databoxInertAttributes(s: DataboxState): DataboxWarning[] {
  const out: DataboxWarning[] = [];
  if (s.defaultSource.trim()) {
    out.push({
      attr: 'databox-default-source',
      message:
        'databox-default-source est sans effet : dsfr-data-chart ne déclare au cadre ' +
        "qu'une source, aucun sélecteur de source n'est affiché. Retirer l'attribut.",
    });
  }
  const titre = s.modalTitle.trim() !== '';
  if (s.fullscreen && !titre) {
    out.push({
      attr: 'databox-fullscreen',
      message:
        'databox-fullscreen est sans effet sans databox-modal-title : le bouton ' +
        "n'apparaît qu'avec un titre de fenêtre, et il ouvre cette fenêtre " +
        "(le graphique n'est pas agrandi).",
    });
  }
  if (titre && !s.fullscreen) {
    out.push({
      attr: 'databox-modal-title',
      message:
        'databox-modal-title est sans effet sans databox-fullscreen : la fenêtre ' +
        "d'information et le bouton qui l'ouvre n'existent qu'avec les deux attributs.",
    });
  }
  if (s.modalContent.trim() && !titre) {
    out.push({
      attr: 'databox-modal-content',
      message:
        'databox-modal-content est sans effet sans databox-modal-title et ' +
        "databox-fullscreen : la fenêtre d'information n'existe qu'avec un titre.",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4. JavaScript du DSFR
// ---------------------------------------------------------------------------

/**
 * Le JavaScript du DSFR est-il charge ? `dsfr.module.min.js` (comme
 * `dsfr.nomodule.min.js`) pose `window.dsfr`, une FONCTION (`dsfr(element)`,
 * `dsfr.start()`, `dsfr.version`). Avant lui, une page peut y avoir range un
 * simple objet de configuration (`window.dsfr = { mode: 'manual' }`) : seul le
 * type `function` prouve que le script a tourne. Mesure sur DSFR 1.15.
 */
export function dsfrJsCharge(): boolean {
  return typeof window !== 'undefined' && typeof (window as { dsfr?: unknown }).dsfr === 'function';
}

/** Delai laisse a un script charge tard, apres l'evenement `load`. */
export const DELAI_VERIFICATION_JS_DSFR_MS = 2000;

/** Un seul avertissement par page : une page a un cadre en a souvent dix. */
let etatVerification: 'repos' | 'attente' | 'faite' = 'repos';

/**
 * Programme, UNE fois par page, la verification de la presence du JavaScript
 * du DSFR, puis avertit s'il manque.
 *
 * Jamais a chaud : un `<script type="module">` s'execute APRES l'analyse du
 * document, donc apres un composant charge en UMD, et une page peut injecter
 * le script plus tard encore. La verification attend l'evenement `load`
 * (scripts differes, modules et `async` ont tourne), puis un delai de grace.
 */
export function surveillerJsDsfr(el: HTMLElement, etiquette: string): void {
  if (etatVerification !== 'repos' || typeof window === 'undefined') return;
  etatVerification = 'attente';
  const verifier = () => {
    setTimeout(() => {
      // Composant retire entre-temps (ou page de test demontee) : rien a dire,
      // et le prochain cadre relancera la verification.
      if (!el.isConnected) {
        etatVerification = 'repos';
        return;
      }
      etatVerification = 'faite';
      if (dsfrJsCharge()) return;
      console.warn(
        `${etiquette}: le cadre officiel (databox) est affiché, mais le JavaScript du DSFR ` +
          "n'est pas chargé : le menu « Plus d'actions » (téléchargement CSV, capture, actions), " +
          "l'infobulle et la fenêtre d'information ne s'ouvrent pas. Charger dsfr.module.min.js " +
          'dans la page (paquet @gouvfr/dsfr) : ' +
          '<script type="module" src="…/@gouvfr/dsfr/dist/dsfr.module.min.js"></script>'
      );
    }, DELAI_VERIFICATION_JS_DSFR_MS);
  };
  if (document.readyState === 'complete') verifier();
  else window.addEventListener('load', verifier, { once: true });
}

/** Tests seulement : remet la verification a zero. */
export function reinitialiserSurveillanceJsDsfr(): void {
  etatVerification = 'repos';
}
