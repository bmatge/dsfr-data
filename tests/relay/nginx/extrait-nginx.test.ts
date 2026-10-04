// @vitest-environment node
//
// Extrait nginx du relais cachable (ADR-155, lot 3) — ce qui se vérifie SANS nginx.
//
// La preuve par un vrai nginx est dans `relais-nginx.test.ts` (job CI `relais-nginx`).
// Ce fichier-ci tourne dans `npm run test:run` et garde ce qu'une lecture suffit à
// établir :
//   - le banc (`tests/relay/nginx/banc/`) est la dérivation de l'extrait de production,
//     et ne s'en écarte que par l'adresse de l'amont ;
//   - la grammaire de la cible écrite dans `relais-http.conf` est celle du relais Node
//     de référence (`proxy/relay/node/target.mjs`) ;
//   - la forme de l'extrait : une `location` statique par hôte, l'hôte jamais en
//     variable dans `proxy_pass`, les en-têtes sur toute réponse, tous les statuts
//     d'erreur de l'amont interceptés.

import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const EXTRAIT = join(ROOT, 'proxy/relay/nginx');
const BANC = join(ROOT, 'tests/relay/nginx/banc');

interface BancModule {
  RENOMMAGES: [string, string][];
  AMONT_BANC: string;
  renommer(texte: string): string;
  deriverBanc(options?: { amont?: string; dureeCache?: number }): {
    http: string;
    server: string;
    cles: string;
  };
}
interface TargetModule {
  isSafePath(path: string): boolean;
  isSafeSearch(search: string): boolean;
}
interface LimitesModule {
  LIMITES: { test: string; regle: string; cle: string; echec: RegExp }[];
}

async function importer<T>(chemin: string): Promise<T> {
  return (await import(/* @vite-ignore */ pathToFileURL(join(ROOT, chemin)).href)) as T;
}

const lire = (dossier: string, nom: string): string => readFileSync(join(dossier, nom), 'utf8');

/** Lignes utiles d'un fichier nginx : sans commentaires ni lignes vides. */
const directives = (texte: string): string[] =>
  texte
    .split('\n')
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne !== '' && !ligne.startsWith('#'));

