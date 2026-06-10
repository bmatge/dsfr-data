import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests traversants #300 (EPIC G) — convention d'attributs unique (anglais)
 * avec alias de compatibilité.
 *
 * Trois conventions coexistaient : kpi en français (valeur, icone, couleur,
 * seuil-vert/orange, tendance), list en franglais (colonnes, recherche,
 * filtres, tri, server-tri), le reste en anglais. Cible = anglais ; les
 * anciennes écritures restent lues (alias déprécié + warn console) jusqu'à
 * la 1.0.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataKpi } from '@/components/dsfr-data-kpi.js';
import { DsfrDataList } from '@/components/dsfr-data-list.js';
import { clearDataCache, dispatchDataLoaded } from '@/utils/data-bridge.js';

const ROWS = [
  { region: 'IDF', population: 100 },
  { region: 'BRE', population: 50 },
];

describe('#300 — AC : les deux écritures fonctionnent pendant la dépréciation', () => {
  beforeEach(() => clearDataCache('g1-src'));

  it('kpi : value (anglais) calcule comme valeur (français)', async () => {
    const en = new DsfrDataKpi();
    en.source = 'g1-src';
    en.value = 'population:sum';
    const fr = new DsfrDataKpi();
    fr.source = 'g1-src';
    fr.valeur = 'population:sum';
    document.body.appendChild(en);
    document.body.appendChild(fr);
    dispatchDataLoaded('g1-src', ROWS);
    await en.updateComplete;
    await fr.updateComplete;

    expect(en.querySelector('.dsfr-data-kpi__value')?.textContent?.trim()).toBe('150');
    expect(fr.querySelector('.dsfr-data-kpi__value')?.textContent?.trim()).toBe('150');

    en.remove();
    fr.remove();
  });

  it('kpi : l’anglais prime quand les deux sont posés', async () => {
    const kpi = new DsfrDataKpi();
    kpi.source = 'g1-src';
    kpi.value = 'population:max';
    kpi.valeur = 'population:sum';
    document.body.appendChild(kpi);
    dispatchDataLoaded('g1-src', ROWS);
    await kpi.updateComplete;

    expect(kpi.querySelector('.dsfr-data-kpi__value')?.textContent?.trim()).toBe('100');
    kpi.remove();
  });

  it('list : columns/search/filters/sort fonctionnent comme les alias français', async () => {
    const list = new DsfrDataList();
    list.source = 'g1-src';
    list.columns = 'region:Région, population:Population';
    list.search = true;
    list.sort = 'population:desc';
    document.body.appendChild(list);
    dispatchDataLoaded('g1-src', ROWS);
    await list.updateComplete;

    expect(list.querySelectorAll('th').length).toBe(2);
    expect(list.querySelector('.fr-search-bar')).not.toBeNull();
    const firstCell = list.querySelector('tbody td')?.textContent?.trim();
    expect(firstCell).toBe('IDF'); // population desc → IDF (100) en premier

    list.remove();
  });

  it('un attribut français présent dans le DOM déclenche le warn de dépréciation', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const kpi = new DsfrDataKpi();
    kpi.setAttribute('valeur', 'population:sum');
    document.body.appendChild(kpi);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('valeur→value'));
    kpi.remove();

    warnSpy.mockClear();
    const list = new DsfrDataList();
    list.setAttribute('colonnes', 'region:Région');
    list.setAttribute('server-tri', '');
    document.body.appendChild(list);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('colonnes→columns'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('server-tri→server-sort'));
    list.remove();
    warnSpy.mockRestore();
  });

  it('aucun warn quand seule la convention cible est utilisée', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const kpi = new DsfrDataKpi();
    kpi.setAttribute('value', 'population:sum');
    document.body.appendChild(kpi);
    expect(warnSpy).not.toHaveBeenCalled();
    kpi.remove();
    warnSpy.mockRestore();
  });
});

describe('#300 — AC : le guide n’utilise plus que la convention cible', () => {
  it('plus aucun attribut français dans guide/*.html', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(__dirname, '../guide');
    const offenders: string[] = [];
    const rx =
      /\b(valeur|colonnes|filtres|icone|couleur|seuil-vert|seuil-orange|tendance)="|server-tri\b|<dsfr-data-list[^>]*\b(tri=|recherche)\b/s;
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.html'))) {
      const content = readFileSync(join(dir, f), 'utf8');
      if (rx.test(content)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
