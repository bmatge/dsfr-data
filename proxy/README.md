# Proxy CORS autonome -- dsfr-data

## Qu'est-ce que c'est ?

Ce dossier contient la configuration d'un **reverse proxy Nginx** qui peut etre
deploye de facon independante, sans le frontend dsfr-data.

Son unique role est de relayer les requetes vers les APIs externes en ajoutant
les en-tetes CORS necessaires (`Access-Control-Allow-Origin: *`, etc.).

## Pourquoi un proxy CORS ?

Les composants dsfr-data interrogent plusieurs APIs gouvernementales depuis
le navigateur. Ces APIs ne fournissent pas toujours les en-tetes CORS requis
pour autoriser les appels cross-origin depuis un domaine tiers.

Sans proxy, le navigateur bloque les reponses et les composants ne peuvent pas
fonctionner lorsqu'ils sont integres dans un site externe.

Le proxy intercepte les requetes, les transmet a l'API cible, puis renvoie la
reponse au navigateur en y ajoutant les en-tetes CORS manquants.

## Routes disponibles

| Route locale          | API distante                            | Usage                     |
|-----------------------|-----------------------------------------|---------------------------|
| `/grist-proxy/`      | `https://docs.getgrist.com/`           | Grist SaaS (community)    |
| `/grist-gouv-proxy/` | `https://grist.numerique.gouv.fr/`     | Grist instance souveraine |
| `/albert-proxy/`     | `https://albert.api.etalab.gouv.fr/`   | IA Albert (DINUM)         |
| `/tabular-proxy/`    | `https://tabular-api.data.gouv.fr/`    | Tabular API data.gouv.fr  |

Un endpoint `/health` est egalement disponible pour les sondes de supervision.

### `/cors-proxy` : le relais generique, borne

`/cors-proxy` relaie vers la cible que le client designe dans l'en-tete
`X-Target-URL` (sources `use-proxy`). Cette cible est bornee avant tout appel :
`https` et nom DNS public seulement (ni adresse IP, ni `localhost`, ni nom local,
ni identifiants, ni port), methodes `GET` et `POST`, corps de 1 Mo, debit
plafonne, certificat de l'amont verifie. Le detail de la regle, ce qu'elle ne
couvre pas et l'isolation reseau recommandee sont dans
[`docs/SECURITY.md`](../docs/SECURITY.md#proxy-générique--bornage). Les `map` de
`nginx.conf` sont la copie de celles de `docker/garde-proxy.conf` : ne pas en
modifier une seule.

## Deploiement avec Docker (recommande)

### Prerequis

- Docker et Docker Compose installes sur la machine.

### Demarrage

```bash
cd proxy/nginx
docker compose up -d
```

Le proxy ecoute sur **le port 3000** de la machine hote.

### Verification

```bash
# Verifier que le conteneur tourne
docker compose ps

# Tester le health check
curl http://localhost:3000/health

# Tester une route de proxy (exemple Grist)
curl -I http://localhost:3000/grist-proxy/api/docs
```

### Arret

```bash
docker compose down
```

### Logs

```bash
docker compose logs -f
```

### Redemarrage apres modification de la configuration

Apres avoir modifie `nginx.conf`, redemarrer le conteneur :

```bash
docker compose restart
```

## Deploiement sans Docker (Nginx natif)

### Prerequis

- Nginx installe sur le systeme (`apt install nginx`, `brew install nginx`, etc.).

### Installation

1. Copier le fichier de configuration :

```bash
sudo cp proxy/nginx/nginx.conf /etc/nginx/nginx.conf
```

2. Tester la configuration :

```bash
sudo nginx -t
```

3. Recharger Nginx :

```bash
sudo systemctl reload nginx
```

Par defaut, le proxy ecoute sur le port 80. Pour changer le port, modifier la
directive `listen` dans `nginx.conf` :

```nginx
listen 3000;
```

## Configuration

### Changer le port

- **Docker** : modifier le mapping de port dans `docker-compose.yml`
  (par exemple `"8080:80"` pour exposer sur le port 8080).
- **Nginx natif** : modifier la directive `listen` dans `nginx.conf`.

### Restreindre les origines autorisees

Par defaut, le proxy autorise toutes les origines (`Access-Control-Allow-Origin: *`).
Pour restreindre l'acces a un domaine specifique, remplacer `'*'` par le domaine
souhaite dans chaque bloc `location` de `nginx.conf` :

```nginx
add_header 'Access-Control-Allow-Origin' 'https://mon-site.gouv.fr' always;
```

### Ajouter un nouvel upstream

Pour ajouter une nouvelle API a proxifier, dupliquer un bloc `location` existant
dans `nginx.conf` et adapter :

- Le chemin local (ex: `/nouvelle-api/`)
- L'URL `proxy_pass`
- Le `Host` dans `proxy_set_header`

### Resolvers DNS

La configuration utilise les DNS publics Google (8.8.8.8) et Cloudflare (1.1.1.1).
Si le proxy tourne dans un reseau interne avec un resolver DNS dedie, adapter
la directive `resolver` dans `nginx.conf`.

## Architecture

```
proxy/
  README.md              <- Ce fichier
  nginx/
    nginx.conf           <- Configuration Nginx autonome (proxy uniquement)
    docker-compose.yml   <- Deploiement Docker
  relay/
    node/                <- Relais cachable de reference (voir ci-dessous)
    nginx/               <- Relais cachable fait avec nginx seul (voir ci-dessous)
```

Le fichier `nginx.conf` a la racine du projet est la configuration complete
utilisee pour le deploiement du site (frontend + proxy). Les fichiers dans ce
dossier ne concernent que le proxy seul.

## Relais cachable (`relay/`)

Le dossier `relay/` n'est **pas** un proxy CORS : c'est un autre contrat (ADR-155). Un site qui a
du cache y fait passer les données d'une dataviz par son propre domaine, sous une URL
`<relais>/<hôte>/<chemin>?<requête>` qui identifie la donnée. Lecture seule, hôtes d'une liste
blanche exacte, clé d'API détenue par le relais, réponses cachables.

- Contrat : [`docs/RELAY.md`](../docs/RELAY.md)
- Relais Node de référence, sans dépendance : [`relay/node/`](relay/node/README.md)
- Extrait nginx — un relais fait avec nginx seul : une `location` statique par hôte autorisé,
  `proxy_cache` —, ce qu'il garantit et ce qu'il ne garantit pas, et la configuration de nginx
  placé devant le relais Node : [`relay/nginx/`](relay/nginx/README.md)
- Suite de conformance, exécutable contre n'importe quel relais : [`tests/relay/`](../tests/relay/README.md)

Il ne remplace pas les routes ci-dessus, et ce n'est pas un proxy ouvert.

## Securite

- Le proxy n'expose aucun fichier statique et ne sert aucun contenu local.
- Les en-tetes `X-Content-Type-Options` et `X-XSS-Protection` sont ajoutes
  a toutes les reponses.
- Le cache Nginx est desactive (`proxy_no_cache`) pour eviter de servir des
  donnees perimees.
- En production, il est fortement recommande de placer ce proxy derriere un
  termineur TLS (Traefik, Caddy, ou un load balancer) et de restreindre les
  origines CORS aux seuls domaines autorises.
