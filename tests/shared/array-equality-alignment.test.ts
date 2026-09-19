import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  looseEquals,
  applyLocalFilter,
  resetArrayEqualityTransitionWarnings,
} from '../../packages/shared/src/query/filter-translator';
import { compileCompute, applyCompute } from '../../packages/shared/src/utils/compute';
import { computeAggregation } from '../../packages/core/src/utils/aggregations';

/**
 * #953 / #842 — l'égalité côté client est alignée sur celle du portail.
 *
 * MESURÉ À L'API le 2026-09-19, deux portails, deux endpoints :
 *
 *   data.economie.gouv.fr /catalog/datasets, champ `keyword` (tableau)
 *     where=keyword = "budgets annexes"  -> total_count = 1  (2e élément)
 *     where=keyword = "LFI 2011"         -> total_count = 1  (1er élément)
 *     where=keyword = "LFI 2011,budgets annexes,finances publiques,loi de
 *                      finances initiale"  -> 0  (le rendu texte NE matche pas)
 *
 *   data.education.gouv.fr /datasets/retours-formulaire-votre-avis-copie/records,
 *   champ `themes_attendus` (multivalué ';'), 176 lignes dont 21 nulles
 *     where=themes_attendus = "Elèves"   -> 124
 *     where=themes_attendus = "Finances" ->  37
 *     where=themes_attendus = "Examens"  ->  56
 *     where=themes_attendus != "Elèves"  ->  31   (= 155 non nulles − 124)
 *     where=themes_attendus in ("Elèves","Finances") -> 130 (= l'union du OU)
 *
 * Opendatasoft lit donc `=` sur un champ multivalué comme un « contient »,
 * `!=` comme la négation stricte de ce `=` (nulls exclus des deux côtés,
 * logique SQL à trois valeurs) et `in` comme l'union des `=`.
 *
 * Côté client, `looseEquals` faisait `String(a) === String(b)` : ce n'était pas
 * une sémantique, c'était `Array.prototype.toString`. Elle regarde désormais
 * DANS le tableau, **en gardant le repli textuel en OU** — d'où la propriété
 * qui rend le changement sûr et que ce fichier démontre :
 *
 *   sur `eq` / `in` / `contains`, le client ne peut que GAGNER des
 *   correspondances, jamais en perdre.
 *
 * L'EXCEPTION, assumée et alignée sur le serveur : `neq` / `notin` sont la
 * négation de `eq` / `in`, donc une ligne que `neq` gardait à tort (parce que
 * `eq` la ratait) en sort désormais. C'est exactement le `!= -> 31` mesuré.
 */

/** L'égalité d'AVANT, à l'identique — l'oracle de la propriété de non-perte. */
function looseEqualsAvant(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  // eslint-disable-next-line eqeqeq -- reproduction fidèle de l'ancien code
  if (a == b) return true;
  return String(a) === String(b);
}

const ROWS = [
  { id: 1, tags: ['urgent', 'social'] }, // tableau à 2 éléments
  { id: 2, tags: ['social'] }, // tableau à 1 élément
  { id: 3, tags: 'urgent' }, // scalaire
  { id: 4, tags: ['urgent'] }, // tableau à 1 élément
  { id: 5, tags: null }, // nul
];

const ids = (rows: Record<string, unknown>[]): unknown[] => rows.map((r) => r.id);

/** Toutes les formes de valeur de champ qu'on peut rencontrer dans une ligne. */
const VALEURS: unknown[] = [
  'urgent',
  'a,b',
  '',
  '75',
  75,
  0,
  true,
  false,
  null,
  undefined,
  [],
  ['urgent'],
  ['urgent', 'social'],
  ['a', 'b'],
  ['non-urgent'],
  [75],
  [75, 13],
  ['', 'x'],
  [null],
  [['a', 'b'], 'c'],
];

/** Toutes les formes de valeur de filtre. */
const FILTRES: unknown[] = [
  'urgent',
  'social',
  'a',
  'b',
  'a,b',
  'urgent,social',
  '',
  '75',
  75,
  13,
  0,
  true,
  'true',
  null,
  undefined,
  'non-urgent',
];

