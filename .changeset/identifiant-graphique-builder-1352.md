---
'dsfr-data': minor
---

Builder : un identifiant par graphique, accolé à tous les id du code généré (#1352, retour usager). Le code du Builder portait des id figés (`chart`, `chart-src`, `query-data`…) : deux extraits collés sur une même page se marchaient dessus, et le second graphique recevait les données du premier. Un champ « Identifiant » (section Apparence), prérempli à chaque nouvelle configuration et modifiable, est désormais accolé à chaque id déclaré et à chaque référence (`chart--a7f3`, `chart-src--a7f3`, `source="chart-src--a7f3"`, `databox-id`, ancres, scripts). Un favori garde son identifiant ; un favori antérieur en reçoit un à l'ouverture. Conséquence : un graphique regénéré ne porte plus `id="chart"` ; les pages qui ciblaient ces id en dur sont à ajuster. La fonction partagée `scopeFavoriteIds` (export du tableau de bord) couvre aussi `databox-id`, et la skill « Patterns de composition » porte la convention pour les modèles qui écrivent le code via le serveur MCP.
