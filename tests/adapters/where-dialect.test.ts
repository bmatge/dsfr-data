import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * #1135 — le dialecte WHERE appartient à l'adaptateur (`translateWhere`,
 * `joinWhere`, `escapeSearchTerm`) ; #1149 — la clause de zone visible aussi
 * (`buildBboxWhere`).
 *
 * Deux promesses :
 * 1. AUCUNE clause ne change pour les fournisseurs livrés : les valeurs
 *    attendues ci-dessous ont été relevées sur les fonctions d'avant #1135
 *    (`toWhereDialect`, `joinWhere(format)`, `escapeWhereValue`) et sur le
 *    gabarit `in_bbox(...)` d'avant #1149 dans `dsfr-data-map-layer.ts`.
 * 2. Un adaptateur tiers à dialecte propre, enregistré par `registerAdapter`,
 *    est parlé par les composants sans qu'on les touche.
 */

import {
  translateWhere,
  joinWhere,
  escapeSearchTerm,
  type WhereDialectCarrier,
} from '@/utils/where.js';
import { OpenDataSoftAdapter } from '@/adapters/opendatasoft-adapter.js';
import { TabularAdapter } from '@/adapters/tabular-adapter.js';
import { GristAdapter } from '@/adapters/grist-adapter.js';
import { InseeAdapter } from '@/adapters/insee-adapter.js';
import { GenericAdapter } from '@/adapters/generic-adapter.js';
import { getAdapter, registerAdapter } from '@/adapters/adapter-registry.js';
import type {
  ApiAdapter,
  AdapterParams,
  BboxBounds,
  BboxTarget,
  FetchResult,
} from '@/adapters/api-adapter.js';
import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { DsfrDataSearch } from '@/components/dsfr-data-search.js';
import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import { DsfrDataContext } from '@/components/dsfr-data-context.js';
import { DsfrDataMapLayer } from '@/components/dsfr-data-map-layer.js';
import { groupFieldsByWhere } from '@/components/facets/facets-server.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataLoaded,
  subscribeToSourceCommands,
} from '@/utils/data-bridge.js';

// --- 1. Clauses identiques avant / après ------------------------------------

const CLAUSES = [
  'region:eq:Provence%2C Alpes',
  'population:gt:2500, region:in:IDF|PACA',
  'nom|prenom:contains:x',
  'date:gte:2020-01-01, x:isnull',
  'a:neq:b, c:lte:3, d:notin:u|v, e:isnotnull, f:startswith:ab',
  '',
];
const TERMS = ['O"Brien \\ a,b:c|d', 'simple', '50%'];
const JOINS: Array<Array<string | null | undefined>> = [['a:eq:1', '', null, 'b:eq:2'], [], ['x']];

/** Relevé sur le code d'avant #1135 (dialecte colon). */
const COLON_AVANT = {
  translate: CLAUSES,
  join: ['a:eq:1, b:eq:2', '', 'x'],
  escape: ['O"Brien \\ a%2Cb%3Ac%7Cd', 'simple', '50%25'],
};

/** Relevé sur le code d'avant #1135 (Opendatasoft). */
const ODSQL_AVANT = {
  translate: [
    'region = "Provence, Alpes"',
    'population > 2500 AND region in ("IDF", "PACA")',
    '(nom like "%x%" OR prenom like "%x%")',
    'date >= "2020-01-01" AND x is null',
    'a != "b" AND c <= 3 AND NOT d in ("u", "v") AND e is not null',
    '',
  ],
  join: ['a:eq:1 AND b:eq:2', '', 'x'],
  escape: ['O\\"Brien \\\\ a,b:c|d', 'simple', '50%'],
};

function mesure(adapter: WhereDialectCarrier | null) {
  return {
    translate: CLAUSES.map((c) => translateWhere(adapter, c)),
    join: JOINS.map((j) => joinWhere(adapter, j)),
    escape: TERMS.map((t) => escapeSearchTerm(adapter, t)),
  };
}

