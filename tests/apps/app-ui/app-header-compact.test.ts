import { describe, it, expect, beforeEach } from 'vitest';
import {
  nextCompact,
  injectAppHeaderStyles,
  COMPACT_ENTER_PX,
  COMPACT_EXIT_PX,
  COMPACT_GAIN_PX,
  COMPACT_RESIDUAL_PX,
} from '../../../packages/app-ui/src/app-header.js';
import '../../../packages/app-ui/src/app-footer.js';

/**
 * En-tete compact au defilement et pied de page d'une ligne : l'en-tete
 * epingle (175 px) passe a une ligne de 48 px des qu'une zone de travail
 * defile, et se redeplie quand elle revient en haut.
 */

const LONGUE = 2000;

describe('nextCompact', () => {
  it('reste deplie sous le seuil d’entree', () => {
    expect(nextCompact(false, COMPACT_ENTER_PX, LONGUE)).toBe(false);
    expect(nextCompact(false, COMPACT_ENTER_PX + 1, LONGUE)).toBe(true);
  });

  it('reste compact tant que la zone n’est pas revenue en haut (hysteresis)', () => {
    expect(nextCompact(true, COMPACT_EXIT_PX + 1, LONGUE)).toBe(true);
    expect(nextCompact(true, COMPACT_EXIT_PX, LONGUE)).toBe(false);
  });

  it('ne compacte pas une zone trop courte : elle clignoterait', () => {
    // Mutation : retirer la garde de course. La compaction agrandit la zone de
    // ~127 px ; une course de 100 px retomberait a 0 et redeplierait l'en-tete.
    expect(nextCompact(false, 80, 100)).toBe(false);
    const juste = COMPACT_GAIN_PX + COMPACT_RESIDUAL_PX;
    expect(nextCompact(false, 80, juste)).toBe(false);
    expect(nextCompact(false, 80, juste + 1)).toBe(true);
  });

  it('la course residuelle reste au-dessus du seuil de sortie', () => {
    expect(COMPACT_RESIDUAL_PX).toBeGreaterThan(COMPACT_EXIT_PX);
  });
});

describe('feuille de la variante compacte', () => {
  beforeEach(() => document.getElementById('app-header-active-style')?.remove());

  it('toutes les regles compactes sont sous le seuil DSFR 62em', () => {
    // Mutation : sortir une regle `app-header--compact` du @media. En deca de
    // 62em l'en-tete DSFR est la variante a burger, que ces regles casseraient.
    injectAppHeaderStyles();
    const css = document.getElementById('app-header-active-style')!.textContent!;
    const debut = css.indexOf('@media (min-width:62em){app-header.app-header--compact');
    expect(debut).toBeGreaterThan(-1);
    // Fin du bloc @media : accolade qui ramene la profondeur a zero.
    let profondeur = 0;
    let fin = -1;
    for (let i = debut; i < css.length; i++) {
      if (css[i] === '{') profondeur++;
      else if (css[i] === '}' && --profondeur === 0) {
        fin = i;
        break;
      }
    }
    const horsMedia = css.slice(0, debut) + css.slice(fin + 1);
    expect(horsMedia).not.toContain('app-header--compact');
  });

  it('le selecteur d’app est masque hors variante compacte', () => {
    injectAppHeaderStyles();
    const css = document.getElementById('app-header-active-style')!.textContent!;
    expect(css).toContain('.app-header-switch{display:none');
    expect(css).toContain('app-header.app-header--compact .app-header-switch{display:block}');
  });
});

describe('<app-footer variant="slim">', () => {
  async function rendre(variant: string) {
    const el = document.createElement('app-footer') as HTMLElement & {
      variant: string;
      updateComplete: Promise<boolean>;
    };
    el.variant = variant;
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
  }

  it('une seule ligne : pas de corps, bloc-marque et liens obligatoires conserves', async () => {
    const el = await rendre('slim');
    expect(el.querySelector('.fr-footer.app-footer--slim')).not.toBeNull();
    expect(el.querySelector('.fr-footer__body')).toBeNull();
    expect(el.querySelector('.fr-logo')).not.toBeNull();
    const liens = [...el.querySelectorAll('.fr-footer__bottom-link')].map((a) =>
      a.textContent!.trim()
    );
    expect(liens).toEqual(
      expect.arrayContaining(['Accessibilité : non conforme', 'Mentions légales'])
    );
    expect(el.querySelector('[role="contentinfo"]#footer')).not.toBeNull();
    el.remove();
  });

  it('sans variante : pied DSFR complet', async () => {
    const el = await rendre('');
    expect(el.querySelector('.fr-footer__body')).not.toBeNull();
    expect(el.querySelector('.app-footer--slim')).toBeNull();
    el.remove();
  });
});
