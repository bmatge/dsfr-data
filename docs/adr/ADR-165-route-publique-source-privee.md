# ADR-165 — Route publique de source : servir une table Grist privée sans exposer la clé

- **Statut** : proposé (2026-11-04)
- **Décideurs** : mainteneur dsfr-data
- **Contexte lié** : #148 (partage public, « PR2 » jamais construit), #316 (export expurgé des clés),
  #655 (`api-key-ref` + `window.DSFR_DATA_KEYS`), ADR-155 (relais cachable du site hôte)
- **Numéro provisoire** : 165 — le dernier ADR cité dans le dépôt est le 164 ; à renuméroter à
  l'enregistrement dans le vault.

## Contexte

Un usager déclare dans Sources un document Grist **non public** avec sa clé d'API. L'app Sources
affiche la table (elle ajoute `Authorization: Bearer <clé>` à chaque appel), le Builder charge les
champs, mais l'aperçu du graphique dit que les données ne sont pas accessibles. Normal : le code
généré en « chargement dynamique » est une `dsfr-data-source url="https://grist…/records"
proxy-url="…" transform="records"` **sans en-tête** (`apps/builder/src/ui/code-generator.ts`,
`generateDynamicCode`), et l'aperçu rend ce code tel quel dans une iframe. Le Builder affiche déjà
une alerte « Ce document Grist n'est pas public. Le code généré ne fonctionnera que si le document
est rendu public », sans distinguer le cas où une clé est enregistrée.

