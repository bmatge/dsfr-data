---
'dsfr-data': minor
---

**`lazy` sur `dsfr-data-source` : différer la première requête jusqu'à ce que quelqu'un regarde** (#931, AM-083). Une page à onglets déclare ses sources pour **tous** les panneaux ; cinq sur six sont fermés à l'arrivée, et pourtant toutes les requêtes partent au chargement. Sur un portail dont le quota anonyme est de 5 000 requêtes par jour et par IP, quelques dizaines de chargements suffisent à épuiser la journée. Avec `lazy`, la première requête attend qu'un consommateur de la source entre dans une marge de 200 px autour du viewport (`IntersectionObserver`, la même marge que `dsfr-data-map` et que le `lazy` de `dsfr-data-repeat`, #891 — même nom, même grammaire booléenne, pour la même raison).

**Mesure** (fixture `e2e/source-lazy.html` : six onglets, huit sources chacun, 48 sources ; Chromium, le même document mesuré deux fois, l'attribut retiré à la volée pour la référence) : **48 requêtes au repos sans l'attribut, 6 avec**. 12 après ouverture d'un second onglet, 38 après avoir ouvert les six et défilé le dernier. Un panneau fermé est en `display:none` : il n'a pas de boîte, il n'intersecte jamais, et l'observateur se déclenche à l'ouverture de l'onglet.

**Ce qui est observé** : les **feuilles** de la chaîne aval (chart, list, kpi, display, podium, a11y, repeat ; pour une couche de carte, la carte qui la porte), suivies à travers les transformateurs — un `dsfr-data-query` est un tuyau déclaré en haut de page, l'observer reviendrait à ne rien différer. **`lazy-target="<sélecteur CSS>"`** remplace cette détection quand elle ne peut pas voir le bon élément.

**Opt-in strict** : sans l'attribut, rien ne change. Et **toutes les dégradations vont du côté « on charge »** : sans `IntersectionObserver`, ou si la page ne déclare aucun consommateur (ou si `lazy-target` ne désigne rien), la source part immédiatement **et le dit en console** — une source qui ne chargerait jamais serait pire que le trafic qu'on cherche à éviter.

**Ce que `lazy` ne promet pas** : un `IntersectionObserver` n'est pas continu. Il échantillonne aux temps de rendu ; un défilement par crans rapides peut traverser un consommateur sans jamais le rapporter comme visible — la source reste alors en attente jusqu'au prochain passage. C'est le comportement du navigateur, pas un bug de la bibliothèque, et c'est écrit dans le guide.

Se cumule avec `require-where` : les deux portes doivent s'ouvrir, et `require-where` est évalué **en premier** (c'est son message d'attente que l'utilisateur doit lire). Pendant l'attente, la source publie `dsfr-data-idle` avec `reason: 'lazy'`, et le **volet Diagnostic distingue les deux attentes** — « en attente d'un regard (lazy) » et « en attente d'un filtre (require-where) » : les confondre enverrait chercher un filtre là où il suffit de faire défiler.
