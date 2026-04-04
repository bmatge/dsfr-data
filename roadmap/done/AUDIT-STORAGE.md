# Audit complet : Sauvegarde des sources, favoris et stabilite serveur

**Date** : 2026-02-19
**Perimetre** : Stockage hybride (localStorage + SQLite), gestion des sources, favoris, connexions, RBAC, synchronisation client-serveur.

---

## Table des matieres

1. [Synthese executive](#1-synthese-executive)
2. [Architecture actuelle](#2-architecture-actuelle)
3. [Problemes critiques identifies](#3-problemes-critiques-identifies)
4. [Problemes de fiabilite](#4-problemes-de-fiabilite)
5. [Problemes de securite](#5-problemes-de-securite)
6. [Problemes d'architecture](#6-problemes-darchitecture)
7. [Plan de fiabilisation](#7-plan-de-fiabilisation)
8. [Proposition : import/export normalise](#8-proposition--importexport-normalise)
9. [Strategie de scalabilite (SQLite > MariaDB)](#9-strategie-de-scalabilite-sqlite--mariadb)

---

## 1. Synthese executive

Le systeme de stockage hybride est **fonctionnellement complet** mais presente des **fragilites structurelles** qui expliquent les incidents de fiabilite observes :

| Aspect | Etat | Risque |
|--------|------|--------|
| Schema SQLite | Correct, bien structure | Faible |
| RBAC (roles + partages) | Fonctionnel, logique correcte | Moyen |
| Sync client-serveur | **Fire-and-forget, sans retry** | **Critique** |
| Gestion des connexions | Index tableau comme cle primaire | **Eleve** |
| Gestion des sources | IDs fragiles (`Date.now()`) | Moyen |
| Stockage API keys | **Clair texte dans localStorage** | **Critique** |
| Validation des donnees | Aucune validation de schema | Eleve |
| Gestion d'erreurs | Silencieuse (catch vide) | Eleve |
| Import/Export | Partiel (favoris seulement) | Moyen |

**Cause racine des instabilites** : la synchronisation `syncToApi()` est fire-and-forget avec des `catch` vides. Quand le serveur est lent ou temporairement indisponible, les donnees sont ecrites en localStorage mais **jamais confirmees cote serveur**. L'utilisateur croit que ses sources sont sauvegardees, mais elles n'existent que dans le cache navigateur.

---

## 2. Architecture actuelle

### 2.1 Flux de donnees

```
Application (Builder, Sources, Favorites, Dashboard)
       |
       | saveToStorage(key, data)         ← API synchrone
       |
       v
  localStorage.setItem()                  ← Ecriture immediate
       |
       | si authentifie: _saveHook()       ← Hook async
       v
  ApiStorageAdapter.save()
       |
       | 1. saveToStorage() (deja fait)
       | 2. syncToApi() en background      ← Fire-and-forget
       v
  syncToApi()
       |
       | GET /api/{resource}               ← Lire l'etat distant
       | Pour chaque item local :
       |   POST (nouveau) ou PUT (existant)
       | Pour chaque item distant absent du local :
       |   DELETE (si _owned !== false)
       v
  Serveur Express + SQLite
```

### 2.2 Fichiers cles

| Couche | Fichier | Role |
|--------|---------|------|
| localStorage | `packages/shared/src/storage/local-storage.ts` | `loadFromStorage`, `saveToStorage`, hooks |
| Adapter API | `packages/shared/src/storage/api-storage-adapter.ts` | Sync local-first avec API |
| Abstraction | `packages/shared/src/storage/storage-provider.ts` | Interface `StorageAdapter` |
| Auth client | `packages/shared/src/auth/auth-service.ts` | Detection DB mode, auto-migration |
| Init auth | `packages/shared/src/auth/init-auth.ts` | `initAuth()`, prefetch, hook setup |
| CRUD generique | `server/src/routes/resource-crud.ts` | Factory CRUD pour toutes les ressources |
| RBAC | `server/src/middleware/rbac.ts` | `canAccess()`, hierarchie de roles |
| Schema | `server/src/db/schema.sql` | 11 tables, contraintes FK |
| Sources app | `apps/sources/src/connections/connection-manager.ts` | CRUD connexions, rendu UI |
| State sources | `apps/sources/src/state.ts` | Etat mutable, normalisation connexions |
| Favoris | `apps/favorites/src/favorites-manager.ts` | CRUD favoris |
| Migration | `server/src/routes/migrate.ts` | Import localStorage vers DB |

---

## 3. Problemes critiques identifies

### 3.1 CRITIQUE : Synchronisation fire-and-forget sans feedback

**Fichier** : `packages/shared/src/storage/api-storage-adapter.ts:69-72`

```typescript
// Sync to API in background (fire-and-forget)
this.syncToApi(endpoint, data).catch((err) => {
  console.warn(`[ApiStorageAdapter] save(${key}): API sync failed`, err);
});
```

**Impact** :
- L'utilisateur enregistre une source → localStorage OK → mais sync serveur echoue silencieusement
- L'utilisateur change de navigateur/device → ses sources ont disparu
- Aucun indicateur visuel de l'etat de synchronisation
- Aucune file d'attente, aucun retry

**Recommandation** : Implementer une file de sync avec retry exponentiel et indicateur visuel (icone "synced/syncing/error").

### 3.2 CRITIQUE : Algorithme de sync naif avec risque de suppression

**Fichier** : `packages/shared/src/storage/api-storage-adapter.ts:133-144`

```typescript
// Delete remote items not in local state (owned only)
for (const remote of remoteItems) {
  if (!localIds.has(remote.id) && (remote as Record<string, unknown>)._owned !== false) {
    try {
      await fetch(`.../${remote.id}`, { method: 'DELETE', ... });
    } catch { }
  }
}
```

**Impact** :
- Si le localStorage est corrompu ou vide (cache vide, changement navigateur) → TOUTES les sources distantes sont supprimees
- Scenar : utilisateur ouvre un nouvel onglet prive → localStorage vide → sync supprime tout cote serveur
- Pas de protection contre la suppression massive
- Pas de "tombstone" ou de soft-delete

**Recommandation** : Supprimer la logique de deletion dans syncToApi() - les suppressions doivent etre explicites (action utilisateur), pas implicites (difference local/remote).

### 3.3 CRITIQUE : JSON.parse sans try-catch dans connection-manager

**Fichier** : `apps/sources/src/connections/connection-manager.ts:677-678`

```typescript
const source = JSON.parse(selectedSourceStr);
const existingSources = JSON.parse(localStorage.getItem(STORAGE_KEYS.SOURCES) || '[]');
```

**Impact** : Si les donnees localStorage sont corrompues, crash complet de l'app Sources.

### 3.4 CRITIQUE : Cles API en clair

**Fichier** : `apps/sources/src/connections/connection-manager.ts:191`

Les cles API Grist sont stockees en clair dans localStorage (`conn.apiKey`). Le champ `api_key_encrypted` dans le schema SQL existe mais **aucun chiffrement n'est implemente**.

---

## 4. Problemes de fiabilite

### 4.1 ELEVE : Index tableau comme identifiant de selection

**Fichier** : `apps/sources/src/state.ts` et `connection-manager.ts`

```typescript
selectedConnection: number | null  // INDEX dans le tableau, pas ID
```

La selection d'une connexion repose sur un index tableau. Quand on supprime un element, tous les index suivants se decalent. Ca provoque :
- Selection d'une mauvaise connexion apres suppression
- Corruption de l'etat d'edition si on edite la connexion N et qu'on supprime la N-1

**Recommandation** : Utiliser `selectedConnectionId: string | null` et retrouver l'element par `.find(c => c.id === id)`.

### 4.2 ELEVE : IDs non-uniques pour les sources et connexions

**Fichiers** : `connection-manager.ts:187,270` et `main.ts:83`

```typescript
// Connexions : Date.now().toString()
id: Date.now().toString()

// Sources manuelles : manual_${Date.now()}
id: `manual_${Date.now()}`
```

Deux creations dans la meme milliseconde = collision d'ID = ecrasement silencieux. Le serveur utilise `uuidv4()` pour les creations directes, mais les donnees migrerees depuis localStorage conservent ces IDs fragiles.

**Recommandation** : Utiliser `crypto.randomUUID()` (API Web standard) partout cote client.

### 4.3 ELEVE : Promise d'auth cachee sans invalidation

**Fichier** : `packages/shared/src/auth/auth-service.ts:89-92`

```typescript
export async function checkAuth(): Promise<AuthState> {
  if (_checkAuthPromise) return _checkAuthPromise;
  _checkAuthPromise = _doCheckAuth();
  return _checkAuthPromise;
}
```

Si le premier appel echoue (timeout reseau), **tous les appelants subsequents recoivent la meme erreur** sans possibilite de retry. La promise rejetee/resolue est cachee indefiniment.

**Recommandation** : Invalider le cache en cas d'echec : `_checkAuthPromise = null` dans le catch.

### 4.4 MOYEN : Normalisation des connexions fragile

**Fichier** : `apps/sources/src/state.ts:95-136`

Quand une connexion revient du serveur, elle contient un `config_json` avec les champs specifiques (url, apiKey, etc.). La fonction `normalizeConnection()` doit les extraire et les remonter au niveau racine. Si un champ est renomme ou si le format change, la normalisation echoue silencieusement et la connexion apparait comme "cassee" dans l'UI.

**Recommandation** : Definir un schema de validation clair et logger un warning si la normalisation echoue.

### 4.5 MOYEN : Fenetre de donnees obsoletes au demarrage

**Fichier** : `apps/sources/src/main.ts:151-160`

```typescript
await initAuth();  // Configure l'adapter, prefetch depuis serveur
// Mais ensuite recharge depuis localStorage (pas le resultat du prefetch) :
state.connections = normalizeConnections(loadFromStorage(STORAGE_KEYS.CONNECTIONS, []));
state.sources = loadFromStorage(STORAGE_KEYS.SOURCES, []);
```

L'app prefetch les donnees du serveur (qui mettent a jour le localStorage), puis relit le localStorage. Si le prefetch n'est pas termine a temps, l'UI montre les anciennes donnees.

**Recommandation** : Attendre le resultat du prefetch avant de charger l'etat, ou afficher un indicateur de chargement.

### 4.6 MOYEN : Pas de gestion de conflits multi-device

Quand deux devices modifient les memes donnees :
- Device A : supprime la source X → sync → serveur supprime X
- Device B : modifie la source X → sync → serveur recree X (POST car absent)

Resultat : donnees inchoerentes, pas de resolution de conflit, pas de versioning.

---

## 5. Problemes de securite

### 5.1 Cles API en clair dans localStorage

**Severite** : Critique
**Impact** : XSS = vol de toutes les cles API Grist
**Recommandation** : Stocker les cles API uniquement cote serveur (champ `api_key_encrypted` avec chiffrement AES-256). Le client ne devrait jamais voir les cles en clair.

### 5.2 Pas de rate-limiting sur les endpoints d'auth

**Severite** : Moyenne
**Fichier** : `server/src/routes/auth.ts`
**Impact** : Brute-force possible sur `/api/auth/login`
**Recommandation** : Ajouter `express-rate-limit` avec 5 tentatives/15min.

### 5.3 Token JWT sans rotation

**Severite** : Moyenne
**Fichier** : `server/src/middleware/auth.ts:27`
Token de 7 jours sans refresh token. Si compromis, acces total pendant 7 jours.
**Recommandation** : Access token 15min + refresh token 30 jours.

### 5.4 Pas de validation des URLs de connexion

**Severite** : Moyenne
**Fichier** : `connection-manager.ts:224`
L'utilisateur peut saisir `javascript:alert(1)` ou `data:text/html,...` comme URL API. Pas de validation de scheme.
**Recommandation** : Valider que l'URL commence par `https://` ou `http://`.

### 5.5 Pas d'index SQL (performance/DoS)

**Severite** : Faible a Moyenne
**Fichier** : `server/src/db/schema.sql`
Aucun index explicite. Avec beaucoup de donnees, les requetes RBAC (3-6 queries par operation) deviendront lentes.
**Recommandation** : Ajouter des index sur `owner_id`, `resource_type + resource_id`, `target_type + target_id`.

---

## 6. Problemes d'architecture

### 6.1 Double systeme de stockage incoherent

Les apps utilisent deux APIs differentes :
- `loadFromStorage()`/`saveToStorage()` (synchrone, `local-storage.ts`)
- `loadData()`/`saveData()` (async, `storage-provider.ts`)

Seul `initAuth()` utilise l'API async. Les apps passent par l'API synchrone + hook. Ca fonctionne mais c'est fragile : si le hook n'est pas enregistre (race condition au demarrage), les donnees ne sont pas synchronisees.

### 6.2 Accoupage fort entre UI et stockage

Le `connection-manager.ts` fait 895 lignes en melangeant rendu DOM, logique metier, et appels de stockage. Aucune separation de responsabilites. Ca rend les tests unitaires impossibles et les bugs difficiles a isoler.

### 6.3 Absence de schema de validation

Aucune validation runtime des donnees lues depuis localStorage ou l'API. Un `JSON.parse()` retourne un `any` caste en `T` par TypeScript, mais sans verification reelle. Si le format change entre deux versions, crash silencieux ou corruption.

### 6.4 Inconsistance des cles de stockage

```typescript
FAVORITES: 'dsfr-data-favorites',    // tirets
DASHBOARDS: 'dsfr-data-dashboards',  // tirets
CONNECTIONS: 'dsfr-data-connections', // underscores
SOURCES: 'dsfr-data-sources',        // underscores
```

Melange de conventions de nommage. Pas un bug, mais symptome d'un developpement incremental.

---

## 7. Plan de fiabilisation

### Phase 1 : Corrections critiques (priorite haute)

#### 1.1 Securiser la synchronisation

**Objectif** : Eliminer les pertes de donnees silencieuses.

**Actions** :
- [ ] Supprimer la logique de DELETE implicite dans `syncToApi()` (les suppressions doivent etre explicites via action utilisateur → appel DELETE direct)
- [ ] Ajouter une file d'attente (`SyncQueue`) avec retry exponentiel (3 tentatives, 2s/4s/8s)
- [ ] Ajouter un indicateur de sync dans l'UI (icone dans le header : vert = sync, orange = en cours, rouge = erreur)
- [ ] Logger les echecs de sync en localStorage (`gw-sync-errors`) pour diagnostic

**Fichiers a modifier** :
- `packages/shared/src/storage/api-storage-adapter.ts` (refonte syncToApi)
- `packages/shared/src/auth/init-auth.ts` (indicateur sync)
- `src/components/layout/app-header.ts` (affichage indicateur)

#### 1.2 Corriger les JSON.parse non proteges

**Actions** :
- [ ] Wrapper tous les `JSON.parse()` dans des try-catch dans `connection-manager.ts:677-678`
- [ ] Auditer tous les appels `JSON.parse` hors utilitaires et les securiser

#### 1.3 Generer des IDs uniques

**Actions** :
- [ ] Remplacer `Date.now().toString()` par `crypto.randomUUID()` pour les connexions
- [ ] Remplacer `manual_${Date.now()}` par `crypto.randomUUID()` pour les sources manuelles
- [ ] Remplacer `fav-${Date.now()}` par `crypto.randomUUID()` pour les favoris
- [ ] Remplacer `dashboard-${Date.now()}` par `crypto.randomUUID()` pour les dashboards

#### 1.4 Corriger la selection par index

**Actions** :
- [ ] Changer `selectedConnection: number | null` en `selectedConnectionId: string | null` dans le state
- [ ] Adapter toutes les fonctions qui utilisent l'index (renderConnections, selectConnection, editConnection, deleteConnection)
- [ ] Meme traitement pour `editingConnectionIndex`

### Phase 2 : Fiabilisation (priorite moyenne)

#### 2.1 Ajouter une validation de schema

**Actions** :
- [ ] Creer un module `packages/shared/src/validation/` avec des fonctions de validation pour chaque type (Source, Connection, Favorite, Dashboard)
- [ ] Valider les donnees a la lecture (apres `JSON.parse`) et ignorer/reparer les items invalides
- [ ] Logger les items rejetes pour diagnostic

**Exemple** :
```typescript
function validateSource(raw: unknown): Source | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string' || !obj.id) return null;
  if (typeof obj.name !== 'string' || !obj.name) return null;
  if (!['grist', 'api', 'manual'].includes(obj.type as string)) return null;
  return obj as Source;
}
```

#### 2.2 Invalider le cache de checkAuth()

**Actions** :
- [ ] Mettre `_checkAuthPromise = null` dans le catch de `_doCheckAuth()`
- [ ] Ajouter un timeout de 5s sur la detection du mode DB

#### 2.3 Securiser les cles API

**Actions** :
- [ ] Implementer le chiffrement AES-256 cote serveur pour `api_key_encrypted`
- [ ] Ne plus envoyer les cles API au client (le proxy serveur les injecte dans les headers)
- [ ] Alternative minimale : chiffrer en localStorage avec Web Crypto API

#### 2.4 Ajouter des index SQL

```sql
CREATE INDEX IF NOT EXISTS idx_sources_owner ON sources(owner_id);
CREATE INDEX IF NOT EXISTS idx_connections_owner ON connections(owner_id);
CREATE INDEX IF NOT EXISTS idx_favorites_owner ON favorites(owner_id);
CREATE INDEX IF NOT EXISTS idx_dashboards_owner ON dashboards(owner_id);
CREATE INDEX IF NOT EXISTS idx_shares_resource ON shares(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_shares_target ON shares(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
```

### Phase 3 : Ameliorations structurelles (priorite basse)

#### 3.1 Unifier l'API de stockage

**Actions** :
- [ ] Migrer les apps de `loadFromStorage`/`saveToStorage` vers `loadData`/`saveData` (async)
- [ ] Supprimer le mecanisme de hook au profit d'appels directs a l'adapter
- [ ] Cela elimine le risque de hook non-enregistre

#### 3.2 Separer UI et logique metier

**Actions** :
- [ ] Extraire les fonctions CRUD de `connection-manager.ts` dans un module `connection-service.ts`
- [ ] Le manager ne fait que du rendu DOM, le service gere le state et le stockage
- [ ] Permet de tester unitairement la logique metier

#### 3.3 Rate-limiting et refresh tokens

**Actions** :
- [ ] Ajouter `express-rate-limit` sur `/api/auth/login` et `/api/auth/register`
- [ ] Implementer un systeme access-token (15min) + refresh-token (30j)

---

## 8. Proposition : import/export normalise

### 8.1 Format d'export

Creer un format JSON unique pour l'export/import de **toutes** les donnees utilisateur :

```typescript
interface GwExportFile {
  version: 1;
  exportedAt: string;  // ISO timestamp
  exportedBy?: string; // email
  data: {
    sources: Source[];
    connections: ExportableConnection[];  // sans apiKey
    favorites: Favorite[];
    dashboards: DashboardData[];
  };
}
```

### 8.2 Regles d'export

- Les **cles API ne sont jamais exportees** (securite)
- Les connexions exportees ont `apiKey: null` et `status: 'disconnected'`
- L'utilisateur doit re-saisir ses cles API apres import
- Les IDs sont preserves pour permettre le dedup a l'import

### 8.3 Regles d'import

- **Deduplication par ID** : si un item avec le meme ID existe, on le saute (ou option "ecraser")
- **Validation de schema** : chaque item importe est valide avant insertion
- **Rapport d'import** : "X sources importees, Y ignorees (doublons), Z rejetees (format invalide)"
- **Transaction** : import atomique (tout ou rien) cote serveur

### 8.4 Benefices

1. **Fiabilisation** : le format d'export sert de "schema de reference" pour la validation
2. **Backup utilisateur** : export > sauvegarde locale > import apres reinstallation
3. **Migration** : facilite le passage d'un mode a l'autre (local > serveur)
4. **Partage** : un utilisateur peut exporter ses sources et les donner a un collegue
5. **Debug** : l'export permet de diagnostiquer les problemes de donnees

### 8.5 Implementation

**Fichiers a creer** :
- `packages/shared/src/export/export-format.ts` (types + validation)
- `packages/shared/src/export/exporter.ts` (collecte + serialisation)
- `packages/shared/src/export/importer.ts` (validation + dedup + insertion)
- `server/src/routes/import-export.ts` (endpoints REST)

**Endpoints** :
- `GET /api/export` : exporter toutes les donnees de l'utilisateur
- `POST /api/import` : importer un fichier GwExportFile

**Integration UI** : boutons dans la page Sources et dans le header utilisateur (Parametres > Export/Import).

---

## 9. Strategie de scalabilite (SQLite > MariaDB)

### 9.1 Etat actuel

L'architecture est **deja assez bien abstraite** :
- `resource-crud.ts` est un factory generique qui construit des requetes SQL
- Les routes specifiques (`sources.ts`, `favorites.ts`) ne contiennent que la config
- La base est initialisee dans `database.ts` avec un singleton

### 9.2 Points de friction pour une migration

| Point | Probleme | Solution |
|-------|----------|----------|
| `better-sqlite3` synchrone | MariaDB est async | Abstraire derriere une interface async `DbAdapter` |
| `datetime('now')` | Syntaxe SQLite | Utiliser `NOW()` pour MySQL ou un helper |
| `INSERT OR IGNORE` | Syntaxe SQLite | Utiliser `INSERT IGNORE` pour MySQL |
| `ON CONFLICT ... DO UPDATE` | UPSERT SQLite | Utiliser `ON DUPLICATE KEY UPDATE` pour MySQL |
| `pragma('journal_mode = WAL')` | Specifique SQLite | Pas d'equivalent (inutile pour MySQL) |
| Template literals dans SQL | `SELECT * FROM ${table}` | Pas de changement necessaire |

### 9.3 Plan d'abstraction

#### Etape 1 : Interface DbAdapter

```typescript
interface DbAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number; lastInsertRowid?: number }>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
```

#### Etape 2 : Implementations

- `SqliteAdapter` : wrapper autour de `better-sqlite3` (existant, juste adapter l'interface)
- `MariaDbAdapter` : wrapper autour de `mysql2/promise` ou `mariadb`
- `PostgresAdapter` : (futur) wrapper autour de `pg`

#### Etape 3 : Configuration

```typescript
// .env
DB_TYPE=sqlite       # ou mariadb, postgres
DB_PATH=./data/dsfr-data.db
# ou
DB_HOST=localhost
DB_PORT=3306
DB_NAME=dsfr_data
DB_USER=root
DB_PASSWORD=***
```

#### Etape 4 : SQL compatible

Utiliser un query builder leger (ex: `kysely`) ou simplement abstraire les differences de syntaxe dans le DbAdapter (methodes `upsert()`, `now()`, `transaction()`).

### 9.4 Ordre recommande

1. **Court terme** : rester sur SQLite (suffisant pour des centaines d'utilisateurs)
2. **Moyen terme** : extraire l'interface `DbAdapter`, adapter le code existant
3. **Long terme** : implementer `MariaDbAdapter` quand le besoin se presente

SQLite supporte tres bien le multi-utilisateur en mode WAL (deja active). Le passage a MariaDB ne sera necessaire que si :
- Plus de 1000 utilisateurs simultanes
- Besoin de replication/haute disponibilite
- Besoin de recherche full-text avancee

---

## Annexe : Matrice des risques

| # | Probleme | Severite | Probabilite | Impact | Effort fix |
|---|----------|----------|-------------|--------|-----------|
| 1 | Sync fire-and-forget | Critique | Haute | Perte de donnees | 2-3j |
| 2 | DELETE implicite dans sync | Critique | Moyenne | Suppression massive | 0.5j |
| 3 | JSON.parse non protege | Critique | Moyenne | Crash app | 0.5j |
| 4 | API keys en clair | Critique | Faible | Vol de credentials | 2-3j |
| 5 | Index comme selection | Eleve | Haute | Corruption etat UI | 1j |
| 6 | IDs non-uniques | Eleve | Faible | Ecrasement donnees | 0.5j |
| 7 | Cache auth non invalide | Eleve | Moyenne | Login impossible | 0.5j |
| 8 | Pas de validation schema | Eleve | Moyenne | Crash ou corruption | 2j |
| 9 | Fenetre donnees obsoletes | Moyen | Haute | Confusion utilisateur | 0.5j |
| 10 | Pas de conflits multi-device | Moyen | Faible | Incoh. donnees | 3-5j |
| 11 | Pas de rate-limiting | Moyen | Faible | Brute-force | 0.5j |
| 12 | Pas d'index SQL | Moyen | Faible | Perf. degradee | 0.5j |
| 13 | Pas d'import/export sources | Moyen | N/A | Pas de backup | 2j |

**Effort total estime** : ~15-20 jours de developpement pour les phases 1 et 2.
