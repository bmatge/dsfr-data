import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AM-114 du banc d'essai (#1232), le RELAIS — attribut `relay-url` de
 * `dsfr-data-source` et repli `window.DSFR_DATA_RELAY` (ADR-155, lot 2).
 *
 * Avec un relais résolu, toute requête GET vers une autre origine part sous la
 * forme `<relais>/<hôte>/<chemin>?<requête>`, sans en-tête. Sans relais, pas un
 * octet ne change : `proxy-url`, `use-proxy`, `X-Target-URL` compris.
 *
 * Sur le modèle de `tests/source-proxy-non-relaye.test.ts` (l'avertissement de
 * la 0.45.0, qui nomme désormais `relay-url`).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import { clearDataCache, clearDataMeta } from '@/utils/data-bridge.js';
import { classifySourceError, describeSourceError } from '@/utils/source-errors.js';
import { resolveServerParams } from '@/components/facets/facets-server.js';
import { resetRelayWarnings } from '@dsfr-data/shared';

interface SourceInternals {
  _fetchData(): Promise<void>;
  _cleanup(): void;
}
const internals = (s: DsfrDataSource) => s as unknown as SourceInternals;

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

let seq = 0;
let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
const sources: DsfrDataSource[] = [];

beforeEach(() => {
  resetRelayWarnings();
  mockFetch.mockReset();
  mockFetch.mockImplementation(async () => jsonResponse({ total_count: 0, results: [], data: [] }));
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  for (const s of sources.splice(0)) {
    internals(s)._cleanup();
    clearDataCache(s.id);
    clearDataMeta(s.id);
  }
  warnSpy.mockRestore();
  errorSpy.mockRestore();
  delete window.DSFR_DATA_RELAY;
  delete window.DSFR_DATA_KEYS;
});

function source(configure: (s: DsfrDataSource) => void): DsfrDataSource {
  const s = new DsfrDataSource();
  s.id = `relay-src-${++seq}`;
  configure(s);
  sources.push(s);
  return s;
}

const dits = (): string[] => warnSpy.mock.calls.map((call: unknown[]) => String(call[0]));
const urls = (): string[] => mockFetch.mock.calls.map((call: unknown[]) => String(call[0]));
const init = (i = 0): RequestInit => mockFetch.mock.calls[i][1] as RequestInit;

const portail = (s: DsfrDataSource): void => {
  s.apiType = 'opendatasoft';
  s.baseUrl = 'https://data.economie.gouv.fr';
  s.datasetId = 'rappelconso';
};

const RECORDS =
  '/donnees-relais/data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/rappelconso/records';

