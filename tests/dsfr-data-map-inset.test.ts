import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * Tests dsfr-data-map-inset — encarts territoriaux (DROM, Corse...).
 *
 * L'encart clone les couches de la carte hote dans une mini-carte verrouillee
 * et delegue son popup a la carte hote (volet unique). Presets de territoires
 * francais + raccourci `insets` sur dsfr-data-map.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import {
  DsfrDataMapInset,
  TERRITORY_PRESETS,
  TERRITORY_GROUPS,
} from '@/components/dsfr-data-map-inset.js';
import { DsfrDataMap } from '@/components/dsfr-data-map.js';
import '@/components/dsfr-data-map-layer.js';
import '@/components/dsfr-data-map-popup.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));

// Quirk happy-dom/vitest : selon l'ordre du graphe de modules, le decorateur
// @customElement de dsfr-data-map peut ne pas s'executer dans la fenetre de
// test. Les tests du raccourci `insets` dependent d'un vrai upgrade (le
// connectedCallback de la carte hote) : on garantit la definition.
if (!customElements.get('dsfr-data-map')) {
  customElements.define('dsfr-data-map', DsfrDataMap);
}

/** Carte hote minimale : une couche geoshape + un encart passe en options */
function makeHost(attrs: Record<string, string> = {}): DsfrDataMap {
  const host = document.createElement('dsfr-data-map') as DsfrDataMap;
  host.setAttribute('center', '46.5,2.6');
  host.setAttribute('zoom', '6');
  host.setAttribute('tiles', 'ign-plan');
  for (const [k, v] of Object.entries(attrs)) host.setAttribute(k, v);

  const layer = document.createElement('dsfr-data-map-layer');
  layer.id = 'couche-principale';
  layer.setAttribute('source', 'territoires');
  layer.setAttribute('type', 'geoshape');
  layer.setAttribute('geo-field', 'geojson');
  host.appendChild(layer);
  return host;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('presets de territoires', () => {
  it('expose les 5 DROM + COM + Corse', () => {
    for (const t of [
      'guadeloupe',
      'martinique',
      'guyane',
      'la-reunion',
      'mayotte',
      'saint-pierre-et-miquelon',
      'saint-martin',
      'saint-barthelemy',
      'nouvelle-caledonie',
      'polynesie-francaise',
      'wallis-et-futuna',
      'corse',
    ]) {
      expect(TERRITORY_PRESETS[t], `preset ${t}`).toBeDefined();
      expect(TERRITORY_PRESETS[t].center).toMatch(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/);
      expect(TERRITORY_PRESETS[t].zoom).toBeGreaterThan(0);
      expect(TERRITORY_PRESETS[t].label.length).toBeGreaterThan(2);
    }
  });

  it('le groupe drom contient les 5 DROM', () => {
    expect(TERRITORY_GROUPS.drom).toEqual([
      'guadeloupe',
      'martinique',
      'guyane',
      'la-reunion',
      'mayotte',
    ]);
  });
});

describe("construction de l'encart", () => {
  it('territory=guadeloupe : label, mini-carte verrouillee, couche clonee sans id', async () => {
    const host = makeHost();
    const inset = document.createElement('dsfr-data-map-inset') as DsfrDataMapInset;
    inset.setAttribute('territory', 'guadeloupe');
    host.appendChild(inset);
    document.body.appendChild(host);
    await nextFrame();

    const label = inset.querySelector('.dsfr-data-map-inset__label');
    expect(label?.textContent).toBe('Guadeloupe');

    const inner = inset.querySelector('dsfr-data-map');
    expect(inner).not.toBeNull();
    expect(inner!.getAttribute('center')).toBe(TERRITORY_PRESETS.guadeloupe.center);
    expect(inner!.getAttribute('zoom')).toBe(String(TERRITORY_PRESETS.guadeloupe.zoom));
    expect(inner!.getAttribute('min-zoom')).toBe(inner!.getAttribute('zoom'));
    expect(inner!.getAttribute('max-zoom')).toBe(inner!.getAttribute('zoom'));
    expect(inner!.hasAttribute('locked')).toBe(true);
    expect(inner!.hasAttribute('no-controls')).toBe(true);
    expect(inner!.getAttribute('tiles')).toBe('ign-plan');
    expect(inner!.getAttribute('name')).toContain('Guadeloupe');

    const clone = inner!.querySelector('dsfr-data-map-layer');
    expect(clone).not.toBeNull();
    expect(clone!.getAttribute('source')).toBe('territoires');
    expect(clone!.getAttribute('geo-field')).toBe('geojson');
    // Jamais d'id duplique dans le document
    expect(clone!.hasAttribute('id')).toBe(false);
    expect(document.querySelectorAll('#couche-principale').length).toBe(1);
  });

  it('les attributs explicites priment sur le preset (cadrage custom)', async () => {
    const host = makeHost();
    const inset = document.createElement('dsfr-data-map-inset');
    inset.setAttribute('territory', 'guyane');
    inset.setAttribute('center', '4.63,-52.45');
    inset.setAttribute('zoom', '8');
    host.appendChild(inset);
    document.body.appendChild(host);
    await nextFrame();

    const inner = inset.querySelector('dsfr-data-map')!;
    expect(inner.getAttribute('center')).toBe('4.63,-52.45');
    expect(inner.getAttribute('zoom')).toBe('8');
    // Le label vient du preset
    expect(inset.querySelector('.dsfr-data-map-inset__label')?.textContent).toBe('Guyane');
  });

  it('territoire inconnu : warning et pas de mini-carte', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const host = makeHost();
    const inset = document.createElement('dsfr-data-map-inset');
    inset.setAttribute('territory', 'atlantide');
    host.appendChild(inset);
    document.body.appendChild(host);
    await nextFrame();

    expect(inset.querySelector('dsfr-data-map')).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('atlantide'));
    warnSpy.mockRestore();
  });

  it('sans territory ni center : pas de mini-carte', async () => {
    const host = makeHost();
    const inset = document.createElement('dsfr-data-map-inset');
    host.appendChild(inset);
    document.body.appendChild(host);
    await nextFrame();
    expect(inset.querySelector('dsfr-data-map')).toBeNull();
  });

  it("hors d'une dsfr-data-map : pas de construction", async () => {
    const inset = document.createElement('dsfr-data-map-inset');
    inset.setAttribute('territory', 'corse');
    document.body.appendChild(inset);
    await nextFrame();
    expect(inset.querySelector('dsfr-data-map')).toBeNull();
  });
});

