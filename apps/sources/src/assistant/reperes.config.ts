/**
 * Repères de l'app Sources (#1007, epic #992, ADR-143).
 *
 * Lu par `npm run build:reperes` / `check:reperes`, qui génèrent
 * `reperes.generated.ts` à côté. Contrat : `ReperesConfig` dans
 * `packages/shared/src/ui/reperes-types.ts`.
 *
 * Zones de réglage : les actions de la page, le pied des jeux locaux, le
 * panneau d'aperçu, et chaque modale — connexion (détection par URL,
 * configuration, Grist, API REST et ses en-têtes), création de table Grist,
 * export vers Grist, jointure, source manuelle (tableau, JSON, CSV). Les
 * lignes rendues par des gabarits TS (en-têtes HTTP, colonnes d'une table
 * Grist, cellules de l'éditeur) sont couvertes par
 * `tests/apps/sources/reperes-completude.test.ts`, qui les REND.
 *
 * Hors zones de réglage : la liste des connexions (`sources.connexions`,
 * posée pour la visite guidée) et celle des jeux locaux — une ligne par
 * connexion ou par jeu, avec ses actions, rien à régler.
 *
 * Sources n'a pas de volet Diagnostic : repères et guidage seulement.
 */
import type { ReperesConfig } from '@dsfr-data/shared';

const config: ReperesConfig = {
  app: 'sources',
  prefixe: 'sources',
  sources: [
    'index.html',
    'src/connections/connection-manager.ts',
    'src/connections/grist-explorer.ts',
    'src/editors/table-editor.ts',
  ],
  zonesDeReglage: [
    'sources.actions',
    'sources.locaux',
    'sources.apercu',
    'sources.connexion',
    'sources.connexion.detection',
    'sources.connexion.configuration',
    'sources.connexion.configuration.grist',
    'sources.connexion.configuration.api',
    'sources.table-grist',
    'sources.export-grist',
    'sources.jointure',
    'sources.manuelle',
    'sources.manuelle.tableau',
    'sources.manuelle.json',
    'sources.manuelle.csv',
  ],
  exceptions: [
    {
      cible: '#api-headers',
      raison:
        "Champ masqué, source de vérité JSON des en-têtes HTTP, synchronisé par l'éditeur clé/valeur (dont les lignes portent les repères).",
    },
  ],
  prerequis: 'src/assistant/prerequis.ts',
  constats: [],
  synonymes: {
    'sources.actions.nouvelle-connexion': ['ajouter une connexion', 'connecter une API', 'Grist'],
    'sources.locaux.creer': ['saisir des données', 'coller du JSON', 'importer un CSV'],
    'sources.locaux.joindre': ['jointure', 'croiser deux sources', 'fusionner'],
    'sources.connexion.configuration.grist.cle-api': ['clé API', 'jeton', 'token'],
    'sources.connexion.configuration.api.chemin': ['data path', 'emplacement des données'],
  },
};

export default config;
