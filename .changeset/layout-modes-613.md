---
'dsfr-data': patch
---

`<app-layout-builder>` expose un attribut `mode` — `page-scroll` (defaut),
`fullscreen`, `sticky-left` (#613).

Trois apps surchargeaient ses classes internes depuis leur propre CSS : le
Playground avec des `!important` pour inverser le sticky, Builder et Assistant
IA avec la meme surcharge dupliquee. Ces classes ne sont pas contractuelles —
un changement du composant les cassait en silence.

La hauteur de la colonne gauche en pile verticale devient une propriete CSS
publique, `--app-layout-left-stacked-height`.
