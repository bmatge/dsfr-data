/**
 * Alimentation déterministe du CANARI (#882) : un jeu taillé pour chaque
 * piège que le banc d'essai a payé, et un faux serveur qui le sert sous les
 * trois formes que les contrôles demandent — tableau nu (API générique),
 * export et `/records` Opendatasoft (pour le contexte, le regroupement
 * serveur et le plafond `max-records`).
 *
 * Les LIGNES vivent dans `jeux/canari.json` (40 lignes écrites à la main,
 * chacune décrite dans `jeux/README.md`), `jeux/canari-ref.json` (la table
 * de droite, avec un DOUBLON de clé volontaire) et `jeux/canari-volume.json`
 * (1 001 lignes engendrées par un générateur congruentiel linéaire de graine
 * 42, pour le plafond de 1 000), et `jeux/canari-facettes.json` (dix lignes
 * pour les deux pièges d'une facette : la valeur à virgule, BUG-031, et
 * l'élément répété dans une cellule tableau, BUG-037).
 *
 * CE MODULE NE SAIT RIEN DE PLAYWRIGHT : il prend une URL, il rend une
 * réponse — ou `null`. Le test-garde d'indépendance parcourt son graphe
 * d'imports et refuserait toute entrée par `packages/`.
 */
import {
  repondreOdsExport,
  repondreOdsFacets,
  repondreOdsMetadonnees,
  repondreOdsRecords,
} from '../builder-e2e/api-fixtures.js';
import type { Row } from '../../tools/oracle/manifest.js';
import { filtrerOdsqlContexte } from './fixtures-contexte.js';
import canari from './jeux/canari.json' with { type: 'json' };
import canariRef from './jeux/canari-ref.json' with { type: 'json' };
import canariVolume from './jeux/canari-volume.json' with { type: 'json' };
import canariFacettes from './jeux/canari-facettes.json' with { type: 'json' };

/** Hôte fictif — TLD réservé (RFC 2606) : rien ne peut joindre le réseau. */
export const HOTE_CANARI = 'https://canari.verif.invalid';

/** Les quarante lignes pièges. */
export const CANARI: Row[] = canari;
/** La table de droite : sept lignes, dont deux fois le code `02`. */
export const CANARI_REF: Row[] = canariRef;
/** Mille et une lignes, pour un plafond de mille. */
export const CANARI_VOLUME: Row[] = canariVolume;
/** Dix lignes : des valeurs à virgule, des cellules tableau à élément répété. */
export const CANARI_FACETTES: Row[] = canariFacettes;

/** Les jeux ODS du canari. */
export const DATASET_CANARI = 'canari';
export const DATASET_VOLUME = 'canari-volume';
export const DATASET_FACETTES = 'canari-facettes';

/** Les trois jeux, sous le nom que les manifestes leur donnent. */
export const JEUX_CANARI = {
  canari: CANARI,
  ref: CANARI_REF,
  volume: CANARI_VOLUME,
  facettes: CANARI_FACETTES,
} as const;

/** URL d'un jeu servi en tableau nu. */
export function urlCanari(nom: keyof typeof JEUX_CANARI): string {
  return `${HOTE_CANARI}/${nom}`;
}

const PREFIXE_ODS = '/api/explore/v2.1/catalog/datasets/';

/**
 * Le jeu des facettes en source Opendatasoft (#1243) : ce qu'un CONTEXTE
 * filtre. Ses filtres émettent `in (…)` et `like "%…%"`, que le harnais de
 * recette ne lit pas : c'est le lecteur du lot « contexte » qui sert ici, et
 * qui REFUSE comme lui une clause qu'il n'a pas su lire.
 */
function repondreFacettes(url: URL, fin: string): unknown | null {
  if (fin === '') return repondreOdsMetadonnees();
  const p = url.searchParams;
  const filtrees = filtrerOdsqlContexte(CANARI_FACETTES, p.get('where') ?? '');
  if (fin === 'records') {
    const limite = Number(p.get('limit') ?? '100');
    const decalage = Number(p.get('offset') ?? '0');
    return { total_count: filtrees.length, results: filtrees.slice(decalage, decalage + limite) };
  }
  if (fin === 'exports/json') {
    const limite = Number(p.get('limit') ?? '0');
    return limite > 0 ? filtrees.slice(0, limite) : filtrees;
  }
  return null;
}

/** Le faux serveur du canari : une URL, une réponse — ou `null` si imprévue. */
export function repondreCanari(url: URL): unknown | null {
  if (url.origin !== HOTE_CANARI) return null;
  if (url.pathname.startsWith(PREFIXE_ODS)) {
    const reste = url.pathname.slice(PREFIXE_ODS.length);
    const [dataset, ...chemin] = reste.split('/');
    const fin = chemin.join('/');
    if (dataset === DATASET_FACETTES) return repondreFacettes(url, fin);
    const jeu =
      dataset === DATASET_CANARI ? CANARI : dataset === DATASET_VOLUME ? CANARI_VOLUME : null;
    if (jeu === null) return null;
    if (fin === 'records') return repondreOdsRecords(url, jeu);
    if (fin === 'exports/json') return repondreOdsExport(url, jeu);
    if (fin === 'facets') return repondreOdsFacets(url, jeu);
    if (fin === '') return repondreOdsMetadonnees();
    return null;
  }
  const nom = url.pathname.replace(/^\//, '') as keyof typeof JEUX_CANARI;
  return JEUX_CANARI[nom] ?? null;
}
