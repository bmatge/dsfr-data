import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La hauteur de la carte d'apercu tient compte de la reserve basse (#628,
 * point 2 — les points 1 et 3 sont couverts par
 * `tests/apps/pipeline-helper/pipeline-chrome.test.ts`).
 *
 * CE FICHIER EXISTE A CAUSE D'UN CALCUL INCOMPLET. `executePreview` posait
 * `state.map.height = calc(100dvh - en-tete - barre - onglets)`, sans
 * soustraire la bande que le `body` s'est DEJA reservee en bas pour le chrome
 * fixe : le rail du volet Diagnostic a toutes les largeurs
 * (`--app-diagnostic-h`), plus la barre d'actions fixee sous 48em
 * (`--app-action-bar-fixed-h`), soit environ 92 px en mobile. La carte
 * depassait d'autant et `.carto-workspace{overflow:hidden}` la rognait :
 * invisible, mais de la surface de carte perdue.
 *
 * `--app-action-bar-fixed-h` est publiee a 0px au-dessus de 48em
 * (`app-action-bar.ts`, firstUpdated) : la soustraire sans condition est juste
 * a toutes les largeurs — un attribut `height` ne saurait de toute facon pas
 * porter de media query.
 *
 * Il ne s'agit ici que du canevas d'APERCU : le code exporte a l'utilisateur
 * garde la hauteur que l'utilisateur a choisie.
 */

const RACINE = join(__dirname, '../../..');
const lire = (p: string) => readFileSync(join(RACINE, p), 'utf-8');
const compact = (s: string) => s.replace(/\s+/g, ' ');

describe('hauteur de la carte d’aperçu de la Carto (#628 point 2)', () => {
  const source = compact(lire('apps/builder-carto/src/main.ts'));

  /** Les deux affectations de `state.map.height` dans `executePreview`. */
  const affectation = /state\.map\.height = state\.map\.insets\.length \? (.+?);/.exec(source);

  it('les deux branches (avec et sans encarts) sont bien lues', () => {
    // Si ce test casse, la forme du calcul a change : les suivants
    // deviendraient vrais pour de mauvaises raisons.
    expect(affectation, 'affectation de state.map.height introuvable').not.toBeNull();
    expect(affectation![1]).toContain('208px');
  });

  it('la réserve basse soustrait le rail du volet et la barre fixe', () => {
    // T1 — mutation : retirer l'une des deux variables. La carte dépasse de
    // la hauteur correspondante, rognée par .carto-workspace.
    const reserve = /const reserveBasse = '([^']+)';/.exec(source);

    expect(reserve, 'reserveBasse introuvable').not.toBeNull();
    expect(reserve![1]).toContain('var(--app-diagnostic-h, 0px)');
    expect(reserve![1]).toContain('var(--app-action-bar-fixed-h, 0px)');
  });

  it('les deux branches la soustraient', () => {
    // T2 — mutation : ne corriger que la branche sans encarts. Le défaut
    // reviendrait dès qu'un encart est ajouté.
    const branches = affectation![1].split(' : ');

    expect(branches).toHaveLength(2);
    for (const branche of branches) {
      expect(branche).toContain('- ${reserveBasse}');
    }
  });

  it('le chrome du haut reste soustrait lui aussi', () => {
    // T3 — mutation : remplacer le calcul par la seule réserve basse.
    const haut = /const chromeHaut = '([^']+)';/.exec(source);

    expect(haut, 'chromeHaut introuvable').not.toBeNull();
    expect(haut![1]).toContain('var(--carto-header-h');
    expect(haut![1]).toContain('var(--app-action-bar-h');
    expect(haut![1]).toContain('var(--carto-tabs-h');
  });
});
