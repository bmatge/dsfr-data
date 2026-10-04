# Relais cachable par le site hôte — le contrat

> **Statut : lot 1 de l'ADR-155** ([#1232](https://github.com/bmatge/dsfr-data/issues/1232), constat AM-114 du banc d'essai).
> Ce document est le **contrat** qu'un relais doit respecter. Il est livré avec un relais Node de
> référence ([`proxy/relay/node/`](../proxy/relay/node/)) et une suite de conformance
> ([`tests/relay/`](../tests/relay/)) qu'un intégrateur lance contre son propre relais.
>
> **Pas encore livré** : l'attribut `relay-url` de `dsfr-data-source` et `window.DSFR_DATA_RELAY`
> (lot 2, bibliothèque), l'extrait nginx `proxy/relay/nginx/` et les renvois depuis
> `DEPLOYMENT.md`, `SECURITY.md` et `ARCHITECTURE.md` (lot 3). Tant que le lot 2 n'est pas publié,
> aucune version de la bibliothèque n'appelle un relais.

## 1. Ce que c'est, ce que ce n'est pas

Un site qui a du cache (Varnish, CDN, cache de son CMS) veut que les données d'une dataviz passent
par **son** domaine, sous une URL qui identifie la donnée. Le relais est la route qui le permet :
le navigateur demande `<relais>/<hôte>/<chemin>?<requête>` au site, le relais va chercher
`https://<hôte>/<chemin>?<requête>` et rend la réponse avec des en-têtes de cache.

Trois effets : le site sert les données depuis son cache ; le portail ne voit plus l'adresse des
visiteurs ; la clé d'API, s'il en faut une, quitte le navigateur.

**Le relais n'est pas un proxy ouvert et ne remplace pas `/cors-proxy`.** Ce sont deux contrats
différents, et ils le restent :

| | Relais (ce document) | `/cors-proxy` et routes `/…-proxy/` ([DEPLOYMENT.md](DEPLOYMENT.md)) |
|---|---|---|
| Cible | dans le chemin de l'URL | dans l'en-tête `X-Target-URL`, ou fixée par la route |
| Hôtes | liste blanche exacte, tenue par le relais | choisis par la route, ou par le client |
| Méthodes | GET, HEAD, OPTIONS | jusqu'à GET, POST, PUT, PATCH, DELETE |
| En-têtes du visiteur | aucun n'est transmis | transmis (`Authorization` compris) |
| Clé d'API | détenue par le relais | envoyée par le navigateur |
| Cache | oui, c'est sa raison d'être | non, ou 60 s sur les routes dédiées |

Rien n'est livré ni documenté pour un CMS en particulier : le contrat, le relais Node et, au lot 3,
l'extrait nginx suffisent à écrire un relais dans n'importe quel environnement.

## 2. Forme de l'URL

```
<relais>/<hôte>/<chemin>?<requête>
```

Avec un relais monté sur `/donnees-relais` :

```
/donnees-relais/donnees.portail.example/api/explore/v2.1/catalog/datasets/x/records?where=…&limit=100
```

est relayé vers `https://donnees.portail.example/api/explore/v2.1/catalog/datasets/x/records?where=…&limit=100`.

Les règles de réécriture sont appliquées **par la bibliothèque** (lot 2). Le relais n'en répare
aucune : ce qui n'arrive pas sous cette forme est refusé.

| Règle | Côté bibliothèque | Ce que le relais en déduit |
|---|---|---|
| **R1** | Cible `https` seulement, port par défaut, sans identifiants. Sinon : pas de réécriture, un avertissement. | Le segment d'hôte ne contient ni schéma, ni port, ni `@`. Tout autre segment est refusé. |
| **R2** | Hôte en minuscules (c'est ce que rend l'API `URL`). | L'hôte est comparé **octet pour octet** à la liste blanche. Majuscules et point final sont refusés, pas normalisés. |
| **R3** | Chemin et requête repris tels que l'adaptateur les a sérialisés : pas de réencodage, pas de tri des paramètres. Le fragment est retiré. | Chemin et requête sont transmis à l'amont **octet pour octet**. |
| **R4** | Même origine ou URL relative : jamais réécrite. | — |
| **R5** | GET seulement. Une requête POST (Grist en SQL) suit le chemin actuel, `proxy-url`. | Tout ce qui n'est pas GET, HEAD ou OPTIONS : 405. |

