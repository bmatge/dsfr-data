// @vitest-environment node
/**
 * Test-garde : les QUATRE endroits qui bornent le proxy generique appliquent la
 * meme regle.
 *
 *   - `vite.config.ts` (developpement) monte `creerRelais` de
 *     `scripts/lib/garde-proxy.cjs` ;
 *   - `docker/nginx.conf` et `docker/nginx-db.conf` lisent les `map` de
 *     `docker/garde-proxy.conf` ;
 *   - `proxy/nginx/nginx.conf` (proxy autonome) porte les memes `map`.
 *
 * Le module est la source de verite : un motif nginx qui s'en ecarte fait
 * echouer ce test. Les `map` sont ensuite RELUES et evaluees comme nginx le
 * fait (premier motif qui correspond, sinon `default`) sur la table de cas
 * commune — ce n'est pas nginx, c'est une lecture mecanique de sa configuration ;
 * le vrai nginx est exerce par `garde-proxy-nginx.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MESSAGES,
  METHODES,
  MOTIF_CIBLE_ADMISE,
  MOTIF_CIBLE_INSTANCE,
  MOTIF_NOM_RESERVE,
  TAILLE_MAX_OCTETS,
} from '../../scripts/lib/garde-proxy.cjs';
import { CAS_CIBLES, HOTE_INSTANCE } from './cas-garde-proxy';

const RACINE = resolve(__dirname, '../..');
const lire = (chemin: string): string => readFileSync(resolve(RACINE, chemin), 'utf-8');

/** Lignes utiles d'un extrait : sans indentation, sans lignes vides. */
function lignes(texte: string): string[] {
  return texte
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
}

/** Ce qui se trouve entre `# >>> garde-proxy : <nom>` et `# <<< garde-proxy : <nom>`. */
function entreReperes(texte: string, nom: string): string {
  const debut = `# >>> garde-proxy : ${nom}\n`;
  const fin = `# <<< garde-proxy : ${nom}`;
  const d = texte.indexOf(debut);
  const f = texte.indexOf(fin);
  if (d === -1 || f === -1 || f < d) throw new Error(`repères « ${nom} » introuvables`);
  return texte.slice(d + debut.length, f);
}

/** Le bloc `location <route> { … }` entier. */
function blocLocation(texte: string, route: string): string {
  const m = new RegExp(`^( *)location ${route} \\{\\n[\\s\\S]*?^\\1\\}$`, 'm').exec(texte);
  if (!m) throw new Error(`location ${route} introuvable`);
  return m[0];
}

interface MapNginx {
  parDefaut: string;
  motifs: Array<{ re: RegExp; source: string; valeur: string }>;
}

/** Relit un bloc `map … $variable { … }` : son `default` et ses motifs, dans l'ordre. */
function lireMap(texte: string, variable: string): MapNginx {
  const m = new RegExp(`map [^\\n]* \\$${variable} \\{\\n([\\s\\S]*?)\\n\\s*\\}`).exec(texte);
  if (!m) throw new Error(`map $${variable} introuvable`);
  const map: MapNginx = { parDefaut: '', motifs: [] };
  for (const ligne of lignes(m[1])) {
    if (ligne.startsWith('#')) continue;
    const defaut = /^default\s+(\S+);$/.exec(ligne);
    if (defaut) {
      map.parDefaut = defaut[1];
      continue;
    }
    const motif = /^"~\*(.+)"\s+(\S+);$/.exec(ligne);
    if (!motif) throw new Error(`ligne de map non comprise : ${ligne}`);
    map.motifs.push({ re: new RegExp(motif[1], 'i'), source: motif[1], valeur: motif[2] });
  }
  return map;
}

function evaluer(map: MapNginx, valeur: string): string {
  return map.motifs.find((m) => m.re.test(valeur))?.valeur ?? map.parDefaut;
}

