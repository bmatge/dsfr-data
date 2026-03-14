# dsfr-data backend (server/)

Backend Express + SQLite pour le mode "database" de dsfr-data.
Ajoute authentification, RBAC, persistance en base, cache API et monitoring centralise.

## Demarrage rapide

```bash
# Depuis la racine du monorepo
npm install
npm run dev:server     # Demarre le backend en mode watch (port 3002)
npm run dev:all        # Demarre Vite + backend en parallele
```

## Variables d'environnement

| Variable | Defaut | Description |
|----------|--------|-------------|
| `PORT` | `3002` | Port d'ecoute Express |
| `DB_PATH` | `server/data/dsfr-data.db` | Chemin du fichier SQLite |
| `JWT_SECRET` | (obligatoire en production) | Secret pour signer les tokens JWT |
| `CORS_ORIGIN` | `http://localhost:5173` | Origine autorisee pour CORS |

## Routes API

### Auth

| Methode | Route | Description |
|---------|-------|-------------|
| `POST` | `/api/auth/register` | Inscription (email, password, displayName) |
| `POST` | `/api/auth/login` | Connexion (set cookie JWT httpOnly) |
| `POST` | `/api/auth/logout` | Deconnexion (clear cookie) |
| `GET` | `/api/auth/me` | Info utilisateur courant |
| `PUT` | `/api/auth/me` | Modifier profil (displayName, password) |

### CRUD resources

Pattern identique pour sources, connections, favorites, dashboards :

| Methode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/{resource}` | Liste (propres + partagees) |
| `GET` | `/api/{resource}/:id` | Detail (verifie acces read) |
| `POST` | `/api/{resource}` | Creer (owner = user courant) |
| `PUT` | `/api/{resource}/:id` | Modifier (verifie acces write) |
| `DELETE` | `/api/{resource}/:id` | Supprimer (owner uniquement) |

Ressources : `sources`, `connections`, `favorites`, `dashboards`.

### Groupes

| Methode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/groups` | Groupes de l'utilisateur |
| `POST` | `/api/groups` | Creer un groupe |
| `PUT` | `/api/groups/:id` | Modifier (admin du groupe) |
| `DELETE` | `/api/groups/:id` | Supprimer (admin du groupe) |
| `POST` | `/api/groups/:id/members` | Ajouter un membre |
| `DELETE` | `/api/groups/:id/members/:userId` | Retirer un membre |

### Partage

| Methode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/shares` | Liste partages d'une ressource (`?resource_type=&resource_id=`) |
| `POST` | `/api/shares` | Creer un partage (owner uniquement) |
| `DELETE` | `/api/shares/:id` | Supprimer un partage (owner uniquement) |

### Cache

| Methode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/cache/:sourceId` | Recuperer donnees cachees (si TTL valide) |
| `PUT` | `/api/cache/:sourceId` | Stocker donnees + hash + TTL |
| `DELETE` | `/api/cache/:sourceId` | Invalider le cache |

### Migration

| Methode | Route | Description |
|---------|-------|-------------|
| `POST` | `/api/migrate` | Importer donnees localStorage vers DB |

Body : `{ sources: [], connections: [], favorites: [], dashboards: [] }`
Retour : `{ imported: { sources: 3, ... }, skipped: { ... } }`

### Monitoring

| Methode | Route | Description |
|---------|-------|-------------|
| `POST` | `/api/monitoring/beacon` | Enregistrer un beacon (UPSERT) |
| `GET` | `/api/monitoring/data` | Donnees monitoring (format compatible app monitoring) |

### Health

| Methode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/health` | Health check (`{ status: "ok", mode: "database" }`) |

## Schema SQLite

Base en mode WAL (Write-Ahead Logging) pour de meilleures performances en lecture concurrente.

### Tables

| Table | Description |
|-------|-------------|
| `users` | Utilisateurs (id, email, password_hash, display_name, role) |
| `groups` | Groupes d'utilisateurs |
| `group_members` | Membres des groupes (group_id, user_id, role) |
| `sources` | Sources de donnees (config_json, data_json) |
| `connections` | Connexions API/Grist (api_key_encrypted) |
| `favorites` | Favoris (code HTML, builder_state_json) |
| `dashboards` | Tableaux de bord (layout_json, widgets_json) |
| `shares` | Partages polymorphiques (resource_type, target_type, permission) |
| `data_cache` | Cache des donnees API (source_id, data_json, ttl_seconds) |
| `monitoring` | Beacons centralises (component, chart_type, origin, call_count) |
| `schema_version` | Version du schema pour les migrations futures |

### Roles utilisateurs

- `admin` : gestion complete (utilisateurs, groupes, toutes ressources)
- `editor` : CRUD sur ses ressources + acces aux ressources partagees
- `viewer` : lecture seule sur les ressources partagees

### Modele de partage

Chaque ressource peut etre partagee via la table `shares` :
- `target_type = 'user'` : partage avec un utilisateur specifique
- `target_type = 'group'` : partage avec un groupe
- `target_type = 'global'` : visible par tous les utilisateurs authentifies
- `permission = 'read'` ou `'write'`

## Build

```bash
npm run build:server   # Compile TypeScript → server/dist/
```

## Tests

Les tests backend utilisent une DB SQLite en memoire (`:memory:`) et supertest :

```bash
npm run test:run       # Inclut les tests server (tests/server/*.test.ts)
```

## Docker (mode database)

```bash
# Generer un secret JWT
echo "JWT_SECRET=$(openssl rand -hex 32)" > .env

# Demarrer avec le mode database
docker compose -f docker-compose.yml -f docker-compose.db.yml up -d --build
```

La DB SQLite est persistee dans le volume `db-data`.
