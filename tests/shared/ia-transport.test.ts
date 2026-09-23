/**
 * Transport IA commun (#998) — une seule implementation pour le Studio et le
 * builder-IA. fetch est mocke : aucun appel reel a Albert.
 *
 * Ce qui est verifie : retry sur 429 (Retry-After honore, plafond de 10 s,
 * backoff exponentiel sans en-tete, 3 nouvelles tentatives au plus), routage
 * serveur / utilisateur, et resolution { post, model, capacites }.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  postProxy,
  proxyFetch,
  resolveTransport,
  resetServerConfigCache,
  IA_CONFIG_KEY,
} from '../../packages/shared/src/ia/transport';
import {
  resetCapabilities,
  setCapabilities,
} from '../../packages/shared/src/ia/albert-capabilities';

const OK_BODY = { choices: [{ message: { role: 'assistant', content: 'ok' } }] };

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const tooMany = (headers: Record<string, string> = {}) =>
  jsonResponse(429, { error: { message: 'rate limited' } }, headers);

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  localStorage.clear();
  resetServerConfigCache();
  resetCapabilities();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Delais demandes a setTimeout pendant l'appel (les attentes de retry). */
function spyDelays(): number[] {
  const delays: number[] = [];
  const real = globalThis.setTimeout;
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
    delays.push(ms ?? 0);
    return real(fn, 0);
  }) as typeof setTimeout);
  return delays;
}

describe('postProxy — retry sur 429', () => {
  afterEach(() => vi.restoreAllMocks());

  it('honore Retry-After (en secondes) puis rend la reponse', async () => {
    const delays = spyDelays();
    fetchMock
      .mockResolvedValueOnce(tooMany({ 'Retry-After': '2' }))
      .mockResolvedValueOnce(jsonResponse(200, OK_BODY));

    const data = await postProxy('/ia-proxy-default', {}, { model: 'm' });

    expect(data).toEqual(OK_BODY);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(delays).toEqual([2000]);
  });

  it('plafonne Retry-After a 10 s', async () => {
    const delays = spyDelays();
    fetchMock
      .mockResolvedValueOnce(tooMany({ 'Retry-After': '120' }))
      .mockResolvedValueOnce(jsonResponse(200, OK_BODY));

    await postProxy('/ia-proxy-default', {}, {});

    expect(delays).toEqual([10000]);
  });

  it('sans en-tete : backoff exponentiel 1 s, 2 s, 4 s', async () => {
    const delays = spyDelays();
    fetchMock
      .mockResolvedValueOnce(tooMany())
      .mockResolvedValueOnce(tooMany())
      .mockResolvedValueOnce(tooMany())
      .mockResolvedValueOnce(jsonResponse(200, OK_BODY));

    const data = await postProxy('/ia-proxy-default', {}, {});

    expect(data).toEqual(OK_BODY);
    expect(delays).toEqual([1000, 2000, 4000]);
  });

  it('abandonne apres 3 nouvelles tentatives et leve une erreur lisible', async () => {
    const delays = spyDelays();
    fetchMock.mockImplementation(async () => tooMany());

    await expect(postProxy('/ia-proxy-default', {}, {})).rejects.toThrow(
      /Trop de requêtes.*rate limited/
    );
    // 1 appel initial + 3 nouvelles tentatives, jamais une cinquieme.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(delays).toHaveLength(3);
  });

  it('ne rejoue pas les autres erreurs', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: { message: 'boom' } }));

    await expect(postProxy('/ia-proxy-default', {}, {})).rejects.toThrow(/500.*boom/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('routage a travers les proxys', () => {
  it('mode serveur : /ia-proxy-default, sans en-tete de jeton', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, OK_BODY));

    await postProxy('/ia-proxy-default', {}, { a: 1 });

    const [endpoint, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe('/ia-proxy-default');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Target-URL']).toBeUndefined();
    expect(headers.Authorization).toBeUndefined();
  });

  it('mode utilisateur : /ia-proxy + X-Target-URL + en-tetes du fournisseur', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, OK_BODY));

    await postProxy(
      '/ia-proxy',
      { 'X-Target-URL': 'https://api.example/v1', 'x-api-key': 'k' },
      {}
    );

    const [endpoint, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe('/ia-proxy');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Target-URL']).toBe('https://api.example/v1');
    expect(headers['x-api-key']).toBe('k');
  });

  it('proxyFetch GET : une seule tentative, pas de corps', async () => {
    fetchMock.mockResolvedValueOnce(tooMany());

    const res = await proxyFetch(
      '/ia-proxy',
      { 'X-Target-URL': 'https://api.example/v1/models' },
      { method: 'GET' }
    );

    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });
});

