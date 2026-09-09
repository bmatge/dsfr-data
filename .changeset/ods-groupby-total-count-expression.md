---
"dsfr-data": patch
---

OpenDataSoft : les agrégats `group-by` ne sont plus tronqués à la première page (l'API renvoie un `total_count` égal à la taille de page, désormais ignoré : toutes les pages sont lues, total inconnu) et une expression aliasée dans `group-by` (`year(date) as annee`) est transmise telle quelle au lieu d'être échappée en nom de champ (#641).