/** Les blocs `location … { … }` de premier niveau d'un fichier, nom et corps. */
function locations(texte: string): { nom: string; corps: string }[] {
  const blocs: { nom: string; corps: string }[] = [];
  const lignes = texte.split('\n');
  for (let index = 0; index < lignes.length; index += 1) {
    const ouverture = /^location (.+) \{$/.exec(lignes[index]);
    if (!ouverture) continue;
    const fin = lignes.indexOf('}', index);
    blocs.push({ nom: ouverture[1], corps: lignes.slice(index + 1, fin).join('\n') });
    index = fin;
  }
  return blocs;
}

let banc: BancModule;
let target: TargetModule;
let LIMITES: LimitesModule['LIMITES'];

beforeAll(async () => {
  banc = await importer<BancModule>('tests/relay/nginx/banc.mjs');
  target = await importer<TargetModule>('proxy/relay/node/target.mjs');
  ({ LIMITES } = await importer<LimitesModule>('tests/relay/nginx/limites.mjs'));
});

// ---------------------------------------------------------------------------
describe('banc nginx — dérivé de l’extrait de production', () => {
  it('les fichiers de `banc/` sont la dérivation de l’extrait (node tests/relay/nginx/ecrire-banc.mjs)', () => {
    const derive = banc.deriverBanc();
    expect(lire(BANC, 'hotes.http.conf')).toBe(derive.http);
    expect(lire(BANC, 'hotes.server.conf')).toBe(derive.server);
    expect(lire(BANC, 'cles.conf')).toBe(derive.cles);
  });

  it('une fois les hôtes renommés, le banc ne diffère de la production que par l’adresse de l’amont', () => {
    const paires: [string, string][] = [
      ['hotes.http.example.conf', 'hotes.http.conf'],
      ['hotes.server.example.conf', 'hotes.server.conf'],
    ];
    const ecarts: [string, string][] = [];
    for (const [production, fichierBanc] of paires) {
      const attendu = directives(banc.renommer(lire(EXTRAIT, production)));
      const obtenu = directives(lire(BANC, fichierBanc));
      expect(obtenu.length).toBe(attendu.length);
      attendu.forEach((ligne, index) => {
        if (ligne !== obtenu[index]) ecarts.push([ligne, obtenu[index]]);
      });
    }
    // Trois hôtes : trois lignes `server`, trois lignes `proxy_pass`. Rien d'autre.
    expect(ecarts.length).toBe(6);
    for (const [production, deBanc] of ecarts) {
      const serveur = /^server [a-z0-9.-]+:443( .*)$/.exec(production);
      if (serveur) {
        expect(deBanc).toBe(`server ${banc.AMONT_BANC}${serveur[1]}`);
      } else {
        expect(production).toMatch(/^proxy_pass https:\/\/relais_[a-z_]+\$relais_cible;$/);
        expect(deBanc).toBe(production.replace('https://', 'http://'));
      }
    }
  });

  it('les fichiers communs de l’extrait ne nomment aucun hôte : le banc les monte tels quels', () => {
    for (const nom of [
      'relais-http.conf',
      'relais-server.conf',
      'relais-hote.conf',
      'relais-reponse.conf',
    ]) {
      const texte = lire(EXTRAIT, nom);
      for (const [exemple] of banc.RENOMMAGES) expect(texte).not.toContain(exemple);
      expect(texte).not.toContain('conformance.test');
      expect(directives(texte).some((ligne) => ligne.startsWith('proxy_pass '))).toBe(false);
    }
  });

  it('la clé d’exemple est fictive, et celle du banc est la clé fictive du profil', () => {
    expect(lire(EXTRAIT, 'cles.example.conf')).toContain('"Apikey CLE-FICTIVE-A-REMPLACER"');
    expect(lire(BANC, 'cles.conf')).toContain('"Apikey cle-fictive-de-conformance"');
  });
});

// ---------------------------------------------------------------------------
describe('extrait nginx — la grammaire de la cible est celle du relais de référence', () => {
  const http = lire(EXTRAIT, 'relais-http.conf');
  const motif =
    /map \$request_uri \$relais_cible \{\n\s+default "";\n\s+"~(.+)" \$relais_c;\n\}/.exec(http);
  // Le motif est écrit dans le sous-ensemble commun à PCRE et à JavaScript : c'est
  // celui du fichier versionné qu'on exécute ici, pas une copie.
  // eslint-disable-next-line security/detect-non-literal-regexp -- motif lu dans relais-http.conf
  const cible = new RegExp(motif?.[1] ?? '(?!)');
  const lireCible = (url: string): string | null => cible.exec(url)?.groups?.relais_c ?? null;

  /** Ce que rend le relais de référence pour la même URL de relais. */
  const reference = (suite: string): string | null => {
    const coupe = suite.indexOf('?');
    const chemin = coupe === -1 ? suite : suite.slice(0, coupe);
    const requete = coupe === -1 ? '' : suite.slice(coupe);
    return target.isSafePath(chemin) && target.isSafeSearch(requete) ? suite : null;
  };

  const hex = (octet: number): string => octet.toString(16).padStart(2, '0');
  const octets = Array.from({ length: 256 }, (_, octet) => octet);

  const corpus: string[] = [
    '/',
    '/a',
    '/a/',
    '/a/b.c~d_e-f',
    '/api/explore/v2.1/catalog/datasets/a-b_c.d~e/records',
    '/a;b=c/d',
    "/!$&'()*+,;=:@",
    '/...',
    '/.a',
    '/a.',
    '/..a',
    '/a..',
    // Les chemins piégés de la suite de conformance (C-SSRF-4).
    '/../x',
    '/x/..',
    '/x/../y',
    '/./x',
    '/x/.',
    '/x/./y',
    '//x',
    '/x//y',
    '/x//',
    '/..;/x',
    '/..;a=b/x',
    '/.;/x',
    '/x\\y',
    '/..\\x',
    '/x/%2e%2e/y',
    '/x/%2E%2E/y',
    '/x/.%2e/y',
    '/x/%2e./y',
    '/x/%252e%252e/y',
    '/x/..%2fy',
    '/x/..%5cy',
    '/x/..%3b/y',
    '/x/%c0%ae%c0%ae/y',
    '/x/..%c0%afy',
    '/x/%e0%80%ae/y',
    '/x/%f0%80%80%ae/y',
    '/x/%f8%80%80%80%ae/y',
    '/x/%fc%80%80%80%80%ae/y',
    '/x/%ef%bc%8e/y',
    '/x/%ef%bc%8f/y',
    '/x/%ef%bc%bc/y',
    '/x/%EF%BC%8E/y',
    '/x/%ef%bc%8d/y',
    '/x/%e0%a0%80/y',
    '/x/%f0%90%80%80/y',
    '/x/%c3%a9',
    '/x%',
    '/x%2',
    '/x%zz',
    '/x%2g',
    '/x y',
    '/x#y',
    '/xé',
    '/x\u0001',
    '/x\ty',
    // Tout octet encodé, en minuscules et en majuscules, seul puis entouré.
    ...octets.flatMap((octet) => [
      `/x%${hex(octet)}`,
      `/x%${hex(octet).toUpperCase()}y/z`,
      `/x?q=%${hex(octet)}`,
      `/x?q=%${hex(octet).toUpperCase()}&r=1`,
    ]),
    // Tout caractère ASCII, dans le chemin puis dans la requête.
    ...octets
      .filter((octet) => octet < 128)
      .flatMap((octet) => [
        `/x${String.fromCharCode(octet)}y`,
        `/x?q=${String.fromCharCode(octet)}y`,
      ]),
    // Les requêtes.
    '/x?',
    '/x?a=1&b=2',
    '/x?where=nom%20like%20%22a%25%22&limit=10&x=%2F%2E%2E&y=a+b&z=%C3%A9[]{}|^&vide=&b=2&a=1',
    '/x?a=../..//%2e%2e',
    '/x?a=b?c=d',
    '/x?a=%',
    '/x?a=%0',
    '/x?a=%0a',
    '/x?a=%0D',
    '/x?a=%00',
    '/x?a=b#c',
    '/x?a=b c',
    '/x?a=é',
    '/../x?a=1',
  ];

  it('le motif se lit dans relais-http.conf, deux fois le même segment', () => {
    expect(motif).not.toBeNull();
    // Garde contre un motif qui admettrait tout : il refuse, et il admet.
    expect(lireCible('/donnees-relais/h.example/a/b?c=d')).toBe('/a/b?c=d');
    expect(lireCible('/donnees-relais/h.example/a/../b')).toBeNull();
  });

  it(`admet et refuse exactement ce qu’admet et refuse target.mjs, sur ${corpus.length} cibles`, () => {
    const divergences: string[] = [];
    for (const suite of corpus) {
      const attendu = reference(suite);
      const obtenu = lireCible(`/donnees-relais/h.example${suite}`);
      if (attendu !== obtenu) divergences.push(`${JSON.stringify(suite)} : ${attendu} / ${obtenu}`);
    }
    expect(divergences).toEqual([]);
    // Le corpus exerce les deux issues.
    expect(corpus.filter((suite) => reference(suite) !== null).length).toBeGreaterThan(400);
    expect(corpus.filter((suite) => reference(suite) === null).length).toBeGreaterThan(200);
  });

  it('refuse une URL de relais sans chemin (`<relais>/<hôte>`) : la bibliothèque n’en produit pas', () => {
    expect(lireCible('/donnees-relais/h.example')).toBeNull();
    expect(lireCible('/donnees-relais/h.example?a=1')).toBeNull();
  });

  it('reste linéaire sur une URL de 8 000 caractères, admise ou refusée', () => {
    const debut = Date.now();
    for (const fin of ['', '\\', '%2e', '?a=%00']) {
      lireCible(`/donnees-relais/h.example/${'ab/'.repeat(1300)}${'c'.repeat(3900)}${fin}`);
      lireCible(`/donnees-relais/h.example/x?${'a=b&'.repeat(1900)}${fin}`);
    }
    expect(Date.now() - debut).toBeLessThan(500);
  });
});

// ---------------------------------------------------------------------------
describe('extrait nginx — forme', () => {
  const hotesServer = lire(EXTRAIT, 'hotes.server.example.conf');
  const hotesHttp = lire(EXTRAIT, 'hotes.http.example.conf');
  const hote = lire(EXTRAIT, 'relais-hote.conf');
  const server = lire(EXTRAIT, 'relais-server.conf');
  const reponse = lire(EXTRAIT, 'relais-reponse.conf');
  const cles = lire(EXTRAIT, 'cles.example.conf');

  it('une `location` statique par hôte : même hôte dans le nom, dans `set`, dans le bloc `upstream` nommé par `proxy_pass`', () => {
    const blocs = locations(hotesServer);
    expect(blocs.length).toBe(3);
    for (const { nom, corps } of blocs) {
      const nomLu = /^\^~ \/donnees-relais\/([a-z0-9.-]+)$/.exec(nom);
      expect(nomLu, nom).not.toBeNull();
      const hoteLu = nomLu?.[1] ?? '';
      expect(corps).toContain(`set $relais_hote ${hoteLu};`);
      expect(corps).toContain('include relais/relais-hote.conf;');
      // L'hôte n'est jamais une variable : `proxy_pass` nomme un bloc `upstream`.
      const passe = /proxy_pass https:\/\/(relais_[a-z_]+)\$relais_cible;/.exec(corps);
      expect(passe, nom).not.toBeNull();
      expect(hotesHttp).toContain(
        `upstream ${passe?.[1]} {\n    zone relais_amonts 256k;\n    server ${hoteLu}:443 `
      );
      // Les deux durées vont ensemble.
      const annonce = /set \$relais_ttl +(\d+);/.exec(corps);
      const gardee = /proxy_cache_valid 200 (\d+)s;/.exec(corps);
      expect(annonce?.[1], nom).toBe(gardee?.[1]);
    }
  });

  it('aucun `proxy_pass` de l’extrait ne porte de variable dans son autorité', () => {
    for (const nom of readdirSync(EXTRAIT).filter((fichier) => fichier.endsWith('.conf'))) {
      for (const ligne of directives(lire(EXTRAIT, nom))) {
        const passe = /^proxy_pass (https?):\/\/([^/$;]*)(.*);$/.exec(ligne);
        if (!ligne.startsWith('proxy_pass ')) continue;
        expect(passe, `${nom} : ${ligne}`).not.toBeNull();
        expect(passe?.[2], `${nom} : ${ligne}`).toMatch(/^(relais_[a-z_]+|127\.0\.0\.1:8155)$/);
      }
    }
  });

  it('un hôte à clé a un préfixe de chemin, comparé littéralement à la cible brute', () => {
    const hotesACle = [...cles.matchAll(/^\s+([a-z0-9.-]+\.[a-z]+)\s+"Apikey /gm)].map((m) => m[1]);
    expect(hotesACle).toEqual(['portail-prive.example']);
    for (const hoteACle of hotesACle) {
      const bloc = locations(hotesServer).find(({ nom }) => nom.endsWith(`/${hoteACle}`));
      expect(bloc?.corps).toMatch(
        /if \(\$relais_cible !~ "\^\\Q\/[^"]*\/\\E"\) \{\n\s+return 403 /
      );
    }
  });

  it('tout en-tête du relais est posé avec `always`, et toute `location` du relais les inclut', () => {
    const enTetes = directives(reponse).filter((ligne) => ligne.startsWith('add_header'));
    expect(enTetes.length).toBeGreaterThan(10);
    for (const ligne of enTetes) expect(ligne).toMatch(/ always;$/);
    for (const nom of [
      'Access-Control-Allow-Origin',
      'Access-Control-Expose-Headers',
      'X-Content-Type-Options',
      'Content-Security-Policy',
      'Cache-Control',
      'Vary',
    ]) {
      expect(enTetes.some((ligne) => ligne.startsWith(`add_header ${nom} `))).toBe(true);
    }
    expect(enTetes.join('\n')).not.toMatch(/Access-Control-Allow-(Headers|Credentials)/);
    const blocs = locations(server);
    expect(blocs.length).toBe(11);
    for (const { nom, corps } of blocs) {
      expect(corps, nom).toContain('include relais/relais-reponse.conf;');
    }
    expect(hote).toContain('include relais/relais-reponse.conf;');
  });

  it('tout `return` porte un corps (sans lui, nginx passerait par `error_page`), sauf le 204 de la pré-vérification', () => {
    for (const texte of [hote, server, hotesServer]) {
      const retours = directives(texte).filter((ligne) => ligne.startsWith('return '));
      for (const ligne of retours) {
        if (ligne === 'return 204;') continue;
        expect(ligne).toMatch(/^return \d{3} '\{"error":"[a-z-]+","message":"[^"']+"\}';$/);
      }
    }
  });

  it('tout statut de 300 à 599 de l’amont est intercepté, une fois (499 : nginx l’interdit)', () => {
    const codes = directives(hote)
      .filter((ligne) => ligne.startsWith('error_page '))
      .flatMap((ligne) => ligne.match(/\b\d{3}\b/g) ?? [])
      .map(Number)
      .sort((a, b) => a - b);
    const attendus = Array.from({ length: 300 }, (_, index) => 300 + index).filter(
      (code) => code !== 499
    );
    expect(codes).toEqual(attendus);
    expect(hote).toContain('proxy_intercept_errors on;');
    for (const cible of [...hote.matchAll(/(@relais_[a-z0-9_]+);/g)].map((m) => m[1])) {
      expect(server).toContain(`location ${cible} {`);
    }
  });

  it('rien du visiteur ne part à l’amont, le certificat est vérifié, le cache ne suit que l’URL', () => {
    for (const attendu of [
      'proxy_pass_request_headers off;',
      'proxy_pass_request_body    off;',
      'proxy_set_header Host            $relais_hote;',
      'proxy_set_header Authorization   $relais_cle;',
      // Sans cette ligne, nginx annonce à l'amont la longueur d'un corps qu'il n'envoie pas.
      'proxy_set_header Content-Length    "";',
      'proxy_ssl_server_name on;',
      'proxy_ssl_name        $relais_hote;',
      'proxy_ssl_verify      on;',
      'proxy_cache_key     "$relais_hote$relais_cible";',
      'proxy_buffering         on;',
      'limit_req  zone=relais_adresse ',
      'limit_req  zone=relais_hote ',
      'max_ranges 0;',
    ]) {
      expect(hote).toContain(attendu);
    }
    // Aucune erreur 5xx ni 429 n'est mise en cache ; `any` les y mettrait.
    const durees = directives(hote).filter((ligne) => ligne.startsWith('proxy_cache_valid'));
    expect(durees).toEqual(['proxy_cache_valid 401 403 404 410 1s;']);
    expect(hote).not.toMatch(/proxy_cache_background_update/);
  });

  it('devant le relais Node : nginx POSE X-Forwarded-For, transmet la cible brute, ne force aucune durée de cache', () => {
    const mandataire = lire(EXTRAIT, 'mandataire-node.server.conf');
    expect(mandataire).toContain('proxy_set_header X-Forwarded-For $remote_addr;');
    expect(mandataire).toContain('proxy_pass http://127.0.0.1:8155;');
    expect(mandataire).toContain('proxy_buffering         on;');
    const actives = directives(mandataire).join('\n');
    expect(actives).not.toMatch(/proxy_cache_valid|proxy_ignore_headers/);
  });
});

// ---------------------------------------------------------------------------
describe('extrait nginx — les limites documentées', () => {
  const lisezMoi = lire(EXTRAIT, 'README.md');
  const contrat = readFileSync(join(ROOT, 'docs/RELAY.md'), 'utf8');

  it('chaque limite de `limites.mjs` est nommée dans le README de l’extrait et dans docs/RELAY.md', () => {
    const cles = [...new Set(LIMITES.map((limite) => limite.cle))];
    expect(cles).toEqual(['avant-routage', 'type-de-contenu', 'memo-une-seconde', 'taille']);
    for (const cle of cles) {
      expect(lisezMoi, cle).toContain(`\`${cle}\``);
      expect(contrat, cle).toContain(`\`${cle}\``);
    }
  });

  it('le décompte annoncé est celui de la liste', () => {
    expect(LIMITES.length).toBe(18);
    expect(new Set(LIMITES.map((limite) => limite.test)).size).toBe(LIMITES.length);
    expect(lisezMoi).toContain(`${137 - LIMITES.length} tests verts`);
    expect(lisezMoi).toContain(`${LIMITES.length} rouges`);
  });
});
