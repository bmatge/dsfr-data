---
'dsfr-data': minor
---

`fetch-mode="export"` sur une source Tabular lit désormais l'export **Parquet** que data.gouv publie pour chaque ressource (#1055, étude #1022) : le jeu entier en quelques requêtes par plages au lieu de pages de 200 (IRVE, 223 174 lignes : 0,66 s et 17 requêtes, contre 10,8 s et 125 requêtes pour 25 000 lignes en pagination), colonnes projetées depuis `select`, `max-records` qui borne les lignes lues. Les lignes ont la forme de l'API (entiers en nombres, dates en `AAAA-MM-JJ`, `__id`). Lignes brutes seulement : avec un `where`, `group-by`, `aggregate` ou `order-by` délégué, ou sans export pour la ressource, la source reste sur la pagination et le dit en console. Le lecteur (`hyparquet` + `fzstd`, MIT) est chargé à la demande : chunks séparés publiés dans `dist/`, que les bundles ESM et UMD importent tous deux (l’UMD par rapport à sa propre URL, sans CDN tiers) — jamais dans le bundle principal. Le mode par défaut ne change pas.
