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
```

Le fichier `nginx.conf` a la racine du projet est la configuration complete
utilisee pour le deploiement du site (frontend + proxy). Les fichiers dans ce
dossier ne concernent que le proxy seul.

## Securite

- Le proxy n'expose aucun fichier statique et ne sert aucun contenu local.
- Les en-tetes `X-Content-Type-Options` et `X-XSS-Protection` sont ajoutes
  a toutes les reponses.
- Le cache Nginx est desactive (`proxy_no_cache`) pour eviter de servir des
  donnees perimees.
- En production, il est fortement recommande de placer ce proxy derriere un
  termineur TLS (Traefik, Caddy, ou un load balancer) et de restreindre les
  origines CORS aux seuls domaines autorises.