/** Décision qu'un bloc `location` borné rend pour une cible, d'après ses `map`. */
function decision(texteMaps: string, cible: string | undefined): 'admis' | 400 | 403 {
  if (cible === undefined || cible === '') return 400;
  if (evaluer(lireMap(texteMaps, 'proxy_cible_refusee'), cible) !== '0') return 403;
  if (evaluer(lireMap(texteMaps, 'proxy_cible_instance'), `${HOTE_INSTANCE}|${cible}`) !== '0') {
    return 403;
  }
  return 'admis';
}

const JEUX_DE_MAPS = [
  { fichier: 'docker/garde-proxy.conf', sert: 'docker/nginx.conf et docker/nginx-db.conf' },
  { fichier: 'proxy/nginx/nginx.conf', sert: 'le proxy autonome' },
];

const LOCATIONS = [
  { fichier: 'docker/nginx.conf', route: '/cors-proxy' as const },
  { fichier: 'docker/nginx.conf', route: '/ia-proxy' as const },
  { fichier: 'docker/nginx-db.conf', route: '/cors-proxy' as const },
  { fichier: 'docker/nginx-db.conf', route: '/ia-proxy' as const },
  { fichier: 'proxy/nginx/nginx.conf', route: '/cors-proxy' as const },
];

describe('les `map` nginx portent les motifs du module', () => {
  for (const { fichier } of JEUX_DE_MAPS) {
    it(`${fichier} : memes motifs, meme ordre, refus par defaut`, () => {
      const texte = lire(fichier);
      const cible = lireMap(texte, 'proxy_cible_refusee');
      expect(cible.parDefaut).toBe('1');
      expect(cible.motifs.map((m) => [m.source, m.valeur])).toEqual([
        [MOTIF_NOM_RESERVE, '1'],
        [MOTIF_CIBLE_ADMISE, '0'],
      ]);

      const instance = lireMap(texte, 'proxy_cible_instance');
      expect(instance.parDefaut).toBe('0');
      expect(instance.motifs.map((m) => [m.source, m.valeur])).toEqual([
        [MOTIF_CIBLE_INSTANCE, '1'],
      ]);
      expect(texte).toContain('map "$host|$http_x_target_url" $proxy_cible_instance {');
      expect(texte).toContain('map $http_x_target_url $proxy_cible_refusee {');
    });
  }

  it('les deux jeux de `map` sont identiques, ligne a ligne', () => {
    const [docker, autonome] = JEUX_DE_MAPS.map((j) =>
      lignes(entreReperes(lire(j.fichier), 'cible'))
    );
    expect(autonome).toEqual(docker);
  });

  it('les images Docker embarquent le fichier de garde', () => {
    for (const dockerfile of ['docker/Dockerfile', 'docker/Dockerfile.db']) {
      expect(lire(dockerfile)).toContain(
        'COPY docker/garde-proxy.conf /etc/nginx/conf.d/00-garde-proxy.conf'
      );
    }
  });
});

describe('les `map` nginx rendent la decision de la table de cas', () => {
  for (const { fichier, sert } of JEUX_DE_MAPS) {
    describe(`${fichier} (${sert})`, () => {
      const texte = lire(fichier);
      for (const cas of CAS_CIBLES) {
        it(`${cas.attendu === 'admis' ? 'admet' : `refuse (${cas.attendu})`} : ${cas.nom}`, () => {
          expect(decision(texte, cas.cible)).toBe(cas.attendu);
        });
      }
    });
  }
});

