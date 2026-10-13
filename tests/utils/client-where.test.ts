import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  splitWhere,
  canDelegateClause,
  splitDialectWhere,
  serverLacksOperator,
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

/**
 * #1285 — une clause n'est déléguée que si l'API la calcule COMME le
 * navigateur ; sinon la source la calcule, sur les lignes chargées.
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
  it('Opendatasoft : contains / notcontains restent, wordstart part', () => {
    expect(splitWhere(ods, 'annee:eq:2024, nom:contains:aliment')).toEqual({
      server: 'annee:eq:2024',
      client: 'nom:contains:aliment',
    });
    expect(splitWhere(ods, 'nom:notcontains:x').client).toBe('nom:notcontains:x');
    expect(splitWhere(ods, 'nom:wordstart:aliment')).toEqual({
      server: 'nom:wordstart:aliment',
      client: '',
    });
    expect(translateWhere(ods, 'nom:wordstart:Lycée prof')).toBe('nom like "lycee* prof*"');
  });

  it('Opendatasoft : un wordstart à signe entre deux chiffres reste au client', () => {
    expect(splitWhere(ods, 'poids:wordstart:1%2C5').client).toBe('poids:wordstart:1%2C5');
    // Apostrophe ou point entre deux lettres : mesurés, délégués.
    expect(splitWhere(ods, "marque:wordstart:kellogg's").server).toBe("marque:wordstart:kellogg's");
    expect(translateWhere(ods, 'mail:wordstart:marseille.fr')).toBe('mail like "marseille.fr*"');
  });

  it('Tabular : contains part, notcontains et wordstart restent', () => {
    expect(splitWhere(tabular, 'a:contains:x, b:notcontains:y, c:wordstart:z')).toEqual({
      server: 'a:contains:x',
      client: 'b:notcontains:y, c:wordstart:z',
    });
  });

  it('Grist : contains, notcontains et wordstart restent', () => {
    expect(splitWhere(grist, 'a:eq:1, a:contains:x, b:notcontains:y, c:wordstart:z')).toEqual({
      server: 'a:eq:1',
      client: 'a:contains:x, b:notcontains:y, c:wordstart:z',
    });
  });

  it('INSEE : seuls eq et in partent', () => {
    expect(splitWhere(insee, 'GEO:eq:FR, OBS_VALUE:gt:3, GEO:contains:DEP')).toEqual({
      server: 'GEO:eq:FR',
      client: 'OBS_VALUE:gt:3, GEO:contains:DEP',
    });
  });

  it('le refus de transport (#1026) ne vaut que pour la clause refusée', () => {
    // Tabular n'écrit qu'un OU entre champs par requête.
    expect(splitWhere(tabular, 'a|b:contains:x, c|d:contains:y, e:eq:1')).toEqual({
      server: 'a|b:contains:x, e:eq:1',
      client: 'c|d:contains:y',
    });
  });

  it('sans adaptateur : tout part, comme avant ; adaptateur tiers ancien : wordstart reste', () => {
    expect(splitWhere(null, 'a:contains:x, b:wordstart:y')).toEqual({
      server: 'a:contains:x, b:wordstart:y',
      client: '',
    });
    const tiers = { capabilities: { whereFormat: 'colon' } };
    expect(canDelegateClause(tiers, 'a:contains:x')).toBe(true);
    expect(canDelegateClause(tiers, 'a:wordstart:x')).toBe(false);
    // Dialecte ODSQL par défaut (adaptateur d'avant #1135) : la règle du portail.
    const odsql = { capabilities: { whereFormat: 'odsql' } };
    expect(canDelegateClause(odsql, 'a:contains:x')).toBe(false);
    expect(canDelegateClause(odsql, 'a:wordstart:x')).toBe(true);
    expect(canDelegateClause(generic, 'a:wordstart:x')).toBe(false);
  });

  it('splitDialectWhere : une clause ODSQL part telle quelle, une clause colon est partagée', () => {
    expect(splitDialectWhere(ods, 'nom like "%x%" AND a = 1')).toEqual({
      server: 'nom like "%x%" AND a = 1',
      client: '',
    });
    expect(splitDialectWhere(grist, 'a:eq:1, nom:contains:x')).toEqual({
      server: 'a:eq:1',
      client: 'nom:contains:x',
    });
  });

  it('serverLacksOperator : seul un wordstart sans équivalent arrête server-search', () => {
    expect(serverLacksOperator(tabular, 'nom|commune:contains:x')).toBe(false);
    expect(serverLacksOperator(grist, 'nom:contains:x')).toBe(false);
    expect(serverLacksOperator(tabular, 'nom:wordstart:x')).toBe(true);
    expect(serverLacksOperator(ods, 'search("a, b:wordstart:c")')).toBe(false);
  });

  it('describeClientWhere nomme la cause et ce que l’API sait faire à la place', () => {
    const o = describeClientWhere(ods, 'nom:contains:x');
    expect(o.cause).toContain('opendatasoft');
    expect(o.cause).toContain('compare des mots');
    expect(o.alternatives).toContain('wordstart');
    expect(o.alternatives).toContain('server-search');
    const t = describeClientWhere(tabular, 'nom:notcontains:x');
    expect(t.alternatives).not.toContain('wordstart');
    const w = describeClientWhere(grist, 'nom:wordstart:x');
    expect(w.alternatives).toBe('');
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
      'nom:wordstart:alim',
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

  it('le where colon d’une source est partagé ; getEffectiveWhere ne rend que la part serveur', () => {
    const source = new DsfrDataSource();
    source.apiType = 'tabular';
    source.where = 'dep:eq:09, nom:notcontains:saint';
    expect(source.getEffectiveWhere()).toBe('dep:eq:09');
    expect(source.getClientWhere()).toBe('nom:notcontains:saint');
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
    expect(message).toContain('remplacez contains par wordstart');
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
