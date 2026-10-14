import { describe, it, expect, vi, afterEach } from 'vitest';
import { applyLocalFilter } from '@dsfr-data/shared';
import {
  splitWhere,
  canDelegateClause,
  describeClientWhere,
  translateWhere,
} from '@/utils/where.js';
import { fetchAllWithClientWhere, colonWhereFields, selectComputes } from '@/utils/client-where.js';
import type { AdapterParams, ApiAdapter, FetchResult } from '@/adapters/api-adapter.js';
import { OpenDataSoftAdapter } from '@/adapters/opendatasoft-adapter.js';
import { TabularAdapter } from '@/adapters/tabular-adapter.js';
import { GristAdapter } from '@/adapters/grist-adapter.js';
import { InseeAdapter } from '@/adapters/insee-adapter.js';
import { GenericAdapter } from '@/adapters/generic-adapter.js';
import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import { DsfrDataQuery } from '@/components/dsfr-data-query.js';

/**
 * #1285, ADR-159 — un filtre n'est confié au serveur que si la structure de
 * la comparaison y est la même ; sinon la source le calcule, sur les lignes
 * chargées. Lot 1 : `contains` / `notcontains` sur Opendatasoft.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

const ods = new OpenDataSoftAdapter();
const tabular = new TabularAdapter();
const grist = new GristAdapter();
const insee = new InseeAdapter();
const generic = new GenericAdapter();

describe('#1285 — splitWhere : ce qui part, ce qui reste', () => {
  it('Opendatasoft : contains / notcontains restent, tout le reste part', () => {
    expect(splitWhere(ods, 'annee:eq:2024, nom:contains:aliment')).toEqual({
      server: 'annee:eq:2024',
      client: 'nom:contains:aliment',
    });
    expect(splitWhere(ods, 'nom:notcontains:x').client).toBe('nom:notcontains:x');
    expect(splitWhere(ods, 'a|b:contains:x, c:in:1|2, d:isnull, e:gte:3')).toEqual({
      server: 'c:in:1|2, d:isnull, e:gte:3',
      client: 'a|b:contains:x',
    });
    expect(ods.supportsServerClause('nom:contains:x')).toBe(false);
    expect(ods.supportsServerClause('nom:neq:x')).toBe(true);
  });

  it('plus aucun like ne sort du traducteur Opendatasoft', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(translateWhere(ods, 'nom:contains:aliment')).toBe('');
    expect(translateWhere(ods, 'annee:eq:2024, nom:notcontains:x')).toBe('annee = "2024"');
    // Une clause écartée de la traduction est dite : elle ne disparaît pas en silence.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("n'a pas d'équivalent ODSQL"));
  });

  it('Tabular, Grist (lot 2) : contains part, notcontains reste ; Tabular garde aussi un contains à étoile', () => {
    const filtre = 'a:eq:1, a:contains:x, b:notcontains:y, c|d:contains:z, e:contains:5%_\\';
    for (const adapter of [tabular, grist]) {
      expect(splitWhere(adapter, filtre)).toEqual({
        server: 'a:eq:1, a:contains:x, c|d:contains:z, e:contains:5%_\\',
        client: 'b:notcontains:y',
      });
    }
    // `*` : PostgREST le lit comme un joker, sans échappement possible
    expect(splitWhere(tabular, 'a:contains:x*y, b:eq:1')).toEqual({
      server: 'b:eq:1',
      client: 'a:contains:x*y',
    });
    expect(splitWhere(grist, 'a:contains:x*y').server).toBe('a:contains:x*y');
    // La recherche lit `supportsServerWhere` : une étoile la renvoie au navigateur
    expect(tabular.supportsServerWhere('a|b:contains:x*y')).toBe(false);
    expect(tabular.supportsServerWhere('a|b:contains:x_y')).toBe(true);
  });

  it('INSEE, generic : rien ne change', () => {
    const filtre = 'a:eq:1, a:contains:x, b:notcontains:y, c|d:contains:z';
    for (const adapter of [insee, generic]) {
      expect(splitWhere(adapter, filtre)).toEqual({ server: filtre, client: '' });
    }
  });

  it('describeClientWhere dit pourquoi Tabular et Grist gardent une clause', () => {
    const neg = describeClientWhere(tabular, 'nom:notcontains:x');
    expect(neg.cause).toContain('valeur est absente');
    // Une recherche ne remplace pas une négation
    expect(neg.alternatives).toBe('');
    const etoile = describeClientWhere(tabular, 'nom:contains:a*b');
    expect(etoile.cause).toContain('joker');
    expect(etoile.cause).not.toContain('absente');
    expect(etoile.alternatives).not.toContain('début de mot');
    expect(describeClientWhere(grist, 'nom:notcontains:x').cause).toContain('valeur est absente');
  });

  it('sans adaptateur : tout part, comme avant ; dialecte ODSQL par défaut : la règle du portail', () => {
    expect(splitWhere(null, 'a:contains:x, b:eq:y')).toEqual({
      server: 'a:contains:x, b:eq:y',
      client: '',
    });
    const tiers = { capabilities: { whereFormat: 'colon' } };
    expect(canDelegateClause(tiers, 'a:contains:x')).toBe(true);
    // Adaptateur d'avant #1135, sans `translateWhere` : c'est `filterToOdsql` qui traduit.
    const odsql = { capabilities: { whereFormat: 'odsql' } };
    expect(canDelegateClause(odsql, 'a:contains:x')).toBe(false);
    expect(canDelegateClause(odsql, 'a:eq:x')).toBe(true);
  });

  it('describeClientWhere nomme la cause et ce que l’API sait faire à la place', () => {
    const o = describeClientWhere(ods, 'nom:contains:x');
    expect(o.cause).toContain('opendatasoft');
    expect(o.cause).toContain('compare des mots');
    expect(o.alternatives).toContain('server-search');
    // Aucun opérateur de remplacement n'est promis (ADR-159, point 5).
    expect(o.alternatives).not.toContain('wordstart');
  });
});

/** Adaptateur factice : rend ses lignes, et note les paramètres reçus. */
function adaptateur(lignes: Record<string, unknown>[], resultat: Partial<FetchResult> = {}) {
  const recus: AdapterParams[] = [];
  const adapter = {
    type: 'factice',
    fetchAll: async (params: AdapterParams) => {
      recus.push(params);
      return {
        data: lignes,
        totalCount: lignes.length,
        needsClientProcessing: false,
        ...resultat,
      } as FetchResult;
    },
  } as unknown as ApiAdapter;
  return { adapter, recus };
}

