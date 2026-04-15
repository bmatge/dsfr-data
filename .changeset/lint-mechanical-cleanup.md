---
"dsfr-data": patch
---

Nettoyage mécanique des warnings ESLint (issue #45) dans les packages publiés :

- **`<\/script>` → `</script>`** dans `cdn-versions.ts` et les code generators (les deux produisent la même chaîne à l'exécution ; seul le source est plus propre).
- **`@ts-ignore` → `@ts-expect-error`** sur les imports Vite `?inline` de `dsfr-data-map` et `dsfr-data-map-layer` (plus sûr : échoue si l'erreur type disparaît).
- **`grist-adapter.ts`** : `console.info` → `console.warn` sur les 2 logs de fallback SQL endpoint (visibles dans la console navigateur).

Aucun changement de comportement.
