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
 * `facets-config.ts`, `sources.ts`) n'ont pas d'ancêtre lexical : c'est
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
  constats: [],
  synonymes: {
    'builder.donnees.series.ajouter': ['série', 'courbe supplémentaire', 'plusieurs séries'],
    'builder.donnees.champ-x': ['axe x', 'abscisse', 'catégories', 'étiquettes'],
    'builder.donnees.champ-y': ['axe y', 'ordonnée', 'valeur', 'mesure'],
    'builder.apparence.palette': ['couleurs', 'palette'],
  },
};

export default config;