describe('resolveTransport — { post, model, capacites }', () => {
  function serverConfig(body: unknown) {
    return jsonResponse(200, body);
  }

  it('mode serveur quand aucun jeton utilisateur : capacites Albert par defaut', async () => {
    fetchMock.mockResolvedValueOnce(serverConfig({ available: true, model: 'albert-large' }));

    const t = await resolveTransport();

    expect(t.mode).toBe('server');
    expect(t.model).toBe('albert-large');
    expect(t.capacites).toMatchObject({ toolCalling: true, jsonSchema: true });

    fetchMock.mockResolvedValueOnce(jsonResponse(200, OK_BODY));
    await expect(t.post({})).resolves.toEqual(OK_BODY);
    expect(fetchMock.mock.calls[1][0]).toBe('/ia-proxy-default');
  });

  it('mode utilisateur : lit la cle partagee dsfr-data-ia-config', async () => {
    expect(IA_CONFIG_KEY).toBe('dsfr-data-ia-config');
    localStorage.setItem(
      IA_CONFIG_KEY,
      JSON.stringify({ apiUrl: 'https://api.openai.example/v1', model: 'gpt', token: 't0k' })
    );
    fetchMock.mockResolvedValueOnce(serverConfig({ available: true }));

    const t = await resolveTransport();

    expect(t.mode).toBe('user');
    expect(t.model).toBe('gpt');
    // Hors Albert et sans sonde : defaut conservateur.
    expect(t.capacites).toMatchObject({ toolCalling: false, jsonSchema: false });

    fetchMock.mockResolvedValueOnce(jsonResponse(200, OK_BODY));
    await t.post({});
    const [endpoint, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(endpoint).toBe('/ia-proxy');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer t0k');
    expect(headers['X-Target-URL']).toBe('https://api.openai.example/v1');
  });

  it('opts.user prime sur localStorage (config du formulaire du builder-IA)', async () => {
    localStorage.setItem(
      IA_CONFIG_KEY,
      JSON.stringify({ apiUrl: 'https://autre.example/v1', model: 'x', token: 'stocke' })
    );
    fetchMock.mockResolvedValueOnce(serverConfig({ available: true }));

    const t = await resolveTransport({
      user: {
        apiUrl: 'https://albert.api.etalab.gouv.fr/v1/chat/completions',
        model: 'openweight-large',
        token: 'formulaire',
      },
    });

    expect(t.mode).toBe('user');
    expect(t.model).toBe('openweight-large');
    // Hote etalab : capacites Albert par defaut.
    expect(t.capacites).toMatchObject({ toolCalling: true, jsonSchema: true });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, OK_BODY));
    await t.post({});
    const headers = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer formulaire');
  });

  it("timeout : passe par fetchWithTimeout (signal d'annulation), aucun sinon", async () => {
    fetchMock.mockResolvedValueOnce(serverConfig({ available: true }));
    const avecDelai = await resolveTransport({ timeout: 45000 });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, OK_BODY));
    await avecDelai.post({});
    expect((fetchMock.mock.calls[1][1] as RequestInit).signal).toBeDefined();

    const sansDelai = await resolveTransport();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, OK_BODY));
    await sansDelai.post({});
    expect((fetchMock.mock.calls[2][1] as RequestInit).signal).toBeUndefined();
  });

  it('les capacites sondees font foi', async () => {
    setCapabilities({ model: 'm', jsonSchema: true, toolCalling: false, probedAt: 1 });
    fetchMock.mockResolvedValueOnce(serverConfig({ available: true }));

    const t = await resolveTransport();

    expect(t.capacites).toMatchObject({ toolCalling: false, jsonSchema: true });
  });

  it("mode 'none' sans jeton ni serveur : post leve une erreur explicite", async () => {
    fetchMock.mockResolvedValueOnce(serverConfig({ available: false }));

    const t = await resolveTransport();

    expect(t.mode).toBe('none');
    await expect(t.post({})).rejects.toThrow(/Aucune configuration IA/);
  });
});
