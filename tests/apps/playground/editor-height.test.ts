import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Hauteur de l'editeur du Playground (#611).
 *
 * CE FICHIER EXISTE A CAUSE D'UN DEFAUT REEL. La colonne gauche est stylee
 * pour occuper `calc(100vh - header - barre d'actions)`, mais aucune regle ne
 * dimensionnait `.CodeMirror` : le CSS CDN de CodeMirror 5 impose
 * `height: 300px`. On lisait donc le code dans une lucarne de 300 px au fond
 * d'une colonne haute, le reste etant vide.
 *
 * Un defaut de CSS ne se teste pas en JSDOM (aucune mise en page reelle) :
 * ces gardes verrouillent les regles et le cablage qui le corrigent, ce qui
 * est exactement ce qui manquait.
 */

const CSS = join(__dirname, '../../../apps/playground/src/styles/playground.css');
const EDITOR = join(__dirname, '../../../apps/playground/src/editor.ts');

/** Corps d'une regle CSS, commentaires exclus. */
function regle(css: string, selecteur: string): string | null {
  const sansCommentaires = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const m = new RegExp(
    `(?:^|\\})\\s*${selecteur.replace(/[.\-]/g, (c) => '\\' + c)}\\s*\\{([^}]*)\\}`
  ).exec(sansCommentaires);
  return m ? m[1] : null;
}

describe('l’éditeur remplit sa colonne', () => {
  const css = readFileSync(CSS, 'utf-8');

  it('neutralise la hauteur par défaut de CodeMirror 5', () => {
    // Sans `height: auto`, les 300 px du CDN gagnent.
    const corps = regle(css, '.playground-editor .CodeMirror');

    expect(corps, 'aucune règle ne dimensionne .CodeMirror').not.toBeNull();
    expect(corps!).toMatch(/height:\s*auto/);
  });

  it('le laisse grandir dans la colonne flex', () => {
    const corps = regle(css, '.playground-editor .CodeMirror')!;

    expect(corps).toMatch(/flex:\s*1/);
    // Sans `min-height: 0`, un enfant flex refuse de retrecir sous sa taille
    // de contenu : la colonne deborderait au lieu de defiler a l'interieur.
    expect(corps).toMatch(/min-height:\s*0/);
  });

  it('le conteneur reste une colonne flex à hauteur définie', () => {
    // C'est LUI qui porte la hauteur : l'editeur ne fait que la remplir.
    const corps = regle(css, '.playground-editor')!;

    expect(corps).toMatch(/display:\s*flex/);
    expect(corps).toMatch(/flex-direction:\s*column/);
    expect(corps).toMatch(/min-height:\s*0/);
  });

  it('le mode empilé mobile reste piloté par le conteneur', () => {
    // L'editeur doit remplir les 50vh du mode empile, pas une hauteur en dur.
    expect(css).toMatch(/max-width:\s*900px/);
    expect(css).toMatch(/height:\s*50vh/);
  });
});

describe('CodeMirror est rafraîchi quand sa taille change', () => {
  const src = readFileSync(EDITOR, 'utf-8');

  it('observe le redimensionnement du conteneur', () => {
    // CM5 calcule sa fenetre d'affichage a l'init. Depuis qu'il est
    // dimensionne par le flex, cette taille change APRES : sans refresh, les
    // lignes du bas ne sont pas rendues et la gouttiere se desaligne.
    expect(src).toContain('ResizeObserver');
    expect(src).toContain('editor.refresh()');
  });

  it('reporte le rafraîchissement à l’image suivante', () => {
    // Rafraichir dans le callback de l'observateur relance un calcul de
    // layout : le navigateur signale une « ResizeObserver loop ».
    expect(src).toContain('requestAnimationFrame');
  });

  it('tolère un environnement sans ResizeObserver', () => {
    expect(src).toMatch(/typeof ResizeObserver === 'undefined'/);
  });

  it('conserve les attributs d’accessibilité du scroller', () => {
    // WCAG 2.1.1 : la zone de defilement de CM5 ne contient aucun element
    // focusable, elle doit rester atteignable au clavier.
    expect(src).toContain("scroller.setAttribute('tabindex', '0')");
    expect(src).toContain("aria-label', 'Défilement du code'");
  });
});
