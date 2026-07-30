/**
 * Presets des territoires français hors métropole (+ Corse) pour les encarts
 * de carte (dsfr-data-map-inset) : cadrage territoire entier.
 * Surchargables par les attributs center/zoom/label de l'encart.
 */
export const TERRITORY_PRESETS: Record<string, { center: string; zoom: number; label: string }> = {
  guadeloupe: { center: '16.20,-61.45', zoom: 9, label: 'Guadeloupe' },
  martinique: { center: '14.63,-61.00', zoom: 9, label: 'Martinique' },
  guyane: { center: '4.00,-53.10', zoom: 6, label: 'Guyane' },
  'la-reunion': { center: '-21.115,55.53', zoom: 9, label: 'La Réunion' },
  mayotte: { center: '-12.83,45.15', zoom: 10, label: 'Mayotte' },
  'saint-pierre-et-miquelon': {
    center: '46.95,-56.33',
    zoom: 9,
    label: 'Saint-Pierre-et-Miquelon',
  },
  'saint-martin': { center: '18.08,-63.06', zoom: 11, label: 'Saint-Martin' },
  'saint-barthelemy': { center: '17.90,-62.83', zoom: 11, label: 'Saint-Barthélemy' },
  'nouvelle-caledonie': { center: '-21.30,165.50', zoom: 6, label: 'Nouvelle-Calédonie' },
  'polynesie-francaise': { center: '-17.55,-149.55', zoom: 8, label: 'Polynésie française' },
  'wallis-et-futuna': { center: '-13.80,-177.15', zoom: 7, label: 'Wallis-et-Futuna' },
  corse: { center: '42.15,9.10', zoom: 7, label: 'Corse' },
};

/** Groupes nommés pour le raccourci `insets` de dsfr-data-map */
export const TERRITORY_GROUPS: Record<string, string[]> = {
  drom: ['guadeloupe', 'martinique', 'guyane', 'la-reunion', 'mayotte'],
};
