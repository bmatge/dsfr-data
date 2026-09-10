import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * tiles-switcher (#744) — sélecteur de fond de carte pour le LECTEUR.
 *
 * Les préréglages de fond existaient déjà, mais n'étaient exposés qu'à l'auteur
 * de la page par l'attribut `tiles` : personne ne pouvait basculer d'un plan à
 * une vue aérienne depuis la carte publiée. Le contrôle est un `select` natif
 * étiqueté, posé avant le conteneur Leaflet — utilisable au clavier, annoncé
 * par les lecteurs d'écran sans code de rôle maison.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataMap, resolveTilesChoices } from '@/components/dsfr-data-map.js';
import { DsfrDataMapInset } from '@/components/dsfr-data-map-inset.js';
import '@/components/dsfr-data-map-layer.js';

if (!customElements.get('dsfr-data-map')) customElements.define('dsfr-data-map', DsfrDataMap);
if (!customElements.get('dsfr-data-map-inset')) {
  customElements.define('dsfr-data-map-inset', DsfrDataMapInset);
}

/** Vue interne de la carte (membres privés pilotés par les tests). */
interface MapInternals {
  _initMap: () => Promise<void>;
  _container: HTMLDivElement | null;
  _injectStyles: () => void;
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));

/** Carte connectée et initialisée (Leaflet chargé, conteneur en place). */
async function readyMap(attrs: Record<string, string>): Promise<DsfrDataMap> {
  const map = document.createElement('dsfr-data-map') as DsfrDataMap;
  for (const [name, value] of Object.entries(attrs)) map.setAttribute(name, value);
  document.body.appendChild(map);
  await (map as unknown as MapInternals)._initMap();
  await map.updateComplete;
  return map;
}

