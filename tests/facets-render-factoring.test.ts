import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Tests de garde #313 (EPIC I) — rendus factorisés, nettoyages.
 *
 * Le « valeur + compteur » était copié 3× (checkbox, multiselect, radio),
 * la barre de recherche 2×. Nettoyages : _searchDebounceTimer au disconnect,
 * closest() mort, baseWhere recalculé par itération, double dispatch en
 * server-facets sans capability.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataFacets } from '@/components/dsfr-data-facets.js';
import { clearDataCache, dispatchDataLoaded, subscribeToSource } from '@/utils/data-bridge.js';

const SRC = readFileSync(
  join(__dirname, '../packages/core/src/components/dsfr-data-facets.ts'),
  'utf8'
);

describe('#313 — duplication éliminée (garde statique)', () => {
  it('le bloc « valeur + compteur » n’existe qu’une fois', () => {
    const occurrences = SRC.split('dsfr-data-facets__count').length - 1;
    // 1 définition CSS + 1 usage dans _renderValueLabel
    expect(occurrences).toBeLessThanOrEqual(2);
  });

  it('la barre de recherche des panels n’existe qu’une fois', () => {
    expect(SRC.split('Les resultats se mettent a jour automatiquement').length - 1).toBe(1);
  });

  it('le closest() mort a disparu', () => {
    expect(SRC).not.toContain("this.closest('dsfr-data-facets') ??");
  });
});

describe('#313 — comportement identique (mêmes rendus)', () => {
  it('checkbox, compteurs et sr-only rendus comme avant', async () => {
    clearDataCache('fact-src');
    const facets = new DsfrDataFacets();
    facets.id = 'fact-facets';
    facets.source = 'fact-src';
    facets.fields = 'region';
    document.body.appendChild(facets);
    dispatchDataLoaded('fact-src', [{ region: 'IDF' }, { region: 'IDF' }, { region: 'BRE' }]);
    await facets.updateComplete;

    const labels = Array.from(facets.querySelectorAll('label.fr-label'));
    const idf = labels.find((l) => (l.textContent || '').includes('IDF'));
    expect(idf).toBeDefined();
    expect(idf!.querySelector('.dsfr-data-facets__count')?.textContent).toBe('2');
    expect(idf!.querySelector('.fr-sr-only')?.textContent).toContain('2 resultats');

    facets.remove();
  });

  it('le debounce de recherche est nettoyé au disconnect', () => {
    vi.useFakeTimers();
    const facets = new DsfrDataFacets();
    facets.id = 'fact-debounce';
    document.body.appendChild(facets);
    (facets as any)._searchDebounceTimer = setTimeout(() => {
      throw new Error('debounce résiduel après disconnect');
    }, 300);

    facets.remove();
    expect((facets as any)._searchDebounceTimer).toBeNull();
    vi.advanceTimersByTime(500);
    vi.useRealTimers();
  });

  it('server-facets sans capability : UN seul dispatch, filtré', async () => {
    clearDataCache('fact-nocap');
    // Source SANS adapter (pas de getAdapter) → fallback client
    const srcEl = document.createElement('div');
    srcEl.id = 'fact-nocap';
    document.body.appendChild(srcEl);

    const facets = new DsfrDataFacets();
    facets.id = 'fact-nocap-facets';
    facets.source = 'fact-nocap';
    facets.fields = 'region';
    (facets as any).serverFacets = true;
    document.body.appendChild(facets);
    // Apres le mount : l'init du transformer repart de selections vides
    (facets as any)._activeSelections = { region: new Set(['IDF']) };

    const emissions: unknown[][] = [];
    const unsub = subscribeToSource(facets.id, {
      onLoaded: (d) => emissions.push(d as unknown[]),
    });

    dispatchDataLoaded('fact-nocap', [{ region: 'IDF' }, { region: 'BRE' }]);
    await facets.updateComplete;

    // Un seul dispatch, et c'est le FILTRÉ (l'ancien chemin émettait brut
    // puis filtré — contenus différents)
    expect(emissions).toHaveLength(1);
    expect(emissions[0]).toEqual([{ region: 'IDF' }]);

    unsub();
    facets.remove();
    srcEl.remove();
  });
});
