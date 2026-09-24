---
'dsfr-data': minor
---

Studio IA et Tableau de bord : la carte d'un document sait afficher le clic dans un volet latéral ou une modale (`popupMode` : `popup`, `panel-right`, `panel-left`, `modal`, avec `popupTitleField`), poser un gabarit de popup (`popupTemplate`, « {nom} — {montant} € ») et regrouper les marqueurs proches (`cluster`, `clusterRadius`, couches marker seulement). L'export écrit un `<dsfr-data-map-popup for="…">` relié à la couche, avec un gabarit tiré des champs choisis ; le Tableau de bord conserve ces options. Le prompt du Studio tire désormais la liste des options de bloc du schéma de ses outils (les skills servent au sens des attributs, jamais à promettre une option), et un garde-fou bloquant (`npm run check:studio-couverture`) exige que chaque composant et attribut du manifeste soit écrit par le Studio ou exclu avec sa raison (#1109).
