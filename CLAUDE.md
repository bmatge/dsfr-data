# CLAUDE.md - Configuration du projet dsfr-data

> 📐 **Le détail d'architecture vit dans [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** (carte de navigation, conventions ADR-053).
> Ce fichier ne garde que l'opérationnel : stack, commandes, conventions, remotes, release, do/don't.
> Pour tout ce qui touche au pipeline de composants, au proxy, aux bundles, au beacon, aux pièges
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
- **Charts** : `@gouvfr/dsfr-chart`. Carte : Leaflet (lazy).
- **Serveur** : Express + MariaDB 11 (`mysql2/promise`).
- **Versioning** : Changesets.
- **Mono** : 11 apps dans `apps/`, lib dans `packages/core/`, partagé dans `packages/shared/`, chrome applicatif dans `packages/app-ui/`.
- **Entrée IA des usagers : le Studio IA** (`apps/studio/`, #1081). L'ancien Assistant IA (`apps/builder-ia/`)
  est retiré ; en déploiement son adresse redirige vers le Studio (`scripts/build-app.js`). Le guide des
  skills vit dans `packages/shared/src/skills/skills.ts`.

## Commandes essentielles

```bash
# Dev
npm run dev                         # Serveur de dev Vite (port 5173, hub + proxy)
npm run dev --workspace=@dsfr-data/app-builder   # Dev d'une app (idem: studio, dashboard,
                                    #   sources, playground, favorites, monitoring)

# Build
npm run build         # Build bibliotheque (delegue a packages/core)
npm run build:shared  # Build du package shared — A RELANCER apres un git pull ou une modif
                      #   de packages/shared/src : tsc lit packages/shared/dist (pas src, que
                      #   Vite aliase), un dist perime donne des erreurs de type fantomes.
                      #   Idem build:app-ui. Detail dans ARCHITECTURE.md §12.
npm run build:apps    # Build de toutes les apps
npm run build:all     # Build complet (shared + lib + apps)
npm run build:app     # Assembler app-dist/ (racine servie par nginx en deploiement)
npm run preview       # Preview du build

# Tests
npm run test          # Vitest watch
npm run test:run      # Vitest une fois
npm run test:coverage # Couverture
npm run test:e2e      # Playwright E2E
npm run typecheck:tests  # Typage de la suite de tests (tsconfig.tests.json)
npx playwright test --config tests/builder-e2e/playwright.config.ts <un-spec>.spec.ts
                      # CINQ specs bloquantes sur PR (builder-e2e.yml, #869, #1081) :
                      #   export-html-api-recette, layout-diagnostic-recette,
                      #   studio-recette, studio-navigation-recette, studio-parite-recette
                      #   (remplacant de la recette de l'ancien Assistant IA, retire avec
                      #   son app a l'etape 2 de #1081).
                      #   Le RESTE du dossier est une recette manuelle, hors CI et pas verte
                      #   (#868) : etat mesure par spec dans tests/builder-e2e/README.md.
                      #   Playwright demarre `npm run dev` lui-meme (et reutilise le tien).
                      #   Un spec a la fois : le dossier entier depasse l'heure.
                      #   Les `*.tool.ts` n'ont aucune assertion : BUILDER_E2E_OUTILS=1 (#867).

# Verification des donnees (ADR-122) — tout chiffre affiche est recalcule par un oracle
#   independant (`tools/oracle/`), qui n'importe rien de la lib. Doc : tools/oracle/README.md.
npm run verif         # Mode DETERMINISTE : fixtures du depot servies par page.route, zero reseau.
                      #   BLOQUANT sur chaque PR (.github/workflows/verif-donnees.yml).
                      #   Lancer `npm run build:shared && npm run build:app-ui` AVANT (la page
                      #   charge packages/shared/dist, pas src — ARCHITECTURE.md §12).
npm run verif:live    # Mode VIVANT : vraies API du banc d'essai, attendu produit juste avant le
                      #   rendu. Jamais bloquant (oracle.yml : nuit, workflow_dispatch, ou PR
                      #   portant le label `oracle`).
npm run verif:expected  # Seulement l'attendu vivant (tools/oracle/out/expected.json) — avec
                      #   l'empreinte du jeu (verdict de nuit rouge) et le recoupement serveur.
npm run verif:attendus  # La TROISIEME VOIX : projette les controles deterministes
                      #   (verif:manifests → out/manifests.json) puis python3 tools/oracle-py/oracle.py
                      #   (stdlib seule, jamais pandas) → tests/verif-donnees/attendus.json, VERSIONNE.
                      #   A relancer apres tout controle deterministe ajoute ou modifie : le job
                      #   `attendus` de verif-donnees.yml refuse un attendu qui change sans etre commite.
                      #   Le fichier garde ne porte QUE des chiffres : la version de l'interpreteur va
                      #   dans tools/oracle/out/attendus-provenance.json (ignore par git), sinon le
                      #   garde-fou rougit des que le runner n'a pas le Python de l'auteur.
npm run banc:studio   # PERTINENCE du Studio IA (#1112) : rejoue la vraie boucle sur des scenarios
                      #   (tools/banc-studio/), criteres deterministes, taux sur N repetitions.
                      #   Modele reel via le mode serveur de l'instance (aucun secret), plafond partage :
                      #   `-- --pr --repetitions 1` pour le sous-ensemble. Jamais bloquant
                      #   (banc-studio.yml : PR touchant au Studio, nuit, dispatch). Doc : son README.

# Lint / garde-fous
npm run check:accents # Lint BLOQUANT des libelles UI : accents + formes hors lexique
                      #   (scripts/check-french-accents.sh, lexique : docs/ux/actions.md)
npm run build:specs-tables    # Regenere les tableaux d'attributs de specs/components/*.html
                      #   depuis packages/core/custom-elements.json
npm run check:specs-tables    # Meme script en --check, BLOQUANT en CI (etape quality, #757) :
                      #   echoue si une page est perimee, si un attribut n'est range dans
                      #   aucune section (`fields="..."` d'un bloc ATTRS ou ATTRS-PROSE),
                      #   ou si un composant n'apparait sur aucune page.
npm run check:studio-couverture  # BLOQUANT en CI (etape quality, #1109) : chaque composant et
                      #   attribut du manifeste est ECRIT par le Studio IA (mesure sur son export,
                      #   depuis le schema de ses outils) ou EXCLU avec sa raison dans
                      #   apps/studio/src/couverture-exclusions.ts. Un attribut ajoute a la lib
                      #   doit y etre tranche. Lancer `npm run build:shared` avant.

# Skills (connaissance IA : Studio IA + serveur MCP)
npm run build:skills  # Chaine complete : analyse CEM -> reference generee -> dist/skills.json
npm run build:cem     # Etape 1 seule : packages/core/custom-elements.json
npm run build:skills-ref  # Etape 2 seule : packages/shared/src/skills/skills-reference.generated.ts
npm run build:skill-matching  # Copie du moteur de matching et de skill-levels vers mcp-server/
npm run build:skills-claude   # Etape 4 seule : export skill Claude Code skills/dsfr-data/
npm run skills:install        # Lie skills/dsfr-data dans .claude/skills (--global : ~/.claude) — docs/AI-SKILLS.md

# Release (voir section Versioning)
npx changeset             # Creer un changeset
npm run version-packages  # Bumper package.json + CHANGELOG + sync version.ts

# Deploy (plateforme VibeLab — skill vps-spawn)
ssh vps "spawn up chartsbuilder git@github.com:bmatge/dsfr-data.git --dns api --mail real --keep"
```

## Conventions de code

- TypeScript strict mode, type hints systematiques.
- Composants Lit dans `packages/core/src/`.
- Nommage : `dsfr-data-*` pour les composants publics, `app-*` pour le chrome applicatif (`packages/app-ui/`).
- Tests : fichiers `*.test.ts` dans `/tests/`. **`tests/` est typecheck** via
  `tsconfig.tests.json` (`npm run typecheck:tests`, etape CI) : vitest ne typecheck pas,
  donc sans ce garde-fou un test peut passer au vert sur du code qui ne compile pas.
  Pour inspecter un membre prive d'un composant, declarer une interface « vue interne »
  et un alias sur l'instance — pas de `as any` disperse.
- Pas d'emoji dans le code sauf demande explicite.
- Imports partages via `@dsfr-data/shared` — **frontiere lib/app (#319)** : `packages/core/src` ne doit importer
  que l'entree lib-safe `@dsfr-data/shared/lib` (ESLint `no-restricted-imports`). Tout nouvel export lib-safe
  va dans les DEUX barrels (`src/lib.ts` et `src/index.ts`). Detail dans `docs/ARCHITECTURE.md`.
- **Acces `import.meta.env` toujours direct** (jamais d'indirection) — piège de build documenté dans
  `docs/ARCHITECTURE.md` §Couplages non-évidents.
- Commits : Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).

## Remotes Git (miroir mef-snum-miweb)

Deux depots GitHub : la **source** `bmatge/dsfr-data` et le **miroir** `mef-snum-miweb/dsfr-data` (presence
du projet dans l'organisation MEF SNUM). Le miroir **recoit, il ne produit rien** (ADR-160, ADR-168, #1335) :
aucune PR n'y est mergee, Dependabot y est en pause, le Default setup CodeQL n'y est **jamais** active (il
desactive le `codeql.yml` du depot sans le reactiver au retrait, ADR-160).

**Configuration locale** : `origin` = bmatge **seul**. Le double push d'avant (deux URL de push sur `origin`)
est **abandonne** : il poussait chaque branche de travail sur le miroir (74 branches mortes le 2026-09-02) et
ne propageait pas les merges faits dans l'interface GitHub. Un remote `mef` **optionnel** sert au geste manuel.

```bash
git remote -v
# origin  https://github.com/bmatge/dsfr-data.git (fetch)
# origin  https://github.com/bmatge/dsfr-data.git (push)
git remote add mef https://github.com/mef-snum-miweb/dsfr-data.git   # optionnel, pour le resync manuel
```

**Ce qui est automatique** — `.github/workflows/mirror-sync.yml`, a chaque push sur `main`, sur un tag
(`dsfr-data@*`, `v*`), a chaque Release publiee, et a la demande (`gh workflow run mirror-sync.yml`) :
- `main` pousse sur le miroir en **avance rapide seulement** (jamais de `--force` : si le miroir a diverge, le
  job echoue avec un message clair et c'est a traiter a la main, ci-dessous) ;
- les tags, a chaque passage ;
- la GitHub Release qui vient d'etre publiee, recreee a l'identique (meme tag, memes notes) ; `workflow_dispatch`
  rattrape celles qui manquent (les 20 dernieres).
Rien n'est jamais supprime sur le miroir. Il faut le secret **`AUTOMATION_TOKEN`** : un PAT **classic** (scopes
`repo` et `workflow`), car un PAT fine-grained n'a qu'un proprietaire de ressources et ne peut pas ecrire a la fois
sur bmatge et sur l'organisation (403 constate le 2026-11-25). Sans lui le job le dit (`::notice::`) et ne pousse rien. `maintenance.yml` signale
chaque lundi un miroir en retard, divergent, ou portant une branche autre que `main`.

**Ce qui reste manuel** (sans le secret, ou apres un echec du workflow) :
```bash
git fetch origin && git push mef refs/remotes/origin/main:refs/heads/main && git push mef --tags
gh release view dsfr-data@X.Y.Z -R bmatge/dsfr-data --json body -q .body > /tmp/notes.md
gh release create dsfr-data@X.Y.Z -R mef-snum-miweb/dsfr-data --title dsfr-data@X.Y.Z --notes-file /tmp/notes.md --latest
```

**Divergence** (le miroir a un commit que la source n'a pas — cas du 2026-10-20, ses propres PR Dependabot) :
lire ce qu'il a en plus (`git fetch mef && git log --oneline origin/main..mef/main`), le rapatrier ici par PR si
cela vaut quelque chose, puis **demander l'autorisation** avant tout `push --force` vers le miroir. Si une
branche autre que `main` s'y retrouve, la supprimer : `git push mef --delete <branche>`.

**Limites** : les workflows tournent **aussi** cote miroir sur chaque push ; ceux qui ecrivent portent
`if: github.repository == 'bmatge/dsfr-data'`, les autres echouent sur les secrets absents (a desactiver dans
`Settings → Actions` du miroir si besoin). Le triage des alertes CodeQL n'est pas un objet git (ADR-160).

## Versioning et Releases (résumé)

Le projet utilise [Changesets](https://github.com/changesets/changesets) pour le semver et le CHANGELOG. `dsfr-data` est le workspace `packages/core/`.

- **patch** (0.4.x) : bugs, fixes CSS, typos · **minor** (0.x.0) : fonctionnalites/composants/adapters · **major** (x.0.0) : breaking changes.

**Pendant le dev** : `npx changeset` pour chaque modif notable (selectionner `dsfr-data`, choisir le niveau, decrire en francais). Le `.changeset/xxx.md` est commite avec le code.

**Nommer les constats du banc d'essai resolus.** Quand l'issue traitee cite un identifiant de registre du
banc d'essai [open-data-viz](https://github.com/bmatge/open-data-viz) (`AM-0XX`, `BUG-0XX`), le
**reporter dans le texte du changeset**, sous la forme « resout le constat AM-0XX du banc d'essai ».
Le changeset devient la note de version : c'est le seul endroit ou le banc puisse lire qu'une de ses
demandes est satisfaite. Le lien existe deja dans l'autre sens — chaque issue deposee cite son
identifiant de registre — mais rien ne le renvoyait.

Sans ce geste, le banc redepose ce qui est deja livre, et le cout est mesure : sur le rapport du
2026-09-10, BUG-005 depose comme bug alors qu'il etait livre depuis la 0.23.0 (#680) dans son cas exact,
AM-052 depose comme retard de generation alors que la fiche servie contenait tout ce qu'il disait
manquant, trois entrees requalifiees de « limite » a « corrige » par le banc lui-meme apres coup, neuf des
dix-sept « echecs muets » deja corriges. A la premiere relecture, sur 16 constats contestes, **11 visaient
une capacite qui existait deja** (#746).

Le banc lit une **instance deployee**, pas le depot : les deux gestes vont ensemble. Une note qui annonce
« resout AM-052 » pendant que `chartsbuilder` sert encore la version precedente ne prouve rien —
d'ou le redeploiement ci-dessous et son `curl …/dist/skills-meta.json` (#733).

**A la release** :
```bash
npm run version-packages    # Bumpe package.json + CHANGELOG.md + sync-versions
                            #   (packages/core/src/version.ts)
git add . && git commit -m "chore: release v$(node -p \"require('./package.json').version\")"
git tag "v$(node -p \"require('./package.json').version\")"
git push && git push --tags
```

**Publication npm** : au merge de la PR changesets (`changeset-release.yml`, `release-publish`), qui pousse aussi le tag `v*` (historique/pins ; ne déclenche plus rien — cible desktop Tauri retirée, ADR-070 et capsule de restauration du vault, #403). Les sous-repos de distribution (`dsfr-data-grist/proxy/mcp`) sont **archivés depuis 2026-04** — plus de publication séparée ; seul le miroir `mef-snum-miweb/dsfr-data` est synchronisé.

**CI** : la CI bloquante tourne **une fois par PR** — `ci.yml` (jobs `quality`, `proxy-nginx`, `relais-nginx`),
`verif-donnees.yml`, `builder-e2e.yml` et `e2e-layout.yml` ne se declenchent que sur `pull_request`, et un
nouveau push annule le run precedent (`concurrency`). Seuls les jobs de securite de `ci.yml` (`sca`, `secrets`,
`sast` : SARIF) tournent aussi sur `main`, sans quoi les alertes de l'onglet Security ne seraient pas rattachees a
la branche par defaut. **`main` est protegee par ruleset** (PR obligatoire, quatre controles requis : CI,
Verification des donnees, Builder E2E, E2E layout ; branche a jour exigee ; force push interdit). Un warning est
emis sur les PRs si `packages/core/src/` ou `packages/shared/` sont modifies sans changeset.

**PR de release (`changeset-release/main`)** : `changeset-release.yml` l'ouvre avec le PAT `AUTOMATION_TOKEN`
quand il est pose (`secrets.AUTOMATION_TOKEN || secrets.GITHUB_TOKEN`) et ses checks partent seuls. Sans le PAT,
elle est poussee par `GITHUB_TOKEN`, qui ne declenche **aucun** workflow : la PR n'a aucun check et le ruleset la
bloque. Geste de secours : un push vide sur sa branche, ou l'exempter dans le ruleset.
```bash
git fetch origin changeset-release/main && git checkout changeset-release/main
git commit --allow-empty -m "chore: déclencher la CI de la release" && git push origin changeset-release/main
```

**Apres merge d'une PR** : rien a faire pour le miroir — `mirror-sync.yml` pousse `main` (et les tags) des que le
secret `AUTOMATION_TOKEN` est pose ; sinon, le geste manuel de la section Remotes Git. **Apres une release** : les
tags et la Release sont propages par le meme workflow (`release: published`, ou `gh workflow run mirror-sync.yml`
pour rattraper une Release publiee par `GITHUB_TOKEN`). Ce qui reste manuel : le redeploiement ci-dessous.

**Apres une release : REDEPLOYER `chartsbuilder`.** Aucun workflow ne deploie le VPS ; sans cette etape,
l'instance publique continue de servir les fiches (`/dist/skills.json`), le guide et les specs de la version
precedente, et un lecteur ne peut pas le savoir. C'est ce qui a induit trois agents en erreur le 2026-09-10 (#733).

```bash
ssh vps "spawn up chartsbuilder git@github.com:bmatge/dsfr-data.git --dns api --mail real --keep"
curl -s https://chartsbuilder.miweb.run/dist/skills-meta.json   # doit annoncer la nouvelle libVersion
```

Le tampon de fraicheur (`dist/skills-meta.json` : `generatedAt`, `libVersion`, `commit`) est genere par
`npm run build:skills`, servi a cote de `dist/skills.json`, et rendu par `list_skills` et `/health` du
serveur MCP — il sert justement a constater qu'un redeploiement a bien eu lieu.

**Fin de session Claude Code** : `git diff --stat` → `npx changeset` si `core/src` ou `shared` touches
(en nommant le constat `AM-0XX` / `BUG-0XX` quand l'issue en cite un) → commit (Conventional) → proposer
une release a l'utilisateur (ne pas releaser sans accord).

**Recapitulatif des gestes de release**, dans l'ordre : changeset nommant les constats resolus → merge de
la PR changesets (npm + tag + Release sur bmatge ; miroir, tags et Release propages par `mirror-sync.yml`) →
**redeploiement de `chartsbuilder`** verifie au `curl` (le seul geste qui reste manuel ; `maintenance.yml`
le rappelle chaque lundi si l'instance est en retard sur `main`).

## Ce que Claude DOIT faire

- Lire `docs/ARCHITECTURE.md` (et sa section **Couplages non-évidents ⚠️**) avant de toucher au pipeline de composants, au proxy, aux bundles, au beacon ou au build.
- Acceder a `import.meta.env.VITE_*` **en direct**, sans indirection.
- Apres modif d'un **attribut / evenement / slot / variable CSS** d'un composant `dsfr-data-*` :
  ecrire le JSDoc sur le composant (`@fires`, `@slot`, `@cssprop`, et `@champ <grammaire>` pour un
  attribut qui designe un champ des donnees, #1141) puis lancer **`npm run build:skills`** —
  la partie « reference » des skills est GENEREE depuis le custom-elements manifest (#512), ne jamais
  editer `packages/shared/src/skills/skills-reference.generated.ts` a la main
  (sinon `tests/skills/skills-reference.test.ts` casse).
- Apres AJOUT d'un attribut (ou d'un composant public) : le **ranger dans une section** d'une page
  `specs/components/*.html` — ajouter son nom au `fields="..."` d'un bloc `<!-- ATTRS -->` (ou d'un
  `<!-- ATTRS-PROSE -->` quand il est documente en prose), ecrire la prose autour, puis lancer
  `npm run build:specs-tables`. Les lignes des tableaux sont GENEREES : ne jamais les saisir a la main.
  `npm run check:specs-tables` est bloquant en CI (#757).
- Apres modif d'un **type de graphique / operateur / agregation** : mettre a jour le guide redige a la main
  dans `packages/shared/src/skills/skills.ts` (sinon `tests/skills/skills.test.ts` casse).
- Apres AJOUT d'un type de graphique (`DSFRChartType`), d'un composant d'affichage ou d'un attribut
  de `dsfr-data-chart` : le **trancher pour le Builder** — lui donner une tuile ou un controle
  (`data-type` / `data-attribut` dans `apps/builder/index.html`), ou l'exclure avec sa raison dans
  `apps/builder/src/couverture-exclusions.ts`. `tests/apps/builder/couverture.test.ts` echoue sinon (#1204).
- **Tout chiffre affiche a un controle** (ADR-122). Tout nouvel attribut, operateur, agregation,
  format ou composant qui **produit ou transforme un nombre** entre dans un manifeste de
  `tests/verif-donnees/` (l'un des dix domaines : `query`, `adaptateurs`, `transformations`,
  `affichages`, `delegation`, `export-studio`, `contexte` en deterministe ; `banc`,
  `banc-adaptateurs`, `banc-pages` en vivant), avec sa **preuve de mutation** —
  le controle vu ROUGE sur un defaut injecte dans la lib, puis le defaut retire. Un controle qui ne
  peut pas echouer ne garde rien. Un controle legitime qu'on ne sait pas faire passer ne se supprime
  pas et ne s'adoucit pas : il reste en `skip` avec la RAISON (defaut de la lib, ou amelioration non
  promise par la doc) et **les deux chiffres**, lib et oracle. Procedure : `tools/oracle/README.md`.
  **Tout piege paye par le banc a un canari** (`tests/verif-donnees/canari.ts`, un controle par piege,
  chacun citant le registre) ; **tout nouvel operateur entre dans les DEUX oracles**, TS et Python
  (`npm run verif:attendus`, attendus versionnes). **Une nuit rouge est gelee ou requalifiee sous
  24 h** : verdict bibliotheque → le gel de `tools/oracle/out/gel/` est copie sous
  `tests/verif-donnees/gel/` et une issue s'ouvre ; verdict donnee, clause perimee, jeu disparu → le
  controle vivant est mis a jour ou mis en `skip`. Jamais un troisieme etat.
- Ajouter un export lib-safe dans **les deux** barrels (`packages/shared/src/lib.ts` ET `src/index.ts`).
- Lancer `npm run build` apres modification des composants.
- Creer un changeset si `packages/core/src/` ou `packages/shared/` sont modifies.
- Apres un changement proxy/URL : valider empiriquement en grepant les bundles produits (aucune URL ne doit fuir dans la mauvaise dimension — voir ARCHITECTURE.md).
- Avant de conclure qu'une capacite MANQUE — a la lecture d'un rapport externe, d'un banc d'essai ou
  d'un constat d'utilisateur : lire [`docs/EVALUER-UNE-REPRODUCTION.md`](docs/EVALUER-UNE-REPRODUCTION.md).
  Les quatre verdicts (natif · natif mais posterieur a la version chargee · prevu a un jalon · absent
  du source) ne se confondent pas, une instance deployee peut avoir plusieurs versions de retard
  (`curl …/dist/skills-meta.json`), et la question « est-ce la bibliotheque, ou d'avoir voulu
  transposer un autre modele ? » a retire douze critiques sur un seul rapport.

## Ce que Claude ne doit JAMAIS faire

- **Jamais** de commit/push direct sur `main`/`master` sans autorisation explicite ; jamais de `git push --force` sans accord.
- **Jamais** d'indirection sur `import.meta.env` (`const m = import.meta as any`) — casse la substitution Vite, fait fuiter l'ancienne URL en dur.
- **Jamais** modifier les `.js` dans `packages/core/src/` (artefacts de build).
- **Jamais** editer a la main `packages/shared/src/skills/skills-reference.generated.ts`,
  `packages/core/custom-elements.json`, `mcp-server/src/skill-matching.generated.ts`,
  `mcp-server/src/skill-levels.generated.ts`, `mcp-server/src/component-contract.generated.ts`,
  `packages/shared/src/debug/field-attrs.generated.ts` ni `skills/dsfr-data/` —
  ce sont des artefacts generes (`npm run build:skills`).
- **Jamais** ajouter d'`import` dans `packages/shared/src/ia/skill-matching.ts` ni dans
  `skill-levels.ts` (adressage par niveau / reference, #1035) : ces fichiers sont
  copies tels quels dans le serveur MCP, qui est hors workspace npm (test-garde + garde-fou
  a la generation).
- **Jamais** importer des modules app-side (`auth/`, `storage/`, `ui/`, `tour/`) depuis `packages/core/src` (frontiere lib/app #319).
- **Jamais** d'`import` de `packages/`, de `@dsfr-data/*` ou de l'alias `@/` dans `tools/oracle/`,
  dans un manifeste de `tests/verif-donnees/` ou dans un recalcul : l'oracle serait alors la lib, et
  ne verifierait plus rien (ADR-122, test-garde `tests/oracle/guard.test.ts` sur tout le graphe
  d'imports). Si un recalcul a besoin d'une operation, on l'ecrit dans `tools/oracle/compute.ts`, en
  tableaux nus. Seule exception declaree : `tests/verif-donnees/fixtures-export-studio.ts`, qui
  importe ce qu'il VERIFIE, jamais ce qui recalcule : le generateur `shared/dashboard/` et l'outil
  `count_where` du Studio (`shared/ia/data-tools.js`, ce module seul, #1316) — le compte annonce
  par le Studio est controle contre l'oracle. Tout elargissement passe par le proprietaire.
- **Jamais** de `rebase` pour integrer `main` sur une branche de travail : `git merge origin/main`
  uniquement (les branches sont partagees, une reecriture d'historique casse les PR ouvertes).
- **Jamais** de `subscribeToSource` manuel dans un composant (utiliser `TransformerMixin` / `SourceSubscriberMixin` — test-garde statique).
- **Jamais** regenerer en place les secrets de prod (`ENCRYPTION_KEY`, `JWT_SECRET`, `DB_*`) dans `/opt/apps/<app>/.env` sur le VPS.
- **Jamais** retirer `esbuild: { keepNames: true }` de `vite.config.ts` (casse les composants Lit minifies).

## Notes

- APIs externes : Grist (docs.getgrist.com, grist.numerique.gouv.fr), Albert IA (albert.api.etalab.gouv.fr), OpenDataSoft (`*.opendatasoft.com`), Tabular (tabular-api.data.gouv.fr), INSEE Melodi (api.insee.fr/melodi).
- Self-hosting et chemins de proxying : `docs/DEPLOYMENT.md` §"Configuration self-hosted".
- Docker : `docker compose up -d --build` (volume `beacon-logs` pour persister le monitoring).
- Detail complet (composants, proxy, bundles, beacon, MariaDB, mcp-server, deploiement) : **`docs/ARCHITECTURE.md`**.

## Maintenance et garde-fous du harnais

- **Calendrier** : [`docs/MAINTENANCE.md`](docs/MAINTENANCE.md) — chaque jour la nuit de l'oracle (règle des 24 h : geler ou
  requalifier, jamais un troisième état) et le banc Studio ; chaque lundi les issues `maintenance` ; chaque mois `/audit-vault`,
  Dependabot, `.env` du VPS, PAT qui expirent ; chaque trimestre ADR et jalons ; à chaque release ce qui reste manuel (`spawn up` + `curl`).
- **Hook Claude Code** : `.claude/settings.json` (versionné) câble `scripts/claude-hooks/guard-git.sh` en `PreToolUse` sur Bash.
  Il BLOQUE (exit 2, message renvoyant ici) : `git push` forcé ; `git push` vers `main` d'un remote bmatge/dsfr-data (la resync du
  miroir `git push mef …` passe) ; `commit`/`merge`/`cherry-pick`/`revert` sur main ; `git rebase`, `pull --rebase` ; `git stash` nu,
  `pop`, ou `push` sans `-m`. Un dépôt qui committe sur main **par design** (le vault Obsidian, ADR-022) se déclare une
  fois par `git config harness.allow-main true` : les règles du commit sur main et du `pull --rebase` (skills du vault) s'y relâchent, rien
  d'autre ; `~/…` et `$HOME/…` sont compris dans `cd` et `-C`. Tester : `npm run test:run -- tests/hooks` (78 cas) ou
  `echo '{"tool_input":{"command":"git push -f"}}' | bash scripts/claude-hooks/guard-git.sh; echo $?` → 2.
- Les mêmes interdits sont tenus **aussi côté GitHub** par le ruleset de `main` (PR + checks obligatoires, pas de push direct ni force) :
  le hook protège le poste, le ruleset protège le dépôt, et l'un ne depend pas de l'autre (ADR-169 du vault).
