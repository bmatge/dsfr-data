/**
 * SPIKE #889 — entrée JETABLE du bundle de mesure.
 *
 * Un seul bundle de PRODUCTION (Lit prod, une seule copie du bus data-bridge)
 * qui embarque la bibliothèque entière + l'élément d'essai `<spike-repeat>`,
 * pour mesurer dans les conditions du guide (#877 : bundle publié, pas les
 * sources servies par Vite en mode dev). Construit par `build.ts`.
 */
import '../../packages/core/src/index.ts';
import './spike-repeat.ts';
export { DATA_EVENTS, getDataCache } from '../../packages/core/src/utils/data-bridge.ts';
export { collectBindings } from './renderer.ts';
