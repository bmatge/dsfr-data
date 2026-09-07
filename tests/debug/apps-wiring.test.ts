import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPreviewHTML, generateDashboardHTML, createEmptyDashboard } from '@dsfr-data/shared';

/**
 * Le cablage du tampon precoce dans les apps (#605, #606).
 *
 * CE FICHIER EXISTE A CAUSE D'UN DEFAUT REEL. Le tampon avait ete corrige
 * dans le Playground uniquement ; le Builder appelait `getPreviewHTML(code)`
 * sans option, et `generateDashboardHTML` — utilise par le Studio et le
 * Dashboard — n'avait meme pas de parametre `debug`. Trois apps sur quatre
 * observaient donc leur apercu SANS tampon, avec pour consequence une
 * chronologie falsifiee (l'erreur datee a t=0, le `loading` perdu) et, plus
 * grave, des erreurs invisibles : le cache global ne garde aucune trace d'un
 * echec.
 *
 * La suite etait pourtant verte. Aucun test ne verifiait le CABLAGE — seul
 * le mecanisme etait couvert. D'ou ces tests, qui lisent le code des apps.
 */

const ROOT = join(__dirname, '../..');
const lire = (p: string) => readFileSync(join(ROOT, p), 'utf-8');

describe('les apercus iframe portent le tampon precoce', () => {
  const APPELS = [
    { app: 'Playground', fichier: 'apps/playground/src/main.ts', fn: 'getPreviewHTML' },
    { app: 'Playground', fichier: 'apps/playground/src/preview.ts', fn: 'getPreviewHTML' },
    { app: 'Builder', fichier: 'apps/builder/src/ui/preview.ts', fn: 'getPreviewHTML' },
  ];

  for (const { app, fichier, fn } of APPELS) {
    it(`${app} (${fichier}) demande debug: true`, () => {
      const src = lire(fichier);
      // On cherche l'appel qui alimente une iframe : c'est LUI qui doit
      // porter le tampon. Le code copie par l'utilisateur, non.
      const appels = src.split('\n').filter((l) => l.includes(`${fn}(`) && l.includes('srcdoc'));
      expect(appels.length, `aucun appel ${fn} vers une srcdoc dans ${fichier}`).toBeGreaterThan(0);
      for (const ligne of appels) {
        expect(ligne, `${fichier} : ${ligne.trim()}`).toContain('debug: true');
      }
    });
  }

  it('le Studio alimente son iframe avec la variante debug', () => {
    const src = lire('apps/studio/src/ui/preview.ts');

    expect(src).toContain('generateDashboardHTML(state.document, { debug: true })');
    // ...et n'expose PAS cette variante dans l'onglet Code.
    expect(src).toMatch(/codeEl.*exportHtml/s);
  });

  it('le Dashboard alimente son iframe avec la variante debug', () => {
    expect(lire('apps/dashboard/src/preview.ts')).toContain('generatePreviewHTMLCode()');
    expect(lire('apps/dashboard/src/code-generator.ts')).toContain('{ debug: true }');
  });
});

describe('le tampon ne fuit JAMAIS dans le code exporté', () => {
  it('getPreviewHTML sans option reste propre', () => {
    expect(getPreviewHTML('<dsfr-data-source id="s"></dsfr-data-source>')).not.toContain(
      '__dsfrDataTrace'
    );
  });

  it('generateDashboardHTML sans option reste propre', () => {
    // C'est le HTML que l'utilisateur copie et exporte : y laisser une sonde
    // de diagnostic serait une fuite dans SA page.
    expect(generateDashboardHTML(createEmptyDashboard())).not.toContain('__dsfrDataTrace');
  });

  it('generateDashboardHTML avec debug l’injecte avant tout le reste', () => {
    const html = generateDashboardHTML(createEmptyDashboard(), { debug: true });

    expect(html).toContain('__dsfrDataTrace');
    // S'il arrivait apres le module de la bibliotheque, il raterait les
    // premiers connectedCallback — c'est-a-dire l'essentiel.
    expect(html.indexOf('__dsfrDataTrace')).toBeLessThan(html.indexOf('dsfr-data'));
  });

  it('les deux générateurs produisent le MÊME document, sonde en plus', () => {
    // La doctrine « l'apercu EST l'export » doit tenir : seule une sonde
    // d'observation s'ajoute, jamais une difference de rendu.
    const doc = createEmptyDashboard();
    const normaliser = (html: string) =>
      html
        .replace(/<script>\(function\(\)\{try\{var b=\[\][\s\S]*?<\/script>/, '')
        .replace(/\s+/g, ' ')
        .trim();

    expect(normaliser(generateDashboardHTML(doc, { debug: true }))).toBe(
      normaliser(generateDashboardHTML(doc))
    );
  });
});

describe('les apps sans iframe observent une racine locale', () => {
  const LOCALES = [
    { app: 'Carto', fichier: 'apps/builder-carto/src/main.ts' },
    { app: 'Pipeline', fichier: 'apps/pipeline-helper/src/main.ts' },
  ];

  for (const { app, fichier } of LOCALES) {
    it(`${app} monte le volet en mode liveRoot`, () => {
      // Ces apps instancient de vrais composants dans le document courant :
      // il n'y a pas d'iframe a ecouter, donc pas de tampon a injecter.
      const src = lire(fichier);
      expect(src).toContain('liveRoot:');
      expect(src).not.toContain('frame:');
    });
  }

  it('l’Assistant IA est en mode rapporté, sans racine à observer', () => {
    // Constat, pas repli : son apercu ne passe par aucun composant dsfr-data
    // (#609). Le declarer live afficherait un volet vide a jamais.
    const src = lire('apps/builder-ia/src/main.ts');

    expect(src).toContain('mountDiagnosticPanel({');
    expect(src).not.toContain('liveRoot:');
    expect(src).not.toContain('frame:');
  });
});
