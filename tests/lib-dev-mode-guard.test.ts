import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La garde de mode developpement ne doit pas etre pliee au build (#716).
 *
 * CE QUI S'EST PASSE. `isViteDevMode()` protege son heuristique d'hote
 * (`localhost` + un port) derriere `import.meta.env.DEV`, precisement pour
 * qu'un integrateur tiers developpant sur `http://localhost:3000` ne soit PAS
 * traite comme le serveur de dev de ce depot (frontiere #319). Mais
 * `scripts/build-lib.ts` est lance par `vite-node`, qui pose
 * `NODE_ENV=development` : Vite en deduisait `DEV: true`, pliait la condition,
 * et le bundle PUBLIE SUR NPM ne testait plus que l'hote. Un integrateur en
 * local recevait des URL `/tabular-proxy/`, `/grist-proxy/`, `/insee-proxy/`
 * qui n'existent pas chez lui.
 *
 * CE QUE CE FICHIER VERROUILLE, en deux temps :
 *
 *  1. la FORME du correctif dans `scripts/build-lib.ts` — le signal est pose
 *     explicitement, il ne se deduit plus de `NODE_ENV` ;
 *  2. le RESULTAT, en grepant les bundles produits, comme le veut la
 *     convention du CLAUDE.md (« valider empiriquement en grepant les bundles
 *     produits »). Ignore plutot que rouge quand `dist/` n'existe pas : meme
 *     doctrine que `tests/debug/standalone-bundle.test.ts`, un garde-fou qui
 *     casse pour une raison etrangere a ce qu'il garde finit desactive.
 *
 * `isViteDevMode` est le SEUL point du code lib qui lise `import.meta.env.DEV` :
 * le rayon d'action est borne, et le test ci-dessous le verifie.
 */

const RACINE = join(__dirname, '..');
const DIST = join(RACINE, 'packages/core/dist');

/** Les bundles reellement publies sur npm et le CDN. */
const BUNDLES_PUBLIES = [
  'dsfr-data.esm.js',
  'dsfr-data.umd.js',
  'dsfr-data.core.esm.js',
  'dsfr-data.core.umd.js',
  'dsfr-data.map.esm.js',
  'dsfr-data.map.umd.js',
];

/**
 * Signature de l'heuristique d'hote apres minification :
 * `… !== "80" && <var> !== "443"`. Les noms de variables changent a chaque
 * build, pas cette paire de litteraux — elle n'apparait nulle part ailleurs.
 */
const HEURISTIQUE_HOTE = /!==\s*["']80["']\s*&&\s*[$\w]+\s*!==\s*["']443["']/;

const built = existsSync(join(DIST, 'dsfr-data.esm.js'));

/** Fichiers `.ts` d'un arbre, artefacts de build `.js` exclus par construction. */
function fichiersTs(dir: string, out: string[] = []): string[] {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree);
    if (statSync(chemin).isDirectory()) fichiersTs(chemin, out);
    else if (entree.endsWith('.ts') && !entree.endsWith('.d.ts')) out.push(chemin);
  }
  return out;
}

/** Retire commentaires de bloc et de ligne : une mention en prose n'est pas une lecture. */
function sansCommentaires(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('la garde de mode developpement survit au build (#716)', () => {
  it('build-lib.ts pose le mode explicitement, sans dependre de NODE_ENV', () => {
    const source = readFileSync(join(RACINE, 'scripts/build-lib.ts'), 'utf-8');
    expect(source).toContain('DSFR_DATA_DEV_BUILD');
    // `mode` force : sous vite-node, NODE_ENV vaut « development ».
    expect(source).toMatch(/mode:\s*devBuild\s*\?/);
    // Et la valeur lue par isViteDevMode est posee noir sur blanc.
    expect(source).toContain("'import.meta.env.DEV'");
  });

  it('isViteDevMode reste le seul point du code lib a lire import.meta.env.DEV', () => {
    // Si un autre module se mettait a lire DEV, le rayon d'action du correctif
    // cesserait d'etre borne a cette fonction — et ce fichier ne suffirait plus.
    const lectures: string[] = [];
    for (const fichier of fichiersTs(join(RACINE, 'packages/shared/src'))) {
      const code = sansCommentaires(readFileSync(fichier, 'utf-8'));
      for (const _ of code.matchAll(/import\.meta\.env\??\.DEV\b/g)) lectures.push(fichier);
    }
    for (const fichier of fichiersTs(join(RACINE, 'packages/core/src'))) {
      const code = sansCommentaires(readFileSync(fichier, 'utf-8'));
      for (const _ of code.matchAll(/import\.meta\.env\??\.DEV\b/g)) lectures.push(fichier);
    }
    expect(lectures.map((f) => f.slice(RACINE.length + 1))).toEqual([
      'packages/shared/src/api/proxy-config.ts',
    ]);
  });

  it('la garde encadre bien l heuristique d hote dans la source', () => {
    const source = readFileSync(join(RACINE, 'packages/shared/src/api/proxy-config.ts'), 'utf-8');
    const debut = source.indexOf('export function isViteDevMode');
    const corps = source.slice(debut, source.indexOf('\n}', debut));
    // Le test de DEV precede le test d'hote : sinon la garde ne garde rien.
    expect(corps.indexOf('import.meta.env?.DEV')).toBeGreaterThan(-1);
    expect(corps.indexOf('import.meta.env?.DEV')).toBeLessThan(corps.indexOf('hostname'));
  });
});

describe.skipIf(!built)('les bundles publies ne contiennent pas la bascule de dev (#716)', () => {
  for (const fichier of BUNDLES_PUBLIES) {
    it(`${fichier} ne teste pas localhost + port`, () => {
      const chemin = join(DIST, fichier);
      if (!existsSync(chemin)) return;
      const source = readFileSync(chemin, 'utf-8');
      expect(
        HEURISTIQUE_HOTE.test(source),
        `${fichier} contient encore l'heuristique d'hote de isViteDevMode : ` +
          `le build a ete fait avec DSFR_DATA_DEV_BUILD=1, ou la garde a saute (#716)`
      ).toBe(false);
    });
  }

  it('l echappatoire runtime des integrateurs reste dans le bundle', () => {
    // `window.DSFR_DATA_PROXY = { baseUrl: '' }` est ce qui reste a un
    // integrateur qui sert le bundle construit derriere ses propres routes de
    // proxy. La retirer transformerait ce correctif en regression.
    const source = readFileSync(join(DIST, 'dsfr-data.esm.js'), 'utf-8');
    expect(source).toContain('DSFR_DATA_PROXY');
  });
});
