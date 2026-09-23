/**
 * Pose le journal réseau et console dans le document courant (#994).
 *
 * Module À EFFET DE BORD, à importer en PREMIÈRE ligne du `main.ts` des apps
 * qui rendent leurs composants dans leur propre document (Carto, Pipeline) :
 *
 * ```ts
 * import '@dsfr-data/shared/debug/installer-journal';
 * ```
 *
 * L'ordre d'évaluation des modules ES suit l'ordre des `import` : placé en
 * tête, ce module s'exécute avant la bibliothèque et avant le code de l'app,
 * donc avant leur première requête. Plus bas, il manquerait précisément les
 * requêtes du démarrage.
 *
 * Déclaré dans `sideEffects` de `packages/shared/package.json` : le paquet
 * est marqué sans effet de bord, et un import nu serait sinon élagué au build.
 */
import { installerJournal } from './journal.js';

if (typeof window !== 'undefined') installerJournal(window);