describe('chaque bloc `location` generique applique le bornage', () => {
  it('les blocs bornes sont identiques d’un fichier a l’autre', () => {
    // Le proxy autonome declare son resolveur au niveau `http` : seules ces
    // lignes le distinguent des deux configurations Docker.
    const sansResolveur = (l: string[]) => l.filter((x) => !/^(resolver|# Resolver)/.test(x));
    for (const route of ['/cors-proxy', '/ia-proxy'] as const) {
      const blocs = LOCATIONS.filter((l) => l.route === route).map((l) =>
        sansResolveur(lignes(entreReperes(lire(l.fichier), route)))
      );
      for (const bloc of blocs.slice(1)) expect(bloc).toEqual(blocs[0]);
    }
  });

  for (const { fichier, route } of LOCATIONS) {
    describe(`${fichier} — ${route}`, () => {
      const bloc = blocLocation(lire(fichier), route);
      const borne = entreReperes(lire(fichier), route);

      it('refuse avant tout appel amont : methode, en-tete absent, cible', () => {
        const refus = borne.slice(0, borne.indexOf('proxy_pass'));
        expect(refus).toContain(`if ($request_method !~ ^(${METHODES[route].join('|')})$) {`);
        expect(refus).toContain(`return 405 '{"error":"${MESSAGES['methode-non-admise']}"}';`);
        expect(refus).toContain("if ($http_x_target_url = '') {");
        expect(refus).toContain(`return 400 '{"error":"${MESSAGES['en-tete-absent']}"}';`);
        expect(refus).toContain('if ($proxy_cible_refusee) {');
        expect(refus).toContain('if ($proxy_cible_instance) {');
        expect(refus).toContain(`return 403 '{"error":"${MESSAGES['cible-non-admise']}"}';`);
      });

      it('borne le debit et la taille du corps', () => {
        const zone = route === '/cors-proxy' ? 'cors_proxy_client' : 'ia_proxy_client';
        expect(borne).toMatch(new RegExp(`limit_req zone=${zone} burst=\\d+ nodelay;`));
        expect(borne).toMatch(/limit_req zone=proxy_generique_global burst=\d+ nodelay;/);
        expect(borne).toContain('limit_req_status 429;');
        expect(TAILLE_MAX_OCTETS).toBe(1024 * 1024);
        expect(borne).toContain('client_max_body_size 1m;');
      });

      it('verifie le certificat de l’amont, ne suit aucune redirection, retient les cookies', () => {
        expect(borne).toContain('proxy_pass $target_url;');
        expect(borne).toContain('proxy_ssl_verify on;');
        expect(borne).toContain(
          'proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;'
        );
        expect(borne).toContain('proxy_ignore_headers X-Accel-Redirect;');
        expect(borne).toContain('proxy_set_header Cookie "";');
        expect(borne).toContain('proxy_set_header X-Target-URL "";');
        expect(bloc).not.toMatch(/proxy_redirect|proxy_intercept_errors|error_page/);
      });

      it(
        route === '/cors-proxy'
          ? 'garde le CORS ouvert (widgets embarques sur des sites tiers)'
          : 'n’ouvre aucun CORS (apps de l’instance seulement)',
        () => {
          const ouvertures = bloc.match(/add_header 'Access-Control-Allow-Origin' '\*' always;/g);
          if (route === '/cors-proxy') {
            expect(ouvertures).toHaveLength(2); // preflight + reponses
            expect(bloc).toContain(
              `add_header 'Access-Control-Allow-Methods' '${METHODES[route].join(', ')}, OPTIONS' always;`
            );
          } else {
            expect(ouvertures).toBeNull();
            expect(bloc).not.toContain('add_header');
          }
        }
      );
    });
  }

  it('aucune cible dynamique hors d’un bloc borne', () => {
    for (const fichier of ['docker/nginx.conf', 'docker/nginx-db.conf', 'proxy/nginx/nginx.conf']) {
      const texte = lire(fichier);
      const dynamiques = texte.match(/proxy_pass\s+\S*\$/g) ?? [];
      const bornes = texte.match(/# >>> garde-proxy : \/[a-z-]+\n/g) ?? [];
      expect(bornes.length).toBeGreaterThan(0);
      expect(dynamiques).toHaveLength(bornes.length);
    }
  });
});

describe('le serveur de developpement monte le meme relais', () => {
  const vite = lire('vite.config.ts');

  it('`/cors-proxy` et `/ia-proxy` passent par creerRelais, avec les methodes du module', () => {
    expect(vite).toContain("creerRelais({ methodes: METHODES['/cors-proxy'], cors: true })");
    expect(vite).toContain("creerRelais({ methodes: METHODES['/ia-proxy'], cors: false })");
  });

  it('aucune autre route ne lit X-Target-URL', () => {
    expect(vite).not.toMatch(/headers\[['"]x-target-url['"]\]/i);
    expect(vite).not.toContain("'/api-proxy'");
  });
});