Deux visiteurs qui posent les mêmes filtres dans un ordre différent produisent deux URL, donc
deux entrées de cache : c'est voulu (trier les paramètres changerait un résultat, ADR-139).

## 3. La clé appartient au relais

Sur une requête relayée, la bibliothèque n'envoie aucun en-tête et aucun cookie. Si le portail
exige une clé, c'est le relais qui l'ajoute, par hôte, depuis sa configuration.

> **⚠️ Une clé confiée au relais rend public tout ce qu'elle sait lire sur l'hôte autorisé.**
>
> Le relais répond à n'importe qui, sans authentification, avec `Access-Control-Allow-Origin: *`.
> Toute URL de l'hôte que la clé sait lire devient donc lisible par tout le monde, depuis
> n'importe quel site, et mise en cache. Le relais ne sait pas distinguer la dataviz de votre page
> d'un inconnu qui construit l'URL à la main.
>
> D'où deux obligations, et le relais de référence refuse de démarrer sans la seconde :
>
> 1. **une clé en lecture seule**, dédiée au relais, au périmètre le plus étroit que le portail
>    sait délivrer ;
> 2. **une liste de préfixes de chemin autorisés** pour cet hôte : seuls les jeux destinés à être
>    publics sont relayés.
>
> Si la donnée ne doit pas être publique, elle ne passe pas par un relais.

## 4. Ce que le relais doit faire, et ne jamais faire

Chaque exigence porte un identifiant ; c'est celui que citent les tests (§10).

### La cible

| Règle | Exigence |
|---|---|
| **C-URL-1** | Le chemin et la requête sont transmis à l'amont octet pour octet : ni décodage, ni réencodage, ni tri, ni paramètre ajouté ou retiré. L'en-tête `Host` de l'amont est l'hôte de la cible. |
| **C-URL-2** | L'hôte est comparé octet pour octet. `DATA.exemple.fr` et `data.exemple.fr.` sont refusés (403). |
| **C-URL-3** | Une URL de relais (chemin et requête) est acceptée jusqu'à 8 000 caractères ; au-delà, 414. |
| **C-SSRF-1** | Liste blanche d'hôtes en **correspondance exacte** : ni joker, ni suffixe, ni sous-domaine implicite. Hôte hors liste : 403, sans contacter personne. |
| **C-SSRF-2** | Un hôte écrit comme une adresse IP est refusé, quelle que soit l'écriture : décimale pointée, entier décimal, hexadécimale, octale, IPv6 entre crochets, IPv4 mappée. Une adresse IP n'entre pas dans la liste blanche. |
| **C-SSRF-3** | Le segment d'hôte ne porte ni identifiants (`user:pass@`), ni port (même `:443`), ni schéma, ni caractère encodé. |
| **C-SSRF-4** | Le chemin ne contient ni `..`, ni `.`, ni `//`, ni barre oblique inverse, ni `%2e`, `%2f`, `%5c`, `%25` (double encodage), ni caractère de contrôle encodé. Le relais **refuse** (400). Un relais bâti sur un serveur qui normalise le chemin avant de router est conforme si la forme piégée n'atteint jamais l'amont et que le chemin normalisé reste sous un préfixe autorisé. |
| **C-SSRF-5** | Un hôte peut être restreint à des **préfixes de chemin**. Hors préfixe : 403. Un préfixe s'arrête à une frontière de segment (`/api/public` n'autorise pas `/api/public-prive`). Obligatoire dès qu'une clé est injectée (§3). |
| **C-SSRF-6** | Vers l'amont : `https`, port 443, certificat vérifié contre le nom. Le relais **résout lui-même** le nom, refuse si l'une des adresses est privée, de boucle locale, de lien local ou réservée — même pour un hôte autorisé —, puis se connecte **à l'adresse qu'il a vérifiée**, pas au nom (sinon un DNS qui change de réponse entre la vérification et la connexion fait passer une adresse privée). |
| **C-SSRF-7** | Une redirection de l'amont n'est jamais renvoyée au navigateur. Elle est suivie seulement si sa cible repasse **toutes** les règles ci-dessus (https, 443, sans identifiants, hôte de la liste, chemin sain et sous un préfixe autorisé de cet hôte, adresse publique), **trois fois au plus**. Sinon : 502. |

