---
'dsfr-data': patch
---

**L'avertissement « source partagée » n'est plus ré-émis une fois par voisin (#900).** Sur une page portant le motif « une query par ligne » — N `dsfr-data-query` sur une même source, gabarit de `dsfr-data-display` —, l'avertissement de #765 partait en O(N²) : sa déduplication comparait une signature `source|liste des lecteurs`, et cette liste s'allonge d'un élément à chaque lecteur qui s'inscrit, donc chaque query repartait pour un avertissement par voisin arrivé après elle. Mesuré en navigateur réel, bundle de production, 119 queries sur une source en ligne : **7 139 `console.warn` au premier rendu, 119 après** — un par query, ce que l'avertissement a toujours voulu dire. Il n'est ni supprimé ni conditionné à un seuil : la déduplication porte désormais sur la source, la liste des lecteurs restant un détail du message.

**Une chaîne déjà reconnue partagée ne se renégocie plus à chaque lecteur (#900).** L'arrivée d'un lecteur de plus sur une chaîne partagée, pour une query qui ne délègue déjà plus rien, ne peut changer aucune décision : le partage ne se défait pas, et il n'y a plus d'overlay à libérer. La renégociation relisait pourtant toute la chaîne et rediffusait `dsfr-data-delegation-contested` à tous les voisins, là encore en O(N²). Le maillon rehaussé après coup (#855) et la query qui délègue encore un `where` continuent de renégocier.
