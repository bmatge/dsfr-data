---
'dsfr-data': patch
---

Tabular : deux chiffres faux corrigés (#1025).

- **Un `group-by` sans agrégat affichait des lignes répétées comme des groupes.** L'API Tabular ne regroupe pas sur `champ__groupby` seul : elle rend une ligne par ligne brute (`Code sexe__groupby` → F, M, M, F, M, api-tabular#119). La bibliothèque le lui déléguait pourtant, puis sautait son propre regroupement : une liste des 8 académies en affichait 137, et un KPI `count` derrière la query annonçait 137. Le défaut existe depuis la délégation du group-by à Tabular. Désormais un `group-by` sans agrégat n'est plus délégué : l'adaptateur rend les lignes brutes, la query regroupe (comme pour `distinct`), avec un avertissement en console.
- **Une page agrégée masquait sa pagination.** Une réponse Tabular agrégée ne porte pas de `meta.total` ; en mode `server-side`, l'adaptateur le lisait comme un total de **0** : une liste `group-by` + `aggregate` n'affichait qu'une page (les 40 ou 50 premiers groupes, les autres inatteignables) et un KPI `meta:total` affichait 0. Un total absent est maintenant un total **inconnu** (`undefined`, contrat #270) : la liste propose la page suivante tant que la page est pleine et affiche « Page N » sans total.
