---
'dsfr-data': patch
---

fix(export, adapter-ods) : un KPI de tableau de bord fait calculer son chiffre par le serveur, sur tout le jeu

Dans un tableau de bord exporté (Studio ou app Tableau de bord), un KPI lisait la source partagée,
qui charge ses lignes par pages jusqu'au plafond `max-records` (1 000 par défaut). Il comptait ou
sommait donc au plus 1 000 lignes. Mesuré dans un navigateur sur le jeu plan-de-relance : **1 000**
projets au lieu de 3 080. Le défaut était masqué jusqu'ici par celui de #765.

- **Opendatasoft** : un KPI (comptage, somme, moyenne, minimum, maximum) reçoit sa propre source,
  qui fait calculer l'agrégat par le serveur (`select="sum(montant) as montant__sum"`), avec son
  filtre propre traduit en ODSQL. Le chiffre porte sur le jeu entier et suit les filtres partagés
  du tableau de bord.
- **Tabular** : un KPI de comptage lit le total annoncé par l'API (`meta:total`).
- Une source partagée dont plus aucun widget ne lit les lignes n'est plus chargée pour rien.
- **Adaptateur Opendatasoft** : un `select` fait uniquement d'agrégats, sans `group-by`, part en
  **une** requête d'une ligne. L'API répète la valeur agrégée sur chaque ligne du jeu, et la
  pagination courait jusqu'au plafond pour des copies. Quand le filtre ne garde aucune ligne, un
  comptage vaut 0 et non « — ».

Vérifié en navigateur contre l'API réelle : KPI à 3 080, KPI filtré à 1 890 (identique à l'API),
0 pour un filtre sans correspondance, en 4 requêtes au lieu de 12.
