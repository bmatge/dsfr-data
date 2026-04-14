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
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  async function loadBeacon() {
    const mod = await import('@/utils/beacon.js');
    return mod.sendWidgetBeacon;
  }

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

  it('in DB mode, uses fetch API instead of synchronous pixel', async () => {
    (window as any).DSFR_DATA_BEACON = true;
    (window as any).__gwDbMode = true;
    vi.stubGlobal('location', {
      hostname: 'example.gouv.fr',
      protocol: 'https:',
      origin: 'https://example.gouv.fr',
      href: 'https://example.gouv.fr/',
    });
    // Mock fetch to succeed so the catch handler (pixel fallback) is never triggered
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    const sendWidgetBeacon = await loadBeacon();
    sendWidgetBeacon('dsfr-data-kpi');

    // In DB mode, the beacon is sent via fetch (async), not via Image pixel (sync)
    // So no synchronous Image.src assignment should have happened
    expect(imageSrcs).toHaveLength(0);
  });

  it('without DB mode, creates pixel synchronously', async () => {
    (window as any).DSFR_DATA_BEACON = true;
    delete (window as any).__gwDbMode;
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
});
