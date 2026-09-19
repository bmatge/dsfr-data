import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  looseEquals,
  looseNotEquals,
  applyLocalFilter,
  resetNeqNullTransitionWarnings,
} from '../../packages/shared/src/query/filter-translator';
import { compileCompute, applyCompute } from '../../packages/shared/src/utils/compute';

/**
 * #958 — une valeur ABSENTE ne satisfait NI `=` NI `!=`.
 *
 * Suite de #953, sur l'autre moitié de l'opérateur. #953 alignait l'égalité
 * d'un champ tableau ; le traitement des NULS par `neq` restait divergent, et
 * il l'était déjà avant.
 *
 * ── MESURÉ À L'API le 2026-09-20 ────────────────────────────────────────
 * data.education.gouv.fr /datasets/retours-formulaire-votre-avis-copie/records
 * champ `themes_attendus` (multivalué ';') — 176 lignes, 21 nulles, 155
 * renseignées (`is null` -> 21, `is not null` -> 155) :
 *
 *   themes_attendus = "Elèves"        -> 124
 *   themes_attendus != "Elèves"       ->  31   = 155 − 124 (nuls EXCLUS)
 *                                              et NON 52 = 176 − 124
 *   themes_attendus != "zzz"          -> 155   (= les renseignées, pas 176)
 *
 * Opendatasoft applique donc la logique SQL à TROIS VALEURS : sur une ligne
 * dont le champ est nul, `=` comme `!=` valent « inconnu », et l'inconnu ne
 * retient pas la ligne. Le client, lui, gardait les nulles sur un `neq` —
 * donc le même `champ:neq:valeur` rendait 31 lignes délégué et 52 évalué au
 * client, et ce qui en décidait n'était pas la balise mais le mode de la
 * source, un transformateur amont ou le partage de chaîne.
 *
 * ── LES DEUX ÉCRITURES DU SERVEUR, mesurées le même jour ────────────────
 * Le relevé annoncé par l'issue est confirmé, et sur un jeu métier :
 *
 *   themes_attendus != "Elèves"            ->  31   (3VL, nuls exclus)
 *   NOT themes_attendus = "Elèves"         ->  52   (complément, nuls gardés)
 *   not(themes_attendus = "Elèves")        ->  52
 *   not(themes_attendus != "Elèves")       -> 145   = 176 − 31
 *   NOT themes_attendus in ("Elèves")      ->  52
 *   NOT themes_attendus like "%Elèves%"    ->  52
 *   themes_attendus not in (…) / not like  -> ODSQL syntax exception
 *
 * `NOT <clause>` est le complément exact de la clause (nuls GARDÉS) ; `!=`
 * est la seule écriture à trois valeurs. Conséquence directe sur le
 * périmètre de ce correctif — et c'est pour ça que `notin` / `notcontains`
 * ne bougent PAS : l'adaptateur les traduit en `NOT … in (…)` et
 * `NOT … like "%…%"`, ODSQL n'ayant pas d'infixe `not in` / `not like`.
 * Le client, qui garde les nuls sur ces deux-là, est DÉJÀ aligné ; les
 * aligner « par symétrie » créerait la divergence qu'on est en train de
 * fermer.
 */

/** 176 lignes, 21 nulles — le jeu mesuré, en miniature et aux proportions. */
const ROWS = [
  { id: 1, t: 'Elèves' },
  { id: 2, t: 'Finances' },
  { id: 3, t: ['Elèves', 'Finances'] },
  { id: 4, t: null },
  { id: 5, t: undefined },
  { id: 6, t: '' }, // chaîne VIDE : une valeur, pas une absence
];

const ids = (rows: Record<string, unknown>[]): unknown[] => rows.map((r) => r.id);

