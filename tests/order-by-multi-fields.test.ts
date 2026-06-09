import { describe, it, expect } from 'vitest';
import { parseOrderBy, buildColonFacetWhere } from '@/utils/where.js';
import { OpenDataSoftAdapter } from '@/adapters/opendatasoft-adapter.js';
import { TabularAdapter } from '@/adapters/tabular-adapter.js';
import { GristAdapter } from '@/adapters/grist-adapter.js';
import type { AdapterParams } from '@/adapters/api-adapter.js';

/**
 * AC de #273 (A5) : `order-by="a:desc, b:asc"` (grammaire commune) est
 * traduit correctement par les 3 adapters serveur ; l'opérateur `in`
 * généré par les facettes multi-sélection est traduit côté Tabular.
 */

function makeParams(overrides: Partial<AdapterParams> = {}): AdapterParams {
  return {
    baseUrl: 'https://example.org/api/docs/d/tables/t/records',
    datasetId: 'ds',
    resource: 'res',
    where: '',
    filter: '',
    select: '',
    groupBy: '',
    aggregate: '',
    orderBy: 'population:desc, nom:asc',
    serverSide: false,
    pageSize: 20,
    limit: 0,
    headers: {},
    ...overrides,
  } as AdapterParams;
}

describe('order-by multi-champs (#273)', () => {
  it('parseOrderBy : grammaire commune "field:dir, field2:dir2"', () => {
    expect(parseOrderBy('population:desc, nom:asc')).toEqual([
      { field: 'population', direction: 'desc' },
      { field: 'nom', direction: 'asc' },
    ]);
    expect(parseOrderBy('nom')).toEqual([{ field: 'nom', direction: 'asc' }]);
    expect(parseOrderBy('')).toEqual([]);
    expect(parseOrderBy('a:desc,')).toEqual([{ field: 'a', direction: 'desc' }]);
  });

  it('ODS : order_by ODSQL valide en multi-champs', () => {
    const adapter = new OpenDataSoftAdapter();
    const url = new URL(adapter.buildUrl(makeParams({ baseUrl: 'https://data.example.org' })));
    expect(url.searchParams.get('order_by')).toBe('population DESC, nom ASC');
  });

  it('Tabular : un paramètre __sort par champ', () => {
    const adapter = new TabularAdapter();
    const url = new URL(adapter.buildUrl(makeParams()));
    expect(url.searchParams.get('population__sort')).toBe('desc');
    expect(url.searchParams.get('nom__sort')).toBe('asc');
  });

  it('Grist Records : sort multi-champs en syntaxe -field,field', () => {
    const adapter = new GristAdapter();
    expect(adapter._orderByToGristSort('population:desc, nom:asc')).toBe('-population,nom');
  });

  it('facette multi-sélection Tabular : in traduit en liste à virgules', () => {
    const adapter = new TabularAdapter();
    const where = buildColonFacetWhere({ region: new Set(['Bretagne', 'Normandie']) });
    const url = new URL(adapter.buildUrl(makeParams({ where, orderBy: '' })));
    expect(url.searchParams.get('region__in')).toBe('Bretagne,Normandie');
  });
});
