import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Le volet lateral (`mode="panel-*"`) est ancre a droite dans le conteneur
 * Leaflet, qui est en `overflow: hidden`. Une largeur demandee superieure a
 * celle de la carte ne deborde donc pas vers la droite : le volet sort par la
 * GAUCHE et se fait rogner, les debuts de lignes disparaissent (titre, libelles,
 * valeurs). C'est le cas nominal sur telephone — 375-393 px de viewport moins
 * les gouttieres DSFR donnent une carte d'environ 340 px, quand la doc et le
 * builder proposent 350 a 400 px.
 *
 * Garde-fou : la largeur reste appliquee telle quelle (style en ligne), mais la
 * feuille injectee la borne a la largeur de la carte.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataMapPopup } from '@/components/dsfr-data-map-popup.js';

function panelStyleSheet(): string {
  return document.querySelector('style[data-dsfr-map-popup]')?.textContent ?? '';
}

/** Corps d'une regle CSS de la feuille injectee, selecteur exact. */
function ruleBody(selector: string): string {
  const css = panelStyleSheet();
  const start = css.indexOf(`${selector} {`);
  expect(start, `regle ${selector} absente de la feuille injectee`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('}', start));
}

function mountPanel(width?: string): HTMLElement {
  const mapEl = document.createElement('dsfr-data-map');
  const container = document.createElement('div');
  container.className = 'dsfr-data-map__container';
  mapEl.appendChild(container);
  document.body.appendChild(mapEl);

  const popup = new DsfrDataMapPopup();
  popup.mode = 'panel-right';
  if (width) popup.width = width;
  mapEl.appendChild(popup);
  popup.showForRecord({ nom: 'Communaute de communes des Terres d Auxois' });

  return container.querySelector('.dsfr-data-map-popup__panel') as HTMLElement;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('largeur du volet lateral sur ecran etroit', () => {
  it('la largeur demandee reste appliquee en style en ligne', () => {
    const panel = mountPanel('400px');
    expect(panel.style.width).toBe('400px');
  });

  it('la largeur par defaut reste 350px', () => {
    const panel = mountPanel();
    expect(panel.style.width).toBe('350px');
  });

  it('le volet est borne a la largeur de la carte', () => {
    mountPanel('400px');
    expect(ruleBody('.dsfr-data-map-popup__panel')).toContain('max-width: 100%');
  });
});