### Les méthodes

| Règle | Exigence |
|---|---|
| **C-MET-1** | GET, HEAD et OPTIONS. Tout le reste : 405 avec `Allow: GET, HEAD, OPTIONS`, sans contacter l'amont. |
| **C-MET-2** | Aucun corps de requête n'est transmis à l'amont. Le relais de référence refuse une requête qui en porte un (400). |
| **C-MET-3** | HEAD rend les en-têtes d'un GET, sans corps. OPTIONS est répondu par le relais (pré-vérification CORS), sans contacter l'amont, et n'autorise aucun en-tête de requête. |
| **C-INJ-1** | Aucun CR, LF ou NUL, nu ou encodé, ne produit d'en-tête ni de seconde requête chez l'amont. Le relais de référence refuse (400) : `%0d`, `%0a` et `%00` n'ont pas leur place dans une requête de données. |

### Les en-têtes

| Règle | Exigence |
|---|---|
| **C-AMONT-1** | Vers l'amont : `Host`, un `Accept` **fixé par le relais**, et la clé de l'hôte s'il en a une. **Rien de ce qu'envoie le visiteur** : jamais `Cookie`, `Authorization`, `Origin`, `Referer`, `User-Agent`, `Accept`, `Accept-Language`, `Range`, `If-None-Match`, ni son adresse (`X-Forwarded-For`, `X-Real-IP`, `Forwarded`). |
| **C-AMONT-2** | La clé d'un hôte n'est envoyée qu'à cet hôte. Une redirection vers un autre hôte ne l'emporte pas. |
| **C-NAV-1** | Vers le navigateur : type de contenu, `ETag`, `Last-Modified`. **Jamais** `Set-Cookie`, ni le `Vary`, le `Cache-Control`, les en-têtes CORS, de quota (`X-RateLimit-*`) ou de signature (`Server`, `X-Powered-By`) de l'amont. |
| **C-NAV-2** | Toute réponse, erreurs comprises, porte `X-Content-Type-Options: nosniff` et `Content-Security-Policy: default-src 'none'; sandbox`. |
| **C-NAV-3** | Types de contenu en liste blanche : `application/json`, `application/geo+json`, `text/csv`. Le relais répond sur l'origine du site : il n'y sert **jamais** de HTML, de SVG, de XML ni de script. Autre type, ou type absent : 502. |
| **C-NAV-4** | Toute réponse, erreurs comprises, porte `Access-Control-Allow-Origin: *`, et jamais `Access-Control-Allow-Credentials`. Sans l'en-tête CORS sur une erreur, le navigateur n'en voit qu'un `TypeError`, que la bibliothèque classe `reponse-bloquee` au lieu de la vraie cause. |
| **C-NAV-5** | `ETag` et `Last-Modified` de l'amont sont transmis tels quels, ou omis. |

### Le cache

