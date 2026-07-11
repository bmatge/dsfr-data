# CLAUDE.md - Configuration du projet dsfr-data

> 📐 **Le détail d'architecture vit dans [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** (carte de navigation, conventions ADR-053).
> Ce fichier ne garde que l'opérationnel : stack, commandes, conventions, remotes, release, do/don't.
> Pour tout ce qui touche au pipeline de composants, au proxy, aux bundles, au beacon, à Tauri, aux pièges
> de build et aux **couplages non-évidents**, lire `docs/ARCHITECTURE.md` AVANT de toucher au code.

## Contexte du projet

Bibliotheque de Web Components de dataviz pour sites gouvernementaux francais.
Composants Lit conformes DSFR (Design System de l'Etat), monorepo npm workspaces.
La bibliotheque npm publiee `dsfr-data` se trouve dans `packages/core/`.

## Stack

- **Langage** : TypeScript strict.
- **Composants** : Lit (LitElement, html, css) dans `packages/core/src/`.
- **Build** : Vite (lib mode + apps), esbuild ; scripts dans `scripts/`.
- **Tests** : Vitest (unit, jsdom) + Playwright (E2E).
- **Charts** : `@gouvfr/dsfr-chart`. Carte : Leaflet (lazy). World-map : d3-geo + topojson.
- **Desktop** : Tauri v2 (Rust + WebView).
- **Serveur** : Express + MariaDB 11 (`mysql2/promise`).
- **Versioning** : Changesets.
- **Mono** : 7 apps dans `apps/`, lib dans `packages/core/`, partagé dans `packages/shared/`, chrome applicatif dans `packages/app-ui/`.

## Commandes essentielles

```bash
# Dev
npm run dev                         # Serveur de dev Vite (port 5173, hub + proxy)
npm run dev --workspace=@dsfr-data/app-builder   # Dev d'une app (idem: builder-ia, dashboard,
                                    #   sources, playground, favorites, monitoring)

# Build
npm run build         # Build bibliotheque (delegue a packages/core)
npm run build:shared  # Build du package shared
npm run build:apps    # Build de toutes les apps
npm run build:all     # Build complet (shared + lib + apps)
npm run build:app     # Assembler app-dist/ pour Tauri
npm run preview       # Preview du build

# Tests
npm run test          # Vitest watch
npm run test:run      # Vitest une fois
npm run test:coverage # Couverture
npm run test:e2e      # Playwright E2E
npx playwright test --config tests/builder-e2e/playwright.config.ts  # Tests exhaustifs Builder
                      #   (requiert `npm run dev` actif en parallele — voir ARCHITECTURE.md §Tests)

# Lint / garde-fous
npm run check:accents # Verifie les accents francais dans le HTML (scripts/check-french-accents.sh)

# Tauri
npm run tauri:dev     # Dev Tauri (app desktop)
npm run tauri:build   # Build Tauri prod (build:all + build:app + tauri build)

# Release (voir section Versioning)
npx changeset             # Creer un changeset
npm run version-packages  # Bumper package.json + CHANGELOG + sync Tauri

# Deploy (plateforme VibeLab — skill vps-spawn)
ssh vps "spawn up chartsbuilder git@github.com:bmatge/dsfr-data.git --dns api --mail real --keep"
```

## Conventions de code

- TypeScript strict mode, type hints systematiques.
- Composants Lit dans `packages/core/src/`.
- Nommage : `dsfr-data-*` pour les composants publics, `app-*` pour le chrome applicatif (`packages/app-ui/`).
- Tests : fichiers `*.test.ts` dans `/tests/`.
- Pas d'emoji dans le code sauf demande explicite.
- Imports partages via `@dsfr-data/shared` — **frontiere lib/app (#319)** : `packages/core/src` ne doit importer
  que l'entree lib-safe `@dsfr-data/shared/lib` (ESLint `no-restricted-imports`). Tout nouvel export lib-safe
  va dans les DEUX barrels (`src/lib.ts` et `src/index.ts`). Detail dans `docs/ARCHITECTURE.md`.
- **Acces `import.meta.env` toujours direct** (jamais d'indirection) — piège de build documenté dans
  `docs/ARCHITECTURE.md` §Couplages non-évidents.
- Commits : Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).

## Remotes Git (miroir mef-snum-miweb)

Le repo est pousse simultanement sur **deux remotes GitHub** depuis 2026-05-24 :
- `bmatge/dsfr-data` — repo historique (fetch + push)
- `mef-snum-miweb/dsfr-data` — miroir org MEF SNUM (push uniquement)

Configuration : un seul remote `origin` avec **multi-push URLs**. Un `git push origin <branche>` envoie aux deux destinations en une seule commande.

```bash
git remote -v
# origin  https://github.com/bmatge/dsfr-data.git (fetch)
# origin  https://github.com/bmatge/dsfr-data.git (push)
# origin  https://github.com/mef-snum-miweb/dsfr-data.git (push)

# Si la config est perdue (reclone, autre poste) :
git remote set-url --add --push origin https://github.com/bmatge/dsfr-data.git
git remote set-url --add --push origin https://github.com/mef-snum-miweb/dsfr-data.git
```

**Limites** :
- Les merges effectues directement cote GitHub (UI bmatge, Dependabot, Changesets release PR...) **ne se propagent pas** au miroir. Resync ponctuel apres un merge UI :
  ```bash
  git fetch origin && git push origin refs/remotes/origin/main:refs/heads/main
  ```
- Les workflows GitHub Actions tournent **aussi cote miweb** sur chaque push ; les jobs dependant de secrets non configures la-bas vont failer (a desactiver dans `Settings → Actions` du repo miweb si besoin).
- Tags : `git push origin --tags` apres une release pour les propager.

## Versioning et Releases (résumé)

Le projet utilise [Changesets](https://github.com/changesets/changesets) pour le semver et le CHANGELOG. `dsfr-data` est le workspace `packages/core/`.

- **patch** (0.4.x) : bugs, fixes CSS, typos · **minor** (0.x.0) : fonctionnalites/composants/adapters · **major** (x.0.0) : breaking changes.

**Pendant le dev** : `npx changeset` pour chaque modif notable (selectionner `dsfr-data`, choisir le niveau, decrire en francais). Le `.changeset/xxx.md` est commite avec le code.

**A la release** :
```bash
npm run version-packages    # Bumpe package.json + CHANGELOG.md + sync Tauri (sync-versions:
                            #   src-tauri/tauri.conf.json + Cargo.toml)
git add . && git commit -m "chore: release v$(node -p \"require('./package.json').version\")"
git tag "v$(node -p \"require('./package.json').version\")"
git push && git push --tags
```

**Automatiquement** sur le tag `v*` : `npm-publish.yml` (npm) · `release.yml` (Tauri macOS/Linux/Windows + GitHub Release). NB : le tag poussé par la PR changesets (GITHUB_TOKEN) ne déclenche PAS `release.yml` → `gh workflow run release.yml -f version=vX.Y.Z`. Les sous-repos de distribution (`dsfr-data-grist/proxy/mcp`) sont **archivés depuis 2026-04** — plus de publication séparée ; seul le miroir `mef-snum-miweb/dsfr-data` est synchronisé.

**CI** : un warning est emis sur les PRs si `packages/core/src/` ou `packages/shared/` sont modifies sans changeset.

**Fin de session Claude Code** : `git diff --stat` → `npx changeset` si `core/src` ou `shared` touches → commit (Conventional) → proposer une release a l'utilisateur (ne pas releaser sans accord).

## Ce que Claude DOIT faire

- Lire `docs/ARCHITECTURE.md` (et sa section **Couplages non-évidents ⚠️**) avant de toucher au pipeline de composants, au proxy, aux bundles, au beacon ou au build.
- Acceder a `import.meta.env.VITE_*` **en direct**, sans indirection.
- Apres modif d'un attribut / type de graphique / operateur / agregation d'un composant `dsfr-data-*` :
  mettre a jour le skill correspondant dans `apps/builder-ia/src/skills.ts` (sinon `tests/apps/builder-ia/skills.test.ts` casse).
- Ajouter un export lib-safe dans **les deux** barrels (`packages/shared/src/lib.ts` ET `src/index.ts`).
- Lancer `npm run build` apres modification des composants.
- Creer un changeset si `packages/core/src/` ou `packages/shared/` sont modifies.
- Apres un changement proxy/URL : valider empiriquement en grepant les bundles produits (aucune URL ne doit fuir dans la mauvaise dimension — voir ARCHITECTURE.md).

## Ce que Claude ne doit JAMAIS faire

- **Jamais** de commit/push direct sur `main`/`master` sans autorisation explicite ; jamais de `git push --force` sans accord.
- **Jamais** d'indirection sur `import.meta.env` (`const m = import.meta as any`) — casse la substitution Vite, fait fuiter l'ancienne URL en dur.
- **Jamais** modifier les `.js` dans `packages/core/src/` (artefacts de build).
- **Jamais** importer des modules app-side (`auth/`, `storage/`, `ui/`, `tour/`) depuis `packages/core/src` (frontiere lib/app #319).
- **Jamais** de `subscribeToSource` manuel dans un composant (utiliser `TransformerMixin` / `SourceSubscriberMixin` — test-garde statique).
- **Jamais** regenerer en place les secrets de prod (`ENCRYPTION_KEY`, `JWT_SECRET`, `DB_*`) dans `/opt/apps/<app>/.env` sur le VPS.
- **Jamais** retirer `esbuild: { keepNames: true }` de `vite.config.ts` (casse les composants Lit minifies).

## Notes

- APIs externes : Grist (docs.getgrist.com, grist.numerique.gouv.fr), Albert IA (albert.api.etalab.gouv.fr), OpenDataSoft (`*.opendatasoft.com`), Tabular (tabular-api.data.gouv.fr), INSEE Melodi (api.insee.fr/melodi).
- Self-hosting et chemins de proxying : `docs/DEPLOYMENT.md` §"Configuration self-hosted".
- Docker : `docker compose up -d --build` (volume `beacon-logs` pour persister le monitoring).
- Detail complet (composants, proxy 3 dimensions, bundles, beacon, Tauri, MariaDB, mcp-server, deploiement) : **`docs/ARCHITECTURE.md`**.