const optionsOf = (map: DsfrDataMap) =>
  [...map.querySelectorAll('.dsfr-data-map__tiles-switcher option')].map((o) => ({
    value: (o as HTMLOptionElement).value,
    label: o.textContent,
  }));

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('#744 — resolveTilesChoices', () => {
  it('sans liste, aucun choix et aucun avertissement', () => {
    expect(resolveTilesChoices('')).toEqual({ choices: [], warnings: [] });
    expect(resolveTilesChoices('   ')).toEqual({ choices: [], warnings: [] });
  });

  it('rend les presets déclarés, dans l’ordre, avec leur libellé français', () => {
    const { choices, warnings } = resolveTilesChoices('ign-plan,ign-ortho', 'ign-plan');
    expect(choices).toEqual([
      { key: 'ign-plan', label: 'Plan IGN' },
      { key: 'ign-ortho', label: 'Vue aérienne IGN' },
    ]);
    expect(warnings).toEqual([]);
  });

  it('résout les alias et supprime les doublons', () => {
    const { choices } = resolveTilesChoices('ign-plan, osm, osm-fr , ign-plan', 'ign-plan');
    expect(choices.map((c) => c.key)).toEqual(['ign-plan', 'osm-fr']);
  });

  it('le fond courant absent de la liste est ajouté en tête', () => {
    const { choices } = resolveTilesChoices('ign-ortho,osm-fr', 'ign-cadastre');
    expect(choices.map((c) => c.key)).toEqual(['ign-cadastre', 'ign-ortho', 'osm-fr']);
  });

  it('une entrée qui n’est pas un preset connu est écartée avec un avertissement', () => {
    const { choices, warnings } = resolveTilesChoices(
      'ign-plan,https://exemple.tld/{z}/{x}/{y}.png,ign-ortho',
      'ign-plan'
    );
    expect(choices.map((c) => c.key)).toEqual(['ign-plan', 'ign-ortho']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('exemple.tld');
  });

  it('un seul fond retenu ne donne aucun sélecteur, mais le dit', () => {
    const { choices, warnings } = resolveTilesChoices('ign-plan', 'ign-plan');
    expect(choices).toEqual([]);
    expect(warnings[0]).toContain('un seul fond');
  });

  it('sovereign-only : les fonds non souverains retombent sur ign-plan, donc rien à choisir', () => {
    const { choices } = resolveTilesChoices('ign-plan,osm-fr', 'ign-plan', true);
    expect(choices).toEqual([]);
    const souverains = resolveTilesChoices('ign-plan,ign-ortho', 'ign-plan', true);
    expect(souverains.choices.map((c) => c.key)).toEqual(['ign-plan', 'ign-ortho']);
  });
});

describe('#744 — le contrôle dans la carte', () => {
  it('défaut : aucun sélecteur', async () => {
    const map = await readyMap({});
    expect(map.tilesSwitcher).toBe('');
    expect(map.querySelector('.dsfr-data-map__tiles-switcher')).toBeNull();
  });

  it('un menu déroulant étiqueté, avec un choix par préréglage déclaré', async () => {
    const map = await readyMap({ 'tiles-switcher': 'ign-plan,ign-ortho,osm-fr' });
    const select = map.querySelector('.dsfr-data-map__tiles-switcher select');
    const label = map.querySelector('.dsfr-data-map__tiles-switcher label');
    expect(select).not.toBeNull();
    expect(label?.textContent).toBe('Fond de carte');
    expect(label?.getAttribute('for')).toBe((select as HTMLSelectElement).id);
    expect((select as HTMLSelectElement).id).not.toBe('');
    expect(optionsOf(map)).toEqual([
      { value: 'ign-plan', label: 'Plan IGN' },
      { value: 'ign-ortho', label: 'Vue aérienne IGN' },
      { value: 'osm-fr', label: 'OpenStreetMap France' },
    ]);
    expect((select as HTMLSelectElement).value).toBe('ign-plan');
  });

  it('un select natif : atteint au clavier, avant la carte dans l’ordre de tabulation', async () => {
    const map = await readyMap({ 'tiles-switcher': 'ign-plan,ign-ortho' });
    const select = map.querySelector('.dsfr-data-map__tiles-switcher select') as HTMLSelectElement;
    const container = (map as unknown as MapInternals)._container;
    // Pas de tabindex negatif, pas de disabled : le select est focusable tel quel
    expect(select.hasAttribute('disabled')).toBe(false);
    expect(select.getAttribute('tabindex')).toBeNull();
    expect(
      select.compareDocumentPosition(container as Node) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('le fond courant est l’option sélectionnée, même hors de la liste', async () => {
    const map = await readyMap({ tiles: 'ign-cadastre', 'tiles-switcher': 'ign-plan,ign-ortho' });
    const select = map.querySelector('.dsfr-data-map__tiles-switcher select') as HTMLSelectElement;
    expect(select.value).toBe('ign-cadastre');
    expect(optionsOf(map).map((o) => o.value)).toEqual(['ign-cadastre', 'ign-plan', 'ign-ortho']);
  });

  it('changer de fond met à jour `tiles`, annonce l’état et notifie la page', async () => {
    const map = await readyMap({ 'tiles-switcher': 'ign-plan,ign-ortho' });
    const select = map.querySelector('.dsfr-data-map__tiles-switcher select') as HTMLSelectElement;
    const events: string[] = [];
    map.addEventListener('dsfr-data-map-tiles-change', (e) => {
      events.push((e as CustomEvent<{ tiles: string }>).detail.tiles);
    });

    select.value = 'ign-ortho';
    select.dispatchEvent(new Event('change'));
    await map.updateComplete;

    expect(map.tiles).toBe('ign-ortho');
    expect(events).toEqual(['ign-ortho']);
    await nextFrame();
    const live = map.querySelector('[aria-live]');
    expect(live?.textContent).toBe('Fond de carte : Vue aérienne IGN.');
  });

  it('les encarts suivent le fond choisi par le lecteur', async () => {
    const map = document.createElement('dsfr-data-map') as DsfrDataMap;
    map.setAttribute('tiles', 'ign-plan');
    map.setAttribute('tiles-switcher', 'ign-plan,ign-ortho');
    const layer = document.createElement('dsfr-data-map-layer');
    layer.setAttribute('source', 'x');
    map.appendChild(layer);
    const inset = document.createElement('dsfr-data-map-inset') as DsfrDataMapInset;
    inset.setAttribute('territory', 'guadeloupe');
    map.appendChild(inset);
    document.body.appendChild(map);
    await (map as unknown as MapInternals)._initMap();
    await nextFrame();
    expect(inset.querySelector('dsfr-data-map')?.getAttribute('tiles')).toBe('ign-plan');

    const select = map.querySelector('.dsfr-data-map__tiles-switcher select') as HTMLSelectElement;
    select.value = 'ign-ortho';
    select.dispatchEvent(new Event('change'));
    await map.updateComplete;

    expect(inset.querySelector('dsfr-data-map')?.getAttribute('tiles')).toBe('ign-ortho');
  });

  it('rien sur une carte verrouillée ou sans contrôles (les encarts en sont)', async () => {
    const locked = await readyMap({ 'tiles-switcher': 'ign-plan,ign-ortho', locked: '' });
    expect(locked.querySelector('.dsfr-data-map__tiles-switcher')).toBeNull();
    const bare = await readyMap({ 'tiles-switcher': 'ign-plan,ign-ortho', 'no-controls': '' });
    expect(bare.querySelector('.dsfr-data-map__tiles-switcher')).toBeNull();
  });

  it('une liste modifiée après coup reconstruit le sélecteur', async () => {
    const map = await readyMap({ 'tiles-switcher': 'ign-plan,ign-ortho' });
    map.tilesSwitcher = 'ign-plan,osm-fr,opentopomap';
    await map.updateComplete;
    expect(optionsOf(map).map((o) => o.value)).toEqual(['ign-plan', 'osm-fr', 'opentopomap']);
    map.tilesSwitcher = '';
    await map.updateComplete;
    expect(map.querySelector('.dsfr-data-map__tiles-switcher')).toBeNull();
  });

  it('la feuille injectée pose le contrôle en surimpression de la carte', () => {
    (new DsfrDataMap() as unknown as MapInternals)._injectStyles();
    const css = document.head.querySelector('style[data-dsfr-data-map]')?.textContent ?? '';
    expect(css).toContain('.dsfr-data-map__tiles-switcher');
    expect(css).toMatch(/\.dsfr-data-map__tiles-switcher \{[^}]*position: absolute;/);
  });
});