| Règle | Exigence |
|---|---|
| **C-CACHE-1** | Une 200 porte `Cache-Control: public, max-age=<N>, s-maxage=<M>, stale-while-revalidate=<S>, stale-if-error=<E>` et `Vary: Accept-Encoding`. **Durée par défaut : 300 s, réglable par hôte.** |
| **C-CACHE-2** | La clé de cache est **l'URL seule** : hôte (en minuscules par C-URL-2), chemin et requête tels que reçus, sans fragment. **Aucun en-tête du visiteur n'influence la réponse** : ni `Range`, ni `If-None-Match`, ni `Accept`, ni `X-Forwarded-Host`, ni aucun autre. |
| **C-CACHE-3** | **Seules les 200 sont mises en cache.** Jamais une 4xx, une 429 ni une 5xx : toute erreur porte `Cache-Control: no-store`. « Réessayer » rejoue la même URL ; une erreur en cache rendrait le bouton inopérant. |
| **C-CACHE-4** | Si le relais a son propre cache, il est **à taille bornée** : un `where` aléatoire fabrique autant d'URL qu'on veut. |
| **C-CACHE-5** | Si l'amont tombe, le relais peut servir une réponse périmée pendant la fenêtre `stale-if-error`. Le relais de référence le fait. |

Fraîcheur : une donnée servie peut avoir l'âge de `s-maxage` plus la fenêtre `stale`. L'attribut
`cache-ttl` de `dsfr-data-source` n'a **aucun rapport** avec le relais : c'est un repli hors ligne,
côté navigateur, et il n'est pas transmis.

### Le déni de service et les fuites

| Règle | Exigence |
|---|---|
| **C-DOS-1** | Délai global vers l'amont (résolution, connexion, redirections et corps compris) : 10 s par défaut. Au terme : 504. |
| **C-DOS-2** | Taille de réponse plafonnée (10 Mo par défaut), **comptée en flux** : la connexion est coupée au premier octet de trop, pas après un téléchargement complet. Dépassement : 502. |
| **C-DOS-3** | Limite de débit **par adresse** : 429 avec `Retry-After`. L'adresse du visiteur ne sert qu'à cela. |
| **C-DOS-4** | Connexions entrantes et requêtes simultanées vers l'amont bornées. |
| **C-FUITE-1** | La clé ne figure dans aucune réponse, aucun message d'erreur. Rien de ce qu'envoie le visiteur n'y revient. |
| **C-FUITE-2** | Journaux : ni la clé, ni l'adresse du visiteur, ni ses en-têtes. Les URL contiennent ce que l'usager a tapé dans une recherche déléguée : la requête n'est journalisée que sur décision explicite, et la **durée de conservation est à fixer par l'intégrateur**. |
| **C-CONF-1** | Liste blanche vide : le relais **refuse de démarrer**. |

## 5. Les erreurs

Les erreurs du relais sont lues par le barème d'erreurs de source de la bibliothèque
(`classifySourceError`, `packages/core/src/utils/source-errors.ts`), qui décide du message montré
au visiteur et de la présence du bouton « Réessayer ». Le statut HTTP est donc le contrat.

| Situation | Statut du relais | Cause dans la bibliothèque |
|---|---|---|
| Hôte hors liste, adresse IP, port, identifiants | **403** | `acces-restreint` |
| Chemin hors des préfixes autorisés | **403** | `acces-restreint` |
| L'amont répond 401 ou 403 (clé du relais refusée) | **403** | `acces-restreint` |
| Chemin ou requête piégés, corps présent | **400** | `page-mal-reglee` |
| Méthode autre que GET, HEAD, OPTIONS | **405** | `page-mal-reglee` |
| URL de plus de 8 000 caractères | **414** | `page-mal-reglee` |
| L'amont répond une autre 4xx (400, 422…) | le même statut | `page-mal-reglee` |
| L'amont répond 404 ou 410 | **404** ou **410** | `donnees-introuvables` |
| Limite de débit du relais, ou l'amont répond 429 | **429** + `Retry-After` | `service-sollicite` |
| L'amont répond une 5xx, une redirection refusée, un type de contenu non autorisé, une réponse trop grosse, ou reste injoignable | **502** | `service-indisponible` |
| Relais saturé | **503** + `Retry-After` | `service-indisponible` |
| L'amont ne répond pas dans le délai (ou répond 408, 504) | **504** | `service-indisponible` |
| Réponse sans en-tête CORS | — | `reponse-bloquee` : **ne doit jamais arriver** (C-NAV-4) |

