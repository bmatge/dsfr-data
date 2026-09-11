---
'dsfr-data': patch
---

feat(context) : un filtre sur un champ absent de la source visée est nommé, au lieu d'un HTTP 400

Une facette ou un filtre de contexte posé sur une colonne que la source ne porte pas, typiquement
une colonne calculée en aval par un `compute`, était diffusé tel quel à l'API, qui répondait 400
sans dire ni quel filtre ni quelle colonne. Le contexte vérifie désormais le champ contre les
lignes des sources qu'il vise :

- **absent de toutes les sources visées** : erreur de configuration nommée (champ, sources,
  contexte, piste de correction) sur l'élément du filtre, et rien n'est diffusé ;
- **absent de certaines seulement** : ces sources sont exclues du filtre, avec un message console,
  et les autres sont filtrées normalement ;
- **schéma inconnu** (source pas encore chargée, ou colonnes restreintes par `select` / `group-by`,
  qui ne prouvent pas l'absence côté API) : le filtre part comme avant, et l'API répond. Pas
  d'attente qui risquerait de figer la page.

L'erreur se lève dès que le filtre est vidé.

Suite du commentaire du banc d'essai sur BUG-013 (#805).
