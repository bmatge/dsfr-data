---
'dsfr-data': patch
---

Un nom de colonne à apostrophe ne casse plus le script exporté.

Les noms de champs étaient interpolés dans des littéraux JavaScript à guillemets
simples des scripts générés — `label: '${valueField}'`, `d['${labelField}']`. Un
en-tête de colonne français ordinaire suffisait :

```js
const labels = data.map(d => d['Nombre d'habitants'] || 'N/A');
//                                        ^ la chaîne se ferme ici
```

Le générateur ne levait rien : le script mourait dans la page de l'utilisateur, sur
une `SyntaxError` qu'il ne pouvait rattacher à son choix de colonne. Une dizaine de
sites concernés dans les deux Builders.

`escape-html.ts` couvre désormais les quatre contextes, et la distinction entre eux
est le fond du sujet — une entité HTML posée en contexte JS produit un défaut
*visible* plutôt qu'une balise cassée :

| Contexte | Fonction |
|---|---|
| Attribut à guillemets simples, chaîne déjà sérialisée | `singleQuoteAttr` |
| Attribut à guillemets simples, depuis la valeur | `jsonAttr` |
| Valeur JSON dans un `<script>` | `jsonLiteral` |
| Littéral chaîne dans un `<script>` | `jsStringLiteral` |

`jsonLiteral` neutralise aussi `</script>` dans les données embarquées : le parseur
HTML cherche la séquence sans connaître la syntaxe JavaScript, et une cellule
contenant cette chaîne fermait le bloc. Corrigé également dans les widgets Grist.