Le corps d'une erreur de l'amont n'est **pas** relayé par le relais de référence : il le remplace
par le sien, `{"error": "<code>", "message": "<texte fixe>"}`, où rien de la requête ni de la
réponse de l'amont n'entre. Les codes : `host-not-allowed`, `path-not-allowed`, `invalid-url`,
`invalid-path`, `invalid-query`, `body-not-allowed`, `method-not-allowed`, `url-too-long`,
`not-found`, `rate-limited`, `relay-busy`, `relay-error`, `upstream-unreachable`,
`upstream-address-forbidden`, `upstream-timeout`, `upstream-error`, `upstream-too-large`,
`upstream-content-type`, `upstream-encoding`, `upstream-redirect-refused`, `upstream-leak`,
`upstream-rate-limited`, `upstream-forbidden`, `upstream-not-found`, `upstream-rejected`.

## 6. Le relais Node de référence

`proxy/relay/node/` — modules `node:` seuls, aucune dépendance, Node 22 ou plus récent. Mode
d'emploi : [`proxy/relay/node/README.md`](../proxy/relay/node/README.md).

```bash
RELAY_HOSTS=donnees.portail.example node proxy/relay/node/server.mjs
# ou, avec un fichier :
RELAY_CONFIG=./relay.config.json RELAY_KEY_PORTAIL_PRIVE=… node proxy/relay/node/server.mjs
```

Il écoute sur `127.0.0.1:8155` et se place **derrière** le serveur web du site, qui lui transmet
`/donnees-relais/` et porte le cache partagé, la compression et le TLS.

### Configuration

Fichier JSON désigné par `RELAY_CONFIG` (exemple :
[`relay.config.example.json`](../proxy/relay/node/relay.config.example.json)), complété par
l'environnement. Un champ inconnu fait échouer le démarrage : une faute de frappe sur
`pathPrefixes` ne doit pas ouvrir un hôte entier.

| Champ | Défaut | Rôle |
|---|---|---|
| `hosts` | — (obligatoire) | Liste blanche : un objet par hôte. |
| `hosts.<hôte>.ttl` | `ttl` global | `max-age` servi au navigateur, en secondes. |
| `hosts.<hôte>.sharedTtl` | `ttl` de l'hôte | `s-maxage`, et fraîcheur du cache du relais. |
| `hosts.<hôte>.staleWhileRevalidate`, `.staleIfError` | valeurs globales | Fenêtres `stale` de l'hôte. |
| `hosts.<hôte>.pathPrefixes` | `[]` (tout l'hôte) | Préfixes de chemin autorisés. **Obligatoire avec `key`.** |
| `hosts.<hôte>.key` | aucune | `{ "header": "Authorization", "prefix": "Apikey ", "env": "NOM_DE_VARIABLE" }`. La clé se lit dans la variable d'environnement nommée : **elle ne s'écrit jamais dans le fichier**. |
| `prefix` | `/donnees-relais` | Chemin sous lequel le relais répond. |
| `ttl` | `300` | Durée de cache par défaut. |
| `staleWhileRevalidate` | `60` | |
| `staleIfError` | `3600` | Durée pendant laquelle une réponse périmée est servie si l'amont tombe. |
| `contentTypes` | JSON, GeoJSON, CSV | Liste blanche des types. HTML, XML, SVG et scripts y sont refusés. |
| `trustedProxies` | `[]` | Adresses des mandataires dont `X-Forwarded-For` est cru, pour la limite de débit. |
| `listen` | `127.0.0.1:8155` | Adresse et port d'écoute. |
| `logQuery` | `false` | Journaliser aussi la requête (ce que l'usager a tapé). |
| `limits.timeoutMs` | `10000` | Délai global vers l'amont. |
| `limits.maxBytes` | `10485760` | Taille maximale d'une réponse. |
| `limits.maxRedirects` | `3` | De 0 à 3 : le contrat interdit d'en suivre plus. |
| `limits.maxUrlLength` | `8000` | |
| `limits.cacheMaxBytes`, `.cacheMaxEntries` | 64 Mo, 2 000 | Bornes du cache en mémoire. |
| `limits.rateLimitRequests`, `.rateLimitWindowSeconds` | 600 par 60 s | Limite de débit par adresse (par préfixe /64 en IPv6). |
| `limits.maxConnections` | `256` | Connexions entrantes simultanées. |
| `limits.maxUpstreamRequests` | `16` | Requêtes simultanées vers l'amont ; au-delà, 503. |

Variables d'environnement : `RELAY_CONFIG`, `RELAY_HOSTS` (hôtes sans clé, séparés par des
virgules, ajoutés à ceux du fichier), `RELAY_PORT`, `RELAY_LISTEN`, `RELAY_PREFIX`, `RELAY_TTL`, et
les variables de clé nommées par le fichier. L'environnement prime sur le fichier.

Mémoire, au pire : `maxUpstreamRequests × maxBytes + cacheMaxBytes`, soit 224 Mo avec les défauts.

### Ce qu'il fait au-delà du minimum

- **Une seule requête vers l'amont par URL** : N visiteurs simultanés sur une URL absente du cache
  attendent la même réponse.
- **La clé ne sort pas, même si l'amont la renvoie** : une réponse qui contient la clé (page de
  débogage, écho des en-têtes) est retenue, 502.
