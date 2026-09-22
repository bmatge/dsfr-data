---
'dsfr-data': minor
---

Recherche serveur multi-colonnes sur Tabular et grammaire du OU entre champs (#1026).

- Nouvelle grammaire « champs multiples » dans le `where` colon : `nom|commune:contains:martin` applique le même opérateur et la même valeur à plusieurs champs, reliés par un OU ; les clauses restent en ET. C'est le seul OU de la grammaire, et il ne réserve aucun caractère de plus (`,` `:` `|`).
- Tabular la traduit en `or=(nom__contains.martin,commune__contains.martin)` (mesuré sur l'API : 351 = 189 + 164 − 2, l'union vraie) ; Opendatasoft et Grist (SQL) en `(… OR …)` ; `dsfr-data-query` et le `where` de `dsfr-data-kpi` la filtrent en OU dans le navigateur. INSEE et generic la refusent explicitement (`supportsServerWhere`) et le filtre reste client.
- `dsfr-data-search fields="nom,commune" server-search` filtre désormais côté serveur sur Tabular, sans gabarit : le gabarit par défaut est `{fields}:contains:{q}` (`{fields}` = les champs de `fields` séparés par `|`), et le compteur lit le `meta.total` de la réponse, juste sur tout le jeu. `contains` y est sensible aux accents : « ecole » ne trouve pas « École » côté serveur.
- Un terme que `or=` ne sait pas transporter (`,` `.` `(` `)` `"` `&`, mesurés : 400 ou 0 sans erreur), une liste `in`/`notin` ou une seconde clause multi-champs ne partent pas au serveur : la query filtre dans le navigateur, la recherche retombe en local, et un avertissement le dit.
