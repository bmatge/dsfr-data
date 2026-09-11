---
'dsfr-data': minor
---

feat(query, normalize, templates) : l'écart avec la ligne précédente (`diff`), les champs multivalués nettoyés, et les gabarits imbriqués signalés

- **`diff`, inverse de `running_sum`** (#775). Les compteurs publiés déjà cumulés sont courants en
  open data institutionnel, et leur incrément est la seule question qui compte. `aggregate="cumul:diff"`
  ajoute la colonne `cumul__diff`, écart de chaque ligne avec la précédente, après `order-by`,
  jamais délégué, avec l'avertissement du cumul quand `order-by` manque. La première ligne vaut
  `null`, jamais 0 : un incrément inconnu n'est pas un incrément nul. Au passage, un agrégat cumulé
  peut porter sur la colonne produite par le précédent dans la même liste
  (`flux:running_sum, flux__running_sum:diff`).
- **`replace` et `replace-fields` sur un champ tableau** (#774). Un champ multivalué traversait
  intact, sans message, alors que ce sont justement les colonnes aux libellés hétérogènes. Il est
  désormais remplacé élément par élément, longueur conservée, sans dédoublonnage. Limite
  documentée : le remplacement s'exécute avant `split` et ne voit donc pas les tableaux qu'il
  fabrique.
- **Un bloc de gabarit imbriqué est signalé** (#769). L'imbrication reste non prise en charge,
  mais un `{{#each}}` placé dans un `{{#if}}` rendait un texte tronqué sans erreur, visible
  seulement en ouvrant l'infobulle. Un avertissement unique par gabarit nomme le composant et
  propose la forme à plat. Le rendu est inchangé.

Résout les constats AM-068, AM-071 et AM-072 du banc d'essai (#775, #774, #769).