- **Pas de compression** : il demande `Accept-Encoding: identity` à l'amont et refuse (502) une
  réponse compressée qu'il n'a pas demandée. C'est le serveur web placé devant lui qui compresse,
  d'où le `Vary: Accept-Encoding` du contrat.
- **Pas de requête conditionnelle** : `If-None-Match` du visiteur est ignoré, la réponse est
  toujours une 200 complète. Le cache du site répond les 304.
- Un en-tête `X-Relay-Cache: HIT | MISS | STALE` et, hors `MISS`, un `Age`.
- `/health` répond `{"status":"ok"}`, sans rien dire de la configuration.

### Ce qu'il ne fait pas

- Il ne limite pas le nombre de connexions **par adresse** (seulement au total) et ne termine pas
  le TLS : c'est le rôle du serveur web placé devant.
- Derrière un mandataire, toutes les connexions viennent de la même adresse : déclarer celle-ci
  dans `trustedProxies`, sinon la limite de débit devient globale.
- Il refuse les adresses NAT64 (`64:ff9b::/96`) : sur un réseau IPv6 seul avec DNS64, il ne joint
  aucun amont.
- Son cache vit en mémoire : il repart vide à chaque redémarrage, et n'est pas partagé entre
  plusieurs instances.

## 7. La suite de conformance

Écrite en `node:test`, sans dépendance. Elle démarre son **faux amont** local, qui joue tous les
hôtes du profil et se montre hostile (`Set-Cookie`, redirections piégées, HTML, flux sans fin…).
Elle ne joint aucun service réel : ses hôtes sont en `.conformance.test`, un domaine réservé.

```bash
# Le relais Node de référence, lancé par la suite elle-même :
node --test tests/relay/conformance.test.mjs

# N'importe quel relais :
RELAY_URL=http://127.0.0.1:8155/donnees-relais node --test tests/relay/conformance.test.mjs
```

### Mettre un relais tiers à l'épreuve

Un relais conforme ne joint que du `https` sur le port 443 d'une adresse publique : il ne peut pas
joindre un faux amont local. Le relais à l'épreuve reçoit donc, **le temps du test seulement**, une
configuration de banc — le profil [`tests/relay/conformance-profile.json`](../tests/relay/conformance-profile.json) :

- trois hôtes autorisés, tous **routés vers `http://127.0.0.1:18155`** (le faux amont), en
  conservant l'en-tête `Host` : `ouvert.conformance.test` (sans clé, durée 300 s),
  `second.conformance.test` (durée 60 s), `cle.conformance.test` (préfixe `/api/public/`, clé
  `Authorization: Apikey cle-fictive-de-conformance`) ;
