import { describe, it, expect } from 'vitest';
import {
  escapeColonValue,
  unescapeColonValue,
  buildColonFacetWhere,
  joinWhere,
} from '@/utils/where.js';
import { GristAdapter } from '@/adapters/grist-adapter.js';
import { TabularAdapter } from '@/adapters/tabular-adapter.js';
import { InseeAdapter } from '@/adapters/insee-adapter.js';
import { OpenDataSoftAdapter } from '@/adapters/opendatasoft-adapter.js';
import { GenericAdapter } from '@/adapters/generic-adapter.js';
import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import type { AdapterParams } from '@/adapters/api-adapter.js';

/**
 * AC de #271 (A3) : une valeur de facette contenant des caractères
 * structurels de la syntaxe colon (`,` `:` `|`) — ex. « Provence, Alpes » —
 * filtre correctement sur les 5 providers ; les facettes croisées sont
 * jointes selon le dialecte du provider (`, ` en colon, ` AND ` en ODSQL).
 */

const TRICKY = 'Provence, Alpes';
const SELECTIONS = { region: new Set([TRICKY]) };

function makeParams(where: string): AdapterParams {
  return {
    baseUrl: 'https://example.org/api/docs/d/tables/t/records',
    datasetId: 'ds',
    resource: 'res',
    where,
    filter: '',
    select: '',
    groupBy: '',
    aggregate: '',
    orderBy: '',
    serverSide: false,
    pageSize: 20,
    limit: 0,
    headers: {},
  } as AdapterParams;
}

describe('échappement colon des valeurs WHERE (#271)', () => {
  it('escape/unescape : aller-retour sans perte', () => {
    for (const v of [TRICKY, 'a:b', 'x|y', '50%', 'a,b:c|d%e', '']) {
      expect(unescapeColonValue(escapeColonValue(v))).toBe(v);
    }
  });

  it('buildColonFacetWhere produit UNE clause malgré la virgule dans la valeur', () => {
    const where = buildColonFacetWhere(SELECTIONS);
    // Le découpage top-level sur ',' ne doit produire qu'une seule clause
    expect(
      where
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
    ).toHaveLength(1);
    expect(where).toBe('region:eq:Provence%2C Alpes');
  });

  it('Grist Records : la valeur arrive intacte dans le filter JSON', () => {
    const adapter = new GristAdapter();
    const where = adapter.buildFacetWhere!(SELECTIONS);
    const filter = adapter._colonWhereToGristFilter(where);
    expect(filter).toEqual({ region: [TRICKY] });
  });

  it('Grist SQL : la valeur arrive intacte dans les args paramétrés', () => {
    const adapter = new GristAdapter();
    const where = adapter.buildFacetWhere!(SELECTIONS);
    const args: (string | number)[] = [];
    const sql = adapter._colonWhereToSql(where, args);
    expect(sql).toContain('= ?');
    expect(args).toEqual([TRICKY]);
  });

  it('Tabular : la valeur arrive intacte dans le query param', () => {
    const adapter = new TabularAdapter();
    const where = adapter.buildFacetWhere!(SELECTIONS);
    const url = new URL(adapter.buildUrl(makeParams(where)));
    expect(url.searchParams.get('region__exact')).toBe(TRICKY);
  });

  it('INSEE : la valeur arrive intacte dans le paramètre dimension', () => {
    const adapter = new InseeAdapter();
    const where = adapter.buildFacetWhere!(SELECTIONS);
    const url = new URL(adapter.buildUrl(makeParams(where)));
    expect(url.searchParams.get('region')).toBe(TRICKY);
  });

  it('ODS : la valeur est quotée en ODSQL (dialecte propre)', () => {
    const adapter = new OpenDataSoftAdapter();
    const where = adapter.buildFacetWhere!(SELECTIONS);
    expect(where).toBe(`region = "${TRICKY}"`);
  });

  it('Generic (client-side) : query parse la clause et filtre correctement', () => {
    const adapter = new GenericAdapter();
    expect(adapter.capabilities.whereFormat).toBe('colon');
    const where = adapter.buildFacetWhere!(SELECTIONS);

    const query = new DsfrDataQuery();
    const filters = (query as unknown as { _parseFilters: (e: string) => unknown[] })._parseFilters(
      where
    );
    expect(filters).toEqual([{ field: 'region', operator: 'eq', value: TRICKY }]);
  });

  it('multi-sélection : tokens in séparés par | avec valeurs à virgule/pipe', () => {
    const selections = { region: new Set(['A, B', 'C|D']) };
    const where = buildColonFacetWhere(selections);
    const adapter = new GristAdapter();
    const filter = adapter._colonWhereToGristFilter(where);
    expect(filter).toEqual({ region: ['A, B', 'C|D'] });
  });

  it('facettes croisées Grist : clauses jointes par virgule (dialecte colon)', () => {
    const whereA = buildColonFacetWhere({ region: new Set([TRICKY]) });
    const whereB = buildColonFacetWhere({ type: new Set(['Hôpital']) });
    const joined = joinWhere('colon', [whereA, whereB]);
    expect(joined).not.toContain(' AND ');

    const adapter = new GristAdapter();
    const filter = adapter._colonWhereToGristFilter(joined);
    expect(filter).toEqual({ region: [TRICKY], type: ['Hôpital'] });
  });

  it('facettes croisées ODSQL : clauses jointes par AND', () => {
    expect(joinWhere('odsql', ['a = "1"', 'b = "2"'])).toBe('a = "1" AND b = "2"');
    expect(joinWhere('odsql', ['', 'b = "2"', null])).toBe('b = "2"');
  });
});
