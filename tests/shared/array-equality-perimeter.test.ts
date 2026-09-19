import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  looseEquals,
  applyLocalFilter,
  resetArrayEqualityTransitionWarnings,
} from '../../packages/shared/src/query/filter-translator';
import { compileCompute, applyCompute } from '../../packages/shared/src/utils/compute';
import { computeAggregation } from '../../packages/core/src/utils/aggregations';

/**
 * Le périmètre de l'égalité « champ tableau », DEUXIÈME état.
 *
 * ── Ce que ce fichier disait avant, et qui était faux ────────────────────
 * Écrit à #842, il verrouillait une asymétrie présentée comme VOULUE :
 * `count:tags:urgent` du KPI parcourait le tableau (`looseEqualsOrContains`,
 * #673), tout le reste — `where` colon, `count{tags:eq:urgent}`, `=` de
 * `compute` — comparait la valeur telle quelle. L'argument était qu'étendre
 * la variante changerait en silence le compte de pages publiées.
 *
 * ── Ce qui l'a invalidé ──────────────────────────────────────────────────
 * La mesure de #953 : Opendatasoft lit déjà `=` sur un champ multivalué comme
 * un « contient ». Dès qu'une clause est déléguée — et ce n'est pas la balise
 * qui porte le `where` qui en décide — la bibliothèque AVAIT déjà la
 * sémantique tableau. L'asymétrie n'était donc pas un contrat, c'était une
 * incohérence interne ; et le comportement client n'était pas une sémantique,
 * c'était `Array.prototype.toString`.
 *
 * ── Le périmètre qui reste, et que ce fichier verrouille maintenant ───────
 * Trois choses continuent de se distinguer, et il faut les dire :
 *   1. le repli textuel (`['a','b']` matche `'a,b'`) est GARDÉ côté client
 *      alors que le portail rend 0 dessus — gardé pour ne perdre aucune ligne ;
 *   2. `contains` du `where` reste une recherche de SOUS-CHAÎNE dans
 *      `String(tableau)` : ce n'est toujours pas un `eq` élément par élément ;
 *   3. `neq` / `notin` sont la négation de `eq` / `in` : c'est le seul endroit
 *      où le client perd une ligne, et le serveur fait pareil.
 *
 * La démonstration de non-perte et les mesures API sont dans
 * `tests/shared/array-equality-alignment.test.ts`.
 */

const ROWS = [
  { id: 1, tags: ['urgent', 'social'] }, // tableau à 2 éléments
  { id: 2, tags: ['social'] }, // tableau à 1 élément
  { id: 3, tags: 'urgent' }, // scalaire
  { id: 4, tags: ['urgent'] }, // tableau à 1 élément
];

const ids = (rows: Record<string, unknown>[]): unknown[] => rows.map((r) => r.id);

describe('#953 — il n’y a plus qu’une égalité', () => {
  beforeEach(() => resetArrayEqualityTransitionWarnings());

  it('`looseEqualsOrContains` a fusionné dans `looseEquals`', async () => {
    const shared = await import('../../packages/shared/src/query/filter-translator');
    expect('looseEqualsOrContains' in shared).toBe(false);
    // Et la fonction survivante fait ce que faisait la variante.
    expect(looseEquals(['urgent', 'social'], 'urgent')).toBe(true);
  });

  it('KPI, `where` et `compute` comptent enfin la même chose', () => {
    expect(computeAggregation(ROWS, 'count:tags:urgent')).toBe(3);
    expect(computeAggregation(ROWS, 'count{tags:eq:urgent}')).toBe(3);
    expect(ids(applyLocalFilter(ROWS, 'tags:eq:urgent'))).toEqual([1, 3, 4]);
    const c = compileCompute("a = when tags = 'urgent' then 1 else 0");
    expect(ROWS.map((r) => applyCompute({ ...r }, c).a)).toEqual([1, 0, 1, 1]);
  });
});

describe('#953 — ce qui distingue ENCORE le client du portail', () => {
  beforeEach(() => resetArrayEqualityTransitionWarnings());

  it('1. le repli textuel est gardé, et le portail ne l’a pas', () => {
    // Mesuré : where=keyword = "LFI 2011,budgets annexes,…" -> total_count = 0.
    // Côté client, ça matche encore — volontairement, pour ne rien perdre.
    expect(looseEquals(['a', 'b'], 'a,b')).toBe(true);
    expect(ids(applyLocalFilter([{ id: 1, t: ['a', 'b'] }], 't:eq:a%2Cb'))).toEqual([1]);
  });

  it('2. `contains` du `where` reste une sous-chaîne, pas un élément', () => {
    // Le faux ami de #951 : il matche « non-urgent » quand on cherche « urgent ».
    const piege = [{ id: 9, tags: ['non-urgent'] }];
    expect(applyLocalFilter(piege, 'tags:contains:urgent')).toHaveLength(1); // faux positif
    expect(applyLocalFilter(piege, 'tags:eq:urgent')).toHaveLength(0); // eq, lui, est juste
    // Et il traverse la frontière entre deux éléments, via la virgule.
    expect(applyLocalFilter([{ tags: ['ea', 'ir'] }], 'tags:contains:a%2Ci')).toHaveLength(1);
  });

  it('3. `neq` / `notin` : la seule perte, et elle est alignée sur le serveur', () => {
    // Avant : [1, 2]. Le portail mesuré ne gardait déjà que la ligne 2.
    expect(ids(applyLocalFilter(ROWS, 'tags:neq:urgent'))).toEqual([2]);
    expect(ids(applyLocalFilter(ROWS, 'tags:notin:urgent|social'))).toEqual([]);
    const c = compileCompute("a = when tags != 'urgent' then 1 else 0");
    expect(ROWS.map((r) => applyCompute({ ...r }, c).a)).toEqual([0, 1, 0, 0]);
  });
});

describe('#953 — la voie `compute` reste valide, elle n’est plus nécessaire', () => {
  beforeEach(() => resetArrayEqualityTransitionWarnings());

  it('le booléen dérivé donne le même résultat que le `where` direct', () => {
    const c = compileCompute("a_urgent = when contains(tags, 'urgent') then 1 else 0");
    const enrichies = ROWS.map((r) => applyCompute({ ...r }, c));
    expect(ids(applyLocalFilter(enrichies, 'a_urgent:eq:1'))).toEqual([1, 3, 4]);
    // … qui est exactement ce que rend désormais le filtre direct.
    expect(ids(applyLocalFilter(ROWS, 'tags:eq:urgent'))).toEqual([1, 3, 4]);
  });

  it('elle garde un intérêt : un scalaire dérivé se délègue et se regroupe', () => {
    // Le filtre final porte sur un scalaire : aucune ambiguïté de mode, et
    // la colonne devient regroupable / affichable. C'est ce qui la garde utile.
    const c = compileCompute("a_urgent = when contains(tags, 'urgent') then 1 else 0");
    expect(ROWS.map((r) => applyCompute({ ...r }, c).a_urgent)).toEqual([1, 0, 1, 1]);
  });
});

describe('#953 — l’avertissement de transition ne sort que sur les lignes qui basculent', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetArrayEqualityTransitionWarnings();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('rien sur un jeu scalaire, un message sur un jeu multivalué', () => {
    applyLocalFilter(
      [
        { dep: '75' },
        { dep: 75 },
        { dep: null },
        { dep: ['75'] }, // un seul élément : matchait déjà par le repli
      ],
      'dep:eq:75'
    );
    expect(warn).not.toHaveBeenCalled();

    applyLocalFilter([{ dep: ['75', '13'] }], 'dep:eq:75');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
