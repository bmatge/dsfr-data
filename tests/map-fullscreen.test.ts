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

/**
 * #825 — la carte principale tombait a 0 px en plein ecran des que la carte
 * portait des encarts. La regle de #780 mettait l'hote en `display: flex`,
 * or les encarts sont des FLOTTANTS (#643) : un conteneur flex ignore le
 * float, chaque encart devenait un item empile en colonne, et la somme de
 * leurs hauteurs ecrasait le volet principal.
 */
describe('#825 — plein écran avec des encarts', () => {
  const stub = (el: HTMLElement, props: Record<string, number>) => {
    for (const [name, value] of Object.entries(props)) {
      Object.defineProperty(el, name, { configurable: true, get: () => value });
    }
  };

  const addInsets = (map: DsfrDataMap, count: number, top: number, height: number) => {
    for (let i = 0; i < count; i++) {
      const inset = document.createElement('dsfr-data-map-inset');
      inset.setAttribute('territory', `t${i}`);
      map.appendChild(inset);
      stub(inset as HTMLElement, { offsetTop: top, offsetHeight: height });
    }
  };

  // Contrat de CLASSES et de REGLES : ce test lit le TEXTE de la feuille emise.
  // Il ne prouve AUCUNE mise en page calculee — happy-dom n'en calcule pas.
  // La mise en page, elle, est MESUREE par `e2e/map-fullscreen.spec.ts` (#845).
  it("l'hôte ne passe PAS en flex : le float des encarts doit rester actif", () => {
    const css = document.querySelector('style[data-dsfr-data-map]')?.textContent ?? '';
    expect(css).toContain('dsfr-data-map:fullscreen');
    const regle = css.slice(css.indexOf('dsfr-data-map:fullscreen'));
    expect(regle.slice(0, regle.indexOf('}'))).not.toContain('display: flex');
  });

  it('le volet principal prend la hauteur de l’écran moins la rangée d’encarts', async () => {
    const map = await readyMap({ fullscreen: '' });
    const container = map.querySelector('.dsfr-data-map__container') as HTMLElement;
    container.style.height = '400px';
    stub(map, { clientHeight: 900 });
    addInsets(map, 5, 713, 187);

    enterFullscreen(map);
    expect(container.style.height).toBe('713px');

    await (document as unknown as { exitFullscreen: () => Promise<void> }).exitFullscreen();
    expect(container.style.height).toBe('400px');
  });

  it('sans encart, le volet prend toute la hauteur de l’écran', async () => {
    const map = await readyMap({ fullscreen: '' });
    const container = map.querySelector('.dsfr-data-map__container') as HTMLElement;
    stub(map, { clientHeight: 900 });
    enterFullscreen(map);
    expect(container.style.height).toBe('900px');
  });

  it('des encarts sur DEUX rangées sont comptés en entier (carte étroite)', async () => {
    const map = await readyMap({ fullscreen: '' });
    const container = map.querySelector('.dsfr-data-map__container') as HTMLElement;
    stub(map, { clientHeight: 900 });
    addInsets(map, 3, 526, 187);
    addInsets(map, 2, 713, 187);
    enterFullscreen(map);
    expect(container.style.height).toBe('526px');
  });
});

/**
 * Revue du 2026-09-13 — le correctif #825 posait la hauteur UNE fois, a
 * l'entree. Or en mode ratio (`height="60%"`, l'exemple du guide IA), le
 * ResizeObserver de `_applyHeight` reposait largeur × ratio a chaque
 * redimensionnement de l'hote — donc des l'entree en plein ecran, qui
 * redimensionne l'hote : 1152 px sur un 1920×1080, les encarts hors cadre.
 *
 * happy-dom n'a pas de ResizeObserver : on en installe un faux qui expose
 * ses rappels, et on le declenche comme le ferait le navigateur.
 */
describe('#825 (suite) — le plein écran survit au ResizeObserver', () => {
  const callbacks: Array<() => void> = [];
  class FakeResizeObserver {
    constructor(cb: () => void) {
      callbacks.push(cb);
    }
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  const fireResize = () => {
    for (const cb of [...callbacks]) cb();
  };
  const stub = (el: HTMLElement, props: Record<string, number>) => {
    for (const [name, value] of Object.entries(props)) {
      Object.defineProperty(el, name, { configurable: true, get: () => value });
    }
  };

  beforeEach(() => {
    callbacks.length = 0;
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;
  });

  afterEach(() => {
    delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
  });

  it('height="60%" : l’entrée en plein écran ne réapplique pas le ratio', async () => {
    const map = await readyMap({ fullscreen: '', height: '60%' });
    const container = map.querySelector('.dsfr-data-map__container') as HTMLElement;
    stub(map, { clientWidth: 1000, clientHeight: 400 });
    fireResize();
    expect(container.style.height).toBe('600px');

    // Entrée : l'hôte passe à l'écran (1920×1080), le navigateur notifie le RO.
    stub(map, { clientWidth: 1920, clientHeight: 1080 });
    enterFullscreen(map);
    fireResize();
    expect(container.style.height).toBe('1080px');
  });

  it('une rotation PENDANT le plein écran recalcule la hauteur du volet', async () => {
    const map = await readyMap({ fullscreen: '', height: '400px' });
    const container = map.querySelector('.dsfr-data-map__container') as HTMLElement;
    stub(map, { clientWidth: 1080, clientHeight: 1920 });
    enterFullscreen(map);
    expect(container.style.height).toBe('1920px');

    stub(map, { clientWidth: 1920, clientHeight: 1080 });
    fireResize();
    expect(container.style.height).toBe('1080px');
  });

  it('à la sortie, le ratio reprend la main sur la largeur courante', async () => {
    const map = await readyMap({ fullscreen: '', height: '60%' });
    const container = map.querySelector('.dsfr-data-map__container') as HTMLElement;
    stub(map, { clientWidth: 1000, clientHeight: 400 });
    fireResize();
    stub(map, { clientWidth: 1920, clientHeight: 1080 });
    enterFullscreen(map);
    fireResize();

    // La fenêtre a été réduite pendant le plein écran : la valeur sauvée à
    // l'entrée (600px) est périmée, le ratio doit tirer 480px de 800px.
    stub(map, { clientWidth: 800, clientHeight: 300 });
    await (document as unknown as { exitFullscreen: () => Promise<void> }).exitFullscreen();
    expect(container.style.height).toBe('480px');
  });
});
