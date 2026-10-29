/**
 * Palettes des graphiques : celles que DSFR Chart applique a `dsfr-data-chart`,
 * reprises ici pour les previews du builder.
 *
 * ⚠️ HOMONYMIE VOULUE, ET DANGEREUSE : `constants/choropleth-scales.ts`
 * exporte `CHOROPLETH_SCALES`, dont les cles portent les MEMES noms
 * (`sequentialAscending`, `sequentialDescending`, `divergentAscending`,
 * `divergentDescending`, `neutral`) avec des rampes a 9 tons differentes.
 * Les deux jeux de noms sont publics : ce sont les valeurs de l'attribut
 * `selected-palette`, la meme cle designant la rampe de DSFR Chart sur un
 * graphique et la rampe a 9 tons sur une carte ou un podium. C'est pour
 * rendre cette homonymie visible A L'IMPORT que les deux constantes vivent
 * dans deux fichiers dont le chemin dit lequel on lit (#969) : un
 * `grep sequentialDescending` a repondu juste et faux trois fois en une
 * journee quand elles cohabitaient dans `dsfr-palettes.ts`.
 *
 * Qui lit quoi : `dsfr-data-chart` et les previews -> ce fichier ;
 * `dsfr-data-map-layer` et `dsfr-data-podium` -> `choropleth-scales.ts`.
 */

/**
 * Dix couleurs DSFR contrastees. Ce ne sont PAS celles de DSFR Chart (voir
 * `PALETTE_COLORS.categorical`) : c'est la palette `categorical` que le
 * podium et les cartes dessinent eux-memes (`CHOROPLETH_SCALES.categorical`).
 */
export const DSFR_COLORS = [
  '#000091',
  '#6A6AF4',
  '#009081',
  '#C9191E',
  '#FF9940',
  '#A558A0',
  '#417DC4',
  '#716043',
  '#18753C',
  '#3A3A3A',
] as const;

/**
 * Couleurs que DSFR Chart applique pour chaque valeur de `selected-palette`
 * (thème clair) — COPIE de `@gouvfr/dsfr-chart` 2.1.1 (`src/utils/colors.js`).
 *
 * `dsfr-data-chart` ne colore rien lui-même : il transmet `selected-palette`
 * à DSFR Chart, qui tire ses couleurs de ce tableau. Cette constante ne sert
 * qu'à MONTRER ces couleurs ailleurs (pastilles du sélecteur du Builder) :
 * elle doit donc dire ce que le graphique affichera vraiment. Elle portait
 * jusqu'ici des teintes inventées (dix couleurs contrastées pour
 * `categorical`, cinq tons pour les dégradés) que le graphique n'a jamais
 * rendues : l'aperçu annonçait un contraste que la courbe n'avait pas.
 *
 * Construction, identique à DSFR Chart : `categorical` = couleurs 01 à 08 ;
 * `default` et `neutral` = une seule couleur ; dégradés = 10 tons
 * interpolés (chroma-js, RGB) entre 09 et 10 ; divergentes = 4 tons entre
 * 11, 13 et 15. `tests/shared/palette-colors.test.ts` relit le paquet
 * installé : une montée de version de DSFR Chart qui change ses couleurs
 * fait échouer ce test.
 */
// satisfies au lieu de l'annotation Record<string, ...> qui resolvait
// PaletteType (keyof) en string (#322)
export const PALETTE_COLORS = {
  default: ['#5C68E5'],
  categorical: [
    '#5C68E5',
    '#82B5F2',
    '#29598F',
    '#31A7AE',
    '#81EEF5',
    '#B478F1',
    '#CFB1F5',
    '#CECECE',
  ],
  sequentialAscending: [
    '#DBDAFF',
    '#C3C2ED',
    '#AAAADB',
    '#9291CA',
    '#7A79B8',
    '#6161A6',
    '#494994',
    '#313083',
    '#181871',
    '#00005F',
  ],
  sequentialDescending: [
    '#00005F',
    '#181871',
    '#313083',
    '#494994',
    '#6161A6',
    '#7A79B8',
    '#9291CA',
    '#AAAADB',
    '#C3C2ED',
    '#DBDAFF',
  ],
  divergentAscending: ['#298641', '#ADA816', '#ED8308', '#E91719'],
  divergentDescending: ['#E91719', '#ED8308', '#ADA816', '#298641'],
  neutral: ['#B1B1B1'],
} satisfies Record<string, readonly string[]>;

/**
 * Premiere couleur que DSFR Chart applique pour chaque palette (theme clair) :
 * celle d'une serie unique, ou de la premiere serie. Derivee de
 * `PALETTE_COLORS`, jamais saisie a part — elle portait jusqu'ici le Bleu
 * France `#000091`, que DSFR Chart n'applique a aucune palette.
 */
export const PALETTE_PRIMARY_COLOR: Record<string, string> = Object.fromEntries(
  Object.entries(PALETTE_COLORS).map(([k, colors]) => [k, colors[0]])
);

/**
 * Libelles des palettes dans l'interface (resumes de section, badges…), pour
 * que la cle interne (`sequentialAscending`) ne fuie jamais.
 * A garder en phase avec les `<option>` du selecteur de palette de
 * `apps/builder/index.html`.
 *
 * Les libelles decrivent ce que DSFR Chart fait vraiment (2.1.1) :
 * - `default` est `#5C68E5`, pas le Bleu France ;
 * - `categorical` donne UNE couleur PAR SERIE (une serie = une seule
 *   couleur), et une couleur par part sur un camembert ;
 * - les divergentes sont quatre tons vert → jaune → orange → rouge, une
 *   couleur par serie, sans centre ni notion d'ecart ;
 * - `neutral` est un seul gris, la base de `highlight-index`.
 */
export const PALETTE_DISPLAY_NAMES: Record<string, string> = {
  default: 'Couleur unique (bleu)',
  categorical: 'Couleurs distinctes par série',
  sequentialAscending: 'Dégradé clair → foncé',
  sequentialDescending: 'Dégradé foncé → clair',
  divergentAscending: 'Vert → rouge (4 tons)',
  divergentDescending: 'Rouge → vert (4 tons)',
  neutral: 'Gris neutre (mise en avant)',
};

export type PaletteType = keyof typeof PALETTE_COLORS;
