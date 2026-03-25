# FR-002 : Authentification RBAC et preparation ProConnect

**Statut** : Draft
**Priorite** : Haute
**Prerequis** : FR-001 (Migration MariaDB)
**Bloque par** : Rien (les phases internes sont independantes de ProConnect)

---

## 1. Contexte

Le serveur Express dispose deja d'une authentification basique :
- **JWT** en cookie httpOnly (7 jours), cree au login/register
- **bcrypt** pour les mots de passe (10 salt rounds)
- **RBAC** : 3 roles (`admin`, `editor`, `viewer`) avec hierarchie
- **Partage** : ownership + shares (user, group, global) avec permissions read/write
- Le premier utilisateur inscrit devient automatiquement `admin`

**Limites actuelles** :
- Pas d'interface d'administration des utilisateurs
- Pas de possibilite de desactiver un compte
- Pas de colonnes pour un provider externe (ProConnect/OIDC)
- Pas de gestion de sessions (un JWT vole reste valide 7 jours)
- Pas de rate limiting sur les endpoints d'auth
- Aucune validation d'email a l'inscription
- Pas de verification d'email (enrollment)
- Pas d'envoi d'email (pas de serveur SMTP configure)

**Objectif a terme** : integrer **ProConnect** (DINUM), le SSO de l'Etat base sur **OpenID Connect**, pour permettre aux agents publics de se connecter avec leur identite professionnelle.

**Infrastructure mail** : le VPS dispose d'un serveur SMTP (`docker-mailserver`) sur le reseau Docker `ecosystem-network`, avec DKIM configure pour le domaine `ecosysteme.matge.com`. Pas d'authentification requise depuis le reseau interne.

## 2. ProConnect : vue d'ensemble

### 2.1 Qu'est-ce que ProConnect ?

ProConnect (ex-AgentConnect) est le fournisseur d'identite (IdP) de l'Etat francais, opere par la DINUM. Il federe les identity providers des administrations (Cerbere, MonComptePro, etc.) via un hub OpenID Connect.

### 2.2 Protocole

- **OpenID Connect 1.0** (surcouche OAuth 2.0)
- **Authorization Code Flow** (le seul supporte)
- **PKCE** recommande (mais pas obligatoire pour les clients confidentiels)
- **Discovery** : `https://auth.proconnect.gouv.fr/api/v2/.well-known/openid-configuration`

### 2.3 Claims disponibles

| Claim | Description | Exemple |
|-------|-------------|---------|
| `sub` | Identifiant unique de l'utilisateur (par IdP) | `abc123-def456` |
| `email` | Email professionnel | `jean.dupont@finances.gouv.fr` |
| `given_name` | Prenom | `Jean` |
| `usual_name` | Nom d'usage | `Dupont` |
| `uid` | Identifiant technique aupres de l'IdP | `jdupont` |
| `siret` | SIRET de l'organisation | `13002526500013` |
| `organizational_unit` | Service / direction | `DGFIP/SI` |
| `idp_id` | Identifiant du fournisseur d'identite | `moncomptepro` |

### 2.4 Processus d'onboarding

1. **Environnement de test** : acces immediat via le portail partenaires ProConnect (credentials sandbox)
2. **DataPass** : demande d'habilitation avec justification du besoin (~5 jours ouvrés)
3. **Credentials de production** : delivres apres validation DataPass (~5 jours ouvrés)
4. **Total estime** : 2 a 3 semaines

### 2.5 Contraintes techniques

- `redirect_uri` doit matcher exactement (slash final compris)
- Le `state` doit etre genere cote serveur et verifie au callback (CSRF)
- Le `nonce` doit etre inclus dans la requete d'autorisation et verifie dans l'id_token
- Deconnexion : obligation d'appeler le endpoint `/session/end` de ProConnect (RP-Initiated Logout)
- Le `sub` est unique par couple (utilisateur, identity provider) — pas globalement unique

## 3. Architecture cible

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (SPA)                       │
│                                                         │
│  ┌─────────────┐  ┌──────────────────┐  ┌───────────┐  │
│  │ Login local  │  │ Bouton ProConnect │  │ Admin UI  │  │
│  │ (email/pwd)  │  │ (redirect)       │  │ (users)   │  │
│  └──────┬───────┘  └────────┬─────────┘  └─────┬─────┘  │
│         │                   │                   │        │
└─────────┼───────────────────┼───────────────────┼────────┘
          │                   │                   │
          ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────┐
