import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #680 — decouverte des facettes declarees en `server-facets` sans `fields`
 * (un appel par jeu, memorise, invalide au changement de jeu), et #676 —
 * sur une facette de type date, le where d'une annee est un intervalle
 * (`champ >= date'2022-01-01' AND champ < date'2023-01-01'`) : l'egalite
 * `champ = "2022"` est refusee par ODS (400 IncompatibleTypesInComparisonFilter).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataFacets } from '@/components/dsfr-data-facets.js';
import { OpenDataSoftAdapter } from '@/adapters/opendatasoft-adapter.js';
import { GristAdapter } from '@/adapters/grist-adapter.js';
import type { ApiAdapter, FacetDescriptor, FacetResult } from '@/adapters/api-adapter.js';
import { clearDataCache, DATA_EVENTS } from '@/utils/data-bridge.js';
import type { SourceCommandEvent } from '@/utils/data-bridge.js';

/**
 * Vue interne du composant : les membres prives inspectes ici plus les
 * membres publics utilises (l'intersection `DsfrDataFacets & …` serait
 * reduite a never par les membres prives).
 */
interface FacetsInternals extends HTMLElement {
  labels: string;
  fields: string;
  emitTransformerError(error: Error): void;
  _facetGroups: Array<{ field: string; label: string; values: Array<{ value: string }> }>;
  _activeSelections: Record<string, Set<string>>;
  _discoveredFacets: FacetDescriptor[] | null;
  _fetchServerFacets(): Promise<void>;
  _buildFacetWhere(excludeField?: string): string;
}

const ODS_PARAMS = { baseUrl: 'https://data.example.fr', datasetId: 'decp' };

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 404,
    statusText: ok ? 'OK' : 'Not Found',
    json: () => Promise.resolve(body),
  };
}

// ===========================================================================
// Adapter ODS : discoverFacets
// ===========================================================================

describe('#680 — OpenDataSoftAdapter.discoverFacets (faux serveur)', () => {
  const adapter = new OpenDataSoftAdapter();
  beforeEach(() => mockFetch.mockReset());

  it('lit les metadonnees du jeu : champs annotes facet, libelle et type date', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        fields: [
          { name: 'id', type: 'text', annotations: {} },
          { name: 'source', label: 'Source', type: 'text', annotations: { facet: true } },
          {
            name: 'datenotification',
            label: 'dateNotification',
            type: 'date',
            annotations: { facet: true },
          },
          { name: 'horodatage', type: 'datetime', annotations: { facet: true } },
          { name: 'montant', type: 'double', annotations: {} },
        ],
      })
    );

    const facets = await adapter.discoverFacets!(ODS_PARAMS);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://data.example.fr/api/explore/v2.1/catalog/datasets/decp'
    );
    expect(facets).toEqual([
      { field: 'source', label: 'Source', isDate: false },
      { field: 'datenotification', label: 'dateNotification', isDate: true },
      { field: 'horodatage', label: undefined, isDate: true },
    ]);
  });

  it('repli sur /facets sans parametre quand les metadonnees ne declarent aucune facette', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ fields: [{ name: 'id', type: 'text' }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          facets: [
            { name: 'source', facets: [] },
            { name: 'nature', facets: [] },
          ],
        })
      );

    const facets = await adapter.discoverFacets!(ODS_PARAMS);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][0]).toBe(
      'https://data.example.fr/api/explore/v2.1/catalog/datasets/decp/facets'
    );
    expect(facets).toEqual([{ field: 'source' }, { field: 'nature' }]);
  });

  it('repli aussi quand les metadonnees sont en erreur ; erreur si /facets echoue', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({}, false))
      .mockResolvedValueOnce(jsonResponse({ facets: [{ name: 'source' }] }));
    expect(await adapter.discoverFacets!(ODS_PARAMS)).toEqual([{ field: 'source' }]);

    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(jsonResponse({}, false)).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.resolve({}),
    });
    await expect(adapter.discoverFacets!(ODS_PARAMS)).rejects.toThrow('HTTP 500');
  });
});

// ===========================================================================
// Adapter ODS : buildFacetWhere sur un champ date (#676)
// ===========================================================================

