/**
 * Presets des territoires français hors métropole (+ Corse) pour les encarts
 * de carte (dsfr-data-map-inset) : cadrage territoire entier.
 * Surchargables par les attributs center/zoom/label de l'encart.
 *
 * Chaque préréglage est calé sur l'encart par défaut (carte de 152 × 160 px :
 * 10rem moins la gouttière, hauteur 160px) — centre au milieu de l'emprise des
 * communes (geo.api.gouv.fr) en projection Mercator, plus grand zoom entier où
 * elle tient. `la-reunion` et `wallis-et-futuna` l'ont été par AM-102 (#1229),
 * les neuf autres par #1245 : au zoom supérieur, chacun coupait son
 * territoire (Marie-Galante et La Désirade, le sud de la Guyane, les îles
 * Loyauté, le cap Corse…). `tests/territories-presets.test.ts` refait le calcul.
 *
 * `polynesie-francaise` est l'EXCEPTION VOULUE (arbitrages du 2026-10-04,
 * #1245) : il cadre Tahiti et Moorea, pas le territoire. La Polynésie s'étend
 * sur vingt degrés de latitude et de longitude ; la montrer entière demande le
 * zoom 3, où aucune île n'est lisible dans 160 px. Tahiti et Moorea portent
 * l'essentiel de la population. Pour un autre archipel, poser `center` et
 * `zoom` sur l'encart.
 *
 * Son zoom, 7, n'est PAS le plus grand qui cadre les deux îles (le 8 les
 * tient, à 3 px des bords) : c'est le plus grand que SERT le fond par défaut.
 * `ign-plan` répond 404 au-delà du zoom 7 sur la Polynésie, la
 * Nouvelle-Calédonie et Wallis-et-Futuna (mesuré le 2026-10-04) — au zoom 8,
 * l'encart sortait gris. Le centre est le milieu de l'emprise de Tahiti et
 * Moorea (contours des communes, hors Maiao, Mehetia et Tetiaroa) en
 * Mercator : 40 px de marge à gauche et à droite, 60 px en haut et en bas.
 * `ign-ortho` et `osm` servent ces territoires aux zooms supérieurs : avec
 * l'un d'eux, `zoom="8"` sur l'encart resserre le cadrage.
 *
 * La même limite du fond ne touche pas les deux autres préréglages
 * concernés, `nouvelle-caledonie` (zoom 5) et `wallis-et-futuna` (zoom 6).
 * Elle rend gris, en revanche, tout encart de ces trois territoires auquel on
 * pose un `zoom` de 8 ou plus avec le fond par défaut.
 */
export const TERRITORY_PRESETS: Record<string, { center: string; zoom: number; label: string }> = {
  guadeloupe: { center: '16.17,-61.41', zoom: 8, label: 'Guadeloupe' },
  martinique: { center: '14.63,-61.02', zoom: 8, label: 'Martinique' },
  guyane: { center: '3.93,-53.11', zoom: 5, label: 'Guyane' },
  'la-reunion': { center: '-21.13,55.53', zoom: 8, label: 'La Réunion' },
  mayotte: { center: '-12.82,45.16', zoom: 9, label: 'Mayotte' },
  'saint-pierre-et-miquelon': {
    center: '46.95,-56.32',
    zoom: 8,
    label: 'Saint-Pierre-et-Miquelon',
  },
  'saint-martin': { center: '18.086,-63.062', zoom: 10, label: 'Saint-Martin' },
  'saint-barthelemy': { center: '17.922,-62.858', zoom: 10, label: 'Saint-Barthélemy' },
  'nouvelle-caledonie': { center: '-21.21,165.85', zoom: 5, label: 'Nouvelle-Calédonie' },
  // Tahiti et Moorea, par choix, au plus grand zoom que sert le fond par défaut : voir l'en-tête.
  'polynesie-francaise': { center: '-17.68,-149.52', zoom: 7, label: 'Polynésie française' },
  'wallis-et-futuna': { center: '-13.79,-177.17', zoom: 6, label: 'Wallis-et-Futuna' },
  corse: { center: '42.19,9.05', zoom: 6, label: 'Corse' },
};

/** Groupes nommés pour le raccourci `insets` de dsfr-data-map */
export const TERRITORY_GROUPS: Record<string, string[]> = {
  drom: ['guadeloupe', 'martinique', 'guyane', 'la-reunion', 'mayotte'],
};

/**
 * Zone de fit par défaut de la métropole (`"latSW,lonSW,latNE,lonNE"`) : quand
 * la carte porte des encarts ultramarins et aucun `max-bounds`, le fit est
 * clippé dessus pour que les DROM ne dézooment pas la vue (#687). Corse
 * comprise, Espagne et Italie du Nord effleurées.
 */
export const METROPOLE_FIT_ZONE = '41,-5.5,51.5,10';

/** Territoires dont un encart appelle un fit métropolitain : tous sauf la Corse. */
const OVERSEAS_TERRITORIES = new Set(Object.keys(TERRITORY_PRESETS).filter((t) => t !== 'corse'));

/**
 * Développe la valeur d'`insets` (groupes + territoires nommés, virgules)
 * en liste de territoires. Les noms inconnus sont conservés tels quels.
 */
export function expandInsets(insets: string): string[] {
  return insets
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .flatMap((t) => TERRITORY_GROUPS[t] ?? [t]);
}

/** Un des territoires (noms d'`insets` ou attributs `territory`) est-il ultramarin ? */
export function hasOverseasTerritory(names: Iterable<string>): boolean {
  for (const name of names) {
    if (OVERSEAS_TERRITORIES.has(name.trim().toLowerCase())) return true;
  }
  return false;
}
