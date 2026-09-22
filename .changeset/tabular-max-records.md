---
'dsfr-data': minor
---

`max-records` honoré par l'adaptateur Tabular (#1027), comme par Opendatasoft : 25 000 lignes par défaut (125 pages de 200), relevable explicitement par l'auteur — `max-records="40000"` charge par exemple les quelque 35 000 communes en 175 requêtes. Un `limit` plus petit reste prioritaire. Quand le plafond coupe le jeu, la source le signale (`truncated`, y compris sur un `group-by` dont l'API ne donne pas le total) et l'avertissement console cite `max-records` ; il se déclenche désormais aussi quand le plafond est atteint pile, cas où il restait muet.

Corrige au passage la dernière page d'un chargement borné : réduite au reste (`page=3&page_size=50` pour `limit="450"`), elle relisait des lignes déjà reçues, l'API plaçant une page à `(page - 1) × page_size`. Les pages suivantes gardent la taille de 200 et le surplus est retranché.
