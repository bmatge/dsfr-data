import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
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

  it('ni le journal réseau ni le journal console ne fuient sans option (#994)', () => {
    // La sonde enveloppe `fetch` et `console` : dans la page exportée de
    // l'utilisateur, ce serait une modification de SON runtime.
    const exports = [
      getPreviewHTML('<dsfr-data-source id="s"></dsfr-data-source>'),
      generateDashboardHTML(createEmptyDashboard()),
    ];
    for (const html of exports) {
      expect(html).not.toContain('__dsfrDataNet');
      expect(html).not.toContain('__dsfrDataConsole');
    }
  });

  it('avec debug, le journal part dans la même balise que le tampon, avant la lib (#994)', () => {
    for (const html of [
      getPreviewHTML('<dsfr-data-source id="s"></dsfr-data-source>', { debug: true }),
      generateDashboardHTML(createEmptyDashboard(), { debug: true }),
    ]) {
      expect(html).toContain('__dsfrDataNet');
      expect(html).toContain('__dsfrDataConsole');
      expect(html.indexOf('__dsfrDataNet')).toBeLessThan(html.indexOf('dsfr-data.'));
    }
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

  for (const { app, fichier } of LOCALES) {
    it(`${app} importe l’installateur du journal EN PREMIER (#994)`, () => {
      // Plus bas, les imports précédents (bibliothèque, code de l'app)
      // seraient évalués avant lui : leurs premières requêtes échapperaient
      // au journal.
      const imports = lire(fichier)
        .split('\n')
        .filter((l) => /^import\s/.test(l));
      expect(imports[0]).toBe("import '@dsfr-data/shared/debug/installer-journal';");
    });
  }

  it('l’installateur du journal est déclaré à effet de bord (#994)', () => {
    // `sideEffects: false` sur le paquet ferait élaguer un import nu au build :
    // l'app tournerait sans journal, sans la moindre erreur.
    const pkg = JSON.parse(lire('packages/shared/package.json')) as {
      sideEffects: unknown;
      exports: Record<string, unknown>;
    };
    expect(pkg.sideEffects).toEqual(
      expect.arrayContaining([
        './src/debug/installer-journal.ts',
        './dist/debug/installer-journal.js',
      ])
    );
    expect(pkg.exports['./debug/*']).toBeDefined();
  });

  it('l’Assistant IA est passé en mode live (#609)', () => {
    // Ce test affirmait l'inverse jusqu'a #609 : l'app dessinait son apercu
    // avec @gouvfr/dsfr-chart en direct, sans aucun composant dsfr-data, donc
    // sans rien a observer sur le bus. Depuis que l'apercu rend le code
    // genere dans une iframe, elle emet comme les autres.
    const src = lire('apps/builder-ia/src/main.ts');

    expect(src).toContain('mountDiagnosticPanel({');
    expect(src).toContain('frame:');
    expect(src).not.toContain('liveRoot:');
  });

  it('son aperçu demande le tampon précoce', () => {
    const src = lire('apps/builder-ia/src/ui/preview.ts');

    expect(src).toContain('getPreviewHTML(code, { debug: true })');
  });

  it('le rendu parallèle a disparu, pas seulement été débranché', () => {
    // Le laisser en place aurait garanti sa reapparition : deux chemins de
    // rendu qui divergent, c'est le defaut que #609 supprime.
    expect(existsSync(join(ROOT, 'apps/builder-ia/src/ui/chart-renderer.ts'))).toBe(false);
  });
});

/**
 * L'assistant contextuel câblé au volet (#1017, #1018, ADR-143). Les quatre
 * apps à aperçu en iframe : Builder, Tableau de bord et Playground montent
 * leur assistant, et le bouton du volet devient « Demander à l'assistant »
 * (`envoi: 'demander'`) ; le Studio, qui n'a pas d'assistant contextuel mais
 * son propre chat, garde le geste par défaut (`envoyer`) : même libellé
 * « Demander à l'assistant » depuis #1081, mais le diagnostic est posé dans
 * SON chat, sans navigation ni envoi. Les apps sans
 * iframe (Carto, Pipeline) suivent le même câblage ; Sources n'a pas de volet.
 */