describe('#953 — non-perte : tout ce qui matchait matche encore', () => {
  it('looseEquals : l’ancienne égalité implique la nouvelle, sur tout le corpus', () => {
    const perdus: string[] = [];
    for (const a of VALEURS) {
      for (const b of FILTRES) {
        if (looseEqualsAvant(a, b) && !looseEquals(a, b)) {
          perdus.push(`${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
        }
      }
    }
    expect(perdus).toEqual([]);
  });

  it('`where` eq / in / contains : aucune ligne perdue, sur tout le corpus', () => {
    const perdus: string[] = [];
    const lignes = VALEURS.map((v, i) => ({ id: i, champ: v }));
    for (const b of FILTRES) {
      if (b === null || b === undefined) continue;
      const val = String(b);
      if (val.includes(':') || val.includes(',') || val.includes('|')) continue;
      for (const op of ['eq', 'in', 'contains']) {
        const apres = new Set(ids(applyLocalFilter(lignes, `champ:${op}:${val}`)));
        // Recalcul de l'ancien comportement pour eq / in (contains est inchangé).
        const avant = lignes
          .filter((r) =>
            op === 'contains'
              ? r.champ !== null &&
                r.champ !== undefined &&
                String(r.champ).toLowerCase().includes(val.toLowerCase())
              : r.champ !== null && r.champ !== undefined && looseEqualsAvant(r.champ, val)
          )
          .map((r) => r.id);
        for (const id of avant) {
          if (!apres.has(id)) perdus.push(`${op}:${val} a perdu la ligne ${id}`);
        }
      }
    }
    expect(perdus).toEqual([]);
  });

  it('`compute` : `= ` ne perd rien non plus', () => {
    const c = compileCompute("a = when tags = 'urgent' then 1 else 0");
    const apres = ROWS.map((r) => applyCompute({ ...r }, c).a);
    const avant = ROWS.map((r) => (looseEqualsAvant(r.tags, 'urgent') ? 1 : 0));
    for (let i = 0; i < ROWS.length; i++) {
      if (avant[i] === 1) expect(apres[i]).toBe(1);
    }
  });
});

describe('#953 — le client compte désormais ce que compte le portail', () => {
  it('looseEquals regarde dans le tableau, et garde le repli textuel', () => {
    // La ligne du tableau à trois lignes de #954 qui changeait de camp.
    expect(looseEquals(['urgent', 'social'], 'urgent')).toBe(true);
    expect(looseEquals(['urgent', 'social'], 'social')).toBe(true);
    // Inchangées.
    expect(looseEquals(['urgent'], 'urgent')).toBe(true);
    expect(looseEquals('urgent', 'urgent')).toBe(true);
    // Le repli textuel reste, en OU — le serveur, lui, rend 0 sur ce cas.
    // On le garde pour ne rien perdre ; c'est écrit en doc.
    expect(looseEquals(['a', 'b'], 'a,b')).toBe(true);
    // Et on ne matche toujours pas n'importe quoi.
    expect(looseEquals(['urgent', 'social'], 'zzz')).toBe(false);
    expect(looseEquals(['non-urgent'], 'urgent')).toBe(false);
    // Coercition lâche à l'intérieur du tableau, comme à l'extérieur.
    expect(looseEquals([75, 13], '75')).toBe(true);
    expect(looseEquals(['75', '13'], 75)).toBe(true);
  });

  it('`where` eq : la ligne multi-étiquettes rentre dans le compte', () => {
    expect(ids(applyLocalFilter(ROWS, 'tags:eq:urgent'))).toEqual([1, 3, 4]);
  });

  it('`where` in : union des eq, comme le `in` du portail (mesuré : 130)', () => {
    expect(ids(applyLocalFilter(ROWS, 'tags:in:urgent|social'))).toEqual([1, 2, 3, 4]);
  });

  it('`where` neq : négation stricte de eq, nuls exclus — LA ligne qui se perd', () => {
    // Avant : [1, 2, 5]. La ligne 1 sortait du compte du portail sans sortir
    // de celui du client. Le serveur mesuré dit 155 − 124 = 31, soit la
    // négation stricte, nuls exclus des deux côtés.
    expect(ids(applyLocalFilter(ROWS, 'tags:neq:urgent'))).toEqual([2, 5]);
    expect(ids(applyLocalFilter(ROWS, 'tags:notin:urgent|social'))).toEqual([5]);
  });

  it('KPI `count:champ:valeur` et `count{champ:eq:valeur}` rendent le MÊME chiffre', () => {
    // C'était toute l'asymétrie de #842 : 3 d'un côté, 2 de l'autre.
    expect(computeAggregation(ROWS, 'count:tags:urgent')).toBe(3);
    expect(computeAggregation(ROWS, 'count{tags:eq:urgent}')).toBe(3);
    expect(applyLocalFilter(ROWS, 'tags:eq:urgent')).toHaveLength(3);
  });

  it('`compute` : `tags = ‘urgent’` vaut désormais `contains(tags, ‘urgent’)`', () => {
    const eg = compileCompute("a = when tags = 'urgent' then 1 else 0");
    const co = compileCompute("a = when contains(tags, 'urgent') then 1 else 0");
    const parEg = ROWS.map((r) => applyCompute({ ...r }, eg).a);
    const parCo = ROWS.map((r) => applyCompute({ ...r }, co).a);
    expect(parEg).toEqual([1, 0, 1, 1, 0]);
    expect(parEg).toEqual(parCo);
  });

  it('les champs scalaires ne bougent pas d’un iota', () => {
    const scalaires = [
      { id: 1, dep: '75' },
      { id: 2, dep: 75 },
      { id: 3, dep: '13' },
      { id: 4, dep: null },
      { id: 5, dep: '' },
    ];
    expect(ids(applyLocalFilter(scalaires, 'dep:eq:75'))).toEqual([1, 2]);
    expect(ids(applyLocalFilter(scalaires, 'dep:neq:75'))).toEqual([3, 4, 5]);
    expect(ids(applyLocalFilter(scalaires, 'dep:in:75|13'))).toEqual([1, 2, 3]);
  });
});

describe('#953 — l’avertissement de transition', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetArrayEqualityTransitionWarnings();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('nomme le champ et la valeur, et dit que le compte s’aligne sur le portail', () => {
    applyLocalFilter(ROWS, 'tags:eq:urgent');
    expect(warn).toHaveBeenCalledTimes(1);
    const msg = String(warn.mock.calls[0][0]);
    expect(msg).toContain('tags');
    expect(msg).toContain('urgent');
    expect(msg).toMatch(/portail|Opendatasoft/i);
  });

  it('ne dit rien quand rien ne change (scalaires, tableau à un élément)', () => {
    applyLocalFilter(
      [
        { id: 1, tags: 'urgent' },
        { id: 2, tags: ['urgent'] },
        { id: 3, tags: null },
      ],
      'tags:eq:urgent'
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('UN avertissement par couple (champ, valeur), pas un par ligne', () => {
    // 5 000 lignes qui basculent toutes, sur 2 valeurs de filtre : 2 messages.
    const grand = Array.from({ length: 5000 }, (_, i) => ({
      id: i,
      tags: ['urgent', 'social'],
    }));
    applyLocalFilter(grand, 'tags:eq:urgent');
    applyLocalFilter(grand, 'tags:eq:social');
    applyLocalFilter(grand, 'tags:eq:urgent'); // rejoué : toujours rien de plus
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('le nombre de couples distincts est borné — pas de fuite mémoire', () => {
    for (let i = 0; i < 500; i++) {
      applyLocalFilter([{ tags: [`v${i}`, 'autre'] }], `tags:eq:v${i}`);
    }
    // Un plafond, puis un dernier message qui dit qu'on se tait.
    expect(warn.mock.calls.length).toBeLessThanOrEqual(51);
    expect(warn.mock.calls.length).toBeGreaterThan(1);
  });
});
