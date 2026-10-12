---
'dsfr-data': patch
---

Pagination par décalage : plus de ligne en double ni de ligne perdue en silence sur Opendatasoft, et le tri d'un tableau paginé au serveur devient stable sur Tabular ([#1274](https://github.com/bmatge/dsfr-data/issues/1274), [#1233](https://github.com/bmatge/dsfr-data/issues/1233)).

**Ce qui est corrigé**

- **Opendatasoft, plus de 100 lignes.** L'adaptateur paginait par `limit` / `offset` sans `order_by`, et l'API ne garantit alors aucun ordre d'une page à l'autre : des lignes revenaient deux fois, d'autres jamais, pour un compte juste (jeu `dgfip-taux-de-change`, Haïti : 321 lignes reçues, 297 distinctes ; un tableau annonçait 162 taux là où il y en a 154). Le défaut est intermittent, donc invisible à une recette ponctuelle. Dès qu'un chargement dépasse une page, la source relit le jeu sur un **ordre total** : le tri demandé, inchangé et en tête, complété de toutes les colonnes triables du jeu (texte, nombre, date, booléen), lues une fois dans ses métadonnées. Vaut pour un chargement complet, pour un chargement coupé par `limit` ou `max-records`, et pour chaque page d'une source en `server-side`. Des groupes triés (`group-by` + `order-by`) sont départagés par les autres clés du regroupement.
- **Tabular en `server-side`.** Un tri sur une clé non unique y restait instable d'une page à l'autre. Il reçoit la clé de départage déjà posée sur les chargements tronqués (l'identifiant de ligne, dans la valeur du tri). Cela complète la résolution du constat PG-033 du banc d'essai.

**Ce qui change pour une page existante**

- **L'ordre des lignes, sur Opendatasoft, au-delà d'une page et sans `order-by`.** Elles arrivaient dans l'ordre de l'API, arbitraire ; elles arrivent triées sur les colonnes du jeu, dans l'ordre de ses champs. Sont concernés : un tableau ou une liste sans tri, un cumul (`running_sum`, `diff`) calculé sans `order-by`, les lignes retenues par un plafond (les premières de cet ordre, et non plus des lignes quelconques), l'ordre des pages d'une source en `server-side` non triée. Pour un ordre précis, poser `order-by`. Avec un `order-by`, seul l'ordre des ex-æquo change.
- **Deux requêtes de plus** par chargement Opendatasoft de plus d'une page : la première page, qui sert de sonde et est relue, et les métadonnées du jeu (une fois par jeu). En `server-side`, une requête de plus par jeu.
- **Un temps de réponse plus long sur un très gros jeu sans filtre** : le tri de départage coûte quelques secondes à la première page d'un jeu de plus d'un million de lignes (mesuré : 5,5 s à froid, 0,7 s ensuite, contre 0,2 s sans tri). Rien de mesurable sur un jeu filtré.
- **Rien ne change** pour un chargement d'une seule page (100 lignes ou moins : ni tri ajouté, ni requête de plus), pour `fetch-mode="export"`, pour une requête regroupée sans tri, et sur Tabular sans `order-by`.

**Si l'API refuse la clé de départage**, ou si les colonnes du jeu ne peuvent pas être lues : la source charge comme avant, un avertissement console le dit une fois, et le volet Diagnostic affiche « pagination sans ordre garanti » (réserve `unstable-pagination`, Opendatasoft) ou « tri serveur instable » (réserve `unstable-sort`, Tabular). Poser alors un `order-by` sur une colonne unique, ou charger en une requête avec `fetch-mode="export"`.

**Ce qui reste**

- Sur Opendatasoft, deux lignes égales sur toutes les colonnes triables et distinctes seulement par une géométrie ou un fichier ne sont pas départagées.
- Sur Tabular, un chargement ou une pagination serveur **sans tri** s'appuie toujours sur l'ordre par défaut de l'API (celui de l'identifiant de ligne), mesuré stable mais non documenté.
- Grist en `server-side`, INSEE Melodi et le mode URL `paginate` paginent eux aussi sans ordre total imposé par la bibliothèque : non mesuré, suivi dans [#1279](https://github.com/bmatge/dsfr-data/issues/1279).