describe('mode adaptateur — portail Opendatasoft avec relay-url', () => {
  it('la requête part vers le relais, sans avertissement', async () => {
    const s = source((el) => {
      portail(el);
      el.relayUrl = '/donnees-relais';
    });
    await internals(s)._fetchData();
    expect(urls()).toEqual([`${RECORDS}?limit=100`]);
    expect(init()).toMatchObject({ credentials: 'omit' });
    expect(init().headers).toBeUndefined();
    expect(dits()).toEqual([]);
  });

  it('deux cibles, deux URL ; la même requête rejouée, la même URL au caractère près', async () => {
    const a = source((el) => {
      portail(el);
      el.relayUrl = '/donnees-relais';
      el.where = 'categorie = "Alimentation"';
      el.groupBy = 'marque';
      el.aggregate = 'n:count:total';
    });
    const b = source((el) => {
      portail(el);
      el.datasetId = 'prix-carburants';
      el.relayUrl = '/donnees-relais';
    });
    await internals(a)._fetchData();
    await internals(a)._fetchData();
    await internals(b)._fetchData();
    const [premiere, rejouee, autre] = urls();
    expect(premiere.startsWith(`${RECORDS}?`)).toBe(true);
    expect(premiere).toContain('group_by=marque');
    expect(rejouee).toBe(premiere);
    expect(autre).not.toBe(premiere);
    expect(autre).toContain('/datasets/prix-carburants/records');
  });

  it('window.DSFR_DATA_RELAY suffit ; l’attribut prime sur lui', async () => {
    window.DSFR_DATA_RELAY = '/relais-global';
    const globale = source(portail);
    const locale = source((el) => {
      portail(el);
      el.relayUrl = 'https://site.example/donnees-relais/';
    });
    await internals(globale)._fetchData();
    await internals(locale)._fetchData();
    expect(urls()[0].startsWith('/relais-global/data.economie.gouv.fr/api/')).toBe(true);
    expect(
      urls()[1].startsWith('https://site.example/donnees-relais/data.economie.gouv.fr/api/')
    ).toBe(true);
    expect(globale.getAdapterParams().relayUrl).toBeUndefined();
    expect(locale.getAdapterParams().relayUrl).toBe('https://site.example/donnees-relais/');
  });

  it('headers et api-key-ref : rien n’est envoyé, et c’est dit UNE fois', async () => {
    window.DSFR_DATA_KEYS = { portail: 'Apikey CLE-DU-NAVIGATEUR' };
    const s = source((el) => {
      portail(el);
      el.relayUrl = '/donnees-relais';
      el.headers = '{"X-Perso":"1"}';
      el.apiKeyRef = 'portail';
    });
    await internals(s)._fetchData();
    await internals(s)._fetchData();
    for (const call of mockFetch.mock.calls) {
      expect(JSON.stringify(call[1])).not.toContain('CLE-DU-NAVIGATEUR');
      expect((call[1] as RequestInit).headers).toBeUndefined();
    }
    const messages = dits().filter((m) => m.includes('qui ne reçoit aucun en-tête'));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain(`dsfr-data-source[${s.id}]`);
    expect(messages[0]).toContain('headers et api-key-ref ne sont pas envoyés');
    expect(messages[0]).toContain('"/donnees-relais"');
    // La clé ne sort pas en console non plus
    expect(dits().join(' ')).not.toContain('CLE-DU-NAVIGATEUR');
  });

  it('api-key-ref seul : le message ne nomme que lui', async () => {
    window.DSFR_DATA_KEYS = { portail: 'Apikey K' };
    const s = source((el) => {
      portail(el);
      el.relayUrl = '/donnees-relais';
      el.apiKeyRef = 'portail';
    });
    await internals(s)._fetchData();
    expect(dits().filter((m) => m.includes("api-key-ref n'est pas envoyé"))).toHaveLength(1);
  });

  it('proxy-url ET relay-url : le relais prend la requête, proxy-url ne déclenche plus « sans effet »', async () => {
    const s = source((el) => {
      portail(el);
      el.relayUrl = '/donnees-relais';
      el.proxyUrl = 'https://proxy.exemple.fr';
      el.useProxy = true;
    });
    await internals(s)._fetchData();
    expect(urls()[0].startsWith(RECORDS)).toBe(true);
    expect(dits().filter((m) => m.includes('est sans effet'))).toEqual([]);
  });

  it('les facettes serveur reçoivent le relais de la source', () => {
    const s = source((el) => {
      portail(el);
      el.relayUrl = '/donnees-relais';
    });
    expect(resolveServerParams(s, () => null)).toMatchObject({ relayUrl: '/donnees-relais' });
    const sans = source(portail);
    expect(resolveServerParams(sans, () => null)).not.toHaveProperty('relayUrl');
  });

  it('une erreur montre l’URL DU RELAIS dans « Détails techniques » (attemptedUrl)', async () => {
    mockFetch.mockImplementation(async () => jsonResponse({ error: 'host-not-allowed' }, 403));
    const s = source((el) => {
      portail(el);
      el.relayUrl = '/donnees-relais';
    });
    const recus: { attemptedUrl?: string; error: Error }[] = [];
    const ecoute = (e: Event): void => {
      const detail = (e as CustomEvent).detail;
      if (detail.sourceId === s.id) recus.push(detail);
    };
    document.addEventListener('dsfr-data-error', ecoute);
    await internals(s)._fetchData();
    document.removeEventListener('dsfr-data-error', ecoute);
    expect(recus).toHaveLength(1);
    // L'URL de diagnostic est celle de la première requête, sans surcharge de page (#598)
    expect(recus[0].attemptedUrl).toBe(RECORDS);
    expect(classifySourceError(recus[0].error)).toBe('acces-restreint');
    // La piste de « Détails techniques » nomme le relais : un 403 y est une liste blanche
    expect(describeSourceError(recus[0].error).hint).toContain('relais (relay-url)');
  });

  it('503 du relais (place prise) : réessayé, la source charge sans erreur', async () => {
    vi.useFakeTimers();
    try {
      mockFetch
        .mockImplementationOnce(async () =>
          jsonResponse({ error: 'relay-busy' }, 503, { 'Retry-After': '1' })
        )
        .mockImplementation(async () => jsonResponse({ total_count: 1, results: [{ a: 1 }] }));
      const s = source((el) => {
        portail(el);
        el.relayUrl = '/donnees-relais';
      });
      const erreurs: unknown[] = [];
      const ecoute = (e: Event): void => {
        if ((e as CustomEvent).detail.sourceId === s.id) erreurs.push(e);
      };
      document.addEventListener('dsfr-data-error', ecoute);
      const pending = internals(s)._fetchData();
      await vi.advanceTimersByTimeAsync(1500);
      await pending;
      document.removeEventListener('dsfr-data-error', ecoute);
      expect(erreurs).toEqual([]);
      expect(urls()).toEqual([`${RECORDS}?limit=100`, `${RECORDS}?limit=100`]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('429 du relais : aucune relance, l’erreur est montrée (#1203)', async () => {
    mockFetch.mockImplementation(async () =>
      jsonResponse({ error: 'rate-limited' }, 429, { 'Retry-After': '1' })
    );
    const s = source((el) => {
      portail(el);
      el.relayUrl = '/donnees-relais';
    });
    await internals(s)._fetchData();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('sans relais, rien ne change', () => {
  it('mode adaptateur : requête directe, en-têtes envoyés, aucun relayUrl dans les paramètres', async () => {
    window.DSFR_DATA_KEYS = { portail: 'Apikey CLE' };
    const s = source((el) => {
      portail(el);
      el.apiKeyRef = 'portail';
    });
    await internals(s)._fetchData();
    expect(urls()).toEqual([
      'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/rappelconso/records?limit=100',
    ]);
    expect(init().headers).toEqual({ Authorization: 'Apikey CLE' });
    expect(init().credentials).toBeUndefined();
    expect(Object.keys(s.getAdapterParams())).not.toContain('relayUrl');
    expect(dits()).toEqual([]);
  });

  it('l’avertissement « proxy-url est sans effet » nomme désormais relay-url', async () => {
    const s = source((el) => {
      portail(el);
      el.proxyUrl = 'https://relais.exemple.fr';
    });
    await internals(s)._fetchData();
    const messages = dits().filter((m) => m.includes('est sans effet'));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('poser relay-url');
    expect(messages[0]).toContain('docs/RELAY.md');
    expect(urls()[0]).toContain('https://data.economie.gouv.fr/');
  });

  it('mode URL : fetch(url, { method, signal }), use-proxy garde X-Target-URL', async () => {
    const directe = source((el) => {
      el.url = 'https://api.exemple.org/data.json';
    });
    const viaProxy = source((el) => {
      el.url = 'https://api.exemple.org/data.json';
      el.proxyUrl = 'https://proxy.exemple.fr';
      el.useProxy = true;
      el.headers = '{"X-Perso":"1"}';
    });
    await internals(directe)._fetchData();
    await internals(viaProxy)._fetchData();
    expect(urls()).toEqual([
      'https://api.exemple.org/data.json',
      'https://proxy.exemple.fr/cors-proxy',
    ]);
    expect(Object.keys(init(0)).sort()).toEqual(['method', 'signal']);
    expect(init(1).headers).toEqual({
      'X-Perso': '1',
      'X-Target-URL': 'https://api.exemple.org/data.json',
    });
  });
});

describe('mode URL avec relay-url', () => {
  it('une URL d’une autre origine part au relais, sans en-tête ni X-Target-URL', async () => {
    const s = source((el) => {
      el.url = 'https://api.exemple.org/v1/data.json?annee=2024';
      el.params = '{"region":"Île-de-France"}';
      el.relayUrl = '/donnees-relais';
      el.proxyUrl = 'https://proxy.exemple.fr';
      el.useProxy = true;
      el.headers = '{"Authorization":"Bearer CLE"}';
    });
    await internals(s)._fetchData();
    expect(urls()).toEqual([
      '/donnees-relais/api.exemple.org/v1/data.json?annee=2024&region=%C3%8Ele-de-France',
    ]);
    expect(Object.keys(init()).sort()).toEqual(['credentials', 'signal']);
    expect(init().credentials).toBe('omit');
    expect(dits().filter((m) => m.includes("headers n'est pas envoyé"))).toHaveLength(1);
    expect(dits().filter((m) => m.includes('est sans effet'))).toEqual([]);
  });

  it('pagination du mode URL : la page fait partie de l’URL, donc de la clé de cache', async () => {
    mockFetch.mockImplementation(async () =>
      jsonResponse({ data: [], meta: { page: 1, page_size: 20, total: 0 } })
    );
    const s = source((el) => {
      el.url = 'https://api.exemple.org/v1/data';
      el.paginate = true;
      el.relayUrl = '/donnees-relais';
    });
    await internals(s)._fetchData();
    expect(urls()).toEqual(['/donnees-relais/api.exemple.org/v1/data?page=1&page_size=20']);
  });

  it('R5 — method="POST" : le chemin actuel, en-têtes et corps compris', async () => {
    const s = source((el) => {
      el.url = 'https://api.exemple.org/recherche';
      el.method = 'POST';
      el.params = '{"q":"x"}';
      el.relayUrl = '/donnees-relais';
      el.headers = '{"Authorization":"Bearer CLE"}';
    });
    await internals(s)._fetchData();
    expect(urls()).toEqual(['https://api.exemple.org/recherche']);
    expect(init()).toMatchObject({
      method: 'POST',
      body: '{"q":"x"}',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer CLE' },
    });
    expect(dits()).toEqual([]);
  });

  it('R4 — URL relative ou de même origine : jamais réécrite, pas un mot', async () => {
    const relative = source((el) => {
      el.url = '/api/jeu.json';
      el.relayUrl = '/donnees-relais';
    });
    const memeOrigine = source((el) => {
      el.url = `${window.location.origin}/donnees.json`;
      el.relayUrl = '/donnees-relais';
    });
    await internals(relative)._fetchData();
    await internals(memeOrigine)._fetchData();
    expect(urls()).toEqual([
      `${window.location.origin}/api/jeu.json`,
      `${window.location.origin}/donnees.json`,
    ]);
    expect(Object.keys(init(0)).sort()).toEqual(['method', 'signal']);
    expect(dits()).toEqual([]);
  });

  it('R1 — cible en http : pas de réécriture, un avertissement ; use-proxy reste actif', async () => {
    const s = source((el) => {
      el.url = 'http://api.exemple.org/data.json';
      el.relayUrl = '/donnees-relais';
      el.proxyUrl = 'https://proxy.exemple.fr';
      el.useProxy = true;
    });
    await internals(s)._fetchData();
    expect(urls()).toEqual(['https://proxy.exemple.fr/cors-proxy']);
    expect(init().headers).toEqual({ 'X-Target-URL': 'http://api.exemple.org/data.json' });
    expect(dits().filter((m) => m.includes('ne passe PAS par le relais'))).toHaveLength(1);
  });

  it('chemin que le relais refuserait (%2F) : la requête ne part pas au relais, et c’est dit', async () => {
    const s = source((el) => {
      el.url = 'https://api.exemple.org/jeux/a%2Fb/lignes';
      el.relayUrl = '/donnees-relais';
    });
    await internals(s)._fetchData();
    expect(urls()).toEqual(['https://api.exemple.org/jeux/a%2Fb/lignes']);
    const messages = dits().filter((m) => m.includes('le relais refuserait ce chemin (400)'));
    expect(messages).toHaveLength(1);
  });
});

describe('statuts du relais → message montré au visiteur (docs/RELAY.md §5)', () => {
  it.each([
    [400, 'page-mal-reglee', false],
    [403, 'acces-restreint', false],
    [404, 'donnees-introuvables', false],
    [410, 'donnees-introuvables', false],
    [405, 'page-mal-reglee', false],
    [408, 'service-indisponible', true],
    [414, 'page-mal-reglee', false],
    [417, 'page-mal-reglee', false],
    [429, 'service-sollicite', true],
    [431, 'page-mal-reglee', false],
    [502, 'service-indisponible', true],
    [503, 'service-indisponible', true],
    [504, 'service-indisponible', true],
  ] as const)('%i → %s (Réessayer : %s)', async (status, cause, retry) => {
    mockFetch.mockImplementation(async () => jsonResponse({ error: 'x' }, status));
    const s = source((el) => {
      portail(el);
      el.relayUrl = '/donnees-relais';
    });
    const recus: Error[] = [];
    const ecoute = (e: Event): void => {
      const detail = (e as CustomEvent).detail;
      if (detail.sourceId === s.id) recus.push(detail.error);
    };
    document.addEventListener('dsfr-data-error', ecoute);
    vi.useFakeTimers();
    try {
      const pending = internals(s)._fetchData();
      await vi.advanceTimersByTimeAsync(10_000);
      await pending;
    } finally {
      vi.useRealTimers();
      document.removeEventListener('dsfr-data-error', ecoute);
    }
    expect(recus).toHaveLength(1);
    const description = describeSourceError(recus[0]);
    expect(description.cause).toBe(cause);
    expect(description.retry).toBe(retry);
    expect(description.status).toBe(status);
    // Jamais de nouvel essai automatique au retour du réseau pour ces causes
    expect(description.autoRetryOnline).toBe(false);
  });
});

describe('garde statique — un seul point de passage pour les adaptateurs (ADR-155 §2)', () => {
  const DIR = join(__dirname, '../packages/core/src/adapters');
  const fichiers = readdirSync(DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
  const code = (f: string): string =>
    readFileSync(join(DIR, f), 'utf8')
      // Les commentaires peuvent nommer ce qu'ils interdisent
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it('aucun adaptateur n’appelle getProxiedUrl( : tout passe par resolveTransportUrl', () => {
    expect(fichiers.length).toBeGreaterThan(5);
    for (const f of fichiers) {
      expect(code(f), f).not.toMatch(/\bgetProxiedUrl\b/);
      expect(code(f), f).not.toMatch(/\bbuildProxiedRequest\b|\bbuildCorsProxyRequest\b/);
    }
  });

  it('les quatre adaptateurs comptent 22 appels à resolveTransportUrl, dont 3 en POST (Grist SQL)', () => {
    const compte = (f: string, motif: RegExp): number => (code(f).match(motif) ?? []).length;
    const appels = Object.fromEntries(
      ['opendatasoft', 'tabular', 'grist', 'insee'].map((nom) => [
        nom,
        compte(`${nom}-adapter.ts`, /\bresolveTransportUrl\(/g),
      ])
    );
    expect(appels).toEqual({ opendatasoft: 8, tabular: 3, grist: 8, insee: 3 });
    expect(compte('grist-adapter.ts', /,\s*'POST'\s*\)/g)).toBe(3);
  });

  it('aucun fetch( nu hors des exceptions déclarées : les requêtes passent par transportFetch', () => {
    // Exceptions, chacune avec sa raison :
    // - Grist SQL (POST, R5) et sa sonde : jamais au relais, en-têtes gardés ;
    // - export Parquet Tabular : hors relais en première version (ADR-155 §2),
    //   et `fetch-mode="export"` retombe sur la pagination quand un relais est posé.
    const attendus: Record<string, number> = {
      'grist-adapter.ts': 3,
      'tabular-adapter.ts': 1,
    };
    for (const f of fichiers) {
      const nus = (code(f).match(/(?<![\w.])fetch\(/g) ?? []).length;
      expect(nus, f).toBe(attendus[f] ?? 0);
    }
    const tabular = code('tabular-adapter.ts');
    expect(tabular).toMatch(/fetch\(url, \{ credentials: 'omit', signal: ownSignal \}\)/);
    expect(tabular).toMatch(/if \(resolveRelayUrl\(params\.relayUrl\)\) \{/);
  });
});
