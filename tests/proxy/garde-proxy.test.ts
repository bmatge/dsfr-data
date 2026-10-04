// @vitest-environment node
/**
 * Bornage du proxy generique en developpement : `scripts/lib/garde-proxy.cjs`,
 * le module que `vite.config.ts` monte sur `/cors-proxy` et `/ia-proxy`.
 *
 * Le middleware tourne sur un vrai serveur HTTP local. L'emetteur de la requete
 * amont est injecte : aucun appel ne sort de la machine, et ce que le relais
 * aurait envoye se lit tel quel.
 */
import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import {
  creerRelais,
  hoteSansPort,
  METHODES,
  verifierCible,
  type OptionsRelais,
} from '../../scripts/lib/garde-proxy.cjs';
import { CAS_CIBLES, HOTE_INSTANCE, METHODES_RETIREES } from './cas-garde-proxy';

describe('verifierCible — la regle, cas par cas', () => {
  for (const cas of CAS_CIBLES) {
    it(`${cas.attendu === 'admis' ? 'admet' : `refuse (${cas.attendu})`} : ${cas.nom}`, () => {
      const verdict = verifierCible(cas.cible, HOTE_INSTANCE);
      if (cas.attendu === 'admis') {
        expect(verdict.ok).toBe(true);
      } else {
        expect(verdict).toMatchObject({ ok: false, status: cas.attendu });
      }
    });
  }

  it('une cible admise est en https, sans identifiants ni port', () => {
    const verdict = verifierCible('https://api.exemple.fr/v1?x=1', HOTE_INSTANCE);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.url.protocol).toBe('https:');
    expect(verdict.url.hostname).toBe('api.exemple.fr');
    expect(verdict.url.port).toBe('');
    expect(verdict.url.username).toBe('');
  });

  it('sans hote d’instance connu, le reste de la regle tient', () => {
    expect(verifierCible('https://api.exemple.fr/').ok).toBe(true);
    expect(verifierCible('https://127.0.0.1/').ok).toBe(false);
  });

  it('hoteSansPort retire le port et met en minuscules', () => {
    expect(hoteSansPort('Instance.Exemple.FR:5173')).toBe('instance.exemple.fr');
    expect(hoteSansPort('localhost')).toBe('localhost');
    expect(hoteSansPort(undefined)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Le middleware, sur un vrai serveur local
// ---------------------------------------------------------------------------

interface AppelAmont {
  hostname?: string;
  port?: number | string;
  path?: string;
  method?: string;
  headers?: Record<string, string>;
  corps: string;
}

interface ReponseAmont {
  status: number;
  headers: Record<string, string>;
  corps: string;
}

/** Faux emetteur : note chaque appel, repond ce qu'on lui dit. */
function fauxAmont(reponse: ReponseAmont) {
  const appels: AppelAmont[] = [];
  const envoyer = ((options: Omit<AppelAmont, 'corps'>, rappel: (r: unknown) => void) => {
    const requete = new PassThrough();
    const morceaux: Buffer[] = [];
    requete.on('data', (m: Buffer) => morceaux.push(m));
    requete.on('end', () => {
      appels.push({ ...options, corps: Buffer.concat(morceaux).toString() });
      const flux = new PassThrough() as PassThrough & {
        statusCode: number;
        headers: Record<string, string>;
      };
      flux.statusCode = reponse.status;
      flux.headers = reponse.headers;
      rappel(flux);
      flux.end(reponse.corps);
    });
    return requete;
  }) as unknown as NonNullable<OptionsRelais['envoyer']>;
  return { appels, envoyer };
}

const serveurs: Server[] = [];
afterEach(() => {
  for (const s of serveurs.splice(0)) s.close();
});

async function monter(options: OptionsRelais): Promise<number> {
  const serveur = createServer(creerRelais(options));
  serveurs.push(serveur);
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok));
  return (serveur.address() as AddressInfo).port;
}

interface Rendu {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  corps: string;
}

function appeler(
  port: number,
  init: { method?: string; headers?: Record<string, string>; corps?: string } = {}
): Promise<Rendu> {
  return new Promise((ok, ko) => {
    const requete = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path: '/',
        method: init.method ?? 'GET',
        headers: { host: `${HOTE_INSTANCE}:5173`, ...init.headers },
      },
      (res) => {
        const morceaux: Buffer[] = [];
        res.on('data', (m: Buffer) => morceaux.push(m));
        res.on('end', () =>
          ok({
            status: res.statusCode ?? 0,
            headers: res.headers,
            corps: Buffer.concat(morceaux).toString(),
          })
        );
      }
    );
    requete.on('error', ko);
    if (init.corps) requete.write(init.corps);
    requete.end();
  });
}

