---
"dsfr-data": minor
---

Nouvel attribut `require-where` sur `dsfr-data-source` et `dsfr-data-query` : sur une page d'exploration, plus aucune requête n'est lancée tant que l'utilisateur n'a posé aucun filtre, et retirer le dernier filtre y ramène (jamais de requête « tout »). Les afficheurs rendent alors un message DSFR paramétrable par `idle-message` (défaut « Choisissez un filtre pour afficher les données »), distinct de « aucune donnée » et du chargement ; l'attente est visible dans le volet Diagnostic et sur le bus via l'événement `dsfr-data-idle` (#690).
