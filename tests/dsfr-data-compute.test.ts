import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests pour l'attribut `compute` de dsfr-data-normalize :
 * évaluateur d'expression sûr (logique pure) + intégration via le composant.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { compileCompute, applyCompute } from '@dsfr-data/shared';
import { DsfrDataNormalize } from '@/components/dsfr-data-normalize.js';
import { clearDataCache, getDataCache } from '@/utils/data-bridge.js';

function run(expr: string, row: Record<string, unknown>): unknown {
  const compiled = compileCompute(`out = ${expr}`);
  return applyCompute(row, compiled).out;
}

describe('compute — évaluateur pur', () => {
  it("mise à l'échelle (× 100)", () => {
    expect(run('valeur * 100', { valeur: 0.26 })).toBeCloseTo(26);
    // valeur en chaîne (non encore typée) : coercition via toNumber (décimale FR)
    expect(run('valeur * 100', { valeur: '0,128' })).toBeCloseTo(12.8);
  });

  it("chaîne d'opérations avec parenthèses et priorité", () => {
    expect(run('(a + b) * 2', { a: 3, b: 4 })).toBe(14);
    expect(run('a + b * 2', { a: 3, b: 4 })).toBe(11);
    expect(run('a / b - 1', { a: 10, b: 5 })).toBe(1);
  });

  it('moins unaire', () => {
    expect(run('-a', { a: 5 })).toBe(-5);
    expect(run('0 - a', { a: 5 })).toBe(-5);
  });

  it('concaténation de texte avec littéraux', () => {
    expect(
      run("Indicateurs + ' / ' + Sous_theme", {
        Indicateurs: 'VE',
        Sous_theme: 'VP',
      })
    ).toBe('VE / VP');
  });

  it('+ : addition numérique si les deux côtés sont numériques, sinon concat', () => {
    expect(run('a + b', { a: 10, b: 20 })).toBe(30);
    expect(run('a + b', { a: '10', b: '20' })).toBe(30); // chaînes numériques → addition
    expect(run('a + b', { a: 'x', b: 'y' })).toBe('xy'); // non-numériques → concat
  });

  it('champ inexistant : null en arithmétique (jamais un 0 plausible), vide en concat', () => {
    // Revue du 2026-09-13 : `absent * 2` rendait 0 et `actif - passif` rendait
    // `actif` quand `passif` manquait — un solde faux et plausible (#301).
    // Même doctrine que les fonctions numériques : non numérique → null.
    expect(run('absent * 2', {})).toBeNull();
    expect(run('actif - passif', { actif: 100 })).toBeNull();
    expect(run('a / b', { a: 1, b: 0 })).toBeNull(); // jamais Infinity
    expect(run('-absent', {})).toBeNull();
    expect(run("'p_' + absent", {})).toBe('p_');
  });

  it('plusieurs assignations séparées par ; (la 2e peut référencer la 1re)', () => {
    const compiled = compileCompute('pct = valeur * 100; label = pct + ' + "'%'");
    const out = applyCompute({ valeur: 0.5 }, compiled);
    expect(out.pct).toBeCloseTo(50);
    expect(out.label).toBe('50%');
  });

  it("n'altère pas la ligne d'origine (copie)", () => {
    const row = { a: 1 };
    applyCompute(row, compileCompute('b = a + 1'));
    expect(row).toEqual({ a: 1 });
  });
});

describe('compute — rejets (sécurité / robustesse)', () => {
  it('rejette une tentative type eval / caractères inattendus', () => {
    expect(() => compileCompute('out = a; alert(1)')).toThrow();
    expect(() => compileCompute('out = a & b')).toThrow();
    expect(() => compileCompute('out = a ? b : c')).toThrow();
  });

  it('rejette un nom de champ dangereux (__proto__, constructor)', () => {
    expect(() => compileCompute('out = __proto__')).toThrow();
    expect(() => compileCompute('__proto__ = 1')).toThrow();
  });

  it('rejette une assignation mal formée', () => {
    expect(() => compileCompute('pas_de_egal')).toThrow();
    expect(() => compileCompute('out = ')).toThrow();
    expect(() => compileCompute('out = (a + 1')).toThrow(); // parenthèse non fermée
    expect(() => compileCompute("out = 'chaine non terminee")).toThrow();
  });

  it('chaîne vide → aucune assignation', () => {
    expect(compileCompute('')).toEqual([]);
    expect(compileCompute('   ')).toEqual([]);
  });
});

describe('compute — intégration via dsfr-data-normalize', () => {
  let normalize: DsfrDataNormalize;

  beforeEach(() => {
    clearDataCache('cmp-out');
    clearDataCache('cmp-src');
    mockFetch.mockReset();
    normalize = new DsfrDataNormalize();
    normalize.id = 'cmp-out';
    normalize.source = 'cmp-src';
  });

  it('numeric-auto puis compute : "0,128" * 100 → ~12.8 + clé de série composite', () => {
    normalize.numericAuto = true;
    normalize.compute = "pct = valeur * 100; serie = Indicateurs + ' / ' + Sous_theme";

    const received: Array<Record<string, unknown>>[] = [];
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.sourceId === 'cmp-out') received.push(detail.data);
    };
    document.addEventListener('dsfr-data-loaded', handler);

    (normalize as any)._processData([
      { Indicateurs: 'PDM % VE', Sous_theme: 'VP', valeur: '0,128' },
    ]);

    document.removeEventListener('dsfr-data-loaded', handler);

    const last = received[received.length - 1];
    expect(last[0].pct).toBeCloseTo(12.8);
    expect(last[0].serie).toBe('PDM % VE / VP');
    expect(getDataCache('cmp-out')).toBeDefined();
  });
});
