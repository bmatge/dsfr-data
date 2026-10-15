---
'dsfr-data': patch
---

Tabular : un regroupement délégué au serveur avec alias personnalisé (`aggregate="montant:sum:total"`) affiche de nouveau la valeur au lieu de « — ». L'API Tabular ne sait pas porter d'alias et nomme toujours la colonne `champ__fonction` ; l'adaptateur pose désormais l'alias de l'auteur sur les groupes reçus, en chargement complet comme en pagination serveur (#1320). Opendatasoft et Grist, qui portent l'alias dans leur requête, n'avaient pas le défaut : un contrôle de donnée le garde.
