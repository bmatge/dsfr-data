/**
 * Repères du builder graphique (#1006, epic #992, ADR-143).
 *
 * Lu par `npm run build:reperes` / `check:reperes`, qui génèrent
 * `reperes.generated.ts` à côté. Contrat : `ReperesConfig` dans
 * `packages/shared/src/ui/reperes-types.ts`.
 *
 * Zones de réglage : la barre d'actions, chaque section `#section-*` de
 * `index.html`, l'onglet Code, les deux modales de configuration (colonnes du
 * tableau, facettes) et leurs sous-zones. Les contrôles rendus par les
 * gabarits TS (`extra-series.ts`, `filter-builder.ts`, `datalist-config.ts`,
 * `facets-config.ts`, `sources.ts`, `lecture.ts`) n'ont pas d'ancêtre lexical : c'est
 * `tests/apps/builder/reperes-completude.test.ts`, qui REND chaque type de
 * graphique, qui les couvre.
 *
 * Hors zones : l'aperçu (garde-fou de lisibilité, état vide), la modale
 * « Aperçu des données », qui ne règlent rien.
 */
import type { ReperesConfig } from '@dsfr-data/shared';

const config: ReperesConfig = {
  app: 'builder',
  prefixe: 'builder',
  sources: [
    'index.html',
    'src/sources.ts',
    'src/ui/extra-series.ts',
    'src/ui/filter-builder.ts',
    'src/ui/datalist-config.ts',
    'src/ui/facets-config.ts',
    'src/ui/lecture.ts',
  ],
  zonesDeReglage: [
    'builder.actions',
    'builder.source',
    'builder.type',
    'builder.donnees',
    'builder.donnees.series',
    'builder.donnees.filtres',
    'builder.donnees.requete',
    'builder.donnees.tableau',
    'builder.donnees.tableau.colonnes',
    'builder.apparence',
    'builder.apparence.couleurs',
    'builder.apparence.axes',
    'builder.apparence.axes.reference',
    'builder.apparence.axes.cibles',
    'builder.generation',
    'builder.nettoyage',
    'builder.cadre',
    'builder.facettes',
    'builder.facettes.champs',
    'builder.partage',
    'builder.accessibilite',
    'builder.code',
  ],
  exceptions: [
    {
      cible: 'button.help-btn',
      raison:
        "Bouton d'aide contextuelle : ouvre l'infobulle du contrôle voisin, ce n'est pas un réglage.",
    },
  ],
  prerequis: 'src/assistant/prerequis.ts',
  constats: ['apps/builder/src/assistant/constats.ts'],
  synonymes: {
    'builder.donnees.series.ajouter': ['série', 'courbe supplémentaire', 'plusieurs séries'],
    'builder.donnees.champ-x': ['axe x', 'abscisse', 'catégories', 'étiquettes'],
    'builder.donnees.champ-y': ['axe y', 'ordonnée', 'valeur', 'mesure'],
    'builder.apparence.palette': ['couleurs', 'palette'],
    'builder.type.map': ['carte des départements', 'carte départementale', 'choroplèthe'],
    'builder.type.map-reg': ['carte des régions', 'carte régionale'],
    'builder.type.map-aca': ['carte des académies', 'rectorats'],
    'builder.type.map-monde': ['carte du monde', 'carte des pays', 'planisphère'],
    'builder.donnees.code-departement': ['code géographique', 'code région', 'académie', 'pays'],
    'builder.donnees.champ-series': [
      'format long',
      'série par champ',
      'données empilées en lignes',
    ],
    'builder.donnees.empiler': ['empiler', 'barres empilées', 'cumulé', 'stacked'],
    'builder.type.podium': ['classement', 'top', 'palmarès'],
    'builder.type.bar-line': ['barres et ligne', 'deux axes', 'graphique combiné', 'mixte'],
    'builder.donnees.champ-ligne': ['seconde mesure', 'courbe', 'deuxième axe'],
    'builder.donnees.podium-places': ['nombre de places', 'top n', 'combien de rangs'],
    'builder.apparence.unite': ['unité', 'pourcentage', 'euros', 'infobulle', 'symbole'],
    'builder.apparence.categories-vides': ['non renseigné', 'valeur manquante', 'catégorie vide'],
    'builder.apparence.couleurs.ajouter': [
      'couleur par catégorie',
      'couleur d’une série',
      'fixer une couleur',
      'color-map',
    ],
    'builder.apparence.axes.minimum': ['borne', 'échelle', 'axe des valeurs', 'minimum', 'y-min'],
    'builder.apparence.axes.maximum': ['borne', 'échelle', 'plafond de l’axe', 'maximum', 'y-max'],
    'builder.apparence.axes.reference.ajouter': [
      'ligne de référence',
      'seuil',
      'moyenne',
      'repère',
      'trait horizontal',
    ],
    'builder.apparence.axes.cibles.ajouter': ['cible', 'objectif', 'trajectoire', 'échéance'],
    'builder.apparence.synthese-carte': [
      'chiffre de la carte',
      'moyenne de la carte',
      'somme',
      'total national',
      'valeur nationale',
    ],
  },
};

export default config;
