---
'dsfr-data': patch
---

Grist en pagination serveur : chaque page montre enfin ses propres lignes, et un regroupement délégué n'arrive plus vide. INSEE Melodi : une observation revenue d'une page à l'autre est constatée et dite ([#1279](https://github.com/bmatge/dsfr-data/issues/1279)).

L'issue listait, par lecture du code, les chemins qui paginent sans ordre total. Chacun a été mesuré contre l'API réelle le 2026-10-13. La mesure n'a trouvé d'ordre instable nulle part — elle a trouvé deux défauts plus graves sur Grist.

**Ce qui est corrigé**

- **Grist, `server-side` : la page deux était la page un.** L'endpoint `/records` de Grist ne connaît pas `offset` : `limit=5&offset=5` rend les lignes 1 à 5, comme `limit=5`, sans erreur (mesuré sur grist.numerique.gouv.fr ; le source de grist-core ne lit que `sort` et `limit`). L'adaptateur demandait la page N par `limit` + `offset` : un tableau paginé au serveur affichait les lignes de la première page à **toutes** les pages, et le bouton « suivant » ne s'éteignait jamais. La page N est désormais demandée par `limit = N × page-size`, et la source n'en garde que la dernière tranche.
- **Grist, endpoint SQL : la réponse n'était pas lue.** Dès qu'une requête demande un `group-by`, un `aggregate` ou un filtre que `/records` ne sait pas faire (`gte`, `contains`, `isnull`…), l'adaptateur passe par l'endpoint SQL du document. L'API y rend des lignes `{ fields: {…} }` ; l'adaptateur attendait des lignes en tableaux et une liste `columns` que l'API ne sert pas. Chaque ligne devenait un objet vide : un graphique ou un tableau en aval d'un regroupement délégué n'avait ni libellé ni valeur, et les facettes serveur d'une source Grist n'avaient aucune valeur.
- **Grist, endpoint SQL, `server-side`.** Le total d'une page était dit égal à son nombre de lignes : le tableau n'offrait jamais de page suivante. Il est désormais inconnu tant que la page est pleine, comme en mode `/records`. Et la page part sur un **ordre total** : le tri demandé, complété par l'identifiant de ligne de Grist (`id`) — ou, pour des groupes, par les colonnes du `group-by` que le tri ne nomme pas. Sans cela, des lignes à valeurs égales pouvaient changer de page d'une requête à l'autre.

**Ce qui change pour une page existante**

- **Un tableau Grist en `server-side` change de contenu à chaque page** : c'est le correctif.
- **La page N d'une source Grist en `server-side` coûte N pages de transfert** (mode `/records`) : l'API n'a pas de décalage. Garder un `page-size` raisonnable, ou retirer `server-side` — Grist rend toute la table en une requête.
- **Un tri paginé sur Grist porte `id` en dernière clé** (`sort=-population,id`). L'ordre des lignes à valeurs égales est celui de leur identifiant, le même par `/records` et par SQL.
- **Rien ne change** pour un chargement complet Grist (une requête, ni tri ni `limit` ajoutés), pour INSEE Melodi, Tabular et le mode URL : aucune de leurs requêtes n'est modifiée.

**INSEE Melodi : constater, faute de pouvoir ordonner**

L'API pagine par numéro de page et n'offre aucun paramètre de tri (`sort=` et `order_by=` sont refusés, `orderBy=` est accepté sans effet, la documentation n'en nomme pas). Son ordre a été mesuré stable : 1 678 observations distinctes sur 1 678, cinq passages, par pages de 1 000 comme de 200. Rien ne le garantit, et la source ne peut pas l'imposer. Au-delà d'une page, elle vérifie donc après coup qu'aucune observation — identifiée par ses dimensions — n'est revenue sur une autre page. Si c'est le cas, un avertissement console dit combien, et le volet Diagnostic affiche « lignes revenues d'une page à l'autre » (nouvelle réserve `repeated-rows`) : autant d'observations manquent, alors que le compte reste juste. Aucune requête de plus ; rien sur un chargement d'une page.

**Mode URL `paginate`**

La source ne connaît ni l'API ni un identifiant de ligne, et ne lit qu'une page : elle ne peut rien garantir ni rien détecter sans crier au loup. La documentation de l'attribut le dit — le tri total est à écrire dans l'URL.

**Tabular sans tri : laissé tel quel, et pourquoi**

L'ordre par défaut des lignes est celui de l'identifiant de ligne, et il est posé par le code de l'API (`order=__id.asc` ajouté à toute requête sans tri ni agrégat, source d'api-tabular) : demander `__id__sort=asc` n'apporterait rien et changerait toutes les URL sans tri.

**Ce qui reste**

- Tabular, **groupes** paginés sans tri (plus de 200 groupes) : l'API ne pose alors aucun ordre. Mesuré stable (1 818 groupes en dix pages, tous distincts, deux passages), non garanti.
- Grist par SQL : `SELECT *` rend `id` et `manualSort` avec les colonnes de la table, ce que `/records` ne fait pas — une page filtrée par un opérateur avancé porte deux colonnes de plus.
- INSEE Melodi en `server-side` : la source ne voit qu'une page et ne constate rien.