- `interdit.conformance.test` **hors** liste ;
- délai de 2 s, plafond de 1 Mo, 500 requêtes par minute et par adresse.

| Variable | Défaut | Rôle |
|---|---|---|
| `RELAY_URL` | — | URL du relais, préfixe compris. Absente : la suite lance le relais de référence. |
| `CONFORMANCE_UPSTREAM_PORT` | `18155` | Port du faux amont. |
| `CONFORMANCE_TIMEOUT_MS` | `2000` | Délai configuré sur le relais. |
| `CONFORMANCE_MAX_BYTES` | `1048576` | Plafond de taille configuré sur le relais. |
| `CONFORMANCE_RATE_REQUESTS` | `500` | Limite de débit configurée ; `0` saute le test. |
| `CONFORMANCE_HAS_CACHE` | — | `1` si le relais a son propre cache : la suite exige alors qu'une seconde requête identique n'atteigne pas l'amont. |
| `RELAY_KEY_CONFORMANCE` | `cle-fictive-de-conformance` | Clé attendue chez l'amont. |

Le test de débit est le dernier et épuise le quota de l'adresse du banc : attendre la fin de la
fenêtre avant de relancer la suite.

### Ce que la suite ne peut pas vérifier sur un relais tiers

Ces exigences ne s'observent pas de l'extérieur, ou sont contredites par la configuration de banc
elle-même. Sur un relais tiers, elles se vérifient **en lisant sa configuration** ; sur le relais
de référence, elles ont leurs tests à part (`tests/relay/reference/`), où la résolution DNS, la
connexion, l'horloge et le journal sont substitués par injection dans `createRelay` — jamais par
configuration : aucune variable d'environnement ne débranche une défense du relais de production.

| Règle | Pourquoi la suite ne la voit pas | Où elle est éprouvée |
|---|---|---|
| **C-SSRF-6** — https, port 443, adresse privée après résolution, connexion à l'adresse vérifiée, certificat | Le banc route justement vers une adresse locale, en clair. | `reference/relay.test.mjs`, `reference/addresses.test.mjs`, `reference/tls.test.mjs` |
| **C-SSRF-7** — une redirection suivie est résolue et vérifiée à son tour | Même raison. La suite vérifie les redirections **refusées**, pas la revérification d'une redirection suivie. | `reference/relay.test.mjs` |
| **C-CACHE-4** — cache borné | État interne. | `reference/relay.test.mjs` |
| **C-CACHE-5** — réponse périmée si l'amont tombe | Demande d'avancer l'horloge du relais. | `reference/relay.test.mjs` |
| **C-CACHE-2** — la seconde requête est servie par le cache | Un relais peut ne pas avoir de cache propre. Vérifié si `CONFORMANCE_HAS_CACHE=1`. | suite, et `reference/relay.test.mjs` |
| **C-DOS-4** — connexions et requêtes simultanées bornées | État interne. | `reference/relay.test.mjs` |
| **C-FUITE-1** — la clé renvoyée par l'amont ne sort pas | Défense en profondeur du relais de référence, qu'un relais sans lecture du corps ne peut pas offrir. | `reference/relay.test.mjs` |
| **C-FUITE-2** — journaux | La suite ne lit pas les journaux du relais. | `reference/relay.test.mjs` |
| **C-CONF-1** — refus de démarrer | La suite parle à un relais déjà démarré. | `reference/config.test.mjs` |

### Dans la CI du dépôt

`tests/relay/relay-conformance.test.ts` est un test Vitest qui lance `node --test` sur la suite de
conformance, puis sur les tests du relais de référence. Il tourne donc avec `npm run test:run`,
sans étape de workflow ni dépendance ajoutée.

## 8. Exigence → test

Suite de conformance : `tests/relay/conformance.test.mjs` (**C**). Tests du relais de référence :
`tests/relay/reference/` (**R**).

