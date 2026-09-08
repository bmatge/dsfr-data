---
'dsfr-data': patch
---

Les données embarquées dans un attribut survivent aux apostrophes françaises.

`JSON.stringify` échappe les guillemets doubles, jamais les simples : une étiquette
ordinaire (« Provence-Alpes-Côte d'Azur », « Val-d'Oise », « Côte-d'Or ») fermait
l'attribut à la première apostrophe. Le composant ne recevait qu'un fragment tronqué
et n'affichait rien, sans message.

Le motif était écrit à sept endroits avec cinq échappements différents. Trois
fonctions partagées les remplacent, une par contexte :

- `singleQuoteAttr` — chaîne déjà sérialisée dans un attribut à guillemets simples ;
- `jsonAttr` — la même, à partir de la valeur ;
- `jsStringLiteral` — littéral JavaScript pour un `<script>` généré.

La distinction n'est pas cosmétique : poser une entité HTML en contexte JS produit
un défaut *visible* plutôt qu'une balise cassée. `el.setAttribute('name', '&#039;')`
affichait littéralement « Val-d&#039;Oise » dans la légende, `setAttribute` ne
décodant pas les entités.

Les deux échappements les plus répandus omettaient aussi l'esperluette : un `&amp;`
présent dans la donnée était redécodé en `&` à la lecture de l'attribut.
