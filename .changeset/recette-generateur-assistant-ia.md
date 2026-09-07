---
'dsfr-data': patch
---

Les données embarquées dans un attribut `data='…'` survivent aux apostrophes.

`JSON.stringify` échappe les guillemets doubles, jamais les simples : une étiquette
française ordinaire (« Provence-Alpes-Côte d'Azur », « Val-d'Oise », « Côte-d'Or »)
fermait l'attribut à la première apostrophe. Le composant ne recevait qu'un fragment
tronqué et n'affichait rien, sans message.

Le motif était écrit à six endroits avec quatre échappements différents. Un helper
unique, `jsonAttr`, les remplace tous — il couvre aussi l'esperluette, dont l'absence
faisait redécoder un `&amp;` présent dans la donnée.
