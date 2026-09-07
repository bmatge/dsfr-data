import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppLayoutBuilder } from '../../../packages/app-ui/src/app-layout-builder.js';

/**
 * Modes de hauteur explicites du layout deux-volets (#613).
 *
 * Trois apps surchargeaient les classes INTERNES du composant depuis leur
 * propre CSS — classes non contractuelles. Le Playground avait du empiler des
 * `!important` pour inverser le sticky ; Builder et Assistant IA
 * maintenaient DEUX FOIS la meme surcharge « plein ecran ». Un changement du
 * composant (comme le sticky du lot UX #538) cassait alors en silence l'app
 * qui le contournait.
 *
 * Ces tests verrouillent le contrat : les modes vivent dans le composant, et
 * les apps ne stylent plus ses entrailles.
 */

const RACINE = join(__dirname, '../../..');
const lire = (p: string) => readFileSync(join(RACINE, p), 'utf-8');

/** Regles de mise en page d'une app, commentaires exclus. */
function reglesDe(chemin: string): string {
  return lire(chemin).replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('le composant porte les trois modes', () => {
  let hote: AppLayoutBuilder | undefined;
  afterEach(() => {
    hote?.remove();
    hote = undefined;
  });

  it('est enregistré comme custom element', () => {
    expect(customElements.get('app-layout-builder')).toBe(AppLayoutBuilder);
  });

  it('vaut page-scroll par défaut — aucune app existante ne change', () => {
    const el = document.createElement('app-layout-builder') as AppLayoutBuilder;
    hote = el;

    expect(el.mode).toBe('page-scroll');
  });

  it('reflète le mode en attribut, pour que le CSS le sélectionne', async () => {
    // `reflect: true` et NON un `setAttribute` dans `render()` : muter
    // l'element pendant le rendu declenche une nouvelle demande de mise a
    // jour, Lit finit par abandonner, et le composant reste sans contenu —
    // colonnes jamais construites, sur les trois apps a la fois.
    const el = document.createElement('app-layout-builder') as AppLayoutBuilder;
    document.body.appendChild(el);
    hote = el;
    el.mode = 'fullscreen';
    await el.updateComplete;

    expect(el.getAttribute('mode')).toBe('fullscreen');
    expect(
      el.querySelector('.builder-layout-container'),
      'le composant doit avoir rendu'
    ).not.toBeNull();
  });

  it('déclare des règles pour chaque mode', () => {
    const src = lire('packages/app-ui/src/app-layout-builder.ts');

    for (const mode of ['fullscreen', 'sticky-left']) {
      expect(src, `mode ${mode} non stylé`).toContain(`[mode='${mode}']`);
    }
  });

  it('cible la BALISE et non :host — le composant rend en light DOM', () => {
    // LE défaut qui a rendu les deux modes inertes : `createRenderRoot()`
    // renvoie `this`, donc il n'y a pas de shadow tree et `:host()` ne matche
    // rien. Le CSS était syntaxiquement valide, la suite verte, et le Builder
    // comme le Playground cassés en production.
    const src = lire('packages/app-ui/src/app-layout-builder.ts');
    // Hors commentaires : la note explicative CITE `:host()` pour dire
    // pourquoi il ne faut pas s'en servir ici.
    const style = src
      .slice(src.indexOf('<style>'), src.indexOf('</style>'))
      .replace(/\/\*[\s\S]*?\*\//g, '');

    expect(style, ':host() est inerte en light DOM').not.toContain(':host(');
    expect(style).toContain("app-layout-builder[mode='fullscreen']");
    expect(style).toContain("app-layout-builder[mode='sticky-left']");
  });

  it('les sélecteurs de mode matchent réellement l’élément rendu', () => {
    // Greper la chaîne ne prouve rien : ce test EXÉCUTE le sélecteur contre
    // l'élément réel. Il aurait échoué sur la version `:host()`.
    const el = document.createElement('app-layout-builder') as AppLayoutBuilder;
    el.setAttribute('mode', 'fullscreen');
    document.body.appendChild(el);
    hote = el;

    expect(el.matches("app-layout-builder[mode='fullscreen']")).toBe(true);
    expect(el.matches(":host([mode='fullscreen'])")).toBe(false);
  });

  it('le style est injecté dans le light DOM, atteignable par le document', async () => {
    const el = document.createElement('app-layout-builder') as AppLayoutBuilder;
    el.mode = 'sticky-left';
    document.body.appendChild(el);
    hote = el;
    await el.updateComplete;

    // Le composant rend son <style> chez lui : il n'y a pas de shadow root.
    expect(el.shadowRoot).toBeNull();
    expect(el.querySelector('style')).not.toBeNull();
  });

  it('expose la hauteur empilée en propriété publique, pas en classe interne', () => {
    const src = lire('packages/app-ui/src/app-layout-builder.ts');

    expect(src).toContain('--app-layout-left-stacked-height');
    expect(src).toContain('@cssprop');
  });
});

describe('les apps ne stylent plus les classes internes du layout', () => {
  const INTERNES = ['.builder-layout-container', '.builder-layout-left', '.builder-layout-right'];

  it('le Builder déclare mode="fullscreen" et n’a plus de surcharge', () => {
    expect(lire('apps/builder/index.html')).toContain('mode="fullscreen"');

    const css = reglesDe('apps/builder/src/styles/builder.css');
    for (const classe of INTERNES) {
      expect(css, `${classe} encore surchargée dans builder.css`).not.toContain(classe);
    }
  });

  it('le Playground déclare mode="sticky-left" et n’a plus d’!important de layout', () => {
    expect(lire('apps/playground/index.html')).toContain('mode="sticky-left"');

    const css = reglesDe('apps/playground/src/styles/playground.css');
    for (const classe of INTERNES) {
      expect(css, `${classe} encore surchargée dans playground.css`).not.toContain(classe);
    }
  });

  it('le Studio reste sur le défaut, sans attribut', () => {
    // Le mode par defaut EST son comportement : lui poser un attribut serait
    // du bruit, et le priver du defaut serait un risque inutile.
    const html = lire('apps/studio/index.html');

    expect(html).toContain('<app-layout-builder');
    expect(html).not.toContain('mode=');
  });

  it('l’Assistant IA garde ses surcharges — décision assumée, pas oubli', () => {
    // #609 remplace son apercu (hauteur intrinseque) par une iframe (hauteur
    // extrinseque) : migrer le mode avant reviendrait a calibrer sur un
    // contenu voue a disparaitre. Le CSS le DIT, pour qu'un lecteur ne prenne
    // pas ce reste pour un manque.
    const css = lire('apps/builder-ia/src/styles/builder-ia.css');

    expect(css).toContain('#613');
    expect(css).toContain('#609');
    expect(css).toMatch(/CONSERVEES|conservées/i);
  });
});
