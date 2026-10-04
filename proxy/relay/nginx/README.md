# Relais cachable — extrait nginx

Un relais conforme au **contrat du relais** ([`docs/RELAY.md`](../../../docs/RELAY.md), ADR-155)
fait avec nginx seul : pas de module tiers, pas de script, pas de processus à côté. Le navigateur
demande `/donnees-relais/<hôte>/<chemin>?<requête>` à votre site ; nginx va chercher
`https://<hôte>/<chemin>?<requête>`, le met en cache et rend la réponse avec des en-têtes de cache.

- **Une `location` statique par hôte autorisé** : c'est la liste blanche. L'hôte n'est jamais une
  variable passée à `proxy_pass`.
- Lecture seule (GET, HEAD, OPTIONS), clé d'API détenue par nginx, rien du visiteur transmis à
  l'amont.
- **Ce n'est pas un proxy ouvert**, et il ne remplace pas `/cors-proxy` (contrat, §1).

> ⚠️ **Une clé confiée au relais rend public tout ce qu'elle sait lire sur l'hôte autorisé.**
> Clé en lecture seule, et préfixe de chemin obligatoire dans la `location` de l'hôte :
> [`docs/RELAY.md` §3](../../../docs/RELAY.md).

nginx seul **ne tient pas tout le contrat** : quatre limites sont décrites [plus bas](#ce-que-lextrait-ne-garantit-pas).
Le montage qui le tient en entier est le [relais Node](../node/README.md) placé derrière nginx
([dernière section](#lautre-montage--nginx-devant-le-relais-node)).

## Les fichiers

| Fichier | Niveau | À modifier ? |
|---|---|---|
| `relais-http.conf` | `http {}` | non — cache, zones de débit, lecture de la cible, en-têtes |
| `relais-server.conf` | `server {}` | non — refus de tout hôte hors liste, réponses d'erreur |
| `relais-hote.conf` | inclus par chaque `location` d'hôte | non — tout le contrat, pour un hôte |
| `relais-reponse.conf` | inclus par chaque `location` du relais | non — en-têtes de toute réponse, journal |
| `hotes.http.example.conf` | `http {}` | **oui** — un bloc `upstream` par hôte |
| `hotes.server.example.conf` | `server {}` | **oui** — une `location` par hôte |
| `cles.example.conf` | `http {}` | **oui**, et hors du dépôt — la clé de chaque hôte à clé |
| `mandataire-node.http.conf`, `mandataire-node.server.conf` | | l'autre montage : nginx devant le relais Node |

## Installer

Copier les quatre fichiers `relais-*.conf` dans `/etc/nginx/relais/` (leurs `include` citent ce
chemin, relatif au dossier de configuration de nginx), vos deux fichiers d'hôtes et votre fichier
de clés où vous voulez, puis :

```nginx
http {
    # …
    include relais/relais-http.conf;
    include /etc/nginx/secrets/relais-cles.conf;   # votre copie de cles.example.conf
    include relais/hotes.http.conf;                # votre copie de hotes.http.example.conf

    server {
        # … votre site …
        include relais/relais-server.conf;
        include relais/hotes.server.conf;          # votre copie de hotes.server.example.conf
    }
}
```

```bash
nginx -t && nginx -s reload
curl -i https://votre-site.example/donnees-relais/donnees.portail.example/api/explore/v2.1/catalog/datasets
```

Requis : nginx 1.22 ou plus récent (construit avec PCRE2 et OpenSSL, modules `proxy`, `map`,
`limit_req`, `limit_conn`, `gzip`, `upstream_zone` : c'est le cas des paquets officiels). Testé en
CI sur l'image `nginx:alpine`.

Côté page, `relay-url="/donnees-relais"` sur `dsfr-data-source` (ou `window.DSFR_DATA_RELAY`) :
[`docs/RELAY.md` §9](../../../docs/RELAY.md).

## Adapter

### Ajouter un hôte

L'hôte s'écrit **trois fois, à l'identique** : dans le nom de la `location`, dans `set
$relais_hote`, et dans le bloc `upstream` que nomme `proxy_pass`.

```nginx
# hotes.http.conf
upstream relais_donnees_exemple_fr {
    zone relais_amonts 256k;
    server donnees.exemple.fr:443 max_conns=64;
    keepalive 8;
}

# hotes.server.conf
location ^~ /donnees-relais/donnees.exemple.fr {
    set $relais_hote donnees.exemple.fr;
    set $relais_ttl  300;
    include relais/relais-hote.conf;
    proxy_cache_valid 200 300s;
    proxy_pass https://relais_donnees_exemple_fr$relais_cible;
}
```

- L'hôte est en minuscules, sans port, sans point final : c'est ce que produit la bibliothèque, et
  il est comparé octet pour octet.
- Le nom de la `location` n'a **pas** de barre finale (nginx répondrait sinon lui-même une
  redirection 301 à `/donnees-relais/<hôte>`) ; `^~` empêche une `location` à expression
  rationnelle du site (`~ \.json$`) de passer devant.
- nginx résout le nom de l'amont **au démarrage** : recharger nginx si le portail change
  d'adresse. Un nom qui ne se résout pas empêche nginx de démarrer.

### Régler la durée de cache

Par hôte, à **deux** endroits de sa `location`, qui doivent rester égaux : `set $relais_ttl 300;`
(ce qu'annonce `Cache-Control` : `max-age` et `s-maxage`) et `proxy_cache_valid 200 300s;` (ce que
garde le cache de nginx). Défaut du contrat : 300 s. Les fenêtres `stale-while-revalidate=60` et
`stale-if-error=3600` annoncées sont dans `relais-http.conf` (`map $status $relais_cache_control`).

### Ajouter une clé

1. Dans votre fichier de clés (hors du dépôt, lisible par root seul), une ligne par hôte :

   ```nginx
   map $relais_hote $relais_cle {
       default               "";
       portail-prive.example "Apikey …";   # l'en-tête Authorization entier
   }
   ```

2. Dans la `location` de l'hôte, **après** `include relais/relais-hote.conf;`, le préfixe de
   chemin autorisé — obligatoire dès qu'il y a une clé :

   ```nginx
   if ($relais_cible !~ "^\Q/api/explore/v2.1/catalog/datasets/jeu-publiable/\E") {
       return 403 '{"error":"path-not-allowed","message":"Chemin hors des prefixes autorises pour cet hote."}';
   }
   ```

   Entre `\Q` et `\E`, le texte est littéral : rien à échapper. Le préfixe finit par une barre
   (frontière de segment) et se compare à la cible **brute** : `/api/%70ublic/` n'est pas
   `/api/public/`. Plusieurs préfixes : `"^(?:\Q/a/\E|\Q/b/\E)"`.

Une clé portée par un autre en-tête qu'`Authorization` : changer la ligne `proxy_set_header
Authorization $relais_cle;` de `relais-hote.conf`.

### Régler les plafonds

| Réglage | Où | Défaut |
|---|---|---|
| Débit par adresse | `relais-http.conf` (`rate=`), `relais-hote.conf` (`burst=`) | 10 requêtes par seconde, rafale de 600 |
| Budget par hôte, toutes adresses confondues | idem, zone `relais_hote` | 50 par seconde, rafale de 1 000 |
| Requêtes simultanées par adresse | `relais-hote.conf`, `limit_conn` | 32 |
| Connexions simultanées vers un hôte | `hotes.http.conf`, `max_conns=` | 64 |
| Délais vers l'amont | `relais-hote.conf`, `proxy_*_timeout` | 5 s pour se connecter, 10 s entre deux lectures |
| Taille et durée de vie du cache | `relais-http.conf`, `proxy_cache_path` | 512 Mo, une heure sans demande |
| Types de contenu servis | `relais-http.conf`, `map … $relais_type` | JSON, GeoJSON, CSV |

Ces limites de débit s'appliquent **avant** la lecture du cache : une réponse servie par le cache
de nginx compte aussi. Le budget par hôte se dimensionne donc sur le trafic qui atteint nginx, pas
sur celui qui atteint le portail ; derrière un cache placé devant (Varnish, CDN), c'est le trafic
que ce cache laisse passer.

### Derrière un autre mandataire (Varnish, CDN, répartiteur)

Toutes les requêtes viennent alors de l'adresse du mandataire, et la limite par adresse devient
globale. Rendre à nginx l'adresse du visiteur, avec le module `realip` — et, comme pour le relais
Node (règle C-DOS-5), seulement depuis un en-tête que le mandataire **pose** :

```nginx
set_real_ip_from 192.0.2.10;        # l'adresse du mandataire, et elle seule
real_ip_header   X-Forwarded-For;
real_ip_recursive on;
```

Un cache placé devant suit le `Cache-Control` du relais : il ne retient ni un 429 ni un 503, qui
sont `no-store`.

## Ce que l'extrait garantit

La suite de conformance du contrat (`tests/relay/conformance.test.mjs`, 140 tests) est jouée en CI
contre un vrai nginx chargé de ces fichiers (job `relais-nginx`) : **119 tests verts**, 18 rouges
(les quatre limites ci-dessous, et elles seules), 3 que la suite saute d'elle-même. Le banc
n'en diffère que par l'adresse de l'amont ([`tests/relay/nginx/`](../../../tests/relay/nginx/)).

| Exigence | Comment nginx la tient |
|---|---|
| Liste blanche exacte (C-SSRF-1 à 3, C-URL-2) | Une `location` par hôte, plus la comparaison du segment d'hôte **brut** à `$relais_hote`. Tout le reste : 403 par `relais-server.conf`. |
| Cible transmise octet pour octet (C-URL-1) | `proxy_pass https://<amont>$relais_cible` : nginx envoie la valeur de la variable telle quelle, et cette variable est la fin de `$request_uri`. |
| Chemins piégés (C-SSRF-4, C-INJ-1) | **Refusés** (400) sur la forme brute, par la grammaire du relais Node recopiée dans `relais-http.conf` — pas « normalisés puis contenus ». |
| Préfixes de chemin (C-SSRF-5) | `if ($relais_cible !~ "^\Q…\E")` dans la `location` de l'hôte. |
| https, 443, SNI, certificat vérifié (C-SSRF-6, en partie) | Bloc `upstream` sur `:443`, `proxy_ssl_server_name`, `proxy_ssl_verify`, autorités du système. |
| Aucune redirection suivie ni rendue (C-SSRF-7) | Toute 3xx de l'amont devient 502. |
| GET, HEAD, OPTIONS (C-MET-1 à 3) | 405 avec `Allow` ; OPTIONS répondu sans amont, sans `Access-Control-Allow-Headers` ; une requête avec corps est refusée (400). |
| Rien du visiteur vers l'amont (C-AMONT-1, C-AMONT-2) | `proxy_pass_request_headers off` : seuls partent `Host`, `Accept`, `Accept-Encoding`, `User-Agent` fixes et la clé de l'hôte. |
| En-têtes vers le navigateur (C-NAV-1, 2, 4, 5) | En-têtes de l'amont retirés par leur nom ; `nosniff`, CSP, CORS et `Access-Control-Expose-Headers: Retry-After` sur toute réponse du relais, erreurs comprises. |
| Cache (C-CACHE-1 à 5) | Clé = hôte et cible brute ; seules les 200 gardées ; `Cache-Control` du contrat ; périmé servi si l'amont tombe, répond 5xx ou 429. |
| Purge (C-CACHE-6) | Par le mémo d'une seconde décrit plus bas — en régime établi seulement. |
| Erreurs (§5 du contrat) | Statuts du barème, corps JSON fixe, `no-store`. |
| Débit (C-DOS-3), simultanéité (C-DOS-4) | `limit_req` par adresse et par hôte, `limit_conn` par adresse, `max_conns` par hôte. |

## Ce que l'extrait ne garantit pas

Quatre limites font échouer des tests de la suite de conformance. La suite n'a pas été adoucie :
ces tests restent rouges contre nginx, et le job CI exige que ce soient exactement ceux-là, pour
la raison dite ici (`tests/relay/nginx/limites.mjs`). Ce qui tient malgré tout est vérifié à part
(`tests/relay/nginx/observations.test.mjs`).

| Limite | Règle | Ce qui se passe | Ce qui tient |
|---|---|---|---|
| `avant-routage` (3 tests) | C-NAV-2, C-NAV-4 | nginx répond **lui-même**, avant de choisir une `location`, à `TRACE` (405) et à un `%00` dans l'URL (400) — comme à une requête illisible, des en-têtes trop longs ou une URL de plus de 16 000 caractères. Ces réponses sont celles du site : page HTML de nginx, sans CORS, sans `nosniff`, sans la CSP du relais. | L'amont n'est pas contacté. La page est celle que nginx rend à toute URL du site, rien de la requête n'y figure. |
| `type-de-contenu` (12 tests) | C-NAV-3 | nginx ne sait pas **refuser** une réponse sur son type. Un type hors liste (HTML, SVG, script, `application/json+xml`, type absent…) n'est pas répondu 502 : le corps est servi, sous `application/octet-stream`. | Jamais sous son type d'origine ; toujours avec `nosniff` et `Content-Security-Policy: default-src 'none'; sandbox`. Le type est comparé en entier à une liste fermée. |
| `memo-une-seconde` (1 test) | C-CACHE-3 | Une 401, 403, 404 ou 410 de l'amont est retenue **une seconde** dans le cache de nginx. C'est le seul moyen qu'a nginx de faire oublier l'entrée : sans cela, la panne suivante resservirait en « périmé » la donnée que le portail vient de retirer (C-CACHE-6). | La réponse reste `no-store` pour le navigateur et tout cache placé devant. Passé la seconde, la requête repart à l'amont. 429 et 5xx ne sont jamais retenus. |
| `taille` (2 tests) | C-DOS-2 | nginx n'a **pas de plafond de taille de réponse** : une réponse de plusieurs centaines de Mo est relayée et écrite dans le cache. | `max_size` borne le disque ; une réponse dont la longueur déclarée n'est pas tenue n'est pas mise en cache. |

**La purge de C-CACHE-6 ne tient qu'en régime établi** *(observé)*. nginx n'efface pas le
fichier de l'entrée oubliée : il cesse de le chercher. Or il ne charge l'index de son cache
qu'**une minute après son démarrage**, et d'ici là il va lire sur disque toute entrée qu'il ne
connaît pas. Deux conséquences :

- dans la minute qui suit un démarrage, une donnée que le portail vient de retirer (404) est
  resservie à la panne suivante — mesuré ;
- après un **redémarrage**, l'ancien fichier d'une donnée retirée, s'il est encore sur disque
  (il le reste tant que l'URL est demandée au moins une fois par `inactive`), redevient une entrée
  périmée comme une autre, resservie à la panne suivante — mesuré aussi, passé la première minute.

Un rechargement (`nginx -s reload`) n'est pas un démarrage : l'index est conservé. Pour fermer ce
reste, **vider le cache du relais à chaque démarrage de nginx** (`rm -rf /var/cache/nginx/relais/*`
avant `nginx`, par exemple en `ExecStartPre`) — ou prendre la variante stricte ci-dessous.

Pour être strict sur C-CACHE-3 au prix de C-CACHE-5 : retirer `proxy_cache_valid 401 403 404 410
1s;` **et** les conditions `error timeout invalid_header http_500 http_502 http_503 http_504
http_429` de `proxy_cache_use_stale` (garder `updating`). nginx ne sert alors plus de réponse
périmée quand l'amont tombe, et n'a plus rien à purger. Ne retirer que la première ligne rouvre
le défaut que C-CACHE-6 interdit.

Limites que la suite de conformance ne voit pas — lues dans la documentation de nginx et, pour
celles marquées *(observé)*, constatées par `observations.test.mjs` :

- **Adresse de l'amont non vérifiée** (C-SSRF-6). nginx ne refuse pas un nom de la liste blanche
  qui résoudrait vers une adresse privée. Ce qui borne : la liste est écrite par vous, le port
  est 443, et le certificat est vérifié pour le nom demandé.
- **Liste noire d'en-têtes de réponse** (C-NAV-1). nginx ne retire que des en-têtes nommés : un
  en-tête de l'amont absent de la liste de `relais-hote.conf` traverse. Le relais Node, lui,
  n'en laisse passer que trois.
- **Pas de délai global** (C-DOS-1). `proxy_read_timeout` court entre deux lectures : un amont qui
  envoie un octet toutes les neuf secondes n'est jamais coupé.
- **Fenêtre de péremption non bornée par l'âge** (C-CACHE-5). nginx sert une entrée périmée tant
  qu'elle est dans son cache, c'est-à-dire tant qu'elle est demandée au moins une fois par
  `inactive` (une heure) — pas « pendant `stale-if-error` secondes ». Et il n'émet pas d'en-tête
  `Age` : un cache placé devant ajoute sa propre durée à celle de nginx.
- **Réponse délimitée par la fermeture** (C-CACHE-3). Une 200 sans `Content-Length` ni découpage
  est acceptée et mise en cache ; le relais Node la refuse.
- **Réponse compressée non demandée**. nginx demande `Accept-Encoding: identity` ; si l'amont
  compresse quand même, la réponse est transmise telle quelle, avec son `Content-Encoding`.
- **Requêtes conditionnelles** *(observé)*. nginx répond lui-même 304 à un `If-None-Match` qui
  correspond à l'`ETag` de l'entrée. Le cache n'en est pas touché et aucun autre visiteur n'en
  voit l'effet, mais c'est un écart à la lettre de C-CACHE-2 (« ni 304 ») : le relais Node rend
  toujours une 200 entière.
- **Limite de débit en IPv6 par adresse entière**, pas par préfixe /64.
- **La clé renvoyée par l'amont** n'est pas retenue (C-FUITE-1) : nginx ne lit pas les corps.
- **Journal d'erreurs** (C-FUITE-2). Le journal d'accès du relais (`log_format relais`) ne porte
  ni adresse, ni en-tête, ni requête. Le journal d'**erreurs** de nginx, lui, écrit l'adresse du
  visiteur et la ligne de requête entière à chaque erreur (amont injoignable, limite de débit) :
  sa durée de conservation est la vôtre.
- **HTTP/0.9**. Une requête sans version reçoit une réponse sans en-têtes, donc sans ceux du relais.
- **Liste blanche vide** (C-CONF-1). Sans `location` d'hôte, nginx démarre et le relais répond 403
  à tout : il ne refuse pas de démarrer.

## Ce que `proxy_pass` transmet à l'amont

C'est le point le plus piégeux de nginx, et la raison de la forme de l'extrait. nginx **route**
sur le chemin normalisé (`%2e%2e` décodé, `..` résolu, `//` fusionné), mais ce qu'il **transmet**
dépend de l'écriture de `proxy_pass` *(observé)* :

| Requête reçue | `proxy_pass http://amont/;` (avec URI) | `proxy_pass http://amont;` (sans URI) | `proxy_pass http://amont$request_uri;` | L'extrait |
|---|---|---|---|---|
| `/p/a/../b` | `/b` | `/p/a/../b` | `/p/a/../b` | refus (400) |
| `/p/a/%2e%2e/b` | `/b` | `/p/a/%2e%2e/b` | `/p/a/%2e%2e/b` | refus (400) |
| `/p/a//b` | `/a/b` | `/p/a//b` | `/p/a//b` | refus (400) |
| `/p/a%2fb` | `/a/b` | `/p/a%2fb` | `/p/a%2fb` | refus (400) |
| `/p/caf%c3%a9` | `/caf%C3%A9` | `/p/caf%c3%a9` | `/p/caf%c3%a9` | `/caf%c3%a9` |
| `/p/%61bc` | `/abc` | `/p/%61bc` | `/p/%61bc` | `/%61bc` |

- **Avec URI**, nginx remplace le préfixe et envoie le chemin normalisé, réencodé à sa façon : une
  remontée devient un autre chemin (resté sous le préfixe, mais ce n'est plus la requête), une
  barre encodée devient une barre, et l'encodage change — la cible n'arrive pas octet pour octet,
  ce qu'exige R3.
- **Sans URI**, la cible part telle que reçue, préfixe du relais compris : inutilisable ici.
- **Avec une variable**, nginx envoie exactement la valeur de la variable : la forme brute, donc
  aussi les remontées, qui atteignent l'amont.

L'extrait prend la troisième forme et la borne : `$relais_cible` n'est non vide que si la requête
brute est déjà canonique. Une cible admise arrive octet pour octet ; une cible piégée n'arrive pas.
Deux contrôles vont ensemble, parce que le routage et la transmission ne lisent pas la même
chose : la `location` (chemin normalisé) et la comparaison de l'hôte brut. `/donnees-relais/x/../donnees.portail.example/…`
atteint la `location` de l'hôte, et y est refusé : son segment d'hôte brut est `x`.

### Quatre autres pièges de nginx, tenus par l'extrait

- **`proxy_pass_request_body off` retire le corps, pas sa longueur** *(observé)*. nginx annonce
  alors à l'amont un `Content-Length` sans rien envoyer derrière ; sur une connexion gardée
  ouverte, l'amont lit la requête **suivante** comme le corps de celle-ci. La première passe de la
  suite de conformance contre nginx l'a montré : la requête qui suivait un GET avec corps
  recevait 400. L'extrait refuse toute requête avec corps et vide `Content-Length`.
- **`X-Accel-Redirect`**. Par défaut, nginx obéit à cet en-tête d'une réponse relayée et sert à
  sa place une `location` interne du site. L'extrait l'ignore (`proxy_ignore_headers`).
- **La redirection 301 automatique**. Une `location` à barre finale qui porte un `proxy_pass`
  répond d'elle-même 301 à l'URL sans la barre. D'où des noms de `location` sans barre finale.
- **Les `location` à expression rationnelle du site** passent devant une `location` par préfixe.
  D'où `^~`.

## L'autre montage : nginx devant le relais Node

Le [relais Node](../node/README.md) tient tout le contrat — plafond de taille, refus sur le type,
délai global, purge, adresse vérifiée. nginx, placé devant, n'apporte que le TLS, la compression
et le cache partagé : `mandataire-node.http.conf` dans `http {}`, `mandataire-node.server.conf`
dans `server {}`.

- **`proxy_set_header X-Forwarded-For $remote_addr;` est obligatoire** dès que `trustedProxies`
  déclare cette machine au relais (règle C-DOS-5). Un `proxy_pass` nu transmet l'en-tête du client :
  chaque requête forge son adresse et obtient son propre quota.
- `proxy_pass http://127.0.0.1:8155;` **sans** barre finale : la cible part telle que reçue.
- Le cache placé devant n'a **pas** de `proxy_cache_valid` : il suit le `Cache-Control` du relais,
  dont les erreurs sont `no-store`. Il ne retient ni un 503 ni un 429.
- `proxy_buffering on` : c'est nginx qui absorbe un visiteur lent.

## Tester

```bash
npx vitest run tests/relay/nginx/extrait-nginx.test.ts     # sans nginx : forme, grammaire, banc
RELAIS_NGINX_REEL=1 npx vitest run tests/relay/nginx/relais-nginx.test.ts   # Docker, Linux
```

Pour éprouver **votre** configuration avec la suite de conformance : [`docs/RELAY.md` §7](../../../docs/RELAY.md),
et [`tests/relay/nginx/banc.mjs`](../../../tests/relay/nginx/banc.mjs) pour la dérivation du banc.
