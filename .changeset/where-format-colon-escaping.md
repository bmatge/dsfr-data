---
'dsfr-data': patch
---

Format WHERE piloté par le dialecte du provider + échappement colon (#271) : les facettes croisées sont jointes par `, ` en colon et ` AND ` en ODSQL (`joinWhere`) — elles produisaient des clauses invalides sur Grist/Tabular. Les valeurs contenant `,` `:` `|` (ex. « Provence, Alpes ») sont percent-encodées par `buildColonFacetWhere` et décodées par tous les parseurs colon (query, Grist SQL et Records, Tabular, INSEE) ; les 5 copies de construction de clauses facettes sont factorisées dans `packages/core/src/utils/where.ts`. L'échappement de `dsfr-data-search` suit le dialecte de l'adapter au lieu d'imposer l'ODSQL. `GenericAdapter` déclare `whereFormat: 'colon'`, conforme à ce qu'il émet réellement.
