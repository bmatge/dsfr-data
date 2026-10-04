// @vitest-environment node
/**
 * Le bornage du proxy generique, par un VRAI nginx.
 *
 * Hors de la suite ordinaire : il faut Docker. Active par `PROXY_NGINX_REEL=1`
 * (job `proxy-nginx` de `.github/workflows/ci.yml`) :
 *
 *   PROXY_NGINX_REEL=1 npx vitest run tests/proxy/garde-proxy-nginx.test.ts
 *
 * Chacune des trois configurations est chargee dans l'image qu'elle vise, dans
 * un conteneur SANS RESEAU (`--network none`) : `nginx -t` valide la syntaxe,
 * puis la table de cas commune est rejouee de l'interieur du conteneur. Aucune
 * requete ne sort, vers aucun service.
 *
 * Lecture du resultat : un refus est un 4xx immediat, rendu par nginx. Une
 * cible ADMISE part vers l'amont — sans reseau, la resolution de nom echoue, et
 * nginx rend 502 (ou ne repond pas avant le delai de curl, code `000`). Dans
 * les deux cas la garde a laisse passer : c'est ce qu'on verifie.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CAS_CIBLES, HOTE_INSTANCE, METHODES_RETIREES } from './cas-garde-proxy';

const ACTIF = process.env.PROXY_NGINX_REEL === '1';
const RACINE = resolve(__dirname, '../..');

interface Cible {
  nom: string;
  image: string;
  port: number;
  routes: string[];
  /** Prepare le dossier a monter et rend les arguments `-v` de `docker run`. */
  monter(dossier: string): string[];
}

/** Les deux fichiers que le Dockerfile ecrit lui-meme dans conf.d. */
const BEACON_LOG =
  "log_format beacon '$time_iso8601|$http_referer|$arg_c|$arg_t|$remote_addr|$arg_r';\n";
const CACHE =
  'proxy_cache_path /var/cache/nginx/api levels=1:2 keys_zone=api_cache:10m max_size=100m inactive=5m;\n';

function confDocker(fichier: string) {
  return (dossier: string): string[] => {
    copyFileSync(join(RACINE, fichier), join(dossier, 'default.conf'));
    copyFileSync(
      join(RACINE, 'docker/security-headers.conf'),
      join(dossier, 'security-headers.conf')
    );
    copyFileSync(join(RACINE, 'docker/garde-proxy.conf'), join(dossier, '00-garde-proxy.conf'));
    writeFileSync(join(dossier, 'beacon-log.conf'), BEACON_LOG);
    writeFileSync(join(dossier, 'cache.conf'), CACHE);
    return ['-v', `${dossier}:/etc/nginx/conf.d:ro`];
  };
}

const CIBLES: Cible[] = [
  {
    nom: 'docker/nginx.conf',
    image: 'nginxinc/nginx-unprivileged:alpine',
    port: 8080,
    routes: ['/cors-proxy', '/ia-proxy'],
    monter: confDocker('docker/nginx.conf'),
  },
  {
    nom: 'docker/nginx-db.conf',
    image: 'nginxinc/nginx-unprivileged:alpine',
    port: 8080,
    routes: ['/cors-proxy', '/ia-proxy'],
    monter: confDocker('docker/nginx-db.conf'),
  },
  {
    nom: 'proxy/nginx/nginx.conf',
    image: 'nginx:alpine',
    port: 80,
    routes: ['/cors-proxy'],
    monter: (dossier) => {
      copyFileSync(join(RACINE, 'proxy/nginx/nginx.conf'), join(dossier, 'nginx.conf'));
      return ['-v', `${join(dossier, 'nginx.conf')}:/etc/nginx/nginx.conf:ro`];
    },
  },
];

function docker(args: string[], entree?: string): string {
  return execFileSync('docker', args, {
    input: entree,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 180_000,
  });
}

const apostrophes = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

interface Appel {
  id: string;
  route: string;
  methode?: string;
  cible?: string;
  corpsOctets?: number;
}

/**
 * Rejoue les appels DANS le conteneur, en parallele, et rend `id → statut`.
 * `000` : curl n'a rien recu avant son delai (la requete est partie vers l'amont).
 */
function rejouer(conteneur: string, port: number, appels: Appel[]): Map<string, string> {
  const script = [
    appels.some((a) => a.corpsOctets)
      ? `head -c ${Math.max(...appels.map((a) => a.corpsOctets ?? 0))} /dev/zero > /tmp/corps`
      : ':',
    ...appels.map((a) => {
      const args = [
        'curl -s -o /dev/null --max-time 4',
        `-w ${apostrophes(`${a.id} %{http_code}\\n`)}`,
        `-X ${a.methode ?? 'GET'}`,
        `-H ${apostrophes(`Host: ${HOTE_INSTANCE}`)}`,
        a.cible === undefined ? '' : `-H ${apostrophes(`X-Target-URL: ${a.cible}`)}`,
        a.corpsOctets ? '--data-binary @/tmp/corps' : '',
        `http://127.0.0.1:${port}${a.route}`,
      ];
      return `${args.filter(Boolean).join(' ')} &`;
    }),
    'wait',
  ].join('\n');
  const sortie = docker(['exec', '-i', conteneur, 'sh'], script);
  const statuts = new Map<string, string>();
  for (const ligne of sortie.split('\n')) {
    const m = /^(\S+) (\d{3})$/.exec(ligne.trim());
    if (m) statuts.set(m[1], m[2]);
  }
  return statuts;
}