describe('#1135 — clauses identiques avant / après, par fournisseur', () => {
  it('Opendatasoft (ODSQL, surchargé par l’adaptateur)', () => {
    expect(mesure(new OpenDataSoftAdapter())).toEqual(ODSQL_AVANT);
  });

  it.each([
    ['Tabular', new TabularAdapter()],
    ['Grist', new GristAdapter()],
    ['INSEE', new InseeAdapter()],
    ['générique', new GenericAdapter()],
  ])('%s (colon, dialecte par défaut)', (_nom, adapter) => {
    expect(mesure(adapter)).toEqual(COLON_AVANT);
  });

  it('source sans adaptateur : colon', () => {
    expect(mesure(null)).toEqual(COLON_AVANT);
  });

  it('adaptateur d’avant #1135 (seulement whereFormat) : dialecte par défaut du format', () => {
    expect(mesure({ capabilities: { whereFormat: 'odsql' } })).toEqual(ODSQL_AVANT);
    expect(mesure({ capabilities: { whereFormat: 'colon' } })).toEqual(COLON_AVANT);
  });

  it('seul Opendatasoft surcharge le dialecte', () => {
    expect(typeof new OpenDataSoftAdapter().translateWhere).toBe('function');
    for (const a of [
      new TabularAdapter(),
      new GristAdapter(),
      new InseeAdapter(),
      new GenericAdapter(),
    ] as ApiAdapter[]) {
      expect(a.translateWhere, a.type).toBeUndefined();
      expect(a.joinWhere, a.type).toBeUndefined();
      expect(a.escapeSearchTerm, a.type).toBeUndefined();
    }
  });
});

// --- Zone visible (#1149) ----------------------------------------------------

/** Gabarit d'avant #1149 dans dsfr-data-map-layer.ts, recopié tel quel. */
function inBboxAvant(field: string, sw: { lat: number; lng: number }, ne: typeof sw) {
  return `in_bbox(${field}, ${sw.lat}, ${sw.lng}, ${ne.lat}, ${ne.lng})`;
}

describe('#1149 — buildBboxWhere', () => {
  const ods = new OpenDataSoftAdapter();

  it.each([
    ['geo_point_2d', { lat: 41, lng: -5 }, { lat: 51, lng: 9 }],
    ['geometry', { lat: 48.8123456789, lng: 2.1 }, { lat: 48.9, lng: 2.5000001 }],
    ['geo_shape', { lat: -21.4, lng: 55.2 }, { lat: -20.8, lng: 55.9 }],
  ])('Opendatasoft : clause identique à celle de la couche (%s)', (field, sw, ne) => {
    const box: BboxBounds = { south: sw.lat, west: sw.lng, north: ne.lat, east: ne.lng };
    expect(ods.buildBboxWhere({ field }, box)).toBe(inBboxAvant(field, sw, ne));
  });

  it('Opendatasoft : deux colonnes lat/lon → null (filtre navigateur)', () => {
    expect(
      ods.buildBboxWhere({ lat: 'lat', lon: 'lon' }, { south: 0, west: 0, north: 1, east: 1 })
    ).toBeNull();
  });

  it('serverGeo vrai si et seulement si l’adaptateur fournit buildBboxWhere', () => {
    for (const a of [
      new OpenDataSoftAdapter(),
      new TabularAdapter(),
      new GristAdapter(),
      new InseeAdapter(),
      new GenericAdapter(),
    ] as ApiAdapter[]) {
      expect(typeof a.buildBboxWhere === 'function', a.type).toBe(a.capabilities.serverGeo);
    }
  });
});

// --- 2. Un adaptateur tiers à dialecte propre --------------------------------

const FICTIF = 'fictif-sql';

/**
 * Dialecte inventé, étranger aux deux formats livrés : `champ = 'valeur'`,
 * clauses entre parenthèses jointes par ` && `, apostrophe doublée.
 */
function traduireFictif(colon: string): string {
  return colon
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const [field, op, value = ''] = c.split(':');
      return `${field} ${op === 'eq' ? '=' : op === 'gt' ? '>' : op} '${value}'`;
    })
    .join(' && ');
}

