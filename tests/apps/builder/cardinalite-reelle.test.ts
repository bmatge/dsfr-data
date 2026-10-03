/**
 * #1172 — le garde-fou de cardinalité et le badge « Données déjà groupées »
 * portent sur le JEU, pas sur l'échantillon de 10 lignes d'une source d'API.
 *
 * Cas de l'issue : jeu Opendatasoft `industrie-du-futur`, 101 lignes annoncées,
 * 10 lignes chargées, champ d'étiquettes `nom_departement` (101 valeurs).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { state, type Source } from '../../../apps/builder/src/state';
import { labelCardinality, updateCardinalityGuard } from '../../../apps/builder/src/ui/smart-guard';
import {
  groupedVerdict,
  updateAggregationBadge,
} from '../../../apps/builder/src/ui/aggregation-smart';
import {
  CARDINALITY_EVENT,
  CARDINALITY_REQUEST_CAP,
  lookupRealCardinality,
  planCardinalityRequest,
  resetRealCardinality,
} from '../../../apps/builder/src/ui/real-cardinality';

const ODS_URL =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/industrie-du-futur/records';

function source(overrides: Partial<Source> = {}): Source {
  return {
    id: 'src-ods',
    name: 'Industrie du futur',
    type: 'api',
    provider: 'opendatasoft',
    apiUrl: ODS_URL,
    recordCount: 101,
    ...overrides,
  } as Source;
}

/** Échantillon de 10 lignes, une par département : tout y est distinct. */
function sample(n = 10): Record<string, unknown>[] {
  return Array.from({ length: n }, (_, i) => ({
    nom_departement: `DEP ${i}`,
    nom_region: i % 2 ? 'BRETAGNE' : 'OCCITANIE',
    nombre_beneficiaires: i,
  }));
}

