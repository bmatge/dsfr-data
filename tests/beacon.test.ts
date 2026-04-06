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
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function loadBeacon() {
    const mod = await import('@/utils/beacon.js');
    return mod.sendWidgetBeacon;
  }

  it('skips on localhost', async () => {
    // jsdom defaults to localhost
    const sendWidgetBeacon = await loadBeacon();
    sendWidgetBeacon('dsfr-data-kpi');
    expect(imageSrcs).toHaveLength(0);
  });

  it('skips on 127.0.0.1', async () => {
    const originalLocation = window.location.hostname;
    Object.defineProperty(window, 'location', {
      value: { ...window.location, hostname: '127.0.0.1' },
      writable: true,
    });

    const sendWidgetBeacon = await loadBeacon();
    sendWidgetBeacon('dsfr-data-kpi');
    expect(imageSrcs).toHaveLength(0);

    Object.defineProperty(window, 'location', {
      value: { ...window.location, hostname: originalLocation },
      writable: true,
    });
  });

  it('skips on chartsbuilder.matge.com', async () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, hostname: 'chartsbuilder.matge.com' },
      writable: true,
    });

    const sendWidgetBeacon = await loadBeacon();
    sendWidgetBeacon('dsfr-data-kpi');
    expect(imageSrcs).toHaveLength(0);

    Object.defineProperty(window, 'location', {
      value: { ...window.location, hostname: 'localhost' },
      writable: true,
    });
  });

  it('sends beacon on external host with origin parameter', async () => {
    const originalLocation = window.location;
    // Use a full replacement to ensure jsdom picks up the new values
    Object.defineProperty(window, 'location', {
      value: {
        ...originalLocation,
        hostname: 'example.gouv.fr',
        origin: 'https://example.gouv.fr',
      },
      writable: true,
      configurable: true,
    });

    const sendWidgetBeacon = await loadBeacon();
    sendWidgetBeacon('dsfr-data-kpi');

    expect(imageSrcs).toHaveLength(1);
    const url = new URL(imageSrcs[0]);
    expect(url.pathname).toBe('/beacon');
    expect(url.searchParams.get('c')).toBe('dsfr-data-kpi');
    // The 'r' param contains window.location.origin
    expect(url.searchParams.has('r')).toBe(true);

    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it('includes subtype in beacon URL', async () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, hostname: 'example.gouv.fr', origin: 'https://example.gouv.fr' },
      writable: true,
    });

    const sendWidgetBeacon = await loadBeacon();
    sendWidgetBeacon('dsfr-data-chart', 'bar');

    expect(imageSrcs).toHaveLength(1);
    const url = new URL(imageSrcs[0]);
    expect(url.searchParams.get('c')).toBe('dsfr-data-chart');
    expect(url.searchParams.get('t')).toBe('bar');

    Object.defineProperty(window, 'location', {
      value: { ...window.location, hostname: 'localhost' },
      writable: true,
    });
  });

  it('deduplicates by component+type', async () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, hostname: 'example.gouv.fr', origin: 'https://example.gouv.fr' },
      writable: true,
    });

    const sendWidgetBeacon = await loadBeacon();
    sendWidgetBeacon('dsfr-data-kpi');
    sendWidgetBeacon('dsfr-data-kpi');
    sendWidgetBeacon('dsfr-data-kpi');

    expect(imageSrcs).toHaveLength(1);

    Object.defineProperty(window, 'location', {
      value: { ...window.location, hostname: 'localhost' },
      writable: true,
    });
  });

  it('sends separate beacons for different components', async () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, hostname: 'example.gouv.fr', origin: 'https://example.gouv.fr' },
      writable: true,
    });

    const sendWidgetBeacon = await loadBeacon();
    sendWidgetBeacon('dsfr-data-kpi');
    sendWidgetBeacon('dsfr-data-list');

    expect(imageSrcs).toHaveLength(2);

    Object.defineProperty(window, 'location', {
      value: { ...window.location, hostname: 'localhost' },
      writable: true,
    });
  });

  it('sends separate beacons for same component with different subtypes', async () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, hostname: 'example.gouv.fr', origin: 'https://example.gouv.fr' },
      writable: true,
    });

    const sendWidgetBeacon = await loadBeacon();
    sendWidgetBeacon('dsfr-data-chart', 'bar');
    sendWidgetBeacon('dsfr-data-chart', 'line');

    expect(imageSrcs).toHaveLength(2);

    Object.defineProperty(window, 'location', {
      value: { ...window.location, hostname: 'localhost' },
      writable: true,
    });
  });

  it('uses tracking pixel (Image) instead of fetch when not in DB mode', async () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, hostname: 'example.gouv.fr', origin: 'https://example.gouv.fr' },
      writable: true,
    });

    const sendWidgetBeacon = await loadBeacon();
    sendWidgetBeacon('dsfr-data-kpi');

    // Pixel was sent synchronously
    expect(imageSrcs).toHaveLength(1);
    expect(imageSrcs[0]).toContain('chartsbuilder.matge.com/beacon');

    Object.defineProperty(window, 'location', {
      value: { ...window.location, hostname: 'localhost' },
      writable: true,
    });
  });

  it('in DB mode, uses fetch API instead of synchronous pixel', async () => {
    (window as any).__gwDbMode = true;
    Object.defineProperty(window, 'location', {
      value: { ...window.location, hostname: 'example.gouv.fr', origin: 'https://example.gouv.fr' },
      writable: true,
    });

    const sendWidgetBeacon = await loadBeacon();
    sendWidgetBeacon('dsfr-data-kpi');

    // In DB mode, the beacon is sent via fetch (async), not via Image pixel (sync)
    // So no synchronous Image.src assignment should have happened
    expect(imageSrcs).toHaveLength(0);

    Object.defineProperty(window, 'location', {
      value: { ...window.location, hostname: 'localhost' },
      writable: true,
    });
  });

  it('without DB mode, creates pixel synchronously', async () => {
    delete (window as any).__gwDbMode;
    Object.defineProperty(window, 'location', {
      value: { ...window.location, hostname: 'example.gouv.fr', origin: 'https://example.gouv.fr' },
      writable: true,
    });

    const sendWidgetBeacon = await loadBeacon();
    sendWidgetBeacon('dsfr-data-chart', 'line');

    // Without DB mode, pixel is created synchronously
    expect(imageSrcs).toHaveLength(1);
    expect(imageSrcs[0]).toContain('chartsbuilder.matge.com/beacon');

    Object.defineProperty(window, 'location', {
      value: { ...window.location, hostname: 'localhost' },
      writable: true,
    });
  });
});
