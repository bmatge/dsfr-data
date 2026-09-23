/**
 * Repères du pipeline (#1008, epic #992, ADR-143).
 *
 * Lu par `npm run build:reperes` / `check:reperes`, qui génèrent
 * `reperes.generated.ts` à côté. Contrat : `ReperesConfig` dans
 * `packages/shared/src/ui/reperes-types.ts`.
 *
 * Deux sortes de repères :
 *
 * - STATIQUES, littéraux du balisage : la barre d'actions et le menu
 *   « Ajouter une étape » (`index.html`), le panneau latéral et ses onglets,
 *   l'éditeur ; les gabarits des contrôles propres à une étape
 *   (`aggregate-control-element.ts` : agrégations de Requêter ;
 *   `saved-source-control.ts` : source enregistrée, document et table Grist) ;
 * - CALCULÉS depuis la définition des nœuds (`node-configs.ts`) : chaque
 *   attribut d'une étape est un repère `pipeline.<type>.<attribut>`, posé à
 *   l'exécution par `attribute-control-element.ts` (`AttributeControl.repere`)
 *   et projeté dans le registre par `reperes-donnees.ts` (champ `donnees`).
 *
 * Contrôles Rete non-formulaire, sans repère, déclarés ici plutôt qu'en
 * `exceptions` (ils ne rendent aucun input/select/textarea/button, une
 * exception y serait « sans objet ») : `StatusControl` (statut d'exécution et
 * champs disponibles, lecture seule), les prises (sockets) et connexions de
 * Rete. La complétude par le rendu (`tests/apps/pipeline-helper/
 * reperes-completude.test.ts`) les liste avec la même raison.
 */
import type { ReperesConfig } from '@dsfr-data/shared';

const config: ReperesConfig = {
  app: 'pipeline-helper',
  prefixe: 'pipeline',
  sources: ['index.html', 'src/ui/aggregate-control-element.ts', 'src/ui/saved-source-control.ts'],
  zonesDeReglage: ['pipeline.actions', 'pipeline.panneau'],
  exceptions: [],
  prerequis: 'src/assistant/prerequis.ts',
  constats: [],
  donnees: 'src/assistant/reperes-donnees.ts',
  synonymes: {
    'pipeline.actions.executer': ['lancer', 'exécuter le pipeline', 'faire circuler les données'],
    'pipeline.query.group-by': ['regrouper', 'grouper par'],
    'pipeline.query.agregat-fonction': ['somme', 'moyenne', 'agrégation', 'compter'],
    'pipeline.panneau.code': ['code html', 'récupérer le code'],
    // #1018 : la première étape d'un pipeline vide, dite comme l'usager la dit.
    'pipeline.actions.ajouter-source': ['ajouter une source', 'brancher une source'],
    'pipeline.query.filter': ['filtrer les lignes', 'ajouter un filtre'],
  },
};

export default config;
