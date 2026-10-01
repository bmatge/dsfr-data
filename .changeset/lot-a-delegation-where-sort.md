---
'dsfr-data': patch
---

`dsfr-data-query` : le `where` reste délégué à l'API quand la page est régénérée par `innerHTML` (Builder carto, « Générer »). Chrome connecte les nouvelles instances avant de déconnecter les anciennes : la query homonyme encore inscrite faisait passer la chaîne pour partagée (filtre appliqué côté client sur les seules lignes chargées, « aucune donnée » sur un gros jeu), puis effaçait en partant la clause que la nouvelle venait de poser. Un élément détaché n'est plus compté comme lecteur, une query détachée ne renégocie plus, et la libération au départ vise l'instance de source réellement déléguée (#1164).

`dsfr-data-list` : en `server-sort`, le tri initial (`sort`) est transmis à l'API dès la première requête, au lieu de n'être envoyé qu'au clic sur un en-tête — la flèche annonçait un tri que les lignes ne suivaient pas (#1178).