| Règle | Tests |
|---|---|
| C-URL-1 | **C** « le chemin et la requête arrivent à l'amont octet pour octet », « les paramètres ne sont pas triés » · **R** `target.test.mjs` |
| C-URL-2 | **C** majuscules, casse mêlée, point final · **R** `target.test.mjs` |
| C-URL-3 | **C** 7 900 caractères passent, 8 200 donnent 414 · **R** `target.test.mjs` (8 000 / 8 001) |
| C-SSRF-1 | **C** hors liste, suffixe, préfixe, sous-domaine, domaine parent |
| C-SSRF-2 | **C** décimale pointée, entier, hexadécimale, octale, abrégée, métadonnées, IPv6, IPv4 mappée, `localhost` · **R** `addresses.test.mjs`, `config.test.mjs` |
| C-SSRF-3 | **C** identifiants, port, schéma, hôte encodé, octet nul, barre inverse, segment vide, cible en forme absolue |
| C-SSRF-4 | **C** quatorze chemins piégés (`..`, `%2e%2e`, `.%2e`, `%252e%252e`, `..%2f`, `..%5c`, `..\`, `..;`, `//`, `.`, `%00`…) · **R** `target.test.mjs` (refus strict, 400) |
| C-SSRF-5 | **C** chemin voisin, préfixe tronqué, préfixe prolongé, casse, racine, chemin autorisé · **R** `target.test.mjs`, `config.test.mjs` |
| C-SSRF-6 | **R** `relay.test.mjs` (neuf adresses privées, nom mixte, rebond DNS, résolution impossible), `addresses.test.mjs`, `tls.test.mjs` |
| C-SSRF-7 | **C** hôte hors liste, http, port, boucle locale, métadonnées, identifiants, hors préfixe, remontée, boucle, chaîne de quatre, jamais de 3xx · **R** redirection suivie et revérifiée, hôte autorisé résolvant en privé, `maxRedirects: 0` |
| C-MET-1 | **C** POST, PUT, PATCH, DELETE, PURGE, TRACE |
| C-MET-2 | **C** GET avec corps |
| C-MET-3 | **C** HEAD, OPTIONS |
| C-INJ-1 | **C** CR LF encodés (chemin, requête), seconde requête encodée, CR et LF nus par socket · **R** refus stricts (400) |
| C-AMONT-1 | **C** quatorze en-têtes du visiteur, aucun n'atteint l'amont · **R** liste exacte des en-têtes envoyés |
| C-AMONT-2 | **C** clé sur l'hôte à clé seulement, jamais après redirection · **R** idem |
| C-NAV-1 à C-NAV-4 | **C** invariants vérifiés sur **chacune** des quelque 500 réponses de la suite, plus un test nommé par règle |
| C-NAV-5 | **C** `ETag`, `Last-Modified` |
| C-CACHE-1 | **C** directives de `Cache-Control`, durée par hôte |
| C-CACHE-2 | **C** en-têtes d'empoisonnement, requête et hôte dans la clé · **R** requêtes simultanées, `HIT` et `Age` |
| C-CACHE-3 | **C** 5xx, 429 et 404 jamais en cache, `no-store` sur toute erreur |
| C-CACHE-4 | **R** borne en entrées, borne en octets, réponse plus grosse que le cache |
| C-CACHE-5 | **R** `STALE` puis erreur passé la fenêtre |
| C-ERR-1, C-ERR-2 | **C** neuf statuts de l'amont, 403, 405, 414, corps d'erreur sans reprise · **R** forme du corps |
| C-DOS-1 | **C** amont lent · **R** résolution qui ne répond pas |
| C-DOS-2 | **C** flux sans fin coupé en flux, longueur déclarée |
| C-DOS-3 | **C** 429 avec `Retry-After` · **R** fenêtre, `X-Forwarded-For` et mandataires de confiance |
| C-DOS-4 | **R** 503 au-delà de `maxUpstreamRequests`, connexion refusée au-delà de `maxConnections` |
| C-FUITE-1 | **C** invariant sur chaque réponse · **R** amont qui renvoie la clé |
| C-FUITE-2 | **R** journaux |
| C-CONF-1 | **R** `config.test.mjs` |