describe('#676 — OpenDataSoftAdapter.buildFacetWhere : intervalle sur une facette date', () => {
  const adapter = new OpenDataSoftAdapter();
  const dateFields = new Set(['datenotification']);

  it('une annee sur un champ date devient [1er janvier, 1er janvier suivant)', () => {
    expect(
      adapter.buildFacetWhere({ datenotification: new Set(['2022']) }, undefined, { dateFields })
    ).toBe("datenotification >= date'2022-01-01' AND datenotification < date'2023-01-01'");
  });

  it('plusieurs annees : OR entre parentheses, AND avec les autres facettes', () => {
    const where = adapter.buildFacetWhere(
      { datenotification: new Set(['2021', '2022']), source: new Set(['AWS']) },
      undefined,
      { dateFields }
    );
    expect(where).toBe(
      "(datenotification >= date'2021-01-01' AND datenotification < date'2022-01-01' OR " +
        "datenotification >= date'2022-01-01' AND datenotification < date'2023-01-01') " +
        'AND source = "AWS"'
    );
  });

  it('sans dateFields (ou champ non date), egalite historique inchangee', () => {
    expect(adapter.buildFacetWhere({ datenotification: new Set(['2022']) })).toBe(
      'datenotification = "2022"'
    );
    expect(adapter.buildFacetWhere({ annee: new Set(['2022']) }, undefined, { dateFields })).toBe(
      'annee = "2022"'
    );
  });

  it('une valeur non annuelle sur un champ date reste en egalite (echappee)', () => {
    expect(
      adapter.buildFacetWhere({ datenotification: new Set(['2022/01']) }, undefined, {
        dateFields,
      })
    ).toBe('datenotification = "2022/01"');
  });

  it('excludeField s applique aussi aux champs date', () => {
    expect(
      adapter.buildFacetWhere(
        { datenotification: new Set(['2022']), source: new Set(['AWS']) },
        'datenotification',
        { dateFields }
      )
    ).toBe('source = "AWS"');
  });
});

// ===========================================================================
// Adapter Grist : equivalent (colonnes Choice / ChoiceList)
// ===========================================================================

describe('#680 — GristAdapter.discoverFacets : colonnes Choice / ChoiceList', () => {
  it('ne retient que les colonnes categorielles declarees', async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        columns: [
          { id: 'nom', fields: { label: 'Nom', type: 'Text' } },
          { id: 'region', fields: { label: 'Région', type: 'Choice' } },
          { id: 'tags', fields: { label: 'tags', type: 'ChoiceList' } },
          { id: 'date', fields: { label: 'Date', type: 'Date' } },
        ],
      })
    );
    const adapter = new GristAdapter();
    const facets = await adapter.discoverFacets!({
      baseUrl: 'https://grist.example.fr/api/docs/abc/tables/T/records',
      datasetId: 'T',
    });
    expect(facets).toEqual([
      { field: 'region', label: 'Région' },
      { field: 'tags', label: undefined },
    ]);
  });
});

// ===========================================================================
// Composant : decouverte au premier cycle, memorisation, invalidation
// ===========================================================================

interface FakeServer {
  discover: ReturnType<typeof vi.fn>;
  fetchFacets: ReturnType<typeof vi.fn>;
  el: HTMLElement;
  setDataset(id: string): void;
}

function makeServerSource(
  id: string,
  descriptors: FacetDescriptor[],
  opts: { odsWhere?: boolean } = {}
): FakeServer {
  const el = document.createElement('div');
  el.id = id;
  let datasetId = 'decp';
  const ods = new OpenDataSoftAdapter();
  const discover = vi.fn().mockImplementation(() => Promise.resolve(descriptors));
  const fetchFacets = vi
    .fn()
    .mockImplementation((_p: unknown, fields: string[]) =>
      Promise.resolve(
        fields.map<FacetResult>((f) => ({ field: f, values: [{ value: `${f}-v`, count: 1 }] }))
      )
    );
  const adapter: Partial<ApiAdapter> = {
    type: 'opendatasoft',
    capabilities: { serverFacets: true, whereFormat: 'odsql' } as ApiAdapter['capabilities'],
    fetchFacets: fetchFacets as unknown as ApiAdapter['fetchFacets'],
    discoverFacets: discover as unknown as ApiAdapter['discoverFacets'],
    buildFacetWhere: opts.odsWhere ? ods.buildFacetWhere.bind(ods) : undefined,
  };
  Object.assign(el, {
    getAdapter: () => adapter,
    getAdapterParams: () => ({ baseUrl: 'https://data.example.fr', datasetId, headers: undefined }),
    getEffectiveWhere: () => '',
  });
  document.body.appendChild(el);
  return { discover, fetchFacets, el, setDataset: (id) => (datasetId = id) };
}