describe('l’assistant contextuel lit les constats du volet', () => {
  const AVEC_ASSISTANT = [
    { app: 'Builder', fichier: 'apps/builder/src/main.ts', monter: 'monterAssistantBuilder(' },
    {
      app: 'Tableau de bord',
      fichier: 'apps/dashboard/src/main.ts',
      monter: 'monterAssistantDashboard(',
    },
    {
      app: 'Playground',
      fichier: 'apps/playground/src/main.ts',
      monter: 'monterAssistantPlayground(',
    },
    { app: 'Carto', fichier: 'apps/builder-carto/src/main.ts', monter: 'monterAssistantCarto(' },
    {
      app: 'Pipeline',
      fichier: 'apps/pipeline-helper/src/main.ts',
      monter: 'monterAssistantPipeline(',
    },
  ];

  for (const { app, fichier, monter } of AVEC_ASSISTANT) {
    it(`${app} : « Demander à l’assistant », pastille et « Me montrer » branchés`, () => {
      const src = lire(fichier);
      expect(src).toContain(monter);
      expect(src).toContain("envoi: 'demander'");
      expect(src).toContain('onSend: () => assistant?.ouvrir()');
      expect(src).toContain('onConstats: () => assistant?.rafraichirConstats()');
      expect(src).toContain('onMontrer:');
      // Plus de navigation vers l'Assistant IA pour y déposer le diagnostic.
      expect(src).not.toContain("appHref('builder-ia'");
    });
  }

  it('les trois apps à iframe dotées d’un assistant gardent leur aperçu en iframe', () => {
    for (const fichier of [
      'apps/builder/src/main.ts',
      'apps/dashboard/src/main.ts',
      'apps/playground/src/main.ts',
    ]) {
      const src = lire(fichier);
      expect(src, fichier).toContain('frame:');
      expect(src, fichier).not.toContain('liveRoot:');
    }
  });

  it('le Studio (iframe, sans assistant contextuel) pose le diagnostic dans SA conversation', () => {
    const src = lire('apps/studio/src/main.ts');
    expect(src).toContain('frame:');
    expect(src).not.toContain("envoi: 'demander'");
    expect(src).not.toContain('mountAssistant(');
    // « Demander à l'assistant » pré-remplit le chat du Studio, sans l'envoyer
    // ni naviguer (#1081).
    expect(src).toContain('onSend: injecterDiagnostic');
    expect(src).not.toMatch(/function injecterDiagnostic[\s\S]*?sendMessage\(/);
    expect(src).not.toContain('navigateTo(');
  });

  it('l’ancien Assistant IA fait de même dans son propre chat', () => {
    const src = lire('apps/builder-ia/src/main.ts');
    expect(src).not.toContain("envoi: 'demander'");
    expect(src).not.toContain('mountAssistant(');
    expect(src).toContain('onSend: injecterDiagnostic');
  });

  it('« Envoyer à l’assistant » a disparu : un seul libellé, « Demander à l’assistant » (#1081)', () => {
    const panneau = lire('packages/app-ui/src/app-diagnostic-panel.ts');
    expect(panneau).not.toContain('Envoyer à l’assistant');
    expect(panneau.match(/Demander à l’assistant\n/g)?.length).toBe(2);
    expect(lire('docs/ux/actions.md')).not.toContain('Envoyer à l');
  });

  it('Sources : assistant de guidage seul, sans volet Diagnostic', () => {
    const src = lire('apps/sources/src/main.ts');
    expect(src).toContain('monterAssistantSources(');
    expect(src).not.toContain('mountDiagnosticPanel');
  });

  it('chaque assistant d’app branche Albert en secours, jamais en premier', () => {
    const apps = [
      'builder',
      'builder-carto',
      'dashboard',
      'pipeline-helper',
      'playground',
      'sources',
    ];
    for (const app of apps) {
      const src = lire(`apps/${app}/src/assistant/index.ts`);
      expect(src, app).toContain('brancherAlbert(assistant');
      expect(src, app).toContain('mountAssistant<');
    }
  });
});
