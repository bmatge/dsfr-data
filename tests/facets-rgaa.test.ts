import { describe, it, expect, vi } from 'vitest';

/**
 * Tests traversants #311 (EPIC I) — facets RGAA : ids en collision, live
 * regions multipliées, diacritiques.
 *
 * Bugs d'origine : ids générés par value.replace(/[^a-zA-Z0-9]/g, '_') —
 * « A-B » et « A B » normalisent tous deux en A_B → deux inputs même id,
 * le label for pointe vers le premier, cliquer le second label coche le
 * MAUVAIS filtre. Une live region par fieldset/panel → chaque _announce
 * répété N fois par le lecteur d'écran. Diacritiques incohérents.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataFacets } from '@/components/dsfr-data-facets.js';
import { clearDataCache, dispatchDataLoaded } from '@/utils/data-bridge.js';

async function renderFacets(rows: Record<string, unknown>[], fields = 'region') {
  clearDataCache('rgaa-src');
  const facets = new DsfrDataFacets();
  facets.id = `rgaa-facets-${Math.floor(performance.now() * 1000) % 100000}`;
  facets.source = 'rgaa-src';
  facets.fields = fields;
  document.body.appendChild(facets);
  dispatchDataLoaded('rgaa-src', rows);
  await facets.updateComplete;
  return facets;
}

describe('#311 — AC : aucun id dupliqué (audit axe)', () => {
  it('« A-B » et « A B » ont des ids DISTINCTS (le label coche le bon filtre)', async () => {
    const facets = await renderFacets([{ region: 'A-B' }, { region: 'A B' }, { region: 'A-B' }]);

    const inputs = Array.from(facets.querySelectorAll('input[type="checkbox"]'));
    const ids = inputs.map((i) => i.id).filter(Boolean);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ids).size).toBe(ids.length);

    // Chaque label pointe vers SON input
    for (const input of inputs) {
      const labels = facets.querySelectorAll(`label[for="${input.id}"]`);
      expect(labels.length, `label for ${input.id}`).toBe(1);
    }

    facets.remove();
  });

  it('deux instances de facets sur les mêmes champs ne partagent aucun id', async () => {
    const a = await renderFacets([{ region: 'IDF' }]);
    const b = await renderFacets([{ region: 'IDF' }]);

    const idsA = Array.from(a.querySelectorAll('input')).map((i) => i.id);
    const idsB = Array.from(b.querySelectorAll('input')).map((i) => i.id);
    for (const id of idsA) {
      expect(idsB, `id ${id} partagé`).not.toContain(id);
    }

    a.remove();
    b.remove();
  });
});

describe('#311 — AC : une seule annonce par action', () => {
  it('une UNIQUE live region au niveau composant', async () => {
    const facets = await renderFacets(
      [
        { region: 'IDF', statut: 'actif' },
        { region: 'BRE', statut: 'clos' },
      ],
      'region, statut'
    );

    const regions = facets.querySelectorAll('[aria-live]');
    expect(regions.length).toBe(1);

    facets.remove();
  });

  it('les annonces utilisent des diacritiques cohérents', async () => {
    const facets = await renderFacets([{ region: 'IDF' }, { region: 'BRE' }]);

    const checkbox = facets.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.click();
    await facets.updateComplete;
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    const live = facets.querySelector('[aria-live]') as HTMLElement;
    expect(live.textContent).toContain('sélectionnée');
    expect(live.textContent).not.toContain('selectionnee');

    facets.remove();
  });
});