const OK_JSON: ReponseAmont = {
  status: 200,
  headers: { 'content-type': 'application/json', 'access-control-allow-origin': 'https://tiers' },
  corps: '{"ok":true}',
};

describe('creerRelais — /cors-proxy', () => {
  const options = (envoyer: OptionsRelais['envoyer']): OptionsRelais => ({
    methodes: METHODES['/cors-proxy'],
    cors: true,
    envoyer,
  });

  it('relaie une cible admise en https sur le port 443, sans les en-tetes de l’instance', async () => {
    const amont = fauxAmont(OK_JSON);
    const port = await monter(options(amont.envoyer));
    const rendu = await appeler(port, {
      headers: {
        'x-target-url': 'https://api.exemple.fr/v1/data?limit=10',
        authorization: 'Apikey abc',
        apikey: 'abc',
        cookie: 'gw-auth-token=secret',
        origin: 'https://instance.exemple.fr',
        referer: 'https://instance.exemple.fr/apps/sources/',
      },
    });

    expect(rendu.status).toBe(200);
    expect(rendu.corps).toBe('{"ok":true}');
    expect(amont.appels).toHaveLength(1);
    const appel = amont.appels[0];
    expect(appel.hostname).toBe('api.exemple.fr');
    expect(appel.port).toBe(443);
    expect(appel.path).toBe('/v1/data?limit=10');
    expect(appel.method).toBe('GET');
    expect(appel.headers?.host).toBe('api.exemple.fr');
    expect(appel.headers?.authorization).toBe('Apikey abc');
    expect(appel.headers?.apikey).toBe('abc');
    for (const retenu of ['cookie', 'origin', 'referer', 'x-target-url']) {
      expect(appel.headers).not.toHaveProperty(retenu);
    }
  });

  it('ouvre le CORS a toute origine et ne laisse pas passer celui de l’amont', async () => {
    const amont = fauxAmont(OK_JSON);
    const port = await monter(options(amont.envoyer));
    const rendu = await appeler(port, { headers: { 'x-target-url': 'https://api.exemple.fr/' } });
    expect(rendu.headers['access-control-allow-origin']).toBe('*');
  });

  it('relaie le corps d’un POST', async () => {
    const amont = fauxAmont(OK_JSON);
    const port = await monter(options(amont.envoyer));
    const rendu = await appeler(port, {
      method: 'POST',
      headers: { 'x-target-url': 'https://api.exemple.fr/q', 'content-type': 'application/json' },
      corps: '{"a":1}',
    });
    expect(rendu.status).toBe(200);
    expect(amont.appels[0].method).toBe('POST');
    expect(amont.appels[0].corps).toBe('{"a":1}');
  });

  it('ne suit pas une redirection de l’amont : la reponse 302 repart telle quelle', async () => {
    const amont = fauxAmont({
      status: 302,
      headers: { location: 'http://169.254.169.254/latest/' },
      corps: '',
    });
    const port = await monter(options(amont.envoyer));
    const rendu = await appeler(port, { headers: { 'x-target-url': 'https://api.exemple.fr/' } });
    expect(rendu.status).toBe(302);
    expect(rendu.headers.location).toBe('http://169.254.169.254/latest/');
    expect(amont.appels).toHaveLength(1);
  });

  for (const cas of CAS_CIBLES.filter((c) => c.attendu !== 'admis')) {
    it(`refuse (${cas.attendu}) sans appeler l’amont : ${cas.nom}`, async () => {
      const amont = fauxAmont(OK_JSON);
      const port = await monter(options(amont.envoyer));
      const rendu = await appeler(port, {
        headers: cas.cible === undefined ? {} : { 'x-target-url': cas.cible },
      });
      expect(rendu.status).toBe(cas.attendu);
      expect(amont.appels).toHaveLength(0);
      expect(JSON.parse(rendu.corps)).toHaveProperty('error');
      // Le refus reste lisible par un widget embarque sur une autre origine.
      expect(rendu.headers['access-control-allow-origin']).toBe('*');
    });
  }

  for (const methode of METHODES_RETIREES) {
    it(`refuse (405) la methode retiree ${methode}`, async () => {
      const amont = fauxAmont(OK_JSON);
      const port = await monter(options(amont.envoyer));
      const rendu = await appeler(port, {
        method: methode,
        headers: { 'x-target-url': 'https://api.exemple.fr/' },
      });
      expect(rendu.status).toBe(405);
      expect(amont.appels).toHaveLength(0);
    });
  }

  it('refuse (413) un corps au-dela de la taille admise', async () => {
    const amont = fauxAmont(OK_JSON);
    const port = await monter({ ...options(amont.envoyer), tailleMaxOctets: 16 });
    const rendu = await appeler(port, {
      method: 'POST',
      headers: { 'x-target-url': 'https://api.exemple.fr/q' },
      corps: 'x'.repeat(64),
    });
    expect(rendu.status).toBe(413);
    expect(amont.appels).toHaveLength(0);
  });

  it('repond au preflight avec les seules methodes relayees', async () => {
    const amont = fauxAmont(OK_JSON);
    const port = await monter(options(amont.envoyer));
    const rendu = await appeler(port, {
      method: 'OPTIONS',
      headers: { 'access-control-request-headers': 'apikey, x-target-url' },
    });
    expect(rendu.status).toBe(204);
    expect(rendu.headers['access-control-allow-origin']).toBe('*');
    expect(rendu.headers['access-control-allow-methods']).toBe('GET, POST, OPTIONS');
    expect(rendu.headers['access-control-allow-headers']).toBe('apikey, x-target-url');
  });

  it('rend 502 quand l’amont est injoignable', async () => {
    const envoyer = (() => {
      const requete = new PassThrough();
      requete.on('finish', () => requete.emit('error', new Error('ECONNREFUSED')));
      return requete;
    }) as unknown as NonNullable<OptionsRelais['envoyer']>;
    const port = await monter(options(envoyer));
    const rendu = await appeler(port, { headers: { 'x-target-url': 'https://api.exemple.fr/' } });
    expect(rendu.status).toBe(502);
  });
});

