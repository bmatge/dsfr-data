import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getProxiedUrl,
  isRelayRequestUrl,
  RELAY_BUSY_MAX_RETRIES,
  RELAY_BUSY_MAX_WAIT_MS,
  RELAY_MAX_URL_LENGTH,
  resetRelayWarnings,
  resolveDataTransport,
  resolveRelayUrl,
  resolveTransportUrl,
  transportFetch,
} from '@dsfr-data/shared';

/**
 * Relais cachable par le site hôte (ADR-155, #1232, constat AM-114) — la
 * réécriture côté bibliothèque. Contrat : `docs/RELAY.md` §2 (règles R1 à R5).
 */

const RELAIS = '/donnees-relais';
const CIBLE =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/rappelconso/records?where=annee%20%3E%202020&limit=100&offset=200';

let warnSpy: ReturnType<typeof vi.spyOn>;
const messages = (): string[] => warnSpy.mock.calls.map((call: unknown[]) => String(call[0]));

beforeEach(() => {
  resetRelayWarnings();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  delete window.DSFR_DATA_RELAY;
  delete (window as unknown as { DSFR_DATA_PROXY?: unknown }).DSFR_DATA_PROXY;
});

describe('resolveRelayUrl — attribut, puis window.DSFR_DATA_RELAY, puis rien', () => {
  it('sans rien : aucun relais', () => {
    expect(resolveRelayUrl()).toBe('');
    expect(resolveRelayUrl('')).toBe('');
    expect(resolveRelayUrl('   ')).toBe('');
  });

  it('retire la barre finale, relatif comme absolu', () => {
    expect(resolveRelayUrl('/donnees-relais/')).toBe('/donnees-relais');
    expect(resolveRelayUrl('https://site.example/donnees-relais//')).toBe(
      'https://site.example/donnees-relais'
    );
  });

  it('se replie sur window.DSFR_DATA_RELAY, et l’attribut prime', () => {
    window.DSFR_DATA_RELAY = '/relais-global';
    expect(resolveRelayUrl()).toBe('/relais-global');
    expect(resolveRelayUrl('/relais-de-la-source')).toBe('/relais-de-la-source');
  });

  it.each(['/relais?x=1', '/relais#x', '/re lais', '/'])(
    'écarte un préfixe inutilisable (%s), et le dit une fois',
    (prefixe) => {
      expect(resolveRelayUrl(prefixe)).toBe('');
      expect(resolveRelayUrl(prefixe)).toBe('');
      expect(messages().filter((m) => m.includes("n'est pas un préfixe de relais"))).toHaveLength(
        1
      );
    }
  );
});

