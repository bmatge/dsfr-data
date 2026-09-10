---
'dsfr-data': patch
---

Documentation : les tableaux d'attributs des pages `/specs` sont désormais générés
depuis le custom-elements manifest (`npm run build:specs-tables`), au lieu d'être
saisis à la main. Le regroupement thématique des sections reste éditorial, mais le
contenu des lignes (type, défaut, description) vient du JSDoc des composants, et
l'exhaustivité est vérifiée : un attribut ajouté au code sans être rangé dans une
section fait échouer la génération. `npm run check:specs-tables` rejoue le contrôle
sans écrire, pour la CI.

Effets sur la lib :

- Descriptions JSDoc ré-accentuées dans `packages/core/src/components/` (141 blocs) :
  elles alimentent aussi les skills, le serveur MCP et l'assistant IA, qui servaient
  jusqu'ici du français dé-accentué.
- Nouvel export lib-safe `escapeText` dans `@dsfr-data/shared` — échappement pour
  contenu textuel (`&`, `<`, `>` seulement), distinct de `escapeHtml` qui vise les
  attributs et transformerait la prose française en `l&#039;élément`.

Attributs qui n'étaient documentés nulle part, révélés par le contrôle d'exhaustivité :
`dsfr-data-map-layer` (`refine-on-click`, `context`, `label`), `dsfr-data-facets`
(`context`, `no-reset`), `dsfr-data-search` (`context`), `dsfr-data-context-filter`
(`context`), `dsfr-data-context-tags` (`clear-all`).

Les extraits de code des pages `/specs` sont colorisés au build (spans `tok-*` posés
par le générateur, stylés dans `packages/app-ui`) — sans coloriseur au runtime.
