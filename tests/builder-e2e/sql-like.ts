/**
 * Le `LIKE` SQL des faux portails, TEL QUE MESURÉ (#1285, ADR-159, lot 2).
 *
 * Deux API du dépôt confient `contains` à un `LIKE` : Tabular (PostgREST,
 * `ilike.*valeur*`) et Grist (SQLite, `LIKE ?`). Le faux Tabular lisait
 * `__contains` comme une sous-chaîne littérale et ignorait `__notcontains` :
 * un `%` ou un `_` laissé dans la valeur, ou une valeur absente écartée par
 * la négation, y passaient au vert alors que l'API réelle se trompait. Un
 * faux serveur complaisant ne garde rien.
 *
 * Mesures du 2026-10-14 (détail dans `packages/shared/src/query/sql-like.ts`,
 * que ce module n'importe pas — il est l'autre voix) :
 *
 * - Tabular : `*`, `%` et `_` sont des jokers (`S*nt`, `S%nt` -> 32 communes
 *   de l'Ariège, `Saint` -> 25) ; `\` échappe le caractère suivant
 *   (`Sain\_` -> 0, `Sa\int` -> 25) ; une étoile précédée de `\` devient un
 *   « % » littéral (`S\*nt` -> 0). Casse ignorée (`ilike`), accents respectés.
 * - Grist : `%` et `_` sont des jokers (`Co_se` -> 2) ; `\` n'échappe qu'avec
 *   `ESCAPE '\'` (sans elle, `Co\_se` -> 0 parce que `\` est un caractère) ;
 *   casse ignorée pour les seules lettres ASCII, accents respectés.
 * - Les deux : une valeur absente ne vérifie ni `LIKE` ni `NOT LIKE` (logique
 *   à trois valeurs) — `__notcontains=zzz` rend 498 élus sur 34 826.
 *
 * Il n'importe rien de la bibliothèque (test-garde `tests/oracle/guard.test.ts`).
 */

type Jeton = { sorte: 'suite' } | { sorte: 'un' } | { sorte: 'lettre'; c: string };

/** Le motif découpé en jetons : joker de suite, joker d'un caractère, caractère littéral. */
function jetons(motif: string, echappement: string | null): Jeton[] {
  const sortie: Jeton[] = [];
  for (let i = 0; i < motif.length; i++) {
    const c = motif[i];
    if (echappement !== null && c === echappement && i + 1 < motif.length) {
      sortie.push({ sorte: 'lettre', c: motif[++i] });
    } else if (c === '%') sortie.push({ sorte: 'suite' });
    else if (c === '_') sortie.push({ sorte: 'un' });
    else sortie.push({ sorte: 'lettre', c });
  }
  return sortie;
}

export interface OptionsLike {
  /** `toutes` : `ilike` de PostgreSQL ; `ascii` : le `LIKE` de SQLite. */
  casse: 'toutes' | 'ascii';
  /** Caractère d'échappement, ou `null` (SQLite sans clause `ESCAPE`). */
  echappement: string | null;
}

/**
 * `valeur LIKE motif`. `null` pour une valeur absente : ni vrai ni faux, comme
 * en SQL — c'est à l'appelant d'écarter la ligne, sous `LIKE` comme sous
 * `NOT LIKE`.
 */
export function likeSql(valeur: unknown, motif: string, options: OptionsLike): boolean | null {
  if (valeur === null || valeur === undefined) return null;
  const plier =
    options.casse === 'toutes'
      ? (t: string) => t.toLowerCase()
      : (t: string) => t.replace(/[A-Z]/g, (c) => c.toLowerCase());
  const v = plier(String(valeur));
  const m = jetons(motif, options.echappement).map((j) =>
    j.sorte === 'lettre' ? { sorte: 'lettre' as const, c: plier(j.c) } : j
  );
  // Parcours à deux curseurs avec retour sur le dernier joker de suite : pas
  // d'expression régulière construite depuis une valeur.
  let i = 0;
  let j = 0;
  let suite = -1;
  let repere = 0;
  while (i < v.length) {
    const jeton = m[j];
    if (jeton && (jeton.sorte === 'un' || (jeton.sorte === 'lettre' && jeton.c === v[i]))) {
      i++;
      j++;
    } else if (jeton && jeton.sorte === 'suite') {
      suite = j++;
      repere = i;
    } else if (suite !== -1) {
      j = suite + 1;
      i = ++repere;
    } else {
      return false;
    }
  }
  while (j < m.length && m[j].sorte === 'suite') j++;
  return j === m.length;
}

/**
 * `__contains` / `__notcontains` de l'API Tabular : `ilike.*valeur*`, que
 * PostgREST lit en remplaçant chaque `*` par `%` — y compris celui d'une
 * valeur, et celui qu'un `\` précède (`\*` devient `\%`, un « % » littéral).
 * Une valeur absente n'est retenue par aucun des deux.
 */
export function ilikeTabular(gauche: unknown, valeur: string, negation: boolean): boolean {
  const motif = `*${valeur}*`.replace(/\*/g, '%');
  const lu = likeSql(gauche, motif, { casse: 'toutes', echappement: '\\' });
  if (lu === null) return false;
  return negation ? !lu : lu;
}
