/**
 * Repères de l'interface carto (#997, epic #992, ADR-143).
 *
 * Lu par `npm run build:reperes` / `check:reperes`, qui génèrent
 * `reperes.generated.ts` à côté. Contrat : `ReperesConfig` dans
 * `packages/shared/src/ui/reperes-types.ts`.
 *
 * État à #997 : seul le bloc « Au clic sur un élément » du panneau Éléments est
 * déclaré zone de réglage — de quoi rendre le contrôle non vacuous. #1002 balise
 * le reste de la carto et élargit `zonesDeReglage`.
 */
import type { ReperesConfig } from '@dsfr-data/shared';

const config: ReperesConfig = {
  app: 'builder-carto',
  prefixe: 'carto',
  sources: ['index.html', 'src/main.ts'],
  zonesDeReglage: ['carto.elements.clic'],
  exceptions: [],
  helpers: [{ fonction: 'fieldInput', parametre: 'repere' }],
  prerequis: 'src/assistant/prerequis.ts',
  constats: [],
  synonymes: {
    'carto.elements.clic.popup-mode': ['fiche', 'popup', 'infobulle', 'panneau latéral', 'au clic'],
  },
};

export default config;
