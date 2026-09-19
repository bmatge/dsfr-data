---
'dsfr-data': minor
---

**`count-label` sur `dsfr-data-display` et `dsfr-data-list`** (#925, AM-077). Les deux afficheurs comptaient « résultat », mot qui ne dit rien d'un annuaire d'établissements ni d'un palmarès de communes ; `dsfr-data-search` avait reçu le libellé paramétrable en 0.29 (#779), pas ses deux voisins. Même grammaire que la recherche, et une seule implémentation pour les trois (`utils/count-label.ts`) : `count-label="établissement"` rend « 12 345 établissements », une forme seule prend un « s » au pluriel, et deux formes séparées par une **barre verticale** couvrent le pluriel irrégulier ou le mot invariable (`"cheval|chevaux"`, `"prix|prix"`). La virgule ne sépare pas les deux formes.

Poser l'attribut fait aussi passer le nombre par le **formateur fr-FR** : « 1 234 » et non « 1234 ». C'est le seul moyen, aujourd'hui, d'obtenir sur `display` un compteur accentué et séparé — `count-label="résultat"` rend « 12 345 résultats ».

**Rien ne change sans l'attribut** : `display` rend « 1234 resultats » et `list` « 1234 résultats » exactement comme avant, au caractère près (verrouillé par test). Corriger ces deux libellés par défaut toucherait le texte rendu de toute page qui utilise les composants — c'est le point résiduel de #925, laissé ouvert.

`count-label` ne sait pas **taire** le compteur : une liste de résultats annonce ce qu'elle compte, et sa région live fait partie de son contrat (ADR-135, qui ferme `display` aux besoins structurels). Mettre en forme une ligne sans landmark ni compteur — une fiche, un nom dans une phrase — c'est `dsfr-data-repeat`.
