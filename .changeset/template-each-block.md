---
"dsfr-data": minor
---

Les templates de `dsfr-data-display` et `dsfr-data-map-popup` acceptent le bloc `{{#each champ}}…{{/each}}` : un champ multivalué se rend enfin en liste structurée, avec `{{.}}` pour l'élément courant (formats de la grammaire compris) et `{{$index}}` pour son rang. La valeur reste échappée, un tableau vide ne rend rien, et les blocs ne s'imbriquent pas (#737).