describe('#958 — `neq` exclut les valeurs absentes, comme le portail', () => {
  beforeEach(() => resetNeqNullTransitionWarnings());

  it('`eq` les excluait DÉJÀ — c’est bien `neq` qui change', () => {
    expect(looseEquals(null, 'Elèves')).toBe(false);
    expect(looseEquals(undefined, 'Elèves')).toBe(false);
    expect(ids(applyLocalFilter(ROWS, 't:eq:Elèves'))).toEqual([1, 3]);
  });

  it('`looseNotEquals` : l’absence ne satisfait pas la non-égalité', () => {
    expect(looseNotEquals(null, 'Elèves')).toBe(false);
    expect(looseNotEquals(undefined, 'Elèves')).toBe(false);
    // et tout le reste est bien la négation de looseEquals
    expect(looseNotEquals('Finances', 'Elèves')).toBe(true);
    expect(looseNotEquals('Elèves', 'Elèves')).toBe(false);
    expect(looseNotEquals(['Elèves', 'Finances'], 'Elèves')).toBe(false);
    expect(looseNotEquals(75, '75')).toBe(false);
  });

  it('`where` colon : les lignes 4 et 5 sortent, la ligne vide reste', () => {
    // AVANT : [2, 4, 5, 6]. Le portail, lui, ne rendait déjà que [2, 6].
    expect(ids(applyLocalFilter(ROWS, 't:neq:Elèves'))).toEqual([2, 6]);
    // eq + neq ne partitionnent plus le jeu : les absents ne sont d'aucun côté,
    // exactement comme 124 + 31 = 155 ≠ 176.
    const eq = applyLocalFilter(ROWS, 't:eq:Elèves').length;
    const neq = applyLocalFilter(ROWS, 't:neq:Elèves').length;
    expect(eq + neq).toBe(applyLocalFilter(ROWS, 't:isnotnull').length);
    expect(eq + neq).not.toBe(ROWS.length);
  });

  it('une valeur qui ne figure nulle part rend les RENSEIGNÉES, pas tout', () => {
    // where=themes_attendus != "zzz" -> 155, et non 176.
    expect(ids(applyLocalFilter(ROWS, 't:neq:zzz'))).toEqual([1, 2, 3, 6]);
  });

  it('`compute` suit : `when t != …` et `where t:neq:…` gardent les mêmes lignes', () => {
    // L'en-tête de compute.ts promet cette égalité de périmètre depuis #671 ;
    // la tenir sur `!=` est la raison d'inclure compute dans ce correctif.
    const c = compileCompute("garde = when t != 'Elèves' then 1 else 0");
    const gardees = ROWS.filter((r) => applyCompute({ ...r }, c).garde === 1);
    expect(ids(gardees)).toEqual(ids(applyLocalFilter(ROWS, 't:neq:Elèves')));
  });
});

describe('#958 — ce qui ne bouge PAS (non-perte ailleurs)', () => {
  beforeEach(() => resetNeqNullTransitionWarnings());

  it('`eq`, `in`, `contains` gardent exactement les mêmes lignes', () => {
    expect(ids(applyLocalFilter(ROWS, 't:eq:Elèves'))).toEqual([1, 3]);
    expect(ids(applyLocalFilter(ROWS, 't:in:Elèves|Finances'))).toEqual([1, 2, 3]);
    expect(ids(applyLocalFilter(ROWS, 't:contains:Elè'))).toEqual([1, 3]);
    expect(ids(applyLocalFilter(ROWS, 't:isnull'))).toEqual([4, 5]);
    expect(ids(applyLocalFilter(ROWS, 't:isnotnull'))).toEqual([1, 2, 3, 6]);
    expect(ids(applyLocalFilter(ROWS, 't:eq:'))).toEqual([6]);
  });

  it('`notin` et `notcontains` gardent les absents : `NOT …` du serveur aussi', () => {
    // Mesuré : NOT themes_attendus in ("Elèves") -> 52 = 176 − 124, nuls GARDÉS.
    expect(ids(applyLocalFilter(ROWS, 't:notin:Elèves'))).toEqual([2, 4, 5, 6]);
    expect(ids(applyLocalFilter(ROWS, 't:notcontains:Elè'))).toEqual([2, 4, 5, 6]);
  });

  it('le repli textuel et la voie tableau de #953 sont intacts', () => {
    expect(looseEquals(['a', 'b'], 'a,b')).toBe(true);
    expect(looseEquals(['urgent', 'social'], 'urgent')).toBe(true);
    expect(looseEquals(null, null)).toBe(true);
    expect(looseEquals(undefined, null)).toBe(true);
  });
});

describe('#958 — l’avertissement de transition', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  const flush = () => new Promise<void>((r) => setTimeout(r, 0));

  beforeEach(() => {
    resetNeqNullTransitionWarnings();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('UN message par champ, qui nomme le champ et COMPTE les lignes perdues', async () => {
    // 200 lignes dont 80 nulles : un message par ligne serait inacceptable —
    // ce dépôt a payé une régression de 7 139 messages.
    const lignes = Array.from({ length: 200 }, (_, i) => ({
      t: i % 5 < 2 ? null : 'Elèves',
    }));
    applyLocalFilter(lignes, 't:neq:Finances');
    await flush();
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain('"t"');
    expect(message).toContain('80');
    expect(message).toContain('#958');
  });

  it('rien du tout quand aucune ligne ne bascule', async () => {
    applyLocalFilter([{ t: 'Elèves' }, { t: '' }], 't:neq:Finances');
    await flush();
    expect(warn).not.toHaveBeenCalled();
  });

  it('le même champ refiltré dix fois ne parle qu’une fois', async () => {
    for (let i = 0; i < 10; i++) {
      applyLocalFilter([{ t: null }], 't:neq:Finances');
      await flush();
    }
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('au-delà de 50 champs distincts, un dernier message et le silence', async () => {
    for (let i = 0; i < 60; i++) {
      applyLocalFilter([{ [`c${i}`]: null }], `c${i}:neq:x`);
      await flush();
    }
    expect(warn).toHaveBeenCalledTimes(51);
    expect(String(warn.mock.calls[50][0])).toContain('coupés');
  });
});