│                   Express API                            │
│                                                         │
│  POST /api/auth/login ────────────── JWT cookie ──────► │
│  POST /api/auth/register ──► email verification ──────► │
│  GET  /api/auth/verify-email?token=xxx ──► JWT cookie ► │
│  POST /api/auth/resend-verification                     │
│                                                         │
│  GET  /api/auth/proconnect ──► redirect ProConnect      │
│  GET  /api/auth/proconnect/callback ──► JWT cookie ───► │
│  GET  /api/auth/proconnect/logout ──► redirect PC       │
│                                                         │
│  GET  /api/admin/users ────── requireRole('admin') ───► │
│  PUT  /api/admin/users/:id                              │
│  DELETE /api/admin/users/:id                            │
│                                                         │
│  authMiddleware (JWT cookie | Bearer token)              │
│  rbac (ownership + shares + groups + roles)              │
│                                                         │
└─────────────────────────────────────────────────────────┘
          │                   │                   │
          ▼                   ▼                   ▼
   ┌──────────┐     ┌────────────────┐   ┌──────────────┐
   │ MariaDB  │     │  ProConnect    │   │  SMTP        │
   │ (users,  │     │  OIDC Provider │   │  mailserver  │
   │  etc.)   │     │  (DINUM)       │   │  (DKIM)      │
   └──────────┘     └────────────────┘   └──────────────┘
```

## 4. Evolution du schema (Migration MariaDB v2)

### 4.1 Table users : nouvelles colonnes

```sql
-- Migration v2 : preparation ProConnect

ALTER TABLE users
  ADD COLUMN auth_provider ENUM('local', 'proconnect') NOT NULL DEFAULT 'local'
    AFTER role,
  ADD COLUMN external_id VARCHAR(255) NULL
    AFTER auth_provider,
  ADD COLUMN idp_id VARCHAR(255) NULL
    AFTER external_id,
  ADD COLUMN siret VARCHAR(14) NULL
    AFTER idp_id,
  ADD COLUMN organizational_unit VARCHAR(255) NULL
    AFTER siret,
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE
    AFTER organizational_unit,
  ADD COLUMN last_login TIMESTAMP NULL
    AFTER is_active,
  ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE
    AFTER last_login,
  ADD COLUMN verification_token_hash VARCHAR(64) NULL
    AFTER email_verified,
  ADD COLUMN verification_expires TIMESTAMP NULL
    AFTER verification_token_hash,
  MODIFY COLUMN password_hash VARCHAR(255) NULL;
  -- password_hash nullable pour les comptes ProConnect (pas de mot de passe local)

-- Marquer les utilisateurs existants comme verifies (migration non-disruptive)
UPDATE users SET email_verified = TRUE;

CREATE UNIQUE INDEX idx_users_external
  ON users(auth_provider, external_id);

CREATE INDEX idx_users_active
  ON users(is_active);

CREATE INDEX idx_users_verification
  ON users(verification_token_hash);

UPDATE schema_version SET version = 2 WHERE version = 1;
INSERT IGNORE INTO schema_version (version) VALUES (2);
```

### 4.2 Table sessions (nouvelle, optionnelle)

Pour permettre la revocation de sessions et le suivi des connexions :

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  token_hash VARCHAR(64) NOT NULL,       -- SHA-256 du JWT (pour revocation)
  auth_provider ENUM('local', 'proconnect') NOT NULL,
  ip_address VARCHAR(45),                -- IPv4 ou IPv6
  user_agent VARCHAR(500),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_sessions_user (user_id),
  INDEX idx_sessions_token (token_hash),
  INDEX idx_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 4.3 Table audit_log (nouvelle, recommandee)

Pour la tracabilite des actions sensibles :

```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(36),
  action VARCHAR(100) NOT NULL,          -- login, logout, role_change, user_disable, etc.
  target_type VARCHAR(50),               -- user, source, connection, etc.
  target_id VARCHAR(36),
  details JSON,                          -- metadata libre
  ip_address VARCHAR(45),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_user (user_id),
  INDEX idx_audit_action (action),
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

## 5. Phase A : Renforcement de l'auth locale

*Peut demarrer immediatement, independamment de ProConnect.*

### 5.1 Rate limiting

```typescript
// server/src/middleware/rate-limit.ts
import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,                    // 10 tentatives
  message: { error: 'Trop de tentatives, reessayez dans 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});
```

Appliquer sur `POST /api/auth/login` et `POST /api/auth/register`.

**Dependance** : `express-rate-limit`

### 5.2 Validation des entrees

```typescript
// server/src/utils/validation.ts

export function isValidEmail(email: string): boolean;
export function isStrongPassword(password: string): { valid: boolean; reason?: string };
// Min 8 chars, 1 majuscule, 1 minuscule, 1 chiffre
```

### 5.3 Desactivation de comptes

L'ajout du champ `is_active` dans la table `users` permet de desactiver sans supprimer :
- Le middleware `authMiddleware` verifie `is_active` en plus du JWT
- Un compte desactive ne peut plus se connecter
- Ses ressources restent accessibles aux autres via les partages existants

### 5.4 Duree de session configurable

```env
JWT_EXPIRY=7d              # Defaut actuel
SESSION_INACTIVITY=24h     # Nouveau : deconnexion apres inactivite
```

### 5.5 Verification d'email a l'inscription (enrollment)

#### 5.5.1 Infrastructure SMTP

