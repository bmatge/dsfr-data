/**
 * Dépendances npm que le serveur de dev pré-optimise DÈS LE DÉMARRAGE
 * (`optimizeDeps.include` de `vite.config.ts`, #1119).
 *
 * Sans cette liste, Vite les trouve par son scanner d'entrées HTML puis par le
 * crawl des imports au premier chargement. Une dépendance qui lui échappe
 * (scanner en échec, import dynamique atteint plus tard — Leaflet d'une carte,
 * `html-to-image` d'un export) est découverte EN COURS DE ROUTE : Vite
 * relance l'optimiseur et, si les chunks partagés changent, recharge toutes
 * les pages ouvertes. Pour `npm run verif` démarré à froid, c'est un contrôle
 * rechargé au milieu de ses gestes, qui ne lit plus rien.
 *
 * Ce sont les imports nus de la lib (`packages/core/src`) et de ce qu'elle
 * embarque de `packages/shared/src` et `packages/app-ui/src`. Le test
 * `tests/vite-deps-pre-optimisees.test.ts` refuse un import nu absent d'ici :
 * une dépendance ajoutée à la lib doit y être ajoutée aussi.
 */
export const DEPS_PRE_OPTIMISEES: readonly string[] = [
  'fzstd',
  'html-to-image',
  'hyparquet',
  'leaflet',
  'leaflet.heat',
  'leaflet.markercluster',
  'lit',
  'lit/decorators.js',
];

/** Imports nus qui ne sont que des TYPES (effacés à la compilation) : rien à optimiser. */
export const IMPORTS_DE_TYPES: readonly string[] = ['geojson'];
