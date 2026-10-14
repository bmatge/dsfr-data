/**
 * `contains` confié à un `LIKE` SQL (#1285, ADR-159, lot 2) : Tabular
 * (PostgREST, `ilike`) et Grist (SQLite, `LIKE`).
 *
 * Le filtre `contains` de la bibliothèque est une SOUS-CHAÎNE : chaque
 * caractère de la valeur vaut pour lui-même. Dans un motif `LIKE`, `%` vaut
 * toute suite de caractères et `_` un caractère quelconque ; une valeur qui
 * les porte change donc de sens si elle part telle quelle. Mesures du
 * 2026-10-14 :
 *
 *   Tabular, communes de l'Ariège (COG, 325 lignes) :
 *     LIBELLE__contains=Saint     ->  25
 *     LIBELLE__contains=S%nt      ->  32   `%` est un joker
 *     LIBELLE__contains=S*nt      ->  32   `*` aussi (PostgREST le lit comme `%`)
 *     LIBELLE__contains=Sain_     ->  25   `_` est un joker
 *     LIBELLE__contains=Sain\_    ->   0   `\` échappe (aucun « _ » littéral)
 *     LIBELLE__contains=S\%nt     ->   0
 *     LIBELLE__contains=Sa\int    ->  25   `\` devant une lettre : la lettre
 *     LIBELLE__contains=Sa\\int   ->   0   `\\` : une barre littérale
 *     LIBELLE__contains=S\*nt     ->   0   `\*` devient `\%` : un « % » littéral,
 *                                         jamais une étoile — `*` n'a pas d'échappement
 *   Grist, `Scrutin_c1` (101 départements), POST /sql :
 *     nom_dept LIKE '%Co_se%'                 ->  2   `_` est un joker
 *     nom_dept LIKE '%Co\_se%'                ->  0   sans ESCAPE, `\` est un caractère
 *     nom_dept LIKE '%Co\_se%' ESCAPE '\'     ->  0   échappé
 *     nom_dept LIKE '%Cor\se%' ESCAPE '\'     ->  2   `\` devant une lettre : la lettre
 *     nom_dept LIKE '%C\%se%'  ESCAPE '\'     ->  0
 *
 * D'où : `\`, `%` et `_` sont échappés par `\` ({@link escapeLikePattern}) ;
 * PostgreSQL prend `\` comme caractère d'échappement par défaut, SQLite
 * seulement avec `ESCAPE '\'`. Une valeur qui porte `*` ne part pas à Tabular
 * (la règle de chaque serveur : `server-clause.ts`).
 *
 * `notcontains` ne part à aucun des deux : `NOT ILIKE` / `NOT LIKE` écartent
 * les valeurs absentes (logique SQL à trois valeurs), que le navigateur garde.
 * Mesuré le 2026-10-14, élus municipaux (Tabular, 34 826 lignes) : la colonne
 * « Libellé de la collectivité à statut particulier » est nulle sur 34 328 ;
 * `__notcontains=zzz` rend 498 lignes, le navigateur 34 826. Grist : 89 lignes
 * sur 101 quand 12 valeurs sont nulles (ADR-159).
 *
 * La casse et les accents restent ceux du serveur (ADR-159, point 3) :
 * `ilike` ignore la casse de toutes les lettres, le `LIKE` de SQLite celle des
 * seules lettres ASCII ; tous deux respectent les accents.
 */

/**
 * La valeur d'un `contains`, échappée pour un motif `LIKE` dont le caractère
 * d'échappement est `\` : `\` d'abord (sinon les `\` ajoutés seraient
 * ré-échappés), puis `%` et `_`. L'appelant l'entoure de ses jokers.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