describe('raccourci insets sur dsfr-data-map', () => {
  it('insets="drom" genere les 5 encarts', async () => {
    const host = makeHost({ insets: 'drom' });
    document.body.appendChild(host);
    await nextFrame();

    const insets = host.querySelectorAll(':scope > dsfr-data-map-inset');
    expect(insets.length).toBe(5);
    expect([...insets].map((i) => i.getAttribute('territory'))).toEqual(TERRITORY_GROUPS.drom);
  });

  it('insets="drom,corse" cumule groupe et territoire', async () => {
    const host = makeHost({ insets: 'drom,corse' });
    document.body.appendChild(host);
    await nextFrame();
    expect(host.querySelectorAll(':scope > dsfr-data-map-inset').length).toBe(6);
  });

  it("un encart explicite pour le meme territoire n'est pas duplique", async () => {
    const host = makeHost({ insets: 'drom' });
    const explicit = document.createElement('dsfr-data-map-inset');
    explicit.setAttribute('territory', 'martinique');
    explicit.setAttribute('zoom', '10');
    host.appendChild(explicit);
    document.body.appendChild(host);
    await nextFrame();

    const martinique = host.querySelectorAll(
      ':scope > dsfr-data-map-inset[territory="martinique"]'
    );
    expect(martinique.length).toBe(1);
    expect(martinique[0].getAttribute('zoom')).toBe('10');
  });
});

describe('delegation du popup a la carte hote', () => {
  it('une couche clonee dans un encart resout le popup de la carte hote', async () => {
    const host = makeHost();
    const popup = document.createElement('dsfr-data-map-popup');
    popup.setAttribute('mode', 'panel-right');
    host.appendChild(popup);
    const inset = document.createElement('dsfr-data-map-inset');
    inset.setAttribute('territory', 'la-reunion');
    host.appendChild(inset);
    document.body.appendChild(host);
    await nextFrame();

    const clone = inset.querySelector('dsfr-data-map-layer')!;
    const innerMap = inset.querySelector('dsfr-data-map')!;
    // _mapParent est resolu au raccordement de la couche ; on le fixe pour
    // tester la resolution du compagnon sans initialiser Leaflet
    (clone as unknown as { _mapParent: Element })._mapParent = innerMap;
    const companion = (
      clone as unknown as { _findPopupCompanion: () => Element | null }
    )._findPopupCompanion();

    expect(companion).toBe(popup);
  });
});
