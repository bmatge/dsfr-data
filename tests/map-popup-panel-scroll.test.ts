import { describe, it, expect, vi } from 'vitest';

/**
 * Test #431 (suivi) — le panel de dsfr-data-map-popup est ancre dans le
 * conteneur Leaflet : ses evenements molette/souris ne doivent PAS remonter
 * au conteneur, sinon la molette zoome la carte au lieu de scroller le volet.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataMapPopup } from '@/components/dsfr-data-map-popup.js';

function makeMapWithContainer(): { mapEl: HTMLElement; container: HTMLDivElement } {
  const mapEl = document.createElement('dsfr-data-map');
  const container = document.createElement('div');
  container.className = 'dsfr-data-map__container';
  mapEl.appendChild(container);
  document.body.appendChild(mapEl);
  return { mapEl, container };
}

describe('#431 — isolation des evenements du panel', () => {
  it('le panel est ancre dans le conteneur Leaflet', () => {
    const { mapEl, container } = makeMapWithContainer();
    const popup = new DsfrDataMapPopup();
    popup.mode = 'panel-right';
    mapEl.appendChild(popup);

    popup.showForRecord({ nom: 'Test' });
    const panel = container.querySelector('.dsfr-data-map-popup__panel');
    expect(panel).not.toBeNull();
    popup.close();
  });

  it('wheel/dblclick/mousedown sur le panel ne remontent pas au conteneur', () => {
    const { mapEl, container } = makeMapWithContainer();
    const popup = new DsfrDataMapPopup();
    popup.mode = 'panel-right';
    mapEl.appendChild(popup);
    popup.showForRecord({ nom: 'Test' });

    const panel = container.querySelector('.dsfr-data-map-popup__panel')!;
    const received: string[] = [];
    for (const type of ['wheel', 'dblclick', 'mousedown']) {
      container.addEventListener(type, () => received.push(type));
    }

    panel.dispatchEvent(new Event('wheel', { bubbles: true }));
    panel.dispatchEvent(new Event('dblclick', { bubbles: true }));
    panel.dispatchEvent(new Event('mousedown', { bubbles: true }));

    // Le conteneur (gestionnaires Leaflet) ne recoit rien
    expect(received).toEqual([]);

    // Contre-epreuve : un wheel directement sur le conteneur passe toujours
    container.dispatchEvent(new Event('wheel', { bubbles: true }));
    expect(received).toEqual(['wheel']);
    popup.close();
  });

  it('sans conteneur (fallback host), le panel fonctionne toujours', () => {
    const mapEl = document.createElement('dsfr-data-map');
    document.body.appendChild(mapEl);
    const popup = new DsfrDataMapPopup();
    popup.mode = 'panel-right';
    mapEl.appendChild(popup);

    popup.showForRecord({ nom: 'Test' });
    expect(mapEl.querySelector('.dsfr-data-map-popup__panel')).not.toBeNull();
    popup.close();
  });
});
