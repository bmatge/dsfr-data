---
'dsfr-data': patch
---

Contrôleur de pagination partagé entre `dsfr-data-list` et `dsfr-data-display` (#304) — ~150 lignes dupliquées avec dérives remplacées par un module unique. Corrigés : `?page=3` est respecté dans les deux modes (la page restaurée depuis l'URL était écrasée par le reset à 1 à l'arrivée des données en pagination cliente) ; le tri serveur revient page 1, dans la même commande que l'orderBy (trier en page 5 affichait la page 5 du nouveau tri) ; en pagination serveur, recherche et filtres **locaux** sont désactivés avec un warning explicite (ils n'opéraient que sur la page chargée — compteurs faux, options de filtre partielles ; utilisez `dsfr-data-search`/`dsfr-data-facets` server-side) ; `$index`/`$uid` exacts en pagination serveur (offset calculé avec la taille de page serveur) ; la pagination serveur s'affiche même sans attribut `pagination` redondant ; ids DOM préfixés par instance (deux listes/displays sur une page n'ont plus d'ids dupliqués — a11y).
