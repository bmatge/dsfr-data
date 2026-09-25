/**
 * Repères du Playground (#1009, epic #992, ADR-143).
 *
 * Lu par `npm run build:reperes` / `check:reperes`, qui génèrent
 * `reperes.generated.ts` à côté. Contrat : `ReperesConfig` dans
 * `packages/shared/src/ui/reperes-types.ts`.
 *
 * Deux sortes de repères dans cette app :
 *
 * - les repères d'INTERFACE, ci-dessous : la barre d'actions, le volet des
 *   exemples, l'éditeur et l'aperçu. Registre généré, révélés par
 *   `creerAdaptateurPlayground().reveler()` ;
 * - les repères de CODE, qui désignent une ligne du code édité
 *   (`playground.ligne.<n>.<balise>[.<attribut>]`) : ils ne sont PAS au
 *   registre — le code change à chaque frappe —, ils sont produits par les
 *   constats de balisage (`constats-balisage.ts`) et montrés par
 *   `montrerCode()` (`adaptateur.ts`).
 *
 * Hors zones : rien — tout ce que l'app règle est dans une des quatre zones.
 */
import type { ReperesConfig } from '@dsfr-data/shared';

const config: ReperesConfig = {
  app: 'playground',
  prefixe: 'playground',
  sources: ['index.html'],
  zonesDeReglage: [
    'playground.actions',
    'playground.exemples',
    'playground.editeur',
    'playground.apercu',
  ],
  exceptions: [],
  synonymes: {
    'playground.actions.executer': ['lancer', 'rendu', 'exécuter le code'],
    'playground.actions.exemples': ['exemples', 'modèles', 'catalogue'],
    'playground.editeur.code': ['éditeur', 'code html', 'saisir le code'],
    'playground.actions.dependances': ['cdn', 'dépendances', 'page autonome'],
    'playground.actions.studio': ['studio', 'studio ia', 'reconstruire'],
  },
};

export default config;