function makeFacets(sourceId: string, fields = ''): FacetsInternals {
  const facets = new DsfrDataFacets();
  facets.id = `${sourceId}-facets`;
  facets.source = sourceId;
  facets.fields = fields;
  facets.serverFacets = true;
  return facets as unknown as FacetsInternals;
}

const DESCRIPTORS: FacetDescriptor[] = [
  { field: 'source', label: 'Source', isDate: false },
  { field: 'datenotification', label: 'Date de notification', isDate: true },
];

describe('#680 — AC : server-facets sans fields affiche les facettes declarees, avec cascade', () => {
  let server: FakeServer;
  beforeEach(() => {
    clearDataCache('disc-src');
    server = makeServerSource('disc-src', DESCRIPTORS, { odsWhere: true });
  });
  afterEach(() => server.el.remove());

  it('un appel de decouverte, puis fetchFacets sur les champs decouverts, libelles declares', async () => {
    const facets = makeFacets('disc-src');
    await facets._fetchServerFacets();

    expect(server.discover).toHaveBeenCalledTimes(1);
    expect(server.discover.mock.calls[0][0]).toMatchObject({
      baseUrl: 'https://data.example.fr',
      datasetId: 'decp',
    });
    expect(server.fetchFacets).toHaveBeenCalledTimes(1);
    expect(server.fetchFacets.mock.calls[0][1]).toEqual(['source', 'datenotification']);

    expect(facets._facetGroups.map((g) => [g.field, g.label])).toEqual([
      ['source', 'Source'],
      ['datenotification', 'Date de notification'],
    ]);
  });

  it('`labels` garde la priorite sur le libelle decouvert', async () => {
    const facets = makeFacets('disc-src');
    facets.labels = 'source:Origine';
    await facets._fetchServerFacets();
    expect(facets._facetGroups.map((g) => g.label)).toEqual(['Origine', 'Date de notification']);
  });

  it('la decouverte est memorisee : deux cycles = un seul appel, y compris concurrents', async () => {
    const facets = makeFacets('disc-src');
    await Promise.all([facets._fetchServerFacets(), facets._fetchServerFacets()]);
    await facets._fetchServerFacets();
    expect(server.discover).toHaveBeenCalledTimes(1);
  });

  it('un changement de dataset-id invalide la memorisation', async () => {
    const facets = makeFacets('disc-src');
    await facets._fetchServerFacets();
    server.setDataset('autre-jeu');
    await facets._fetchServerFacets();
    expect(server.discover).toHaveBeenCalledTimes(2);
    expect(server.discover.mock.calls[1][0]).toMatchObject({ datasetId: 'autre-jeu' });
  });

  it('cascade : la selection annuelle sur la facette date filtre les autres par intervalle', async () => {
    const facets = makeFacets('disc-src');
    await facets._fetchServerFacets();
    facets._activeSelections = { datenotification: new Set(['2022']) };
    server.fetchFacets.mockClear();

    await facets._fetchServerFacets();

    // Deux groupes de where : « source » filtre par la date, « datenotification » sans filtre
    const calls = server.fetchFacets.mock.calls as Array<[unknown, string[], string]>;
    const forSource = calls.find(([, fields]) => fields.includes('source'))!;
    expect(forSource[2]).toBe(
      "datenotification >= date'2022-01-01' AND datenotification < date'2023-01-01'"
    );
    const forDate = calls.find(([, fields]) => fields.includes('datenotification'))!;
    expect(forDate[2]).toBe('');

    // Et la commande emise vers la source porte le meme intervalle (#676)
    expect(facets._buildFacetWhere()).toContain(">= date'2022-01-01'");
    expect(facets._buildFacetWhere()).not.toContain('= "2022"');
  });

  it('avec fields explicite, la decouverte ne sert qu a typer : fields reste maitre', async () => {
    const facets = makeFacets('disc-src', 'datenotification');
    await facets._fetchServerFacets();
    expect(server.discover).toHaveBeenCalledTimes(1);
    expect(server.fetchFacets.mock.calls[0][1]).toEqual(['datenotification']);
    facets._activeSelections = { datenotification: new Set(['2022']) };
    expect(facets._buildFacetWhere()).toBe(
      "datenotification >= date'2022-01-01' AND datenotification < date'2023-01-01'"
    );
  });

  it('decouverte en echec : warn, memorise vide, pas de nouvelle tentative a chaque cycle', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    server.discover.mockImplementation(() => Promise.reject(new Error('HTTP 500')));
    const facets = makeFacets('disc-src');
    await facets._fetchServerFacets();
    await facets._fetchServerFacets();
    expect(server.discover).toHaveBeenCalledTimes(1);
    expect(server.fetchFacets).not.toHaveBeenCalled();
    expect(facets._discoveredFacets).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('#680 — un adapter sans discoverFacets garde le comportement historique', () => {
  it('sans fields : aucun fetch (fields requis), sans erreur', async () => {
    clearDataCache('legacy-src');
    const el = document.createElement('div');
    el.id = 'legacy-src';
    const fetchFacets = vi.fn().mockResolvedValue([]);
    Object.assign(el, {
      getAdapter: () => ({
        capabilities: { serverFacets: true, whereFormat: 'odsql' },
        fetchFacets,
      }),
      getAdapterParams: () => ({ baseUrl: 'https://api.example.fr', datasetId: 'ds' }),
      getEffectiveWhere: () => '',
    });
    document.body.appendChild(el);

    const facets = makeFacets('legacy-src');
    await facets._fetchServerFacets();
    expect(fetchFacets).not.toHaveBeenCalled();

    facets.fields = 'region';
    await facets._fetchServerFacets();
    expect(fetchFacets).toHaveBeenCalledTimes(1);
    el.remove();
  });
});

// ===========================================================================
// #676 — selection annuelle issue de l'URL emise avant la decouverte
// ===========================================================================

describe('#676 — erreur amont avant decouverte : re-emission en intervalle', () => {
  let server: FakeServer;
  beforeEach(() => {
    clearDataCache('err-src');
    server = makeServerSource('err-src', DESCRIPTORS, { odsWhere: true });
  });
  afterEach(() => server.el.remove());

  it('une selection « 2022 » sur un champ date est re-emise en intervalle apres la decouverte', async () => {
    const facets = makeFacets('err-src');
    document.body.appendChild(facets);
    facets._activeSelections = { datenotification: new Set(['2022']) };

    const commands: SourceCommandEvent[] = [];
    const listener = (e: Event) => commands.push((e as CustomEvent<SourceCommandEvent>).detail);
    document.addEventListener(DATA_EVENTS.SOURCE_COMMAND, listener);

    // La source a repondu 400 a `datenotification = "2022"` : erreur amont
    facets.emitTransformerError(new Error('HTTP 400: IncompatibleTypesInComparisonFilter'));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(server.discover).toHaveBeenCalledTimes(1);
    const mine = commands.filter((c) => c.sourceId === 'err-src');
    expect(mine).toHaveLength(1);
    expect(mine[0].where).toBe(
      "datenotification >= date'2022-01-01' AND datenotification < date'2023-01-01'"
    );

    // Une seconde erreur ne relance rien (decouverte memorisee)
    facets.emitTransformerError(new Error('HTTP 500'));
    await new Promise((r) => setTimeout(r, 0));
    expect(server.discover).toHaveBeenCalledTimes(1);
    expect(commands.filter((c) => c.sourceId === 'err-src')).toHaveLength(1);

    document.removeEventListener(DATA_EVENTS.SOURCE_COMMAND, listener);
    facets.remove();
  });

  it('sans selection en forme d annee, une erreur amont ne declenche rien', async () => {
    const facets = makeFacets('err-src');
    document.body.appendChild(facets);
    facets._activeSelections = { source: new Set(['AWS']) };
    facets.emitTransformerError(new Error('HTTP 500'));
    await new Promise((r) => setTimeout(r, 0));
    expect(server.discover).not.toHaveBeenCalled();
    facets.remove();
  });
});