Le dépôt a une doctrine constante : **aucun secret n'entre dans un code produit**. L'export JSON de
Sources et Favoris expurge `apiKey` et les en-têtes sensibles (#316). L'export HTML du tableau de
bord refuse d'émettre une source à en-tête ou à clé et la garde en données intégrées
(`packages/shared/src/dashboard/export-html.ts`, `besoinDeSecret`). La passation Playground →
Studio refuse une source à clé (`sourceNonTransmise: 'cle'`). Le serveur refuse le partage public
d'un favori dont la source porte une connexion ou une clé, « jusqu'à ce que le travail sur le proxy
arrive » (`server/src/routes/shares.ts`, `favoriteNeedsPrivateProxy`, #148 PR2).

Deux mécanismes existent pour qu'une clé **ne quitte pas** le navigateur ou le serveur :

| Mécanisme | Qui configure | Clé où | Adapté au cas |
| --- | --- | --- | --- |
| `api-key-ref` + `window.DSFR_DATA_KEYS` (#655) | L'intégrateur, dans sa page | La page hôte, lisible par tout visiteur | Page interne seulement |
| Relais ADR-155 (`relay-url`, `docs/RELAY.md` §3) | L'opérateur du site hôte, fichier de configuration, préfixes de chemin obligatoires avec une clé | Le relais | Sites avec équipe web ; pas du libre-service |

Aucun des deux ne sert l'agent seul, sans équipe web, qui veut publier un graphique sur une table
Grist privée depuis l'instance.

## Ce que l'on refuse d'emblée

**Un attribut de plus sur `use-proxy` qui désignerait une clé stockée.** `use-proxy` passe par
`/cors-proxy`, dont la cible est **libre**, lue dans l'en-tête `X-Target-URL`. Si le serveur y
ajoutait une clé sur la foi d'une référence écrite dans le HTML, quiconque lit la page pourrait
rejouer la référence avec une autre URL et lire **tout ce que la clé sait lire**. Une clé Grist est
personnelle et couvre le compte entier (tous les documents). Règle qui en découle, reprise de
C-SSRF-5 et §3 du relais : **le serveur n'associe jamais une clé à une URL choisie par le client**.
L'association clé + URL est fixée côté serveur, à la publication.

## Décision

En **mode serveur** seulement, l'instance expose une **route publique de source**, liée à une source
précise, publiée explicitement par son propriétaire, révocable.

### 1. Publication explicite, dans Sources

Sur une source Grist (ou toute source à connexion authentifiée), une action **« Publier cette
table »** crée un partage de type `public` sur la ressource `source`, dans la table `shares` existante
(jeton aléatoire, révocable depuis la même interface, journalisé dans `audit_log` : publication et
révocation). Le dialogue dit, avant confirmation :

> Quiconque a le lien pourra lire **cette table**, même si le document Grist est privé. Votre clé
> reste sur le serveur. Vous pouvez révoquer le lien à tout moment.

### 2. La route

```
GET /api/public/sources/<jeton>/records
```

- Résout le jeton → la source → sa connexion → déchiffre la clé (déjà AES-256-GCM,
  `server/src/routes/connections.ts`).
- Appelle **la seule URL liée à la source** : document et table fixés à la publication
  (`https://<hôte Grist>/api/docs/<doc>/tables/<table>/records`). Aucun paramètre du client n'est
  transmis à l'amont, hormis une liste fermée (`limit`, `sort`, le `filter` Grist encodé) si la
  pagination serveur est voulue ; au lot 1, **aucun** : la route rend la table.
- Méthode `GET` seule ; pas de mode SQL Grist (il passe en POST et accepte une requête libre).
- Réponse : le JSON Grist tel quel (`{ records: [{ id, fields }] }`), pour que `transform="records"`
  et l'aplatissement `fields` du mode URL (#1136) s'appliquent sans changement.
- `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=300` (réglable par source),
  cache côté serveur sur le jeton, limite de débit par adresse (mêmes ordres de grandeur que
  `/cors-proxy`), `Vary` vide.
- 404 pour un jeton inconnu **ou révoqué** (indistincts), 403 si l'amont répond 401/403 (clé
  refusée), 502 sur toute autre panne amont. La clé et les en-têtes du visiteur ne figurent dans
  aucune réponse, aucun journal (C-FUITE-1 et C-FUITE-2 du relais).

Même route en version **authentifiée**, pour l'aperçu : `GET /api/sources/<id>/records` avec le
cookie de session, mêmes règles, réservée au propriétaire ou à un partage `user`/`group`.

### 3. Le code généré

Le Builder, pour une source publiée, émet :

```html
<dsfr-data-source id="chart-data"
  url="https://<instance>/api/public/sources/<jeton>/records"
  transform="records"></dsfr-data-source>
```

Mode URL nue de `dsfr-data-source` : **aucun changement dans la bibliothèque**, plus de `proxy-url`
(la route est CORS-ouverte), et le code copié fonctionne tel quel hors de l'instance. Le commentaire
en tête dit que la table est servie par l'instance et que le lien est révocable depuis Sources.

Tant que la source n'est pas publiée, l'aperçu passe par la route authentifiée (l'iframe `srcdoc`
partage l'origine et le cookie) et le panneau de code porte une alerte : « Publiez la source dans
Sources pour obtenir un code utilisable hors de votre session ». Le même mécanisme vaut pour le
Studio IA et l'export HTML du tableau de bord (`generateSourceHTML`), qui cessent d'embarquer les
données pour une source publiée.

### 4. L'alerte du Builder passe à trois états

- document public : rien ;
- non public, clé enregistrée, source non publiée : « L'aperçu utilise votre clé enregistrée. Publiez
  la source pour que le code généré fonctionne hors de votre session » ;
- non public, sans clé : le message actuel.

### 5. Mode statique

Sans serveur, rien de tout cela n'existe. Le repli reste : données intégrées, ou `api-key-ref` avec
registre `window.DSFR_DATA_KEYS` fourni par la page hôte (l'aperçu peut injecter le registre dans
son `srcdoc` seulement, jamais dans le panneau de code). Ce repli n'est pas l'objet de cet ADR.

## Conséquences

**Positives**

- L'agent seul publie un graphique sur une table Grist privée sans écrire une ligne et sans que sa
  clé quitte le serveur.
- Débloque #148 PR2 : un favori à source privée devient partageable publiquement dès que sa source
  est publiée (`favoriteNeedsPrivateProxy` teste alors la publication de la source, pas la présence
  d'une clé).
- Zéro changement dans la bibliothèque publiée ; le relais ADR-155 reste la voie des sites hôtes
  avec cache et équipe web, les deux coexistent.

**Négatives et risques assumés**

- **Quiconque a le lien lit la table.** C'est le contrat du lien public des favoris ; il doit être
  dit au moment de publier, avec la révocation à côté.
- **L'instance devient un point de service public** pour chaque table publiée : quota Grist consommé
  par les visiteurs des sites tiers. Cache et limite de débit sont obligatoires, pas optionnels ;
  un plafond d'instance (nombre de sources publiées par usager, réglable) est prévu.
- **La clé reste personnelle.** Si l'usager la régénère, tous ses widgets publiés tombent. Le
  dialogue de publication recommande une clé dédiée, en lecture seule quand l'instance Grist le
  permet ; aucune vérification technique n'est possible côté dsfr-data.
- **Un jeton est une URL** : il circule dans le HTML des sites tiers, les journaux de leurs CDN, les
  favoris des navigateurs. La révocation est la seule parade ; la rotation (nouveau jeton, ancien
  invalide) est offerte dans la même interface.
- Dépendance de disponibilité : le widget publié dépend de l'instance, comme déjà avec `proxy-url`.

## Alternatives écartées

1. **Inliner la clé dans le code généré** (`headers='{"Authorization":"Bearer …"}'`), même derrière
   une confirmation « Copier avec la clé » : contredit #316, #655 et l'export HTML ; une page
   publique rend la clé lisible à chaque visiteur, avec les droits du compte entier.
2. **Attribut de clé sur `use-proxy` / `/cors-proxy`** : proxy ouvert authentifié, voir plus haut.
3. **Relais ADR-155 seul** : juste pour un site hôte outillé ; demande un fichier de configuration
   par hôte et par clé, hors de portée de l'agent seul.
4. **Rendre le document Grist public** : c'est le conseil actuel du Builder ; il expose le document
   entier, toutes tables et toutes colonnes, là où la route n'expose qu'une table choisie.

## Plan de mise en œuvre (lot 1)

1. Serveur : route publique et route authentifiée, liaison à `shares`, audit, cache, limite de
   débit ; tests `tests/server/` (jeton révoqué → 404, clé jamais dans la réponse ni le journal,
   URL amont fixe quelle que soit la requête, méthode non GET → 405).
2. Sources : action « Publier cette table », dialogue, révocation et rotation, compteur de sources
   publiées.
3. Builder : générateur (`generateDynamicCode`) et alerte à trois états ; aperçu par la route
   authentifiée.
4. Studio IA et export HTML : source publiée → `url` de la route au lieu des données intégrées.
5. `favoriteNeedsPrivateProxy` → « source non publiée ».
6. Docs : `docs/DEPLOYMENT.md` (variables de plafond et de cache), `docs/SECURITY.md` (surface
   exposée), guide utilisateur, spec de `dsfr-data-source` (section Sécurité : la route comme voie
   recommandée en mode serveur).
7. Changeset `minor` côté apps ; aucun côté `packages/core`.

Hors lot 1 : pagination serveur à travers la route (liste fermée de paramètres), autres fournisseurs
à clé (Opendatasoft privé, API générique à en-tête), publication d'une **vue** (colonnes ou filtre
restreints) plutôt que de la table entière.