describe('creerRelais — /ia-proxy', () => {
  const options = (envoyer: OptionsRelais['envoyer']): OptionsRelais => ({
    methodes: METHODES['/ia-proxy'],
    cors: false,
    envoyer,
  });

  it('relaie POST et GET avec les en-tetes du fournisseur, sans ouverture CORS', async () => {
    const amont = fauxAmont(OK_JSON);
    const port = await monter(options(amont.envoyer));
    const post = await appeler(port, {
      method: 'POST',
      headers: {
        'x-target-url': 'https://api.exemple.fr/v1/chat/completions',
        authorization: 'Bearer k',
        'x-api-key': 'k',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      corps: '{"model":"m"}',
    });
    const get = await appeler(port, {
      headers: { 'x-target-url': 'https://api.exemple.fr/v1/models', authorization: 'Bearer k' },
    });

    expect(post.status).toBe(200);
    expect(get.status).toBe(200);
    expect(amont.appels.map((a) => a.method)).toEqual(['POST', 'GET']);
    expect(amont.appels[0].headers?.['x-api-key']).toBe('k');
    expect(amont.appels[0].headers?.['anthropic-version']).toBe('2023-06-01');
    expect(amont.appels[0].corps).toBe('{"model":"m"}');
    // Ni l'ouverture du relais, ni celle de l'amont.
    expect(post.headers).not.toHaveProperty('access-control-allow-origin');
  });

  it('le preflight d’une autre origine ne recoit aucun en-tete CORS', async () => {
    const amont = fauxAmont(OK_JSON);
    const port = await monter(options(amont.envoyer));
    const rendu = await appeler(port, { method: 'OPTIONS' });
    expect(rendu.status).toBe(204);
    expect(rendu.headers).not.toHaveProperty('access-control-allow-origin');
  });

  it('refuse les cibles internes et les methodes retirees comme /cors-proxy', async () => {
    const amont = fauxAmont(OK_JSON);
    const port = await monter(options(amont.envoyer));
    const interne = await appeler(port, {
      method: 'POST',
      headers: { 'x-target-url': 'http://127.0.0.1:3003/ia-proxy-default' },
      corps: '{}',
    });
    const retiree = await appeler(port, {
      method: 'DELETE',
      headers: { 'x-target-url': 'https://api.exemple.fr/v1/models' },
    });
    expect(interne.status).toBe(403);
    expect(retiree.status).toBe(405);
    expect(amont.appels).toHaveLength(0);
  });
});
