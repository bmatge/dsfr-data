import { describe, it, expect, afterEach } from 'vitest';

/**
 * #898 (BUG-018 du banc d'essai) — le `<summary class="fr-accordion__btn">` de
 * `dsfr-data-a11y` deborde de 16 px sur telephone.
 *
 * La classe DSFR `fr-accordion__btn` est ecrite pour un `<button>`, dont le
 * `box-sizing` par defaut est `border-box` ; un `<summary>` est `content-box`.
 * Il recoit donc `width: 100 %` ET 16 px de padding de chaque cote : 390 px
 * dans un conteneur de 358, sur un viewport de 390. La page defile
 * horizontalement de 16 px sur TOUTE page qui porte un `dsfr-data-a11y` — 51
 * des 66 pages du banc d'essai, mesurees. Le banc le rustinait en CSS de page
 * (`dsfr-data-a11y summary { box-sizing: border-box }`), une ligne qui vise le
 * DOM interne d'un composant : la correction appartient a la bibliotheque.
 *
 * La mesure (`scrollWidth === innerWidth` a 390 px) est dans
 * `e2e/a11y-accordion-mobile.spec.ts` : happy-dom n'a pas de mise en page.
 */

import '@/components/dsfr-data-a11y.js';

afterEach(() => {
  document.body.innerHTML = '';
});

async function monter() {
  document.body.innerHTML = `<dsfr-data-a11y id="a11y" description="Un graphique."></dsfr-data-a11y>`;
  const el = document.getElementById('a11y') as HTMLElement & { updateComplete: Promise<unknown> };
  await el.updateComplete;
  return el;
}

describe('#898 — le bouton d’accordéon de dsfr-data-a11y tient dans son conteneur', () => {
  it('le composant pose box-sizing: border-box sur son summary', async () => {
    const el = await monter();
    const summary = el.querySelector('summary.fr-accordion__btn');
    expect(summary).not.toBeNull();

    const styles = [...el.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n');
    // La regle doit etre PORTEE PAR LE COMPOSANT, et bornee a son propre
    // accordeon : un `summary { … }` global re-ecrirait ceux de la page hote.
    const regle = /\.dsfr-data-a11y[^{]*\bsummary\b[^{]*\{[^}]*box-sizing:\s*border-box/s;
    expect(regle.test(styles)).toBe(true);
  });

  it('le summary reste le bouton d’accordéon DSFR (pas de changement de balise)', async () => {
    const el = await monter();
    // Le correctif tient en une declaration CSS : remplacer le `summary` par un
    // `button` casserait le pliage natif de `<details>` et l'AC du composant.
    expect(el.querySelector('details > summary.fr-accordion__btn')).not.toBeNull();
  });
});
