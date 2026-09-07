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

  it('reflète le mode sur l’hôte, pour que le CSS le sélectionne', async () => {
    const el = document.createElement('app-layout-builder') as AppLayoutBuilder;
    document.body.appendChild(el);
    hote = el;
    el.mode = 'fullscreen';
    await el.updateComplete;

    expect(el.getAttribute('data-mode')).toBe('fullscreen');
  });

  it('déclare des règles pour chaque mode', () => {
    const src = lire('packages/app-ui/src/app-layout-builder.ts');

    for (const mode of ['fullscreen', 'sticky-left']) {
      expect(src, `mode ${mode} non stylé`).toContain(`[data-mode='${mode}']`);
    }
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
