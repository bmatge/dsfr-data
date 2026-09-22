---
'dsfr-data': minor
---

L'analyse statique du balisage (`lintMarkup`, dans l'outil MCP `diagnose_widget_code`) couvre maintenant les cartes (#995). Elle signale les pannes muettes visibles sans exécuter la page. Pour `dsfr-data-map-layer` : une couche placée hors de `<dsfr-data-map>`, un `lat-field` sans `lon-field` (et l'inverse), un `type="geoshape"` sans `geo-field` et un `max-items` qui n'est pas un nombre. Pour `dsfr-data-map-popup` : une popup hors de la carte, un `mode` inconnu et un `for` qui ne désigne aucune couche.

Trois cas sont des avertissements, parce que la page peut quand même marcher :
- une couche sans `lat-field`/`lon-field` ni `geo-field`, qui ne devine que `geo_point_2d`, `geopoint` et `geo_point` ;
- un `max-items` nul ou négatif, qui désactive le plafond ;
- une popup ou une infobulle sur une couche qui n'en branche pas (`geoshape` ou `circle` en `no-interactive`, `heatmap`).

Chacun de ces constats porte un code de règle stable dans le nouveau champ optionnel `regle` de `LintFinding` (`carte/lat-sans-lon`, `carte/couche-hors-carte`, etc.). `lireBalises` rend désormais aussi, pour chaque balise, les balises `dsfr-data-*` ouvertes autour d'elle (`parents`).