const PARAMS: AdapterParams = {
  baseUrl: '',
  datasetId: 'jeu',
  resource: '',
  select: '',
  where: 'annee:eq:2024',
  filter: '',
  groupBy: '',
  aggregate: '',
  orderBy: '',
  limit: 0,
  transform: '',
  pageSize: 20,
};

const LIGNES = [
  { id: 1, nom: 'alimentation', pop: 3 },
  { id: 2, nom: 'habitat', pop: 9 },
  { id: 3, nom: 'Alimentaire', pop: 1 },
  { id: 4, nom: null, pop: 5 },
];

describe('#1285 — fetchAllWithClientWhere', () => {
  const signal = new AbortController().signal;

  it('charge par la part serveur, puis filtre, trie et borne', async () => {
    const { adapter, recus } = adaptateur(LIGNES);
    const r = await fetchAllWithClientWhere(
      adapter,
      { ...PARAMS, orderBy: 'pop:asc', limit: 1 },
      'nom:contains:aliment',
      signal
    );
    // Le tri et la limite passent APRÈS le filtre : ils ne partent pas à l'API.
    expect(recus[0]).toMatchObject({ where: 'annee:eq:2024', orderBy: '', limit: 0 });
    expect(r.data).toEqual([{ id: 3, nom: 'Alimentaire', pop: 1 }]);
    // Lignes gardées par le filtre, avant `limit` — comme un total serveur.
    expect(r.totalCount).toBe(2);
    expect(r.needsClientProcessing).toBe(false);
  });

  it('un regroupement n’est plus délégué : lignes brutes filtrées, à regrouper en aval', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { adapter, recus } = adaptateur(LIGNES);
    const r = await fetchAllWithClientWhere(
      adapter,
      { ...PARAMS, groupBy: 'nom', aggregate: 'pop:sum', select: 'nom' },
      'nom:contains:alim',
      signal
    );
    expect(recus[0]).toMatchObject({ groupBy: '', aggregate: '', select: '' });
    expect(r.data).toHaveLength(2);
    expect(r.needsClientProcessing).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('group-by / aggregate non délégués'));
  });

  it('le champ filtré est lu même absent du select, puis retiré', async () => {
    const { adapter, recus } = adaptateur(LIGNES);
    const r = await fetchAllWithClientWhere(
      adapter,
      { ...PARAMS, select: 'id, pop as population' },
      'nom:contains:hab',
      signal
    );
    expect(recus[0].select).toBe('id, pop as population, nom');
    expect(r.data).toEqual([{ id: 2, pop: 9 }]);
  });

  it('lecture coupée par le plafond : résultat partiel, total inconnu, et c’est dit', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { adapter } = adaptateur(LIGNES, { totalCount: 4000 });
    const r = await fetchAllWithClientWhere(adapter, PARAMS, 'nom:contains:hab', signal, 'src');
    expect(r.truncated).toBe(true);
    expect(r.totalCount).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('max-records'));
  });

  it('utilitaires', () => {
    expect(colonWhereFields('a|b:contains:x, c:eq:1, a:isnull')).toEqual(['a', 'b', 'c']);
    expect(selectComputes('count(*) as n')).toBe(true);
    expect(selectComputes('a, b as c')).toBe(false);
    expect(selectComputes('')).toBe(false);
  });
});