/** Une cible admise est partie vers l'amont : ni refus de la garde, ni succes local. */
const PARTIE_VERS_L_AMONT = ['502', '504', '000'];

describe.skipIf(!ACTIF)('bornage du proxy generique — nginx reel, sans reseau', () => {
  for (const [index, cible] of CIBLES.entries()) {
    describe(cible.nom, () => {
      const conteneur = `garde-proxy-${process.pid}-${index}`;
      let dossier = '';
      let statuts = new Map<string, string>();

      beforeAll(() => {
        dossier = mkdtempSync(join(tmpdir(), 'garde-proxy-'));
        chmodSync(dossier, 0o755);
        const volumes = cible.monter(dossier);
        // Syntaxe : la configuration telle qu'elle sera chargee.
        docker(['run', '--rm', '--network', 'none', ...volumes, cible.image, 'nginx', '-t']);
        docker([
          'run',
          '-d',
          '--rm',
          '--network',
          'none',
          '--name',
          conteneur,
          ...volumes,
          cible.image,
        ]);
        // Attente du demarrage : la route repond des que nginx ecoute.
        docker(
          ['exec', '-i', conteneur, 'sh'],
          `for i in $(seq 1 50); do curl -s -o /dev/null http://127.0.0.1:${cible.port}/cors-proxy && exit 0; sleep 0.2; done; exit 1`
        );

        const appels: Appel[] = [];
        for (const route of cible.routes) {
          CAS_CIBLES.forEach((cas, i) =>
            appels.push({ id: `${route}|cas${i}`, route, cible: cas.cible })
          );
          for (const methode of METHODES_RETIREES) {
            if (methode === 'HEAD') continue; // curl -X HEAD attend un corps qui ne vient pas
            appels.push({
              id: `${route}|${methode}`,
              route,
              methode,
              cible: 'https://api.exemple.fr/',
            });
          }
          appels.push({ id: `${route}|OPTIONS`, route, methode: 'OPTIONS' });
          appels.push({
            id: `${route}|POST`,
            route,
            methode: 'POST',
            cible: 'https://api.exemple.fr/q',
            corpsOctets: 64,
          });
          appels.push({
            id: `${route}|trop-grand`,
            route,
            methode: 'POST',
            cible: 'https://api.exemple.fr/q',
            corpsOctets: 2 * 1024 * 1024,
          });
        }
        statuts = rejouer(conteneur, cible.port, appels);
      }, 240_000);

      afterAll(() => {
        try {
          docker(['rm', '-f', conteneur]);
        } catch {
          // deja arrete
        }
        if (dossier) rmSync(dossier, { recursive: true, force: true });
      });

      for (const route of cible.routes) {
        describe(route, () => {
          CAS_CIBLES.forEach((cas, i) => {
            it(`${cas.attendu === 'admis' ? 'admet' : `refuse (${cas.attendu})`} : ${cas.nom}`, () => {
              const statut = statuts.get(`${route}|cas${i}`);
              if (cas.attendu === 'admis') expect(PARTIE_VERS_L_AMONT).toContain(statut);
              else expect(statut).toBe(String(cas.attendu));
            });
          });

          for (const methode of METHODES_RETIREES.filter((m) => m !== 'HEAD')) {
            it(`refuse (405) la methode retiree ${methode}`, () => {
              expect(statuts.get(`${route}|${methode}`)).toBe('405');
            });
          }

          it('repond 204 au preflight', () => {
            expect(statuts.get(`${route}|OPTIONS`)).toBe('204');
          });

          it('laisse partir un POST de taille ordinaire', () => {
            expect(PARTIE_VERS_L_AMONT).toContain(statuts.get(`${route}|POST`));
          });

          it('refuse (413) un corps au-dela de 1 Mo', () => {
            expect(statuts.get(`${route}|trop-grand`)).toBe('413');
          });
        });
      }

      it('plafonne le debit : une rafale recoit des 429', () => {
        const rafale: Appel[] = Array.from({ length: 150 }, (_, i) => ({
          id: `rafale${i}`,
          route: '/cors-proxy',
          cible: 'https://api.exemple.fr/',
        }));
        const rendus = [...rejouer(conteneur, cible.port, rafale).values()];
        expect(rendus.filter((s) => s === '429').length).toBeGreaterThan(0);
        // Tout ce qui n'est pas plafonne est parti vers l'amont : jamais un refus de garde.
        for (const s of rendus) expect([...PARTIE_VERS_L_AMONT, '429']).toContain(s);
      }, 60_000);

      it('rend les refus lisibles d’une autre origine sur /cors-proxy, pas sur /ia-proxy', () => {
        const enTetes = (route: string): string =>
          docker(
            ['exec', '-i', conteneur, 'sh'],
            `curl -s -D - -o /dev/null -H 'X-Target-URL: https://127.0.0.1/' http://127.0.0.1:${cible.port}${route}`
          ).toLowerCase();
        expect(enTetes('/cors-proxy')).toContain('access-control-allow-origin: *');
        if (cible.routes.includes('/ia-proxy')) {
          expect(enTetes('/ia-proxy')).not.toContain('access-control-allow-origin');
        }
      });
    });
  }
});
