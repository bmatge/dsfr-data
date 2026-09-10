import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le lien d'evitement mene quelque part, et le defilement ne range personne
 * sous la barre fixe (#627).
 *
 * CE FICHIER EXISTE PARCE QUE `axe` NE VOIT NI L'UN NI L'AUTRE.
 * La regle `skip-link` est classee `best-practice`, donc hors du jeu
 * `wcag2a/wcag2aa` execute par `e2e/accessibility.spec.ts` : un lien
 * « Contenu » pointant sur une ancre inexistante passait au vert. Et le
 * `scroll-padding` releve d'un critere (WCAG 2.2 SC 2.4.11) qu'aucun
 * verificateur automatique ne sait apprecier.
 *
 * Deux invariants :
 *  1. les douze apps portent une cible `#main-content`, FOCALISABLE — un
 *     `<main>` ne l'est pas de lui-meme, l'ancre y menait sans y poser le
 *     focus ;
 *  2. partout ou le chrome se reserve du `padding-bottom` sur le `body`, il
 *     se reserve le meme `scroll-padding-bottom` sur `html` : le premier
 *     empeche le contenu de finir sous la barre, le second empeche le focus
 *     d'y etre amene.
 */

const RACINE = join(__dirname, '../../..');
const lire = (p: string) => readFileSync(join(RACINE, p), 'utf-8');
const compact = (s: string) => s.replace(/\s+/g, ' ');

/** Les douze apps du monorepo — la liste se derive, elle ne s'ecrit pas. */
function apps(): string[] {
  return readdirSync(join(RACINE, 'apps'))
    .filter((a) => existsSync(join(RACINE, 'apps', a, 'index.html')))
    .sort();
}

/** La balise ouvrante qui porte `id="main-content"`, si elle existe. */
function baliseCible(html: string): string | null {
  const m = /<[a-z-]+[^>]*\bid="main-content"[^>]*>/i.exec(html);
  return m ? m[0] : null;
}

describe('le lien d’evitement a une cible focalisable', () => {
  const LISTE = apps();

  it('les douze apps sont bien douze', () => {
    expect(LISTE).toHaveLength(12);
  });

  it('le lien d’evitement vise toujours #main-content', () => {
    // T1 — mutation : renommer l'ancre dans app-header sans renommer les
    // cibles. Les douze liens pointeraient dans le vide d'un coup.
    expect(compact(lire('packages/app-ui/src/app-header.ts'))).toContain('href="#main-content"');
  });

  it.each(apps())('%s porte une cible focalisable', (app) => {
    // T2 — mutation : retirer `tabindex="-1"` d'une cible. Le lien y mene
    // toujours mais n'y pose pas le focus : le clavier repart du haut.
    const html = lire(`apps/${app}/index.html`);
    const propre = baliseCible(html);

    // Les quatre apps a deux volets heritent leur cible d'app-layout-builder,
    // qui rend `<main class="builder-layout-right" id="main-content">`.
    if (!propre) {
      expect(html, `${app} n’a ni cible propre ni app-layout-builder`).toContain(
        '<app-layout-builder'
      );
      return;
    }
    expect(propre, `cible de ${app} non focalisable`).toContain('tabindex="-1"');
  });

  it('la cible rendue par le layout deux-volets est focalisable elle aussi', () => {
    // T3 — meme mutation, cote composant : elle priverait Builder,
    // Assistant IA, Playground et Studio d'un coup.
    const layout = compact(lire('packages/app-ui/src/app-layout-builder.ts'));

    expect(layout).toContain('<main class="builder-layout-right" id="main-content" tabindex="-1">');
  });
});

describe('le chrome fixe se reserve aussi l’ancrage du defilement', () => {
  /** Les couples `padding-bottom` / `scroll-padding-bottom` d'une feuille. */
  function reserves(chemin: string): { body: string[]; html: string[] } {
    const css = lire(chemin).replace(/\/\*[\s\S]*?\*\//g, '');
    const grab = (re: RegExp) => [...css.matchAll(re)].map((m) => compact(m[1]).trim());
    return {
      body: grab(/body:has\([^)]*\)[^{]*\{padding-bottom:([^};]+)/g),
      html: grab(/html:has\([^)]*\)[^{]*\{scroll-padding-bottom:([^};]+)/g),
    };
  }

  it.each([
    ['packages/app-ui/src/app-action-bar.ts', 1],
    ['packages/app-ui/src/app-diagnostic-panel.ts', 2],
  ])('%s reserve autant de scroll-padding que de padding', (chemin, attendu) => {
    // T4 — mutation : retirer une des regles `scroll-padding-bottom`. Un
    // element amene au focus se rangerait sous la barre ou sous le rail
    // (WCAG 2.2 SC 2.4.11), sans que le `padding-bottom` n'y change rien.
    const { body, html } = reserves(chemin as string);

    expect(body).toHaveLength(attendu as number);
    expect(html, 'une reserve de defilement manque').toHaveLength(attendu as number);
    // Les memes valeurs, calculees sur les memes variables publiees.
    expect(html).toEqual(body);
  });
});
