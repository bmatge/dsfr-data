import { describe, it, expect } from 'vitest';
import {
  looseEquals,
  looseEqualsOrContains,
  applyLocalFilter,
} from '../../packages/shared/src/query/filter-translator';
import { compileCompute, applyCompute } from '../../packages/shared/src/utils/compute';
import { computeAggregation } from '../../packages/core/src/utils/aggregations';

/**
 * Garde-fou documentaire de #842 — l'asymétrie « champ tableau » est VOULUE.
 *
 * `looseEqualsOrContains` (#673) fait matcher un champ TABLEAU dès qu'un de ses
 * éléments est égal. Elle n'a qu'UN appelant dans tout le dépôt : la valeur de
 * filtre d'un `count:champ:valeur` du KPI (aggregations.ts). Partout ailleurs —
 * `where` colon (source, query, KPI, filtre entre accolades d'une expression)
 * et les comparaisons `=` / `!=` de `compute` — l'égalité est `looseEquals`.
 *
 * ⚠️ Et `looseEquals` ne dit PAS « un tableau ne matche jamais » : son repli
 * `String(a) === String(b)` fait matcher un tableau À UN SEUL ÉLÉMENT
 * (`['urgent'] == 'urgent'` est vrai en JS), et un tableau à plusieurs
 * éléments matche son propre rendu à la virgule (`'urgent,social'`). La
 * différence est donc DÉPENDANTE DE LA DONNÉE : la même page rend des
 * résultats différents selon qu'une ligne porte une étiquette ou deux.
 * C'est précisément ce que la doc doit dire.
 *
 * Étendre la variante tableau à `where` / `compute` serait un changement de
 * comportement silencieux (une page qui comptait deux lignes en compterait
 * soudain quatre) : arbitrage tranché à #842, on documente au lieu d'étendre.
 * Si ce test casse, c'est que la sémantique a bougé — reprendre la doc avec
 * (JSDoc de `where` / `compute` / `value` du KPI, USER-GUIDE, skill).
 */

const ROWS = [
  { id: 1, tags: ['urgent', 'social'] }, // tableau à 2 éléments
  { id: 2, tags: ['social'] }, // tableau à 1 élément
  { id: 3, tags: 'urgent' }, // scalaire
  { id: 4, tags: ['urgent'] }, // tableau à 1 élément
];

const ids = (rows: Record<string, unknown>[]): unknown[] => rows.map((r) => r.id);

describe('#842 — la variante « tableau contient » et son périmètre', () => {
  it('les deux égalités ne diffèrent que sur un tableau à PLUSIEURS éléments', () => {
    expect(looseEqualsOrContains(['urgent', 'social'], 'urgent')).toBe(true);
    expect(looseEquals(['urgent', 'social'], 'urgent')).toBe(false);

    // Le piège : à un seul élément, les deux sont d'accord — par le repli
    // `String(a) === String(b)`, pas par une quelconque connaissance des
    // tableaux. La différence n'apparaît donc que sur certaines lignes.
    expect(looseEquals(['urgent'], 'urgent')).toBe(true);
    expect(looseEqualsOrContains(['urgent'], 'urgent')).toBe(true);
    // Et un tableau à plusieurs éléments matche son rendu à la virgule.
    expect(looseEquals(['urgent', 'social'], 'urgent,social')).toBe(true);

    // Sur un scalaire, les deux sont rigoureusement la même fonction.
    for (const [a, b] of [
      ['urgent', 'urgent'],
      ['75', 75],
      [true, 'true'],
      [null, undefined],
      ['', 0],
      ['urgent', 'social'],
    ] as [unknown, unknown][]) {
      expect(looseEqualsOrContains(a, b)).toBe(looseEquals(a, b));
    }
  });

  it('KPI `count:champ:valeur` : la variante S’APPLIQUE — les 3 lignes « urgent »', () => {
    expect(computeAggregation(ROWS, 'count:tags:urgent')).toBe(3);
  });

  it('KPI, filtre entre accolades du même attribut : la variante NE s’applique PAS', () => {
    // Même composant, même attribut `value` — mais le dialecte colon des
    // accolades passe par applyLocalFilter. La ligne 1 (deux étiquettes)
    // sort du compte : 2 au lieu de 3.
    expect(computeAggregation(ROWS, 'count{tags:eq:urgent}')).toBe(2);
    // Le `where` du KPI (même applyLocalFilter) donnerait le même 2.
    expect(ids(applyLocalFilter(ROWS, 'tags:eq:urgent'))).toEqual([3, 4]);
  });

  it('`where` colon : eq / in / neq comparent la valeur du champ telle quelle', () => {
    expect(ids(applyLocalFilter(ROWS, 'tags:eq:urgent'))).toEqual([3, 4]);
    // `in` applique la même égalité à chaque jeton : la ligne 1 manque encore.
    expect(ids(applyLocalFilter(ROWS, 'tags:in:urgent|social'))).toEqual([2, 3, 4]);
    // Le négatif garde donc la ligne multi-étiquettes, qui n’a pas matché.
    expect(ids(applyLocalFilter(ROWS, 'tags:neq:urgent'))).toEqual([1, 2]);
  });

  it('`compute` : `champ = valeur` compare la valeur du champ telle quelle', () => {
    const c = compileCompute("a = when tags = 'urgent' then 1 else 0");
    expect(ROWS.map((r) => applyCompute({ ...r }, c).a)).toEqual([0, 0, 1, 1]);
  });

  // --- Les voies de remplacement, quand on VEUT le comportement tableau ---

  it('voie native de `compute` : `contains()` parcourt le tableau, élément par élément', () => {
    const c = compileCompute("a = when contains(tags, 'urgent') then 1 else 0");
    expect(ROWS.map((r) => applyCompute({ ...r }, c).a)).toEqual([1, 0, 1, 1]);
  });

  it('voie native de `where` : une colonne calculée en amont, puis un filtre dessus', () => {
    // dsfr-data-normalize compute="a_urgent = when contains(tags,'urgent') then 1 else 0"
    // puis where="a_urgent:eq:1" — c'est LA réponse à donner en doc.
    const c = compileCompute("a_urgent = when contains(tags, 'urgent') then 1 else 0");
    const enrichies = ROWS.map((r) => applyCompute({ ...r }, c));
    expect(ids(applyLocalFilter(enrichies, 'a_urgent:eq:1'))).toEqual([1, 3, 4]);
  });

  it('`where="champ:contains:v"` : donne le bon résultat ici, mais n’est PAS un équivalent', () => {
    // Il compare une SOUS-CHAÎNE de `String(tableau)`. Sur ce jeu, ça tombe juste.
    expect(ids(applyLocalFilter(ROWS, 'tags:contains:urgent'))).toEqual([1, 3, 4]);
    // Ça cesse de marcher dès qu'une étiquette est sous-chaîne d'une autre.
    const piege = [{ id: 9, tags: ['non-urgent'] }];
    expect(applyLocalFilter(piege, 'tags:contains:urgent')).toHaveLength(1); // faux positif
    expect(applyLocalFilter(piege, 'tags:eq:urgent')).toHaveLength(0);
  });
});
