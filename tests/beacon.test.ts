import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for the beacon utility.
 *
 * Since the module uses a module-level `sent` Set for deduplication,
 * we re-import the module for each test to get a fresh Set.
 *
 * The beacon uses `new Image().src = url` (tracking pixel) to send data.
 * We spy on Image construction to capture the URLs.
 */
describe('sendWidgetBeacon', () => {
  let imageSrcs: string[];
  let OriginalImage: typeof Image;

  beforeEach(() => {
    imageSrcs = [];
    OriginalImage = globalThis.Image;
    // Mock Image to capture .src assignments
    globalThis.Image = class MockImage {
      private _src = '';
      get src() {
        return this._src;
      }
      set src(url: string) {
        this._src = url;
        imageSrcs.push(url);
      }
    } as unknown as typeof Image;
  });

  afterEach(() => {
    globalThis.Image = OriginalImage;
    delete (window as any).__gwDbMode;
    delete (window as any).DSFR_DATA_BEACON;
    delete (window as any).DSFR_DATA_BEACON_URL;
    document.querySelectorAll('dsfr-data-beacon').forEach((e) => e.remove());
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  /** Pose un <dsfr-data-beacon url="..."> dans le DOM (sans dependre du composant). */
  function addBeaconElement(url: string): HTMLElement {
    const el = document.createElement('dsfr-data-beacon');
    if (url !== null) el.setAttribute('url', url);
    document.body.appendChild(el);
    return el;
  }

  function externalLocation() {
    vi.stubGlobal('location', {
      hostname: 'example.gouv.fr',
      protocol: 'https:',
      origin: 'https://example.gouv.fr',
      href: 'https://example.gouv.fr/',
    });
  }

  async function loadBeacon(beaconUrl = 'https://chartsbuilder.matge.com') {
    // BEACON_BASE_URL est une constante module-level lue depuis import.meta.env
    // au chargement : on fixe l'env AVANT l'import frais pour que les tests ne
    // dependent pas du .env local (vide en CI → beacon desactive par defaut).
    // Les 3 variables sont stubbees a cause de la cascade de fallback
    // VITE_BEACON_URL || VITE_PROXY_URL_EMBED || VITE_PROXY_URL.
    vi.stubEnv('VITE_BEACON_URL', beaconUrl);
    vi.stubEnv('VITE_PROXY_URL_EMBED', beaconUrl);
    vi.stubEnv('VITE_PROXY_URL', beaconUrl);
    const mod = await import('@/utils/beacon.js');
    return mod.sendWidgetBeacon;
  }

  it('skips when no beacon collection URL is baked in the bundle', async () => {
    (window as any).DSFR_DATA_BEACON = true;
    vi.stubGlobal('location', {
      hostname: 'example.gouv.fr',
      protocol: 'https:',
      origin: 'https://example.gouv.fr',
      href: 'https://example.gouv.fr/',
    });

    const sendWidgetBeacon = await loadBeacon('');
    sendWidgetBeacon('dsfr-data-kpi');
    expect(imageSrcs).toHaveLength(0);
  });

  it('skips when DSFR_DATA_BEACON is not set (opt-in)', async () => {
    vi.stubGlobal('location', {
      hostname: 'example.gouv.fr',
      protocol: 'https:',
      origin: 'https://example.gouv.fr',
      href: 'https://example.gouv.fr/',
    });

    const sendWidgetBeacon = await loadBeacon();
    sendWidgetBeacon('dsfr-data-kpi');
    expect(imageSrcs).toHaveLength(0);
  });

  it('skips on localhost even when enabled', async () => {
    (window as any).DSFR_DATA_BEACON = true;
    // happy-dom defaults to http://localhost/
    const sendWidgetBeacon = await loadBeacon();
    sendWidgetBeacon('dsfr-data-kpi');
    expect(imageSrcs).toHaveLength(0);
  });

  it('skips on 127.0.0.1 even when enabled', async () => {
    (window as any).DSFR_DATA_BEACON = true;
    vi.stubGlobal('location', {
      hostname: '127.0.0.1',
      protocol: 'http:',
      origin: 'http://127.0.0.1',
      href: 'http://127.0.0.1/',
    });

    const sendWidgetBeacon = await loadBeacon();
    sendWidgetBeacon('dsfr-data-kpi');
    expect(imageSrcs).toHaveLength(0);
  });

  it('skips on chartsbuilder.matge.com even when enabled', async () => {
    (window as any).DSFR_DATA_BEACON = true;
    vi.stubGlobal('location', {
      hostname: 'chartsbuilder.matge.com',
      protocol: 'https:',
      origin: 'https://chartsbuilder.matge.com',
      href: 'https://chartsbuilder.matge.com/',
    });

    const sendWidgetBeacon = await loadBeacon();
    sendWidgetBeacon('dsfr-data-kpi');
    expect(imageSrcs).toHaveLength(0);
  });

  it('sends beacon on external host when enabled', async () => {
    (window as any).DSFR_DATA_BEACON = true;
    vi.stubGlobal('location', {
      hostname: 'example.gouv.fr',
      protocol: 'https:',
      origin: 'https://example.gouv.fr',
      href: 'https://example.gouv.fr/',
    });

    const sendWidgetBeacon = await loadBeacon();
    sendWidgetBeacon('dsfr-data-kpi');

    expect(imageSrcs).toHaveLength(1);
    const url = new URL(imageSrcs[0]);
    expect(url.pathname).toBe('/beacon');
    expect(url.searchParams.get('c')).toBe('dsfr-data-kpi');
    // The 'r' param contains window.location.origin
    expect(url.searchParams.has('r')).toBe(true);
  });

  it('includes subtype in beacon URL', async () => {
    (window as any).DSFR_DATA_BEACON = true;
    vi.stubGlobal('location', {
      hostname: 'example.gouv.fr',
      protocol: 'https:',
      origin: 'https://example.gouv.fr',
      href: 'https://example.gouv.fr/',
    });

    const sendWidgetBeacon = await loadBeacon();
    sendWidgetBeacon('dsfr-data-chart', 'bar');

    expect(imageSrcs).toHaveLength(1);
    const url = new URL(imageSrcs[0]);
    expect(url.searchParams.get('c')).toBe('dsfr-data-chart');
    expect(url.searchParams.get('t')).toBe('bar');
  });

  it('deduplicates by component+type', async () => {
    (window as any).DSFR_DATA_BEACON = true;
    vi.stubGlobal('location', {
      hostname: 'example.gouv.fr',
      protocol: 'https:',
      origin: 'https://example.gouv.fr',
      href: 'https://example.gouv.fr/',
    });

    const sendWidgetBeacon = await loadBeacon();
    sendWidgetBeacon('dsfr-data-kpi');
    sendWidgetBeacon('dsfr-data-kpi');
    sendWidgetBeacon('dsfr-data-kpi');

    expect(imageSrcs).toHaveLength(1);
  });

  it('sends separate beacons for different components', async () => {
    (window as any).DSFR_DATA_BEACON = true;
    vi.stubGlobal('location', {
      hostname: 'example.gouv.fr',
      protocol: 'https:',
      origin: 'https://example.gouv.fr',
      href: 'https://example.gouv.fr/',
    });

    const sendWidgetBeacon = await loadBeacon();
    sendWidgetBeacon('dsfr-data-kpi');
    sendWidgetBeacon('dsfr-data-list');

    expect(imageSrcs).toHaveLength(2);
  });

  it('sends separate beacons for same component with different subtypes', async () => {
    (window as any).DSFR_DATA_BEACON = true;
    vi.stubGlobal('location', {
      hostname: 'example.gouv.fr',
      protocol: 'https:',
      origin: 'https://example.gouv.fr',
      href: 'https://example.gouv.fr/',
    });

    const sendWidgetBeacon = await loadBeacon();
    sendWidgetBeacon('dsfr-data-chart', 'bar');
    sendWidgetBeacon('dsfr-data-chart', 'line');

    expect(imageSrcs).toHaveLength(2);
  });

  it('uses tracking pixel (Image) instead of fetch when not in DB mode', async () => {
    (window as any).DSFR_DATA_BEACON = true;
    vi.stubGlobal('location', {
      hostname: 'example.gouv.fr',
      protocol: 'https:',
      origin: 'https://example.gouv.fr',
      href: 'https://example.gouv.fr/',
    });

    const sendWidgetBeacon = await loadBeacon();
    sendWidgetBeacon('dsfr-data-kpi');

    // Pixel was sent synchronously
    expect(imageSrcs).toHaveLength(1);
    expect(imageSrcs[0]).toContain('chartsbuilder.matge.com/beacon');
  });

  it('un transport enregistré qui retourne true remplace le pixel (#308)', async () => {
    (window as any).DSFR_DATA_BEACON = true;
    const transport = vi.fn().mockReturnValue(true);
    (window as any).DSFR_DATA_BEACON_TRANSPORT = transport;
    vi.stubGlobal('location', {
      hostname: 'example.gouv.fr',
      protocol: 'https:',
      origin: 'https://example.gouv.fr',
      href: 'https://example.gouv.fr/',
    });

    const sendWidgetBeacon = await loadBeacon();
    sendWidgetBeacon('dsfr-data-kpi');

    expect(transport).toHaveBeenCalledWith({
      component: 'dsfr-data-kpi',
      chartType: null,
      pageUrl: 'https://example.gouv.fr/',
    });
    expect(imageSrcs).toHaveLength(0);
    delete (window as any).DSFR_DATA_BEACON_TRANSPORT;
  });

  it('un transport qui retourne false ou jette laisse le pixel (#308)', async () => {
    (window as any).DSFR_DATA_BEACON = true;
    (window as any).DSFR_DATA_BEACON_TRANSPORT = vi.fn().mockImplementation(() => {
      throw new Error('transport KO');
    });
    vi.stubGlobal('location', {
      hostname: 'example.gouv.fr',
      protocol: 'https:',
      origin: 'https://example.gouv.fr',
      href: 'https://example.gouv.fr/',
    });

    const sendWidgetBeacon = await loadBeacon();
    sendWidgetBeacon('dsfr-data-chart', 'bar');

    expect(imageSrcs).toHaveLength(1);
    delete (window as any).DSFR_DATA_BEACON_TRANSPORT;
  });

  it('sans transport, le pixel reste le transport par defaut', async () => {
    (window as any).DSFR_DATA_BEACON = true;
    vi.stubGlobal('location', {
      hostname: 'example.gouv.fr',
      protocol: 'https:',
      origin: 'https://example.gouv.fr',
      href: 'https://example.gouv.fr/',
    });

    const sendWidgetBeacon = await loadBeacon();
    sendWidgetBeacon('dsfr-data-chart', 'line');

    // Without DB mode, pixel is created synchronously
    expect(imageSrcs).toHaveLength(1);
    expect(imageSrcs[0]).toContain('chartsbuilder.matge.com/beacon');
  });

  // --- Override runtime de l'URL de collecte (#340) ---

  it('window.DSFR_DATA_BEACON_URL prend le pas sur l URL bakee', async () => {
    (window as any).DSFR_DATA_BEACON = true;
    (window as any).DSFR_DATA_BEACON_URL = 'https://collecte.ministere.fr/';
    vi.stubGlobal('location', {
      hostname: 'example.gouv.fr',
      protocol: 'https:',
      origin: 'https://example.gouv.fr',
      href: 'https://example.gouv.fr/',
    });

    const sendWidgetBeacon = await loadBeacon('https://chartsbuilder.matge.com');
    sendWidgetBeacon('dsfr-data-kpi');

    expect(imageSrcs).toHaveLength(1);
    const url = new URL(imageSrcs[0]);
    expect(url.origin).toBe('https://collecte.ministere.fr');
    expect(url.pathname).toBe('/beacon');
  });

  it('window.DSFR_DATA_BEACON_URL active la collecte meme sans URL bakee', async () => {
    (window as any).DSFR_DATA_BEACON = true;
    (window as any).DSFR_DATA_BEACON_URL = 'https://collecte.ministere.fr';
    vi.stubGlobal('location', {
      hostname: 'example.gouv.fr',
      protocol: 'https:',
      origin: 'https://example.gouv.fr',
      href: 'https://example.gouv.fr/',
    });

    const sendWidgetBeacon = await loadBeacon('');
    sendWidgetBeacon('dsfr-data-kpi');

    expect(imageSrcs).toHaveLength(1);
    expect(imageSrcs[0]).toContain('https://collecte.ministere.fr/beacon');
  });

  it('skip sur le host de collecte resolu via override (pas de self-ping)', async () => {
    (window as any).DSFR_DATA_BEACON = true;
    (window as any).DSFR_DATA_BEACON_URL = 'https://collecte.ministere.fr';
    vi.stubGlobal('location', {
      hostname: 'collecte.ministere.fr',
      protocol: 'https:',
      origin: 'https://collecte.ministere.fr',
      href: 'https://collecte.ministere.fr/',
    });

    const sendWidgetBeacon = await loadBeacon('https://chartsbuilder.matge.com');
    sendWidgetBeacon('dsfr-data-kpi');

    expect(imageSrcs).toHaveLength(0);
  });

  // --- Cible declarative <dsfr-data-beacon> (#345) ---

  it('un <dsfr-data-beacon url> vaut opt-in et fournit l URL, sans window.DSFR_DATA_BEACON', async () => {
    externalLocation();
    addBeaconElement('https://collecte.ministere.fr');

    // Aucune URL bakee : seul l'element active et cible la collecte.
    const sendWidgetBeacon = await loadBeacon('');
    sendWidgetBeacon('dsfr-data-kpi');

    expect(imageSrcs).toHaveLength(1);
    expect(imageSrcs[0]).toContain('https://collecte.ministere.fr/beacon');
  });

  it('l URL de l element est prioritaire sur window.DSFR_DATA_BEACON_URL', async () => {
    externalLocation();
    (window as any).DSFR_DATA_BEACON = true;
    (window as any).DSFR_DATA_BEACON_URL = 'https://override.window.fr';
    addBeaconElement('https://collecte.element.fr/');

    const sendWidgetBeacon = await loadBeacon('https://chartsbuilder.matge.com');
    sendWidgetBeacon('dsfr-data-kpi');

    expect(imageSrcs).toHaveLength(1);
    const url = new URL(imageSrcs[0]);
    expect(url.origin).toBe('https://collecte.element.fr');
    expect(url.pathname).toBe('/beacon');
  });

  it('window.DSFR_DATA_BEACON = false neutralise meme un element present (kill switch)', async () => {
    externalLocation();
    (window as any).DSFR_DATA_BEACON = false;
    addBeaconElement('https://collecte.ministere.fr');

    const sendWidgetBeacon = await loadBeacon('');
    sendWidgetBeacon('dsfr-data-kpi');

    expect(imageSrcs).toHaveLength(0);
  });

  it('un <dsfr-data-beacon> sans url ne vaut pas opt-in', async () => {
    externalLocation();
    addBeaconElement(''); // attribut url vide

    const sendWidgetBeacon = await loadBeacon('');
    sendWidgetBeacon('dsfr-data-kpi');
    await Promise.resolve();

    expect(imageSrcs).toHaveLength(0);
  });

  it('rattrape un element declare APRES le composant (timing DOM order)', async () => {
    externalLocation();
    // readyState happy-dom = 'complete' → deferBeacon passe par queueMicrotask.
    const sendWidgetBeacon = await loadBeacon('');

    // Le composant emet AVANT que l'element existe (connectedCallback synchrone).
    sendWidgetBeacon('dsfr-data-chart', 'bar');
    expect(imageSrcs).toHaveLength(0); // rien d'envoye dans le tick synchrone

    // L'element est parse juste apres, dans le meme tick.
    addBeaconElement('https://collecte.ministere.fr');
    // Couvre les deux branches de deferBeacon (DOMContentLoaded / microtask).
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();

    expect(imageSrcs).toHaveLength(1);
    expect(imageSrcs[0]).toContain('https://collecte.ministere.fr/beacon');
  });
});
