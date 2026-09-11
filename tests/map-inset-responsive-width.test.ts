import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * #818 (lot 3 de #789) — largeur responsive des encarts territoriaux.
 *
 * `width` était posé en style inline, qui ne peut pas porter de media query :
 * cinq encarts à 20 % tiennent sur une ligne en bureau, pas sur téléphone.
 * En échelle, l'encart pose des variables CSS que la feuille de la carte
 * consomme en `:where()` : une règle de page prime toujours (#643).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataMapInset, parseLengthScale } from '@/components/dsfr-data-map-inset.js';
import { DsfrDataMap } from '@/components/dsfr-data-map.js';

if (!customElements.get('dsfr-data-map')) customElements.define('dsfr-data-map', DsfrDataMap);

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

async function inset(width: string): Promise<DsfrDataMapInset> {
  const el = document.createElement('dsfr-data-map-inset') as DsfrDataMapInset;
  el.setAttribute('width', width);
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('#818 — grammaire', () => {
  it('base et paliers', () => {
    expect(parseLengthScale('50% md:20%')).toEqual({
      base: '50%',
      steps: [['md', '20%']],
      error: null,
    });
    expect(parseLengthScale('md:12rem lg:10rem').base).toBeNull();
  });

  it('point de rupture inconnu, longueur illisible, terme nu mal placé : erreurs nommées', () => {
    expect(parseLengthScale('50% xxl:20%').error).toContain('point de rupture inconnu « xxl »');
    expect(parseLengthScale('50% md:grand').error).toContain('longueur « grand » illisible');
    expect(parseLengthScale('md:20% 50%').error).toContain('seul le premier terme');
  });
});

describe('#818 — encart', () => {
  it('AC : une valeur nue rend exactement comme aujourd’hui (style inline)', async () => {
    const el = await inset('10rem');
    expect(el.style.width).toBe('10rem');
    expect(el.hasAttribute('data-width-scale')).toBe(false);
  });

  it('AC : width="50% md:20%" pose deux paliers en variables, sans style inline', async () => {
    const el = await inset('50% md:20%');
    expect(el.style.width).toBe('');
    expect(el.hasAttribute('data-width-scale')).toBe(true);
    expect(el.style.getPropertyValue('--dsfr-data-inset-w')).toBe('50%');
    expect(el.style.getPropertyValue('--dsfr-data-inset-w-md')).toBe('20%');
  });

  it('repasser à une valeur nue retire l’échelle', async () => {
    const el = await inset('50% md:20%');
    el.setAttribute('width', '12rem');
    await el.updateComplete;
    expect(el.style.width).toBe('12rem');
    expect(el.hasAttribute('data-width-scale')).toBe(false);
    expect(el.style.getPropertyValue('--dsfr-data-inset-w-md')).toBe('');
  });

  it('AC : un point de rupture inconnu est une erreur de configuration nommée', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = await inset('50% xxl:20%');
    expect(el.getAttribute('data-dsfr-config-error')).toContain('xxl');
    expect(el.hasAttribute('data-width-scale')).toBe(false);
  });
});

describe('#818 — feuille de la carte', () => {
  it('AC : règles en :where() (une règle de page prime), paliers chaînés jusqu’à 10rem', () => {
    document.querySelector('style[data-dsfr-data-map]')?.remove();
    const map = new DsfrDataMap();
    (map as unknown as { _injectStyles(): void })._injectStyles();
    const css = document.querySelector('style[data-dsfr-data-map]')?.textContent ?? '';
    expect(css).toMatch(
      /:where\(dsfr-data-map-inset\[data-width-scale\]\)\s*\{\s*width:\s*var\(--dsfr-data-inset-w, 10rem\)/
    );
    expect(css).toContain('@media (min-width: 48em)');
    // md reprend sm puis la base, puis 10rem
    expect(css).toContain(
      'var(--dsfr-data-inset-w-md, var(--dsfr-data-inset-w-sm, var(--dsfr-data-inset-w, 10rem)))'
    );
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(bare).not.toMatch(/(^|[^(])dsfr-data-map-inset\[data-width-scale\]\s*\{/);
  });
});
