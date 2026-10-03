---
'dsfr-data': patch
---

Carte : un encart (`dsfr-data-map-inset`) ne trace plus que les entités de son emprise, une seule fois, et les remplace à chaque nouvelle donnée — résout le constat BUG-034 du banc d'essai (#1229).

**Le doublon.** Un encart porte sa propre `dsfr-data-map`, avec un clone de chaque couche de la carte hôte. La carte hôte cherchait ses couches par un `querySelectorAll` qui descendait dans ses encarts : à son initialisation, elle redisait « la carte est prête » aux couches clonées des encarts déjà initialisés, et la couche refaisait alors son groupe Leaflet sans retirer le précédent. Le groupe orphelin gardait ses entités, et plus aucun rendu ne le vidait : 8 cercles pour 4 lignes, puis 6 pour 2 après un filtre. L'ordre d'initialisation des cartes dépend de la reprise après le chargement de Leaflet — d'où un défaut intermittent, sur des encarts qui changeaient d'un essai à l'autre. La carte ne notifie plus que ses propres couches, et une couche rappelée sur une carte où elle est déjà branchée ne refait rien.

**Le coût.** La couche d'un encart reçoit les mêmes lignes que celle de la carte hôte (aucune requête de plus : c'était déjà le cas, et c'est désormais contrôlé), mais ne trace que celles de son cadre, élargi de la taille des symboles pour qu'un cercle à cheval sur le bord reste dessiné. Classes de couleur, rayons proportionnels, intensités de chaleur et plafond `max-items` restent calculés sur le jeu entier : un même enregistrement a la même apparence dans l'encart et sur la carte principale. Un encart redimensionné (palier de `width`, plein écran) retrace sa nouvelle emprise.

Mesures sur 7 250 points, Chromium sans tête, médiane de vingt rafraîchissements après un filtre (`e2e/map-insets-perf.html`) :

| Encarts | Entités posées dans les encarts, avant | après | Cercles, avant | après | Marqueurs, avant | après |
|---|---|---|---|---|---|---|
| 0 | — | — | 44 ms | 57 ms | 227 ms | 228 ms |
| 5 (`insets="drom"`) | 36 250 (7 250 par encart) | 363 | 227 ms | 70 ms | 1 361 ms | 247 ms |
| 9 | 65 250 | 363 | 367 ms | 61 ms | 2 435 ms | 260 ms |

Le temps de rafraîchissement ne croît plus avec le nombre d'encarts (l'écart restant est celui d'une mesure à l'autre). Une requête réseau pour la source dans les trois cas, avant comme après. Sur la page minimale du banc (4 points, cinq encarts), cinq essais : des encarts doublés à chaque essai avant, aucun après.

Dans le même mouvement, trois défauts du même emboîtement de cartes :

- la description de la carte lue par les lecteurs d'écran comptait les couches des encarts (« 4 cercles, 4 cercles, 4 cercles… ») : elle compte les couches de la carte, une fois ; celle d'un encart compte ce qu'il montre ;
- une couche en `bbox`, clonée dans un encart, poussait à la source la zone visible de l'encart sous la même clé que la couche d'origine : la carte principale se retrouvait filtrée sur le dernier encart prêt. Un encart ne commande plus la source — avec `bbox`, il ne montre donc que ce que la zone visible de la carte principale a chargé ;
- une `dsfr-data-map-timeline` désignant ses couches par `for` ne pilotait pas leurs clones, qui restaient sur le jeu entier ; et une couche prête après le premier pas (timeline prête avant la carte) traçait tout au lieu du pas courant. Les encarts suivent maintenant le pas de la carte principale.

Méthode ajoutée sur `dsfr-data-map-layer` : `getTimelineFrame()` (indice du pas affiché, `-1` quand la couche montre tout).
