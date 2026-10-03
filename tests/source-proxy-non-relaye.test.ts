import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * AM-114 du banc d'essai (#1232), partie AVERTISSEMENT — `proxy-url` (ou
 * `use-proxy`) posé sur une source dont l'hôte n'est pas relayé.
 *
 * `getProxiedUrl` ne réécrit qu'une liste fixe d'hôtes (Tabular, Grist gouv et
 * SaaS, Albert, INSEE). En mode adaptateur, un portail Opendatasoft est donc
 * appelé en direct quel que soit l'attribut, et rien ne le disait : un
 * intégrateur croyait ses données servies par son relais. La source l'écrit
 * désormais UNE fois en console — le journal console (#994) le porte au volet
 * Diagnostic. Le relais cachable lui-même n'est pas dans ce lot (ADR à venir).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import { clearDataCache, clearDataMeta } from '@/utils/data-bridge.js';
import { isRelayedHost, RELAYED_HOSTS } from '@dsfr-data/shared';

interface SourceInternals {
  _fetchData(): Promise<void>;
  _cleanup(): void;
}
const internals = (s: DsfrDataSource) => s as unknown as SourceInternals;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

let seq = 0;
let warnSpy: ReturnType<typeof vi.spyOn>;
const sources: DsfrDataSource[] = [];

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation(async () => jsonResponse({ total_count: 0, results: [], data: [] }));
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  for (const s of sources.splice(0)) {
    internals(s)._cleanup();
    clearDataCache(s.id);
    clearDataMeta(s.id);
  }
  warnSpy.mockRestore();
});

function source(configure: (s: DsfrDataSource) => void): DsfrDataSource {
  const s = new DsfrDataSource();
  s.id = `proxy-src-${++seq}`;
  configure(s);
  sources.push(s);
  return s;
}

/** Les avertissements « sans effet » émis, texte complet. */
function avertissements(): string[] {
  return warnSpy.mock.calls
    .map((call: unknown[]) => String(call[0]))
    .filter((message: string) => message.includes('est sans effet'));
}

describe('AM-114 — isRelayedHost (@dsfr-data/shared)', () => {
  it('ne reconnaît que les hôtes à endpoint dédié', () => {
    expect(RELAYED_HOSTS).toEqual([
      'tabular-api.data.gouv.fr',
      'docs.getgrist.com',
      'grist.numerique.gouv.fr',
      'albert.api.etalab.gouv.fr',
      'api.insee.fr',
    ]);
    expect(isRelayedHost('https://tabular-api.data.gouv.fr/api/resources/x/data/')).toBe(true);
    expect(isRelayedHost('https://data.economie.gouv.fr/api/explore/v2.1/')).toBe(false);
    expect(isRelayedHost('/relais/jeu.json')).toBe(false);
    expect(isRelayedHost('')).toBe(false);
  });
});

describe('AM-114 — mode adaptateur : portail Opendatasoft', () => {
  const portail = (s: DsfrDataSource) => {
    s.apiType = 'opendatasoft';
    s.baseUrl = 'https://data.economie.gouv.fr';
    s.datasetId = 'rappelconso';
  };

  it('proxy-url : un avertissement qui nomme la source, l’attribut, l’hôte et les hôtes relayés', async () => {
    const s = source((el) => {
      portail(el);
      el.proxyUrl = 'https://relais.exemple.fr';
    });
    await internals(s)._fetchData();

    const messages = avertissements();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain(`dsfr-data-source[${s.id}]`);
    expect(messages[0]).toContain('proxy-url="https://relais.exemple.fr" est sans effet');
    expect(messages[0]).toContain('"data.economie.gouv.fr"');
    expect(messages[0]).toContain('api-type="opendatasoft"');
    for (const host of RELAYED_HOSTS) expect(messages[0]).toContain(host);
    // La requête part bien en direct : c'est ce que l'avertissement dit.
    expect(String(mockFetch.mock.calls[0][0])).toContain('https://data.economie.gouv.fr/');
  });

  it('use-proxy seul : même avertissement, qui nomme use-proxy', async () => {
    const s = source((el) => {
      portail(el);
      el.useProxy = true;
    });
    await internals(s)._fetchData();
    const messages = avertissements();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('use-proxy est sans effet');
  });

  it('une seule fois par source, quel que soit le nombre de chargements', async () => {
    const s = source((el) => {
      portail(el);
      el.proxyUrl = 'https://relais.exemple.fr';
    });
    await internals(s)._fetchData();
    await internals(s)._fetchData();
    await internals(s)._fetchData();
    expect(avertissements()).toHaveLength(1);
  });

  it('sans proxy-url ni use-proxy : pas un mot', async () => {
    const s = source(portail);
    await internals(s)._fetchData();
    expect(avertissements()).toEqual([]);
  });
});

describe('AM-114 — un hôte relayé ne déclenche rien', () => {
  it('Tabular + proxy-url : la requête passe par le relais, sans avertissement', async () => {
    const s = source((el) => {
      el.apiType = 'tabular';
      el.resource = '1c5075ec-7ce1-49cb-ab89-94f507812daf';
      el.proxyUrl = 'https://relais.exemple.fr';
    });
    await internals(s)._fetchData();
    expect(avertissements()).toEqual([]);
    expect(String(mockFetch.mock.calls[0][0])).toContain(
      'https://relais.exemple.fr/tabular-proxy/'
    );
  });
});

describe('AM-114 — mode URL', () => {
  it('proxy-url sans use-proxy sur un hôte quelconque : avertissement, qui indique use-proxy', async () => {
    const s = source((el) => {
      el.url = 'https://api.exemple.org/data.json';
      el.proxyUrl = 'https://relais.exemple.fr';
    });
    await internals(s)._fetchData();
    const messages = avertissements();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('"api.exemple.org"');
    expect(messages[0]).toContain('relais générique (/cors-proxy)');
  });

  it('proxy-url AVEC use-proxy : le relais générique prend la requête, pas d’avertissement', async () => {
    const s = source((el) => {
      el.url = 'https://api.exemple.org/data.json';
      el.proxyUrl = 'https://relais.exemple.fr';
      el.useProxy = true;
    });
    await internals(s)._fetchData();
    expect(avertissements()).toEqual([]);
    expect(String(mockFetch.mock.calls[0][0])).toBe('https://relais.exemple.fr/cors-proxy');
  });

  it('une URL relative ou de même origine n’a rien à relayer', async () => {
    const relative = source((el) => {
      el.url = '/relais/jeu.json';
      el.proxyUrl = 'https://relais.exemple.fr';
    });
    const memeOrigine = source((el) => {
      el.url = `${window.location.origin}/donnees.json`;
      el.proxyUrl = 'https://relais.exemple.fr';
    });
    await internals(relative)._fetchData();
    await internals(memeOrigine)._fetchData();
    expect(avertissements()).toEqual([]);
  });
});
