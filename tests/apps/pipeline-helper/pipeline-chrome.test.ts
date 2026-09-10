import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Les hauteurs de chrome ecrites en dur (#628, points 1 et 3).
 *
 * CE FICHIER EXISTE PARCE QU'UN CALCUL DE HAUTEUR N'AVAIT PAS DE GARDE.
 * `.pipeline-page` prend `100vh` moins l'en-tete et la barre de titre, sans
 * aucune media query — alors que sous 48em le `body` se reserve DEJA en bas la
 * barre d'actions fixee et le rail du volet Diagnostic. La page depassait donc
 * de cette reserve, et son propre `overflow: hidden` rognait le bas de
 * l'inspecteur : invisible, mais de la surface perdue.
 *
 * Et les replis d'avant hydratation (`min-height` des `app-header:not(:defined)`,
 * `--carto-header-h`) annoncaient 56 ou 96 px pour un en-tete qui en fait 141
 * sous 62em et 175 au-dessus. Leur seul effet est un saut de mise en page,
 * mais il vaut ce que vaut la valeur annoncee.
 *
 * Le test de la DoD (« aucune valeur de chrome hors chrome-breakpoints.ts »)
 * n'est PAS ici : il demande un cadrage a lui.
 */

const RACINE = join(__dirname, '../../..');
const lire = (p: string) => readFileSync(join(RACINE, p), 'utf-8');
const compact = (s: string) => s.replace(/\s+/g, ' ');

describe('la page Pipeline tient compte de la reserve basse en mobile', () => {
  const css = compact(lire('apps/pipeline-helper/src/styles/pipeline-helper.css'));

  it('la hauteur de base ne soustrait que le chrome du haut', () => {
    // T1 — mutation : soustraire la reserve basse a toutes les largeurs. En
    // bureau elle vaut 0, mais le calcul mentirait sur son intention.
    expect(css).toContain(
      'height: calc(100vh - var(--app-header-h, 141px) - var(--app-action-bar-h, 0px));'
    );
  });

  it('sous 48em elle soustrait aussi la barre fixe et le rail', () => {
    // T2 — mutation : retirer la media query. La page depasse de la reserve,
    // `overflow: hidden` rogne le bas de l'inspecteur.
    const bloc = /@media \(max-width: 47\.99em\) \{ \.pipeline-page \{([^}]*)\}/.exec(css);

    expect(bloc, 'media query mobile absente de .pipeline-page').not.toBeNull();
    expect(bloc![1]).toContain('var(--app-action-bar-fixed-h, 3.5rem)');
    expect(bloc![1]).toContain('var(--app-diagnostic-h, 2.25rem)');
  });
});

describe('les replis d’avant hydratation annoncent la hauteur reelle', () => {
  /** Les apps qui reservent une hauteur a l'en-tete avant sa definition. */
  function appsAvecRepli(): string[] {
    return readdirSync(join(RACINE, 'apps'))
      .filter((a) => existsSync(join(RACINE, 'apps', a, 'index.html')))
      .filter((a) => lire(`apps/${a}/index.html`).includes('app-header:not(:defined)'))
      .sort();
  }

  it('onze apps en posent un', () => {
    expect(appsAvecRepli()).toHaveLength(11);
  });

  it.each(appsAvecRepli())('%s reserve 141 px, puis 175 px au-dessus de 62em', (app) => {
    // T3 — mutation : revenir a 56 px (ou 96 px pour la Carto). L'en-tete
    // grandit de 85 px a l'hydratation et pousse toute la page.
    const html = compact(lire(`apps/${app}/index.html`));

    expect(html).toContain('app-header:not(:defined){display:block;min-height:141px}');
    expect(html).toContain('@media (min-width:62em){app-header:not(:defined){min-height:175px}}');
  });

  it('la Carto part de la meme hauteur avant sa propre mesure', () => {
    // T4 — mutation : remettre 96 px. La carte est dimensionnee sur
    // --carto-header-h jusqu'a ce que main.ts la re-mesure.
    expect(compact(lire('apps/builder-carto/src/styles/carto.css'))).toContain(
      '--carto-header-h: 141px;'
    );
  });
});