function fictif(bbox?: (t: BboxTarget, b: BboxBounds) => string | null): ApiAdapter {
  const rien = (): Promise<FetchResult> =>
    Promise.resolve({ data: [], needsClientProcessing: false });
  return {
    type: FICTIF,
    capabilities: {
      serverFetch: true,
      serverFacets: false,
      serverSearch: true,
      serverGroupBy: false,
      serverOrderBy: false,
      serverGeo: !!bbox,
      whereFormat: 'sql-fictif',
    },
    validate: (_p: AdapterParams) => null,
    fetchAll: rien,
    fetchPage: rien,
    buildUrl: () => 'https://exemple.test/lignes',
    buildServerSideUrl: () => 'https://exemple.test/lignes',
    translateWhere: traduireFictif,
    joinWhere: (clauses) => clauses.map((c) => `(${c})`).join(' && '),
    escapeSearchTerm: (term) => term.replace(/'/g, "''"),
    ...(bbox ? { buildBboxWhere: bbox } : {}),
  };
}

/** Élément source factice exposant l'adaptateur (comme dsfr-data-source). */
function sourceFactice(id: string, adapter: ApiAdapter): HTMLElement {
  const el = document.createElement('div');
  el.id = id;
  Object.assign(el, { getAdapter: () => adapter, getEffectiveWhere: () => '' });
  document.body.appendChild(el);
  return el;
}

interface QueryInternals {
  _buildWhereDelegation(
    expr: string,
    adapter?: ApiAdapter
  ): { ok: boolean; where: string; fields: string[] };
}
interface SourceInternals {
  _whereOverlays: Map<string, string>;
}
interface ContextInternals {
  _translateFor(sourceId: string, colonWhere: string): string;
}
interface SearchInternals {
  _term: string;
  _applyFilter(): void;
  _cleanup?: () => void;
}
interface LayerInternals {
  _leafletMap: unknown;
  _data: Record<string, unknown>[];
  _renderLayer: (...args: unknown[]) => unknown;
  _sendBboxCommand(): void;
}

describe('#1135 — adaptateur tiers à dialecte propre, composants inchangés', () => {
  const elements: HTMLElement[] = [];
  afterEach(() => {
    elements.splice(0).forEach((e) => e.remove());
    vi.restoreAllMocks();
  });

  it('registerAdapter : le registre le rend', () => {
    const adapter = fictif();
    registerAdapter(adapter);
    expect(getAdapter(FICTIF)).toBe(adapter);
  });

  it('dsfr-data-source joint ses clauses avec le joint de l’adaptateur', () => {
    registerAdapter(fictif());
    const source = new DsfrDataSource();
    source.apiType = FICTIF;
    source.where = "pop > '10'";
    (source as unknown as SourceInternals)._whereOverlays.set('facettes', "nom = 'x'");
    expect(source.getAdapter()?.type).toBe(FICTIF);
    expect(source.getEffectiveWhere()).toBe("(pop > '10') && (nom = 'x')");
  });

  it('dsfr-data-query délègue le where traduit par l’adaptateur', () => {
    const query = new DsfrDataQuery() as unknown as QueryInternals;
    expect(query._buildWhereDelegation('pop:gt:10, nom:eq:x', fictif())).toEqual({
      ok: true,
      where: "pop > '10' && nom = 'x'",
      fields: ['pop', 'nom'],
    });
  });

  it('dsfr-data-context traduit pour la source de l’adaptateur', () => {
    elements.push(sourceFactice('fictif-ctx', fictif()));
    const ctx = new DsfrDataContext() as unknown as ContextInternals;
    expect(ctx._translateFor('fictif-ctx', 'dep:eq:75')).toBe("dep = '75'");
  });

  it('dsfr-data-facets (serveur) regroupe avec le joint de l’adaptateur', () => {
    const grouped = groupFieldsByWhere(['a', 'b'], "pop > '10'", fictif(), (f) =>
      f === 'b' ? "a = '1'" : ''
    );
    expect([...grouped.keys()]).toEqual(["(pop > '10')", "(pop > '10') && (a = '1')"]);
  });

  it('dsfr-data-search échappe le terme avec l’adaptateur', () => {
    clearDataCache('fictif-src');
    clearDataMeta('fictif-src');
    elements.push(sourceFactice('fictif-src', fictif()));
    const search = new DsfrDataSearch();
    search.id = 'fictif-recherche';
    search.source = 'fictif-src';
    search.fields = 'nom';
    search.serverSearch = true;
    search.searchTemplate = "nom = '{q}'";
    const wheres: string[] = [];
    const unsub = subscribeToSourceCommands('fictif-src', (cmd) => {
      if (cmd.where) wheres.push(cmd.where);
    });
    search.connectedCallback();
    dispatchDataLoaded('fictif-src', [{ nom: "L'Haÿ" }]);
    (search as unknown as SearchInternals)._term = "L'Haÿ";
    (search as unknown as SearchInternals)._applyFilter();
    unsub();
    (search as unknown as SearchInternals)._cleanup?.();
    expect(wheres).toContain("nom = 'L''Haÿ'");
  });

  describe('dsfr-data-map-layer : zone visible construite par l’adaptateur (#1149)', () => {
    function couche(sourceId: string, adapter: ApiAdapter) {
      elements.push(sourceFactice(sourceId, adapter));
      const layer = new DsfrDataMapLayer();
      layer.source = sourceId;
      layer.bbox = true;
      const internals = layer as unknown as LayerInternals;
      internals._leafletMap = {
        getBounds: () => ({
          getSouthWest: () => ({ lat: 41, lng: -5 }),
          getNorthEast: () => ({ lat: 51, lng: 9 }),
        }),
      };
      const render = vi.fn();
      internals._renderLayer = render;
      const commands: string[] = [];
      const unsub = subscribeToSourceCommands(sourceId, (cmd) => {
        if (cmd.whereKey === 'map-bbox') commands.push(String(cmd.where));
      });
      return { layer, internals, render, commands, unsub };
    }

    it('colonne géographique : la clause de l’adaptateur part telle quelle', () => {
      const bbox = vi.fn(
        (t: BboxTarget, b: BboxBounds) =>
          `${'field' in t ? t.field : ''} DANS [${b.south};${b.west};${b.north};${b.east}]`
      );
      const { layer, internals, render, commands, unsub } = couche('fictif-geo', fictif(bbox));
      layer.bboxField = 'position';
      internals._sendBboxCommand();
      unsub();
      expect(bbox).toHaveBeenCalledWith(
        { field: 'position' },
        { south: 41, west: -5, north: 51, east: 9 }
      );
      expect(commands).toEqual(['position DANS [41;-5;51;9]']);
      expect(render).not.toHaveBeenCalled();
    });

    it('lat-field / lon-field : l’adaptateur reçoit le couple de colonnes', () => {
      const bbox = vi.fn((t: BboxTarget) => ('lat' in t ? `${t.lat}&${t.lon}` : null));
      const { layer, internals, commands, unsub } = couche('fictif-latlon', fictif(bbox));
      layer.latField = 'y';
      layer.lonField = 'x';
      internals._sendBboxCommand();
      unsub();
      expect(commands).toEqual(['y&x']);
    });

    it('refus null : filtre dans le navigateur, aucune commande', () => {
      const { layer, internals, render, commands, unsub } = couche(
        'fictif-refus',
        fictif(() => null)
      );
      layer.bboxField = 'position';
      internals._sendBboxCommand();
      unsub();
      expect(commands).toEqual([]);
      expect(render).toHaveBeenCalledTimes(1);
    });

    it('sans buildBboxWhere (même serverGeo vrai) : filtre dans le navigateur', () => {
      const adapter = fictif();
      (adapter.capabilities as { serverGeo: boolean }).serverGeo = true;
      const { layer, internals, render, commands, unsub } = couche('fictif-sans', adapter);
      layer.bboxField = 'position';
      internals._sendBboxCommand();
      unsub();
      expect(commands).toEqual([]);
      expect(render).toHaveBeenCalledTimes(1);
    });

    it('Opendatasoft : clause identique à celle d’avant #1149', () => {
      const { layer, internals, commands, unsub } = couche('ods-geo', new OpenDataSoftAdapter());
      layer.bboxField = 'geo_point_2d';
      internals._sendBboxCommand();
      unsub();
      expect(commands).toEqual([
        inBboxAvant('geo_point_2d', { lat: 41, lng: -5 }, { lat: 51, lng: 9 }),
      ]);
    });
  });
});
