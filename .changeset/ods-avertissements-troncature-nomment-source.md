---
'dsfr-data': patch
---

Les avertissements de troncature d'Opendatasoft nomment `dsfr-data-source` : pagination incomplète, plafond atteint sur un `group-by` et export JSON tronqué citent désormais « l'attribut max-records de dsfr-data-source », comme l'adaptateur Tabular (#1027). Les messages existaient mais ne nommaient aucun composant : un lecteur ne savait pas quel réglage relever, et la vérification des données les écartait. Résout le constat AM-002 du banc d'essai pour la part troncature silencieuse (#1032).