function groups(n: number, field = 'nom_departement'): Record<string, unknown>[] {
  return Array.from({ length: n }, (_, i) => ({ [field]: `G ${i}`, n: 1 }));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Attend l'évènement qui signale l'arrivée d'une cardinalité réelle. */
function settled(): Promise<void> {
  return new Promise((resolve) => {
    document.addEventListener(CARDINALITY_EVENT, () => resolve(), { once: true });
  });
}

function installDom(): void {
  document.body.innerHTML = `
    <span class="agg-badge" id="aggregation-badge" hidden></span>
    <div id="cardinality-guard" hidden>
      <p id="cardinality-guard-text"></p>
      <div id="cardinality-guard-actions"></div>
    </div>`;
}

function requestedUrls(fetchMock: ReturnType<typeof vi.fn>): URL[] {
  return fetchMock.mock.calls.map((call) => new URL(String(call[0]), 'http://localhost'));
}

describe('#1172 — cardinalité réelle du champ d’étiquettes', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetRealCardinality();
    installDom();
    state.savedSource = source();
    state.localData = sample();
    state.data = [];
    state.fields = [
      { name: 'nom_departement', type: 'string', sample: 'DEP 0' },
      { name: 'nom_region', type: 'string', sample: 'BRETAGNE' },
      { name: 'nombre_beneficiaires', type: 'number', sample: 1 },
    ];
    state.labelField = 'nom_departement';
    state.chartType = 'bar';
    state.queryGroupBy = '';
    fetchMock = vi.fn(async () => jsonResponse({ total_count: 101, results: groups(101) }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetRealCardinality();
  });

  it('demande à l’API un regroupement plafonné sur le champ, filtres de la source conservés', () => {
    const plan = planCardinalityRequest(
      source({ apiUrl: `${ODS_URL}?where=annee%3D2024&limit=10&select=nom_region` }),
      'nom_departement'
    );
    const url = new URL(plan?.url ?? '');
    expect(url.pathname.endsWith('/records')).toBe(true);
    expect(url.searchParams.get('group_by')).toBe('nom_departement');
    expect(url.searchParams.get('select')).toBe('count(*) as n');
    expect(url.searchParams.get('limit')).toBe(String(CARDINALITY_REQUEST_CAP));
    expect(url.searchParams.get('where')).toBe('annee=2024');
  });

  it('se règle sur les capacités du fournisseur : pas de requête sans regroupement serveur', () => {
    expect(
      planCardinalityRequest(
        source({ provider: 'generic', apiUrl: 'https://exemple.test/api/lignes' }),
        'nom_departement'
      )
    ).toBeNull();
    // Opendatasoft, mais sur un export : le regroupement n'existe que sur /records.
    expect(
      planCardinalityRequest(
        source({ apiUrl: ODS_URL.replace('/records', '/exports/json') }),
        'nom_departement'
      )
    ).toBeNull();
    // API tabulaire : clés nues, la syntaxe refuse `champ__groupby=`.
    const tabular = planCardinalityRequest(
      source({
        provider: 'tabular',
        apiUrl: 'https://tabular-api.data.gouv.fr/api/resources/abc/data/',
      }),
      'Code sexe'
    );
    expect(tabular?.url).toContain('Code%20sexe__groupby&Code%20sexe__count');
    expect(tabular?.url).not.toContain('__groupby=');
  });

  it('le garde-fou s’affiche sur les 101 départements réels, pas sur les 10 de l’échantillon', async () => {
    const guard = document.getElementById('cardinality-guard') as HTMLElement;
    const done = settled();

    updateCardinalityGuard();
    // Réponse pas encore arrivée : 10 valeurs dans l'échantillon, rien à signaler.
    expect(guard.hidden).toBe(true);

    await done;
    updateCardinalityGuard();
    expect(guard.hidden).toBe(false);
    const text = document.getElementById('cardinality-guard-text')?.textContent ?? '';
    expect(text).toContain('101 catégories détectées');
    expect(text).not.toContain('échantillon');
    expect(labelCardinality('nom_departement')).toMatchObject({ n: 101, origin: 'reel' });
  });

  it('une seule requête par source et par champ, quel que soit le nombre de recalculs', async () => {
    const done = settled();
    for (let i = 0; i < 5; i++) {
      updateCardinalityGuard();
      updateAggregationBadge();
    }
    await done;
    for (let i = 0; i < 5; i++) {
      updateCardinalityGuard();
      updateAggregationBadge();
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestedUrls(fetchMock)[0].searchParams.get('group_by')).toBe('nom_departement');
  });

  it('un échec n’est pas rejoué, et le repli annonce l’échantillon', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: 'indisponible' }, 503));
    // 60 lignes chargées sur 5 000 : le garde-fou se déclenche sur l'échantillon.
    state.savedSource = source({ recordCount: 5000 });
    state.localData = sample(60);
    const guard = document.getElementById('cardinality-guard') as HTMLElement;
    const done = settled();

    updateCardinalityGuard();
    await done;
    updateCardinalityGuard();
    updateCardinalityGuard();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lookupRealCardinality(state.savedSource, 'nom_departement').status).toBe('failed');
    expect(guard.hidden).toBe(false);
    const text = document.getElementById('cardinality-guard-text')?.textContent ?? '';
    expect(text).toContain('Au moins 60 catégories détectées');
    expect(text).toContain('calculé sur un échantillon de 60 lignes');
  });

  it('changer de champ annule la requête en cours', async () => {
    const signals: AbortSignal[] = [];
    fetchMock.mockImplementation(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          const signal = init?.signal as AbortSignal;
          signals.push(signal);
          signal.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError')));
          if (signals.length === 2) {
            resolve(jsonResponse({ results: groups(2, 'nom_region') }));
          }
        })
    );
    const done = settled();

    lookupRealCardinality(state.savedSource, 'nom_departement');
    lookupRealCardinality(state.savedSource, 'nom_region');
    await done;

    expect(signals[0].aborted).toBe(true);
    expect(lookupRealCardinality(state.savedSource, 'nom_region')).toMatchObject({
      status: 'ok',
      distinct: 2,
    });
  });

  it('badge « déjà groupées » : jugé sur le jeu — 13 régions pour 101 lignes ne sont pas groupées', async () => {
    // L'échantillon trompe : 10 lignes, 10 régions distinctes.
    state.localData = sample().map((row, i) => ({ ...row, nom_region: `REG ${i}` }));
    state.labelField = 'nom_region';
    fetchMock.mockImplementation(async () => jsonResponse({ results: groups(13, 'nom_region') }));
    const badge = document.getElementById('aggregation-badge') as HTMLElement;
    const done = settled();

    updateAggregationBadge();
    // En attente : le badge ne tait pas qu'il parle d'un échantillon.
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toContain('peut-être déjà groupées');
    expect(badge.textContent).toContain('calculé sur un échantillon de 10 lignes');

    await done;
    updateAggregationBadge();
    expect(groupedVerdict()).toBe('non');
    expect(badge.hidden).toBe(true);
  });

  it('badge « déjà groupées » : affirmé quand le jeu a autant de groupes que de lignes', async () => {
    const badge = document.getElementById('aggregation-badge') as HTMLElement;
    const done = settled();

    updateAggregationBadge();
    await done;
    updateAggregationBadge();

    expect(groupedVerdict()).toBe('groupe');
    expect(badge.textContent).toBe('Données déjà groupées (1 ligne par catégorie)');
  });

  it('plafond atteint : « au moins », et aucun verdict de regroupement', async () => {
    state.savedSource = source({ recordCount: 250000 });
    fetchMock.mockImplementation(async () =>
      jsonResponse({ results: groups(CARDINALITY_REQUEST_CAP) })
    );
    const done = settled();

    updateCardinalityGuard();
    await done;
    updateCardinalityGuard();

    const text = document.getElementById('cardinality-guard-text')?.textContent ?? '';
    expect(text).toContain('Au moins 1');
    expect(text).toContain('catégories détectées');
    expect(groupedVerdict()).toBe('non');
  });

  it('échantillon complet : aucune requête, le compte local est exact', () => {
    state.savedSource = source({ recordCount: 10 });

    updateCardinalityGuard();
    updateAggregationBadge();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(labelCardinality('nom_departement')).toMatchObject({ n: 10, origin: 'complet' });
    expect(groupedVerdict()).toBe('groupe');
  });
});
