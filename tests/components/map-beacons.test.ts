import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock beacon before importing the components
vi.mock('@/utils/beacon.js', () => ({
  sendWidgetBeacon: vi.fn(),
}));

import { sendWidgetBeacon } from '@/utils/beacon.js';
import { DsfrDataMapLayer } from '@/components/dsfr-data-map-layer.js';
import { DsfrDataMapPopup } from '@/components/dsfr-data-map-popup.js';
import { DsfrDataMapTimeline } from '@/components/dsfr-data-map-timeline.js';
import { DsfrDataMap } from '@/components/dsfr-data-map.js';

/**
 * #293 : tous les composants publics de la famille carte envoient un beacon,
 * avec la convention de sous-type de beacon.ts (variante fonctionnelle,
 * jamais de config technique, omis plutot que '').
 */
describe('map family beacons (#293)', () => {
  beforeEach(() => {
    vi.mocked(sendWidgetBeacon).mockClear();
  });

  it('dsfr-data-map-layer sends a beacon with its layer type as subtype', () => {
    const layer = new DsfrDataMapLayer();
    layer.type = 'heatmap';
    layer.connectedCallback();
    expect(sendWidgetBeacon).toHaveBeenCalledWith('dsfr-data-map-layer', 'heatmap');
    layer.disconnectedCallback();
  });

  it('dsfr-data-map-popup sends a beacon without subtype', () => {
    const popup = new DsfrDataMapPopup();
    popup.connectedCallback();
    expect(sendWidgetBeacon).toHaveBeenCalledWith('dsfr-data-map-popup');
    popup.disconnectedCallback();
  });

  it('dsfr-data-map-timeline omits the subtype instead of passing an empty string', () => {
    const timeline = new DsfrDataMapTimeline();
    timeline.connectedCallback();
    expect(sendWidgetBeacon).toHaveBeenCalledWith('dsfr-data-map-timeline');
    expect(sendWidgetBeacon).not.toHaveBeenCalledWith('dsfr-data-map-timeline', '');
    timeline.disconnectedCallback();
  });

  it('dsfr-data-map does not send its tile preset as subtype (config, not variant)', () => {
    const map = new DsfrDataMap();
    map.tiles = 'ign';
    map.connectedCallback();
    expect(sendWidgetBeacon).toHaveBeenCalledWith('dsfr-data-map');
    map.disconnectedCallback();
  });
});