Le conteneur `chartsbuilder` est connecte au reseau Docker `ecosystem-network` qui heberge un serveur `docker-mailserver` (conteneur `mailserver`). Ce serveur SMTP :
- Ecoute sur le port 25 (pas d'auth depuis le reseau interne Docker)
- Envoie avec DKIM signe pour le domaine `ecosysteme.matge.com`
- N'est utilise qu'en envoi (SMTP_ONLY=1)

#### 5.5.2 Module mailer

```typescript
// server/src/utils/mailer.ts

import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'mailserver',
  port: parseInt(process.env.SMTP_PORT || '25'),
  secure: false,           // pas de TLS sur le reseau interne
  tls: { rejectUnauthorized: false },
});

const FROM = process.env.SMTP_FROM || 'noreply@ecosysteme.matge.com';
const APP_URL = process.env.APP_URL || 'https://chartsbuilder.matge.com';

export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const verifyUrl = `${APP_URL}/api/auth/verify-email?token=${token}`;
  await transporter.sendMail({
    from: `"DSFR Data" <${FROM}>`,
    to: email,
    subject: 'Confirmez votre adresse email — DSFR Data',
    html: `
      <p>Bonjour,</p>
      <p>Vous avez cree un compte sur DSFR Data. Cliquez sur le lien ci-dessous pour confirmer votre adresse email :</p>
      <p><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p>Ce lien expire dans 24 heures.</p>
      <p>Si vous n'etes pas a l'origine de cette inscription, ignorez cet email.</p>
    `,
    text: `Confirmez votre email en visitant : ${verifyUrl}\n\nCe lien expire dans 24 heures.`,
  });
}

export async function sendWelcomeEmail(email: string, displayName: string): Promise<void> {
  await transporter.sendMail({
    from: `"DSFR Data" <${FROM}>`,
    to: email,
    subject: 'Bienvenue sur DSFR Data',
    html: `
      <p>Bonjour ${displayName},</p>
      <p>Votre compte a ete cree sur <a href="${APP_URL}">DSFR Data</a> via ProConnect.</p>
      <p>Vous disposez du role <strong>editeur</strong> et pouvez creer des visualisations de donnees.</p>
      <p>Si vous n'etes pas a l'origine de cette connexion, contactez l'administrateur.</p>
    `,
    text: `Bonjour ${displayName},\n\nVotre compte a ete cree sur DSFR Data (${APP_URL}) via ProConnect.\nRole : editeur.`,
  });
}
```

#### 5.5.3 Flow d'inscription avec verification

```
Utilisateur                    Serveur                        SMTP
    │                            │                              │
    ├── POST /register ─────────►│                              │
    │   (email, password)        │                              │
    │                            ├── Cree le compte             │
    │                            │   email_verified = false     │
    │                            │   verification_token_hash    │
    │                            │   verification_expires +24h  │
    │                            │                              │
    │                            ├── sendVerificationEmail() ──►│
    │                            │                              ├──► Email
    │◄── 201 { message:         │                              │
    │    "Verification email     │                              │
    │     envoyee" }             │                              │
    │                            │                              │
    │   (clic sur le lien)       │                              │
    │                            │                              │
    ├── GET /verify-email ──────►│                              │
    │   ?token=abc123            │                              │
    │                            ├── SHA-256(token) ==          │
    │                            │   verification_token_hash ?  │
    │                            │   expires > NOW() ?          │
    │                            │                              │
    │                            ├── email_verified = true      │
    │                            │   verification_token = NULL  │
    │                            │                              │
    │                            ├── createToken() + cookie     │
    │◄── 302 redirect / ────────┤                              │
    │   (connecte)               │                              │
```

#### 5.5.4 Endpoints

**`POST /api/auth/register`** (modifie) :
- Cree le compte avec `email_verified = false`
- Genere un token : `crypto.randomBytes(32).toString('hex')`
- Stocke le hash SHA-256 du token en base (pas le token brut)
- Envoie l'email de verification avec le token brut dans le lien
- **Ne pose pas de JWT** (l'utilisateur doit verifier son email d'abord)
- Retourne `201 { message: 'Verification email envoyee', email }`
- **Exception** : le premier utilisateur (admin) est cree avec `email_verified = true` directement, recoit son JWT normalement (pas de verification requise)

**`GET /api/auth/verify-email?token=xxx`** (nouveau) :
- Hash le token recu en SHA-256
- Cherche l'utilisateur par `verification_token_hash` avec `verification_expires > NOW()`
- Si trouve : `email_verified = true`, efface le token, cree le JWT, pose le cookie, redirect vers `/`
- Si expire : redirect vers `/?error=token_expired`
- Si invalide : redirect vers `/?error=invalid_token`

**`POST /api/auth/resend-verification`** (nouveau) :
- Body : `{ email }`
- Cherche l'utilisateur non verifie par email
- Genere un nouveau token (invalide l'ancien), remet l'expiration a +24h
- Renvoie l'email
- Rate limited (3 envois / heure par email)
- Retourne toujours `200 { message: 'Si un compte existe, un email a ete envoye' }` (pas de leak d'existence)

**`POST /api/auth/login`** (modifie) :
- Si `email_verified = false` : retourne `403 { error: 'email_not_verified', email }` au lieu du JWT
- Le frontend affiche un message "Verifiez votre boite mail" avec un bouton "Renvoyer l'email"

#### 5.5.5 Securite du token de verification

- Token : 32 bytes aleatoires (`crypto.randomBytes(32)`) → 64 chars hex
- Stocke en base : SHA-256 du token (pas le token brut, pour eviter le leak si dump DB)
- Expiration : 24 heures
- Usage unique : efface apres verification
- Pas de JWT : le token n'est pas un JWT, c'est un token opaque usage unique

#### 5.5.6 Nettoyage

Un cleanup periodique supprime les comptes non verifies expires depuis plus de 7 jours :

```sql
DELETE FROM users
WHERE email_verified = FALSE
  AND verification_expires < NOW() - INTERVAL 7 DAY;
```

Ce cleanup peut etre execute au demarrage du serveur ou via un cron dans le conteneur.

## 6. Phase B : Interface d'administration

### 6.1 Endpoints API admin

Tous proteges par `requireRole('admin')` :

| Methode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/admin/users` | Liste paginee (email, role, provider, last_login, is_active) |
| `GET` | `/api/admin/users/:id` | Detail d'un utilisateur + ses ressources (count) |
| `PUT` | `/api/admin/users/:id/role` | Changer le role (`{ role: 'editor' }`) |
| `PUT` | `/api/admin/users/:id/status` | Activer/desactiver (`{ active: true/false }`) |
| `DELETE` | `/api/admin/users/:id` | Supprimer + cascade (ressources, partages, group_members) |
| `GET` | `/api/admin/users/:id/sessions` | Voir les sessions actives |
| `DELETE` | `/api/admin/users/:id/sessions` | Revoquer toutes les sessions |
| `GET` | `/api/admin/audit` | Journal d'audit pagine + filtres |
| `GET` | `/api/admin/stats` | Stats globales (users par role, par provider, creations/j) |

### 6.2 Interface frontend

**Option recommandee** : nouvelle app `apps/admin/` (comme les autres apps du monorepo).

Pages :
- **Liste des utilisateurs** : tableau avec tri/filtre, badges de role, indicateur actif/inactif
- **Detail utilisateur** : infos, role (modifiable), ressources, sessions, actions (desactiver, supprimer)
- **Journal d'audit** : timeline des actions sensibles
- **Statistiques** : nombre d'utilisateurs, repartition par role/provider

Composants DSFR a utiliser :
- `fr-table` pour les listes
- `fr-badge` pour les roles et statuts
- `fr-modal` pour les confirmations (desactivation, suppression)
- `fr-pagination` pour la navigation
- `fr-select` pour le changement de role

### 6.3 Protection de l'admin

- Un admin ne peut pas se retirer son propre role admin
- Un admin ne peut pas se desactiver lui-meme
- Il doit toujours rester au moins 1 admin actif dans le systeme
- Toute modification de role est tracee dans `audit_log`

## 7. Phase C : Integration ProConnect (OIDC)

*Demarre quand les credentials sandbox sont obtenus.*

### 7.1 Dependance

```json
"openid-client": "^6.0.0"
```

(`openid-client` est la reference Node.js pour OIDC, maintenue par Filip Skokan, auteur de jose.)

### 7.2 Configuration

```env
# .env
PROCONNECT_ENABLED=false                    # Feature flag
PROCONNECT_CLIENT_ID=...
PROCONNECT_CLIENT_SECRET=...
PROCONNECT_ISSUER=https://auth.proconnect.gouv.fr/api/v2
PROCONNECT_REDIRECT_URI=https://chartsbuilder.matge.com/api/auth/proconnect/callback
PROCONNECT_POST_LOGOUT_URI=https://chartsbuilder.matge.com/
PROCONNECT_SCOPES=openid given_name usual_name email uid siret
```

### 7.3 Module OIDC

```typescript
// server/src/auth/proconnect.ts

import { Issuer, Client, generators } from 'openid-client';

let client: Client | null = null;

export async function initProConnect(): Promise<void> {
  if (process.env.PROCONNECT_ENABLED !== 'true') return;

  const issuer = await Issuer.discover(process.env.PROCONNECT_ISSUER!);
  client = new issuer.Client({
    client_id: process.env.PROCONNECT_CLIENT_ID!,
    client_secret: process.env.PROCONNECT_CLIENT_SECRET!,
    redirect_uris: [process.env.PROCONNECT_REDIRECT_URI!],
    response_types: ['code'],
    post_logout_redirect_uris: [process.env.PROCONNECT_POST_LOGOUT_URI!],
  });
}

export function getClient(): Client {
  if (!client) throw new Error('ProConnect not initialized');
  return client;
}
```

### 7.4 Endpoints OIDC

#### `GET /api/auth/proconnect` — Lancement du flow

```typescript
router.get('/proconnect', (req, res) => {
  const state = generators.state();
  const nonce = generators.nonce();

  // Stocker state + nonce en session server-side (ou cookie signe)
  // pour verification au callback
  req.session = { state, nonce };  // ou cookie httpOnly

  const authUrl = getClient().authorizationUrl({
    scope: process.env.PROCONNECT_SCOPES,
    state,
    nonce,
    acr_values: 'eidas1',  // niveau de garantie
  });

  res.redirect(authUrl);
});
```

#### `GET /api/auth/proconnect/callback` — Retour de ProConnect

```typescript
router.get('/proconnect/callback', async (req, res) => {
  const { state, nonce } = req.session;  // ou cookie signe

  // 1. Echanger le code contre les tokens
  const tokenSet = await getClient().callback(
    process.env.PROCONNECT_REDIRECT_URI,
    req.query,
    { state, nonce }
  );

  // 2. Recuperer les infos utilisateur
  const userinfo = await getClient().userinfo(tokenSet.access_token!);
  // userinfo = { sub, email, given_name, usual_name, uid, siret, idp_id, ... }

  // 3. Chercher ou creer l'utilisateur
  const db = getDb();
  let user = await db.select().from(users)
    .where(and(
      eq(users.auth_provider, 'proconnect'),
      eq(users.external_id, userinfo.sub)
    ))
    .limit(1);

  if (!user.length) {
    // Creer le compte
    const id = uuidv4();
    await db.insert(users).values({
      id,
      email: userinfo.email,
      display_name: `${userinfo.given_name} ${userinfo.usual_name}`,
      role: 'editor',   // role par defaut, ajustable par l'admin
      auth_provider: 'proconnect',
      external_id: userinfo.sub,
      idp_id: userinfo.idp_id,
      siret: userinfo.siret,
      organizational_unit: userinfo.organizational_unit,
      last_login: new Date(),
    });
    user = [{ id, email: userinfo.email, role: 'editor' }];
  } else {
    // Mettre a jour last_login, display_name, siret
    await db.update(users).set({
      display_name: `${userinfo.given_name} ${userinfo.usual_name}`,
      siret: userinfo.siret,
      last_login: new Date(),
    }).where(eq(users.id, user[0].id));
  }

  // 4. Verifier que le compte est actif
  if (!user[0].is_active) {
    res.redirect('/?error=account_disabled');
    return;
  }

  // 5. Emettre le JWT (meme mecanisme que le login local)
  const token = createToken({
    userId: user[0].id,
    email: user[0].email,
    role: user[0].role,
  });
  setAuthCookie(res, token);

  // 6. Stocker l'id_token pour le logout ProConnect
  // (necessaire pour le RP-Initiated Logout)
  setProConnectCookie(res, tokenSet.id_token!);

  // 7. Rediriger vers le frontend
  res.redirect('/');
});
```

#### `GET /api/auth/proconnect/logout` — Deconnexion

```typescript
router.get('/proconnect/logout', (req, res) => {
  const idToken = getProConnectCookie(req);
  clearAuthCookie(res);
  clearProConnectCookie(res);

  if (idToken) {
    // RP-Initiated Logout : redirige vers ProConnect pour fin de session SSO
    const logoutUrl = getClient().endSessionUrl({
      id_token_hint: idToken,
      post_logout_redirect_uri: process.env.PROCONNECT_POST_LOGOUT_URI,
    });
    res.redirect(logoutUrl);
  } else {
    res.redirect('/');
  }
});
```

### 7.5 Frontend : bouton ProConnect

Le bouton ProConnect est fourni par la DINUM (charte graphique imposee) :

```html
<!-- Bouton officiel ProConnect -->
<a href="/api/auth/proconnect" class="proconnect-button">
  <img src="/public/proconnect-button.svg" alt="S'identifier avec ProConnect">
</a>
```

**Integration dans le frontend** :
- Page de login : ajouter le bouton ProConnect sous le formulaire classique
- Afficher le bouton uniquement si `PROCONNECT_ENABLED=true` (expose via `/api/health` ou `/api/auth/config`)
- Le endpoint `GET /api/auth/config` retourne `{ proconnect: true/false, localAuth: true/false }`

### 7.6 Gestion de la coexistence local + ProConnect

| Scenario | Comportement |
|----------|-------------|
| User local existant, meme email qu'un compte ProConnect | **Pas de fusion automatique**. Deux comptes distincts. L'admin peut fusionner manuellement via l'interface admin. |
| User ProConnect qui se connecte pour la premiere fois | Creation automatique avec role `editor` |
| User ProConnect desactive par l'admin | Rejet au callback (`?error=account_disabled`) |
| ProConnect indisponible | Le bouton reste visible mais redirige vers une erreur. L'auth locale continue de fonctionner. |

### 7.7 Email de bienvenue ProConnect

A la **premiere connexion** ProConnect (creation du compte), un email informatif est envoye via `sendWelcomeEmail()` :
- **Non bloquant** : le compte est actif immediatement, l'email est une notification / trace
- **Contenu** : confirmation de creation de compte, role attribue, lien vers l'app
- **Pas de verification** : l'email est fourni par l'IdP via OIDC, il est deja verifie
- Le compte ProConnect est cree avec `email_verified = true` (l'IdP fait foi)
- L'envoi est fire-and-forget : un echec d'envoi ne bloque pas la connexion

```typescript
// Dans le callback ProConnect, apres creation du compte
if (isNewUser) {
  sendWelcomeEmail(userinfo.email, displayName).catch(err =>
    console.error('Welcome email failed:', err)
  );
}
```

### 7.8 Attribution des roles pour les comptes ProConnect

Par defaut, tout nouveau compte ProConnect recoit le role `editor`.

Options pour l'admin :
1. **Manuelle** : l'admin change le role via l'interface admin apres la premiere connexion
2. **Par SIRET** (futur) : regle automatique "tout agent du SIRET X = editor" (table `role_rules`)
3. **Par whitelist email** (futur) : pre-creer les comptes avec le role souhaite avant la premiere connexion

## 8. Recapitulatif des roles

| Role | Auth locale | ProConnect | Capacites |
|------|:-----------:|:----------:|-----------|
| `admin` | oui | oui | Tout : CRUD global, gestion users, partage global, monitoring, audit |
| `editor` | oui | oui | CRUD ses ressources, partager avec users/groups, builder, playground |
| `viewer` | oui | oui | Lecture seule des ressources partagees, consultation dashboards |

**Hierarchie** : `admin` > `editor` > `viewer`

Le middleware `requireRole(minRole)` existant fonctionne deja avec cette hierarchie.

## 9. Securite

### 9.1 Protections existantes (conservees)

- JWT en cookie httpOnly, Secure, SameSite=Strict
- Helmet (CSP, X-Frame-Options, etc.)
- CORS restrictif
- bcrypt (10 rounds) pour les mots de passe

### 9.2 Ajouts prevus

| Mesure | Phase | Implementation |
|--------|-------|----------------|
| Rate limiting auth | A | `express-rate-limit` sur login/register |
| Validation email | A | Regex + longueur max |
| Verification email (enrollment) | A | Token opaque SHA-256, expire 24h, envoi SMTP |
| Mot de passe fort | A | Min 8 chars, complexite |
| Desactivation comptes | A | Colonne `is_active` |
| Sessions revocables | A | Table `sessions` + verification |
| Audit log | B | Table `audit_log`, log des actions sensibles |
| State + nonce OIDC | C | Generes server-side, verifies au callback |
| PKCE (recommande) | C | `code_challenge` + `code_verifier` |
| id_token stocke pour logout | C | Cookie httpOnly dedie |

### 9.3 Considerations RGPD

- Les donnees ProConnect (email, nom, SIRET) sont des donnees personnelles
- Informer l'utilisateur a la premiere connexion (mentions legales)
- Droit de suppression : supprimer le compte + toutes les ressources
- Pas de stockage de l'`access_token` ProConnect au-dela du callback

## 10. Plan d'execution

| Etape | Phase | Description | Prerequis |
|-------|-------|-------------|-----------|
| **10.1** | A | Rate limiting + validation inputs | FR-001 |
| **10.2** | A | Migration schema v2 : `is_active`, colonnes ProConnect, colonnes verification email | FR-001 |
| **10.3** | A | Module mailer (`nodemailer` + SMTP `mailserver`) | FR-001 |
| **10.4** | A | Verification email a l'inscription (register, verify-email, resend) | 10.2, 10.3 |
| **10.5** | A | Verification `is_active` dans authMiddleware | 10.2 |
| **10.6** | A | Table `sessions` + revocation | 10.2 |
| **10.7** | B | Endpoints admin (`/api/admin/users`, etc.) | 10.5 |
| **10.8** | B | Table `audit_log` + logging des actions sensibles | 10.7 |
| **10.9** | B | App frontend admin (`apps/admin/`) | 10.7 |
| **10.10** | C | Module `proconnect.ts` (openid-client) | Credentials sandbox |
| **10.11** | C | Endpoints OIDC (authorize, callback, logout) + email de bienvenue | 10.10, 10.3 |
| **10.12** | C | Bouton ProConnect dans le frontend | 10.11 |
| **10.13** | C | Tests E2E avec environnement sandbox | 10.12 |
| **10.14** | C | Demande DataPass + passage en production | Tests OK |

## 10bis. Decoupage en PRs

L'implementation est decoupee en 6 PRs independantes pour faciliter la review et limiter le risque de regression. Chaque PR est mergeable et deployable independamment (sauf dependances indiquees).

### PR 1 — Renforcement auth + migration schema v2
**Etapes** : 10.1, 10.2, 10.5
**Phase** : A
**Prerequis** : FR-001 merge
**Effort** : comparable a FR-001

Contenu :
- `express-rate-limit` sur login/register (10 req / 15 min)
- Validation email (regex) + mot de passe fort (8 chars, complexite)
- Migration schema v2 : nouvelles colonnes users (`auth_provider`, `external_id`, `idp_id`, `siret`, `organizational_unit`, `is_active`, `last_login`, `email_verified`, `verification_token_hash`, `verification_expires`, `password_hash` nullable)
- Verification `is_active` dans `authMiddleware`
- `UPDATE users SET email_verified = TRUE` pour les comptes existants
- Tests unitaires rate limit, validation, is_active

Fichiers impactes :
- `server/src/middleware/rate-limit.ts` (nouveau)
- `server/src/utils/validation.ts` (nouveau)
- `server/src/middleware/auth.ts` (ajout check is_active)
- `server/src/db/database.ts` (migration v2)
- `server/src/routes/auth.ts` (validation renforcee)
- `server/package.json` (+express-rate-limit)
- `docker-compose.db.yml` (env vars SMTP)
- `tests/server/auth.test.ts`

### PR 2 — Verification email (enrollment)
**Etapes** : 10.3, 10.4
**Phase** : A
**Prerequis** : PR 1
**Effort** : comparable a FR-001

Contenu :
- Module `server/src/utils/mailer.ts` (nodemailer, transport SMTP `mailserver`)
- `sendVerificationEmail()` + `sendWelcomeEmail()`
- Modification `POST /register` : ne pose plus le JWT, envoie l'email de verification
- Exception : premier user (admin) → skip verification, JWT immediat
- `GET /api/auth/verify-email?token=xxx` : verifie, active, pose JWT, redirect `/`
- `POST /api/auth/resend-verification` : renvoie l'email (rate limited 3/h)
- `POST /login` refuse les comptes non verifies (403 `email_not_verified`)
- Cleanup des comptes non verifies expires > 7 jours (au demarrage serveur)
- Tests unitaires + integration (avec SMTP mocke)

Fichiers impactes :
- `server/src/utils/mailer.ts` (nouveau)
- `server/src/routes/auth.ts` (register, login, verify-email, resend)
- `server/package.json` (+nodemailer, +@types/nodemailer)
- `.env.example` (+SMTP_HOST, SMTP_PORT, SMTP_FROM, APP_URL)
- `docker-compose.db.yml` (env vars SMTP)
- `tests/server/auth.test.ts`

### PR 3 — Sessions revocables
**Etapes** : 10.6
**Phase** : A
**Prerequis** : PR 1
**Effort** : inferieur a FR-001

Contenu :
- Table `sessions` (id, user_id, token_hash, auth_provider, ip, user_agent, expires, revoked)
- Enregistrement de session au login (hash SHA-256 du JWT)
- Verification du token non revoque dans `authMiddleware`
- Endpoint de revocation (utilise par l'admin dans PR 4)

Fichiers impactes :
- `server/src/db/database.ts` (table sessions dans schema)
- `server/src/middleware/auth.ts` (check session non revoquee)
- `server/src/routes/auth.ts` (enregistrement session au login/register)
- `tests/server/auth.test.ts`

### PR 4 — API admin
**Etapes** : 10.7, 10.8
**Phase** : B
**Prerequis** : PR 1
**Effort** : comparable a FR-001

Contenu :
- `server/src/routes/admin.ts` : 9 endpoints proteges par `requireRole('admin')`
- Liste users paginee, detail, changement de role, activation/desactivation, suppression cascade
- Sessions actives par user, revocation de sessions
- Table `audit_log` + helper `logAudit()`
- Protections : pas de self-degrade, toujours 1 admin minimum
- Stats globales (users par role/provider, creations/jour)
- Tests unitaires admin

Fichiers impactes :
- `server/src/routes/admin.ts` (nouveau)
- `server/src/utils/audit.ts` (nouveau)
- `server/src/db/database.ts` (table audit_log dans schema)
- `server/src/index.ts` (mount `/api/admin`)
- `tests/server/admin.test.ts` (nouveau)

### PR 5 — App frontend admin
**Etapes** : 10.9
**Phase** : B
**Prerequis** : PR 4
**Effort** : ~2x FR-001 (app complete)

Contenu :
- Nouvelle app `apps/admin/` (TypeScript, Vite, DSFR)
- Pages : liste users, detail user, journal d'audit, statistiques
- Composants DSFR : `fr-table`, `fr-badge`, `fr-modal`, `fr-pagination`, `fr-select`
- Appels API vers `/api/admin/*`
- Navigation depuis le hub (lien conditionnel si admin)

Fichiers impactes :
- `apps/admin/` (nouveau repertoire complet)
- `package.json` (workspace)
- `index.html` (lien admin conditionnel)

### PR 6 — Integration ProConnect (OIDC)
**Etapes** : 10.10, 10.11, 10.12, 10.13
**Phase** : C
**Prerequis** : PR 2 (mailer), credentials sandbox ProConnect
**Effort** : comparable a FR-001
**Bloquant externe** : credentials sandbox (~immedait) puis DataPass (~2-3 semaines)

Contenu :
- `openid-client` : module `server/src/auth/proconnect.ts`
- 3 endpoints : `/api/auth/proconnect`, `/proconnect/callback`, `/proconnect/logout`
- Creation auto du compte ProConnect (role `editor`, `email_verified = true`)
- Email de bienvenue a la premiere connexion (fire-and-forget via mailer)
- Feature flag `PROCONNECT_ENABLED`
- `GET /api/auth/config` : expose les providers actifs au frontend
- Bouton ProConnect dans la page de login (SVG officiel DINUM)
- RP-Initiated Logout (obligatoire ProConnect)
- Tests avec OIDC mocke + tests E2E en sandbox

Fichiers impactes :
- `server/src/auth/proconnect.ts` (nouveau)
- `server/src/routes/auth.ts` (endpoints OIDC + /config)
- `server/src/index.ts` (init ProConnect au demarrage)
- `server/package.json` (+openid-client)
- `.env.example` (+PROCONNECT_*)
- `docker-compose.db.yml` (env vars ProConnect)
- Frontend login (bouton ProConnect)
- `tests/server/auth.test.ts`

### Recapitulatif

| PR | Phase | Effort | Prerequis | Peut demarrer |
|----|-------|--------|-----------|---------------|
| **PR 1** Schema + rate limit + is_active | A | ~FR-001 | FR-001 merge | Immediatement |
| **PR 2** Verification email | A | ~FR-001 | PR 1 | Apres PR 1 |
| **PR 3** Sessions revocables | A | < FR-001 | PR 1 | En parallele de PR 2 |
| **PR 4** API admin | B | ~FR-001 | PR 1 | En parallele de PR 2/3 |
| **PR 5** Frontend admin | B | ~2x FR-001 | PR 4 | Apres PR 4 |
| **PR 6** ProConnect OIDC | C | ~FR-001 | PR 2 + credentials | Quand credentials dispo |

**Effort total estime : ~7x FR-001** (dont ~2x pour le frontend admin seul).
**Chemin critique** : PR 1 → PR 2 → PR 6 (bloque par credentials ProConnect).
**Parallelisation possible** : PR 2, PR 3 et PR 4 peuvent avancer en parallele apres PR 1.

## 11. Dependances npm a ajouter

| Package | Phase | Justification |
|---------|-------|---------------|
| `express-rate-limit` | A | Rate limiting endpoints auth |
| `nodemailer` | A | Envoi d'emails (verification, bienvenue) via SMTP |
| `openid-client` | C | Client OIDC certifie pour ProConnect |

## 12. Variables d'environnement (ajouts)

```env
# Phase A
JWT_EXPIRY=7d

# Phase A - SMTP (envoi d'emails via docker-mailserver sur ecosystem-network)
SMTP_HOST=mailserver
SMTP_PORT=25
SMTP_FROM=noreply@ecosysteme.matge.com
APP_URL=https://chartsbuilder.matge.com

# Phase C (ProConnect)
PROCONNECT_ENABLED=false
PROCONNECT_CLIENT_ID=
PROCONNECT_CLIENT_SECRET=
PROCONNECT_ISSUER=https://auth.proconnect.gouv.fr/api/v2
PROCONNECT_REDIRECT_URI=https://chartsbuilder.matge.com/api/auth/proconnect/callback
PROCONNECT_POST_LOGOUT_URI=https://chartsbuilder.matge.com/
PROCONNECT_SCOPES=openid given_name usual_name email uid siret
```

## 13. Risques et mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| ProConnect indisponible | Moyen | Auth locale reste fonctionnelle, feature flag `PROCONNECT_ENABLED` |
| Doublons de comptes (meme email, providers differents) | Moyen | Pas de fusion automatique, outil de merge admin |
| `sub` ProConnect change (changement d'IdP cote agent) | Faible | Fallback sur email + confirmation manuelle |
| Processus DataPass long | Moyen | L'auth locale couvre 100% des besoins en attendant |
| Rate limiting trop agressif | Faible | Seuils configurables, whitelist IP admin |
| SMTP indisponible (mailserver down) | Moyen | L'inscription echoue gracieusement (500 + message). L'admin est exempt (pas de verification). Retry possible via resend-verification |
| Email en spam | Faible | DKIM configure sur `ecosysteme.matge.com`. Domaine deja utilise par g3 |

## 14. Criteres d'acceptation

### Phase A
- [ ] Rate limiting fonctionnel sur login/register (10 req / 15 min)
- [ ] Validation email et mot de passe renforcee
- [ ] Verification email a l'inscription : register → email → clic → verifie + connecte
- [ ] Premier utilisateur (admin) exempt de la verification email
- [ ] Login refuse si email non verifie (403 + message explicite)
- [ ] Renvoi d'email de verification (rate limited)
- [ ] Comptes desactivables par l'admin
- [ ] Colonnes ProConnect presentes dans le schema (meme si non utilisees)

### Phase B
- [ ] Interface admin fonctionnelle (liste, detail, changement de role, desactivation)
- [ ] Audit log des actions admin
- [ ] Protection : impossible de supprimer le dernier admin

### Phase C
- [ ] Flow OIDC complet : authorize → callback → session JWT → logout
- [ ] Creation automatique des comptes ProConnect
- [ ] Bouton ProConnect dans l'interface de login
- [ ] Email de bienvenue a la premiere connexion ProConnect (non bloquant)
- [ ] Deconnexion ProConnect (RP-Initiated Logout)
- [ ] Tests en sandbox ProConnect valides
- [ ] Feature flag `PROCONNECT_ENABLED` fonctionnel
