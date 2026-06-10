/**
 * Layout components for the dsfr-data application
 *
 * These components provide reusable layout structures
 * for the header, footer, and page layouts.
 */
import { registerServerCacheProvider, registerDbBeaconTransport } from '@dsfr-data/shared';

// Mode DB : branche le fallback offline /api/cache de dsfr-data-source via
// le hook window.DSFR_DATA_CACHE_PROVIDER (#307) — la lib publiee ne
// connait plus aucune API applicative.
registerServerCacheProvider();
// Mode DB : beacon vers l'API de monitoring via le hook
// window.DSFR_DATA_BEACON_TRANSPORT (#308) — transport par defaut : pixel.
registerDbBeaconTransport();

// La couche persistance n'affiche plus d'UI (#322) : c'est le chrome qui
// transforme le depassement de quota en toast DSFR.
window.addEventListener('dsfr-data:storage-quota', () => {
  import('@dsfr-data/shared').then(({ toastError }) => {
    toastError('Espace de stockage plein. Supprimez des elements pour continuer.');
  });
});

export { AppHeader } from './app-header.js';
export { AppFooter } from './app-footer.js';
export { AppLayoutBuilder } from './app-layout-builder.js';
export { AppLayoutDemo } from './app-layout-demo.js';
export { AppSidemenu } from './app-sidemenu.js';
export { AppPreviewPanel } from './app-preview-panel.js';
