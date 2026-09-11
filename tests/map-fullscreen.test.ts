import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #780 — contrôle de plein écran de dsfr-data-map (volet de AM-061 scindé :
 * la capture d'image reste refusée).
 *
 * happy-dom n'implémente pas l'API Fullscreen : les tests la simulent
 * (`fullscreenEnabled`, `fullscreenElement`, `requestFullscreen`,
 * `exitFullscreen`, événement `fullscreenchange`) — c'est le contrat
 * qu'utilise le composant, rien de plus.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataMap } from '@/components/dsfr-data-map.js';

if (!customElements.get('dsfr-data-map')) customElements.define('dsfr-data-map', DsfrDataMap);

interface MapInternals {
  _initMap: () => Promise<void>;
  _leafletMap: { invalidateSize: () => void } | null;
}

let fullscreenElement: Element | null = null;

function enterFullscreen(el: Element) {
  fullscreenElement = el;
  document.dispatchEvent(new Event('fullscreenchange'));
}

function installFullscreenApi(enabled = true) {
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => enabled });
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fullscreenElement,
  });
  (
    HTMLElement.prototype as unknown as { requestFullscreen: () => Promise<void> }
  ).requestFullscreen = function (this: Element) {
    enterFullscreen(this);
    return Promise.resolve();
  };
  (document as unknown as { exitFullscreen: () => Promise<void> }).exitFullscreen = () => {
    fullscreenElement = null;
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  };
}

async function readyMap(attrs: Record<string, string>): Promise<DsfrDataMap> {
  const map = document.createElement('dsfr-data-map') as DsfrDataMap;
  map.id = 'carte-fs';
  for (const [name, value] of Object.entries(attrs)) map.setAttribute(name, value);
  document.body.appendChild(map);
  await (map as unknown as MapInternals)._initMap();
  await map.updateComplete;
  return map;
}

const buttonOf = (map: DsfrDataMap) =>
  map.querySelector('.dsfr-data-map__fullscreen') as HTMLButtonElement | null;

beforeEach(() => {
  fullscreenElement = null;
  installFullscreenApi(true);
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('#780 — bouton de plein écran', () => {
  it('sans l’attribut, aucun bouton', async () => {
    const map = await readyMap({});
    expect(buttonOf(map)).toBeNull();
  });

  it('AC : un vrai bouton, avant la carte dans l’ordre de tabulation', async () => {
    const map = await readyMap({ fullscreen: '' });
    const button = buttonOf(map)!;
    expect(button.tagName).toBe('BUTTON');
    expect(button.type).toBe('button');
    expect(button.textContent).toBe('Plein écran');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    const container = map.querySelector('.dsfr-data-map__container')!;
    expect(
      button.compareDocumentPosition(container) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('AC : la carte passe en plein écran et en revient, état annoncé', async () => {
    const map = await readyMap({ fullscreen: '', name: 'Bornes de recharge' });
    const announce = vi.spyOn(map, 'announceToScreenReader');
    const events: boolean[] = [];
    map.addEventListener('dsfr-data-map-fullscreen-change', (e) =>
      events.push((e as CustomEvent<{ fullscreen: boolean }>).detail.fullscreen)
    );
    const button = buttonOf(map)!;

    button.click();
    await Promise.resolve();
    expect(document.fullscreenElement).toBe(map);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.textContent).toBe('Quitter le plein écran');
    expect(button.title).toContain('Bornes de recharge');
    expect(announce).toHaveBeenCalledWith('Carte en plein écran.');

    button.click();
    await Promise.resolve();
    expect(document.fullscreenElement).toBeNull();
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(announce).toHaveBeenLastCalledWith('Plein écran quitté.');
    expect(events).toEqual([true, false]);
  });

  it('AC : la carte recalcule sa taille à chaque bascule (pas de tuiles grises)', async () => {
    const map = await readyMap({ fullscreen: '' });
    const leaflet = (map as unknown as MapInternals)._leafletMap!;
    const spy = vi.spyOn(leaflet, 'invalidateSize');
    buttonOf(map)!.click();
    await Promise.resolve();
    expect(spy).toHaveBeenCalled();
  });

  it('une sortie par Échap (hors bouton) met aussi le bouton à jour', async () => {
    const map = await readyMap({ fullscreen: '' });
    buttonOf(map)!.click();
    await Promise.resolve();
    // Le navigateur sort seul du plein écran (Échap)
    fullscreenElement = null;
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(buttonOf(map)!.getAttribute('aria-pressed')).toBe('false');
  });

  it('le plein écran d’une AUTRE carte ne touche pas celle-ci', async () => {
    const map = await readyMap({ fullscreen: '' });
    const other = document.createElement('div');
    document.body.appendChild(other);
    const announce = vi.spyOn(map, 'announceToScreenReader');
    fullscreenElement = other;
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(buttonOf(map)!.getAttribute('aria-pressed')).toBe('false');
    expect(announce).not.toHaveBeenCalled();
  });

  it('pas de bouton sans API Fullscreen (Safari iPhone), ni en locked / no-controls', async () => {
    installFullscreenApi(false);
    expect(buttonOf(await readyMap({ fullscreen: '' }))).toBeNull();
    installFullscreenApi(true);
    expect(buttonOf(await readyMap({ fullscreen: '', locked: '' }))).toBeNull();
    expect(buttonOf(await readyMap({ fullscreen: '', 'no-controls': '' }))).toBeNull();
  });

  it('retirer l’attribut retire le bouton', async () => {
    const map = await readyMap({ fullscreen: '' });
    map.removeAttribute('fullscreen');
    await map.updateComplete;
    expect(buttonOf(map)).toBeNull();
  });
});