describe('#1285 — dsfr-data-source : la part cliente du filtre', () => {
  interface SourceInternals {
    _whereOverlays: Map<string, string>;
    _clientWhereOverlays: Map<string, string>;
    _clientWhereConfigError(adapter: ApiAdapter): string | null;
  }
  const interne = (s: DsfrDataSource) => s as unknown as SourceInternals;

  it('le where propre d’une source colon est partagé comme celui d’une query (lot 2)', () => {
    const source = new DsfrDataSource();
    source.apiType = 'tabular';
    source.where = 'dep:eq:09, nom:notcontains:saint';
    expect(source.getEffectiveWhere()).toBe('dep:eq:09');
    expect(source.getClientWhere()).toBe('nom:notcontains:saint');
    const g = new DsfrDataSource();
    g.apiType = 'grist';
    g.where = 'nom:contains:saint, dep:notcontains:9';
    expect(g.getEffectiveWhere()).toBe('nom:contains:saint');
    expect(g.getClientWhere()).toBe('dep:notcontains:9');
    // Sans clause gardée, le where part tel quel
    const t = new DsfrDataSource();
    t.apiType = 'tabular';
    t.where = 'dep:eq:09, nom:contains:saint';
    expect(t.getEffectiveWhere()).toBe('dep:eq:09, nom:contains:saint');
    expect(t.getClientWhere()).toBe('');
  });

  it('un where ODSQL n’est jamais découpé', () => {
    const source = new DsfrDataSource();
    source.apiType = 'opendatasoft';
    source.where = 'nom like "saint*" AND dep = "09"';
    expect(source.getEffectiveWhere()).toBe('nom like "saint*" AND dep = "09"');
    expect(source.getClientWhere()).toBe('');
  });

  it('les parts clientes des émetteurs s’ajoutent, en ET', () => {
    const source = new DsfrDataSource();
    source.apiType = 'opendatasoft';
    interne(source)._whereOverlays.set('ctx-a', 'dep = "09"');
    interne(source)._clientWhereOverlays.set('ctx-b', 'nom:contains:saint');
    interne(source)._clientWhereOverlays.set('ctx-c', 'libelle:contains:ville');
    expect(source.getEffectiveWhere()).toBe('dep = "09"');
    expect(source.getClientWhere()).toBe('nom:contains:saint, libelle:contains:ville');
  });

  it('server-side : erreur de configuration qui nomme la clause et les corrections', () => {
    const source = new DsfrDataSource();
    source.id = 's';
    source.apiType = 'opendatasoft';
    source.serverSide = true;
    interne(source)._clientWhereOverlays.set('q', 'nom:contains:aliment');
    const message = interne(source)._clientWhereConfigError(ods) ?? '';
    expect(message).toContain('la clause "nom:contains:aliment"');
    expect(message).toContain('Retirez server-side de dsfr-data-source "s"');
    expect(message).not.toContain('wordstart');
    expect(message).toContain('dsfr-data-search server-search');
    source.serverSide = false;
    expect(interne(source)._clientWhereConfigError(ods)).toBeNull();
  });

  it('un agrégat porté par la source ne peut pas suivre une clause cliente', () => {
    const source = new DsfrDataSource();
    source.id = 's';
    source.apiType = 'opendatasoft';
    source.select = 'count(*) as n';
    interne(source)._clientWhereOverlays.set('ctx', 'nom:contains:aliment');
    const message = interne(source)._clientWhereConfigError(ods) ?? '';
    expect(message).toContain('select="count(*) as n"');
    expect(message).toContain('dsfr-data-query en aval');
    source.select = 'nom, dep';
    expect(interne(source)._clientWhereConfigError(ods)).toBeNull();
  });
});

describe('#1285 — dsfr-data-query : la valeur d’un contains reste le texte écrit', () => {
  interface QueryInternals {
    _applyFilters(data: Record<string, unknown>[], expr: string): Record<string, unknown>[];
  }
  const query = new DsfrDataQuery() as unknown as QueryInternals;
  const CODES = [{ code: '00712' }, { code: '17' }, { code: '70' }];

  it('« 007 » cherche « 007 », pas « 7 » — comme la source, qui calcule la même clause', () => {
    // La valeur était convertie en nombre : `code:contains:007` cherchait « 7 »
    // et retenait les trois lignes, là où la source (applyLocalFilter) n'en retient qu'une.
    expect(query._applyFilters(CODES, 'code:contains:007')).toEqual([{ code: '00712' }]);
    expect(query._applyFilters(CODES, 'code:notcontains:007')).toEqual([
      { code: '17' },
      { code: '70' },
    ]);
    expect(applyLocalFilter(CODES, 'code:contains:007')).toEqual([{ code: '00712' }]);
  });
});