describe('sans relais résolu, pas un octet ne change', () => {
  const corpus = [
    CIBLE,
    'https://tabular-api.data.gouv.fr/api/resources/abc/data/?page=2&page_size=100',
    'https://grist.numerique.gouv.fr/api/docs/d/tables/t/records',
    'https://api.insee.fr/melodi/data/DS_X?maxResult=10',
    '/relatif/jeu.json',
    'http://localhost/meme-origine.json',
    'pas une url',
  ];

  it.each(corpus)('%s : exactement getProxiedUrl', (url) => {
    for (const proxyUrl of [undefined, '', 'https://mon-proxy.example']) {
      for (const method of ['GET', 'POST']) {
        const resolution = resolveDataTransport(url, { proxyUrl }, method);
        expect(resolution).toEqual({ url: getProxiedUrl(url, proxyUrl), relayed: false });
        expect(resolveTransportUrl(url, { proxyUrl }, method)).toBe(getProxiedUrl(url, proxyUrl));
      }
    }
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('une URL vide lève comme getProxiedUrl', () => {
    expect(() => resolveTransportUrl('', {})).toThrow('getProxiedUrl: url is required');
  });

  it('transportFetch appelle fetch(url, init) avec le MÊME objet', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const init = { headers: { Authorization: 'Apikey K' }, credentials: 'include' as const };
    await transportFetch(CIBLE, init, { proxyUrl: 'https://mon-proxy.example' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(CIBLE);
    expect(fetchMock.mock.calls[0][1]).toBe(init);
    vi.unstubAllGlobals();
  });
});

describe('réécriture — <relais>/<hôte>/<chemin>?<requête>', () => {
  it('R3 : chemin et requête repris tels quels, ni réencodage ni tri', () => {
    expect(resolveDataTransport(CIBLE, { relayUrl: RELAIS })).toEqual({
      url:
        '/donnees-relais/data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/rappelconso/records' +
        '?where=annee%20%3E%202020&limit=100&offset=200',
      relayed: true,
    });
    // L'ordre des paramètres est celui de la cible : z avant a, doublon gardé
    expect(
      resolveTransportUrl('https://portail.example/x?z=1&a=2&z=3&vide=&nu', { relayUrl: RELAIS })
    ).toBe('/donnees-relais/portail.example/x?z=1&a=2&z=3&vide=&nu');
    // Encodages laissés comme l'adaptateur les a écrits (`+`, `%20`, `%2C`, casse des hexa)
    expect(
      resolveTransportUrl('https://portail.example/a%20b/c?q=x+y%2Cz%2c&w=%C3%A9', {
        relayUrl: RELAIS,
      })
    ).toBe('/donnees-relais/portail.example/a%20b/c?q=x+y%2Cz%2c&w=%C3%A9');
  });

  it('R3 : le fragment est retiré ; un « ? » nu et une cible sans chemin sont gardés', () => {
    expect(resolveTransportUrl('https://portail.example/x?a=1#ancre', { relayUrl: RELAIS })).toBe(
      '/donnees-relais/portail.example/x?a=1'
    );
    expect(resolveTransportUrl('https://portail.example/x?', { relayUrl: RELAIS })).toBe(
      '/donnees-relais/portail.example/x?'
    );
    expect(resolveTransportUrl('https://portail.example', { relayUrl: RELAIS })).toBe(
      '/donnees-relais/portail.example/'
    );
  });

  it('R2 : hôte en minuscules', () => {
    expect(resolveTransportUrl('https://DATA.Economie.GOUV.fr/API/x', { relayUrl: RELAIS })).toBe(
      '/donnees-relais/data.economie.gouv.fr/API/x'
    );
  });

  it('relais absolu, avec ou sans barre finale', () => {
    for (const relayUrl of ['https://site.example/relais', 'https://site.example/relais/']) {
      expect(resolveTransportUrl('https://portail.example/x?a=1', { relayUrl })).toBe(
        'https://site.example/relais/portail.example/x?a=1'
      );
    }
  });

  it('les hôtes connus du proxy passent AUSSI par le relais, proxy-url ou non', () => {
    const tabular = 'https://tabular-api.data.gouv.fr/api/resources/abc/data/?page=2';
    expect(
      resolveDataTransport(tabular, { relayUrl: RELAIS, proxyUrl: 'https://mon-proxy.example' })
    ).toEqual({
      url: '/donnees-relais/tabular-api.data.gouv.fr/api/resources/abc/data/?page=2',
      relayed: true,
    });
  });

  it('window.DSFR_DATA_RELAY suffit, sans attribut', () => {
    window.DSFR_DATA_RELAY = '/relais-global/';
    expect(resolveTransportUrl('https://portail.example/x')).toBe(
      '/relais-global/portail.example/x'
    );
  });

  it('déterminisme : même cible, même URL au caractère près ; deux cibles, deux URL', () => {
    const construire = (offset: number): string => {
      const url = new URL('https://portail.example/api/explore/v2.1/catalog/datasets/j/records');
      url.searchParams.set('where', 'region = "Île-de-France" and montant > 10');
      url.searchParams.set('group_by', 'region');
      url.searchParams.set('limit', '100');
      url.searchParams.set('offset', String(offset));
      return resolveTransportUrl(url.toString(), { relayUrl: RELAIS });
    };
    expect(construire(0)).toBe(construire(0));
    expect(construire(0)).not.toBe(construire(100));
    expect(
      resolveTransportUrl('https://portail.example/datasets/a/records', { relayUrl: RELAIS })
    ).not.toBe(
      resolveTransportUrl('https://portail.example/datasets/b/records', { relayUrl: RELAIS })
    );
    expect(resolveTransportUrl('https://un.example/x', { relayUrl: RELAIS })).not.toBe(
      resolveTransportUrl('https://deux.example/x', { relayUrl: RELAIS })
    );
  });
});

describe('ce qui ne part pas au relais', () => {
  it('R4 : URL relative ou de même origine, sans un mot', () => {
    for (const url of ['/jeu.json', 'jeu.json', 'http://localhost/api/jeu.json']) {
      expect(resolveDataTransport(url, { relayUrl: RELAIS })).toEqual({ url, relayed: false });
    }
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('R5 : une requête POST garde le chemin actuel (proxy-url compris), sans un mot', () => {
    const sql = 'https://grist.numerique.gouv.fr/api/docs/d/sql';
    const options = { relayUrl: RELAIS, proxyUrl: 'https://mon-proxy.example' };
    expect(resolveDataTransport(sql, options, 'POST')).toEqual({
      url: 'https://mon-proxy.example/grist-gouv-proxy/api/docs/d/sql',
      relayed: false,
    });
    expect(resolveDataTransport(sql, options, 'post').relayed).toBe(false);
    expect(resolveDataTransport(sql, options, 'GET').relayed).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['schema', 'http://portail.example/x', 'https'],
    ['port', 'https://portail.example:8443/x', 'port'],
    ['identifiants', 'https://alice:secret@portail.example/x', 'identifiants'],
  ])('R1 (%s) : pas de réécriture, un avertissement, une seule fois', (raison, url, mot) => {
    const attendu = { url, relayed: false, skipped: raison };
    expect(resolveDataTransport(url, { relayUrl: RELAIS })).toEqual(attendu);
    expect(resolveDataTransport(url, { relayUrl: RELAIS })).toEqual(attendu);
    const dits = messages();
    expect(dits).toHaveLength(1);
    expect(dits[0]).toContain('ne passe PAS par le relais');
    expect(dits[0]).toContain(mot);
    // Le mot de passe d'une URL à identifiants ne sort pas en console
    expect(dits[0]).not.toContain('secret');
  });

  it('R1 : un « :443 » explicite est le port par défaut, la cible est relayée', () => {
    expect(resolveTransportUrl('https://portail.example:443/x', { relayUrl: RELAIS })).toBe(
      '/donnees-relais/portail.example/x'
    );
  });

  it.each([
    'https://portail.example/datasets/a%2Fb/records',
    'https://portail.example/datasets/a%2fb/records',
    'https://portail.example/datasets/a%5Cb/records',
    'https://portail.example/datasets/a%252e/records',
    'https://portail.example/datasets/a%3Bb/records',
    'https://portail.example/a//b',
    'https://portail.example/a/%c0%ae%c0%ae/b',
    'https://portail.example/a/%ef%bc%8e/b',
    'https://portail.example/a|b',
    'https://portail.example/a[0]',
  ])('chemin que le relais refuserait (%s) : pas de réécriture, un avertissement', (url) => {
    const resolution = resolveDataTransport(url, { relayUrl: RELAIS });
    expect(resolution.relayed).toBe(false);
    expect(resolution.skipped).toBe('chemin');
    expect(resolution.url).toBe(url);
    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toContain('le relais refuserait ce chemin (400)');
  });

  it('requête que le relais refuserait (%0A) : pas de réécriture, un avertissement', () => {
    const url = 'https://portail.example/x?where=a%0Ab';
    expect(resolveDataTransport(url, { relayUrl: RELAIS })).toEqual({
      url,
      relayed: false,
      skipped: 'requete',
    });
    expect(messages()[0]).toContain('le relais refuserait cette requête (400)');
  });

  it('une cible hors relais retombe sur le proxy quand il sait la relayer', () => {
    const url = 'https://tabular-api.data.gouv.fr/a//b';
    expect(
      resolveDataTransport(url, { relayUrl: RELAIS, proxyUrl: 'https://mon-proxy.example' })
    ).toEqual({
      url: 'https://mon-proxy.example/tabular-proxy/a//b',
      relayed: false,
      skipped: 'chemin',
    });
  });

  it('data: et blob: ne sont ni relayés ni signalés', () => {
    for (const url of ['data:application/json,[]', 'blob:http://localhost/abc']) {
      expect(resolveDataTransport(url, { relayUrl: RELAIS })).toEqual({ url, relayed: false });
    }
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('longueur — au-delà de 8 000 caractères, le relais est quand même appelé', () => {
  const longue = (taille: number): string => {
    const base = 'https://portail.example/x?where=';
    const prefixe = '/donnees-relais/portail.example/x?where='.length;
    return base + 'a'.repeat(taille - prefixe);
  };

  it('8 000 : rien à dire', () => {
    const resolution = resolveDataTransport(longue(RELAY_MAX_URL_LENGTH), { relayUrl: RELAIS });
    expect(resolution.relayed).toBe(true);
    expect(resolution.url).toHaveLength(RELAY_MAX_URL_LENGTH);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('8 001 : relayée quand même, et dit une fois', () => {
    const url = longue(RELAY_MAX_URL_LENGTH + 1);
    for (let i = 0; i < 3; i += 1) {
      const resolution = resolveDataTransport(url, { relayUrl: RELAIS });
      expect(resolution.relayed).toBe(true);
      expect(resolution.url.startsWith('/donnees-relais/portail.example/x?where=aaa')).toBe(true);
    }
    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toContain('8001 caractères');
    expect(messages()[0]).toContain('414');
  });

  it('relais absolu : seuls le chemin et la requête comptent, comme chez le relais', () => {
    const url = longue(RELAY_MAX_URL_LENGTH);
    const resolution = resolveDataTransport(url, {
      relayUrl: 'https://site.example/donnees-relais',
    });
    expect(resolution.url).toHaveLength('https://site.example'.length + RELAY_MAX_URL_LENGTH);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('isRelayRequestUrl', () => {
  it('reconnaît ce que rend la réécriture, et rien d’autre', () => {
    const relayee = resolveTransportUrl(CIBLE, { relayUrl: RELAIS });
    expect(isRelayRequestUrl(relayee, RELAIS)).toBe(true);
    expect(isRelayRequestUrl(relayee, '/donnees-relais/')).toBe(true);
    expect(isRelayRequestUrl(CIBLE, RELAIS)).toBe(false);
    expect(isRelayRequestUrl('/donnees-relais-bis/x', RELAIS)).toBe(false);
    expect(isRelayRequestUrl(relayee)).toBe(false);
    expect(isRelayRequestUrl(relayee, '')).toBe(false);
  });
});

describe('transportFetch — requête relayée', () => {
  const RELAYEE = '/donnees-relais/portail.example/x?a=1';
  const options = { relayUrl: RELAIS };
  let fetchMock: ReturnType<typeof vi.fn>;

  const reponse = (status: number, headers: Record<string, string> = {}): Response =>
    new Response(status === 200 ? '{"ok":true}' : '{"error":"x"}', { status, headers });

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('aucun en-tête, credentials: omit, le signal gardé — une requête « simple »', async () => {
    fetchMock.mockResolvedValue(reponse(200));
    const controller = new AbortController();
    await transportFetch(
      RELAYEE,
      {
        headers: { Authorization: 'Apikey SECRET', 'X-Perso': '1' },
        credentials: 'include',
        signal: controller.signal,
      },
      options
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(RELAYEE);
    expect(Object.keys(init).sort()).toEqual(['credentials', 'signal']);
    expect(init.credentials).toBe('omit');
    expect(init.signal).toBe(controller.signal);
    expect(init.method).toBeUndefined(); // jamais HEAD : il coûte un GET au relais
  });

  it('une requête POST vers une URL de relais n’est pas traitée comme relayée', async () => {
    fetchMock.mockResolvedValue(reponse(503, { 'Retry-After': '1' }));
    const init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' };
    const response = await transportFetch(RELAYEE, init, options);
    expect(response.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toBe(init);
  });

  it('503 + Retry-After: 1 → un nouvel essai après le délai annoncé, puis la réponse', async () => {
    fetchMock
      .mockResolvedValueOnce(reponse(503, { 'Retry-After': '1' }))
      .mockResolvedValueOnce(reponse(200));
    const pending = transportFetch(RELAYEE, undefined, options);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1); // pas avant le délai
    await vi.advanceTimersByTimeAsync(300);
    const response = await pending;
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(RELAYEE); // la même URL, au caractère près
  });

  it('borne : trois nouveaux essais, puis le 503 est rendu tel quel', async () => {
    fetchMock.mockImplementation(async () => reponse(503, { 'Retry-After': '1' }));
    const pending = transportFetch(RELAYEE, undefined, options);
    await vi.advanceTimersByTimeAsync(60_000);
    const response = await pending;
    expect(response.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1 + RELAY_BUSY_MAX_RETRIES);
    expect(RELAY_BUSY_MAX_RETRIES).toBe(3);
  });

  it('Retry-After illisible (relais d’une autre origine) : une seconde par défaut', async () => {
    fetchMock.mockResolvedValueOnce(reponse(503)).mockResolvedValueOnce(reponse(200));
    const pending = transportFetch(RELAYEE, undefined, options);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(300);
    expect((await pending).status).toBe(200);
  });

  it.each([String(RELAY_BUSY_MAX_WAIT_MS / 1000 + 1), '120', 'Wed, 21 Oct 2026 07:28:00 GMT'])(
    'Retry-After: %s — une panne annoncée, pas une place prise : aucun nouvel essai',
    async (retryAfter) => {
      fetchMock.mockResolvedValue(reponse(503, { 'Retry-After': retryAfter }));
      const response = await transportFetch(RELAYEE, undefined, options);
      expect(response.status).toBe(503);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );

  it.each([429, 502, 504, 500, 403, 404, 414])(
    '%i : jamais de nouvel essai automatique',
    async (status) => {
      fetchMock.mockResolvedValue(reponse(status, { 'Retry-After': '1' }));
      const response = await transportFetch(RELAYEE, undefined, options);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(response.status).toBe(status);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );

  it('une annulation pendant l’attente rejette en AbortError, sans nouvel essai', async () => {
    fetchMock.mockResolvedValue(reponse(503, { 'Retry-After': '1' }));
    const controller = new AbortController();
    const pending = transportFetch(RELAYEE, { signal: controller.signal }, options);
    const rejet = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(200);
    controller.abort();
    await rejet;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('une panne réseau n’est pas réessayée', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(transportFetch(RELAYEE, undefined, options)).rejects.toThrow('Failed to fetch');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
