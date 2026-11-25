# Agentic coding sur dsfr-data : état des lieux

> État des lieux au **2026-11-25**, écrit pour des collègues qui ne connaissent pas le projet et
> s'intéressent à la manière de construire un logiciel avec un agent de code (ici Claude Code).
> Il décrit le dispositif tel qu'il est, le critique, et liste ce qui manque. Tous les chiffres sont
> comptés dans le dépôt, le vault et GitHub à la date indiquée ; aucun n'est estimé. Lecture : une
> vingtaine de minutes.

## 1. En deux minutes

**Le projet.** `dsfr-data` est une bibliothèque de Web Components de visualisation de données
conformes au DSFR (le design system de l'État), avec une suite d'applications d'édition
(ChartsBuilder, Studio IA, tableaux de bord, carte), un serveur, un serveur MCP et une instance
publique, [chartsbuilder.miweb.run](https://chartsbuilder.miweb.run). Un seul développeur, rattaché au
MEF/SNUM, depuis le 14 mars 2026.

**Ce que « agentic coding » veut dire ici.** Un humain décide (quoi faire, dans quel ordre, ce qui est
acceptable), et Claude Code exécute (lit, écrit, teste, ouvre la PR). Entre les deux, un **harnais
écrit** porte le contexte d'une session à l'autre : des contrats en prose lus au démarrage, une
mémoire externe (un vault Obsidian), de la connaissance générée depuis le code, des garde-fous
mécaniques en CI, et une boucle de retour externe. Le modèle n'a aucune mémoire d'une session à
l'autre ; tout ce qui doit survivre est écrit quelque part et relu.

**Les chiffres.**

| Mesure | Valeur | Source |
|---|---|---|
| Durée | 8 mois et demi (2026-03-14 → 2026-11-12, dernier commit sur `main`) | `git log` |
| Commits sur `main` | 1 256, dont 927 (74 %) co-signés `Co-Authored-By: Claude` | `git log --format=%B` |
| Issues + PR (dernier numéro) | 1 389 | `gh pr list --limit 1` |
| Issues | 572 (565 fermées, 7 ouvertes) | `gh issue list` |
| PR fusionnées | 738 : 521 humaines, 146 Dependabot, 71 bots de release | `gh pr list --state merged` |
| Releases | 150 tags ; version courante `0.52.0` ; `0.53.0` en attente (PR de release #1363 ouverte depuis le 2026-11-04, fusionnée et publiée le 2026-11-25) | `git tag`, `packages/core/package.json` |
| Workflows GitHub Actions | 12 | `.github/workflows/` |
| Tests | 512 fichiers `*.test.ts`, 8 971 `it(`/`test(` ; 11 manifestes de vérification des données ; 1 021 attendus figés par l'oracle Python | `tests/` |
| Composants publics | 29 `dsfr-data-*` ; 22 pages de specs ; 34 skills générées + 1 skill métier | `packages/core/src`, `specs/`, `skills/` |
| Documentation | 15 fichiers dans `docs/` (8 665 lignes) ; `ARCHITECTURE.md` seul : 1 789 lignes, 34 206 mots, dont 51 « couplages non évidents » (11 693 mots) ; `tools/oracle/README.md` : 1 251 lignes | `wc` |
| Vault Obsidian | 83 fiches projet, 267 notes de session (120 citent dsfr-data), 170 ADR dont 37 `project: dsfr-data` | `~/Documents/Obsidian` |
| Banc d'essai externe | 201 constats au registre (108 corrigés, 64 actés, 22 retirés), 61 pages reproduites | `open-data-viz/public/data/retours.json` |
| Cadence | 340 commits en septembre, 372 en octobre ; 271 PR humaines fusionnées en septembre | `git log`, `gh` |

Le rythme dit quelque chose : un développeur seul ne fusionne pas 271 PR en un mois sans un agent qui
écrit et une CI qui relit. Le reste du document explique ce qui rend ce rythme tenable, et ce qu'il
coûte.

## 2. Le dispositif, couche par couche

### 2a. Le contrat : ce que l'agent lit avant de toucher au code

Trois fichiers en prose sont chargés ou pointés à chaque session.

- **`~/.claude/CLAUDE.md`** (global, tous projets) : où vit la mémoire (le vault), les interdits
  (jamais de commit sur `main`, jamais de `push --force`, jamais d'édition de `.env*`, jamais de
  dépendance non listée), les conventions (français, Conventional Commits), les slash commands.
- **[`CLAUDE.md`](../CLAUDE.md)** (projet, 322 lignes, 3 082 mots) : le contrat opérationnel. Stack,
  commandes, conventions, remotes, procédure de release, et deux listes qui font l'essentiel du
  travail : « Ce que Claude DOIT faire » et « Ce que Claude ne doit JAMAIS faire ». Chaque règle
  cite l'issue qui l'a rendue nécessaire (17 issues distinctes y sont citées). Il a été modifié
  51 fois.
- **[`docs/ARCHITECTURE.md`](ARCHITECTURE.md)** : la carte de navigation (convention ADR-053 du
  vault). Son cœur est le §12 « Couplages non-évidents » : 51 entrées, chacune racontant ce qu'on
  oublie en touchant le code et qui casse à distance, avec le numéro d'issue et le fichier. Le §13
  donne les sept « lignes de force » (par exemple : « un chiffre ne dépend de rien d'invisible »,
  « généré depuis le code, jamais écrit à la main »). Le fichier cite 204 issues et 31 ADR
  distinctes, et a été modifié 128 fois.

Deux documents complètent le contrat sur un point précis : [`EVALUER-UNE-REPRODUCTION.md`](EVALUER-UNE-REPRODUCTION.md)
(comment juger un manque, voir 2e) et [`docs/ux/actions.md`](ux/actions.md) (le lexique normatif des
libellés d'interface, dont le lint est bloquant). Les autres fichiers de `docs/` sont la
documentation du produit, pas du dispositif : `USER-GUIDE`, `DEPLOYMENT`, `CONTRIBUTING`,
`DATASHEET`, `SECURITY`, `security-baseline`, `security-dev-guide`, `security-incident-response`,
`AI-SKILLS`, `RELAY`, `RAPPORT-dsfr-chart-2.1-cartes`, `PLAN_REMEDIATION_REVUE_2026-06`,
`THIRD-PARTY-LICENSES`.

Le trait caractéristique de ces textes : ils sont écrits **pour un lecteur qui n'a pas de mémoire**.
Chaque règle vient avec son pourquoi et son exemple mesuré (« KPI à 11 au lieu de 3 080 »), parce
qu'une règle nue est oubliée ou contournée par le modèle, alors qu'une règle motivée est appliquée.

### 2b. La mémoire : ce qui survit entre deux sessions

- **Le vault Obsidian** (`~/Documents/Obsidian`, lui-même un dépôt Git). Sa règle est posée dans
  son propre `CLAUDE.md` et dans ADR-051 : *le dépôt GitHub est la vérité du travail (issues, PR) ; le
  vault est la mémoire du sens (pourquoi, récit, liens)*. Trois objets comptent :
  - la **fiche projet** `10-Projects/dsfr-data.md` (207 lignes) : statut, `next-action` (un
    pointeur de moins de 80 caractères, obligatoire quand la fiche est active), un « Focus courant »
    en prose datée, les 41 ADR liées ;
  - les **notes de session** `20-Sessions/YYYY-MM-DD.md` : 267 notes, une par jour travaillé, avec
    objectifs, travaux (renvois aux PR), décisions, problèmes ; 120 citent dsfr-data ;
  - les **ADR** `30-Knowledge/ADR/` : 170 au total, 37 pour dsfr-data (34 acceptées, 1 rejetée,
    1 remplacée, 1 différée). Elles ont été relues intégralement contre le code le 2026-10-22
    (`30-Knowledge/dsfr-data-revue-adr-2026-10-22.md`) : une ADR jamais implémentée a été rejetée,
    deux ont été marquées remplacées.
- **Les slash commands** (`~/.claude/commands/`, 426 lignes en tout) : `/session-start` tire le vault,
  lit la fiche, la dernière session, les ADR récentes et les issues ouvertes, puis affiche un brief ;
  `/session-end` récapitule, écrit la note du jour, met à jour la fiche (et **refuse** une fiche
  active sans `next-action`), propose une ADR, commit et pousse le vault ; `/new-adr` numérote et
  lie ; `/sync-vault` et `/audit-vault` entretiennent.
- **La mémoire automatique de Claude Code** (`~/.claude/projects/<projet>/memory/`) : un index
  `MEMORY.md` et quatre fichiers de « feedback » (par exemple : « OIDC doit rester optionnel »,
  « merger une PR avec `--delete-branch` casse la PR enfant »). Elle n'a pas bougé depuis juin 2026 :
  le vault a pris ce rôle.

La carte d'ensemble de ce harnais transversal vit dans le vault, `50-Meta/HARNESS.md` (ADR-075 :
« la prose exprime l'intention, les hooks font l'enforcement »), et sa configuration est mirrorée
dans `50-Meta/claude-code-config/` avec un `bootstrap.sh` pour un nouveau poste.

### 2c. La connaissance générée : une seule source, plusieurs rendus

La connaissance qui permet à un assistant de générer du code `dsfr-data` correct n'est pas écrite
à la main dans une doc à part : elle est **extraite du code**.

```
packages/core/src/components/*.ts  (JSDoc : @fires, @slot, @cssprop, @champ)
   | npm run build:cem                   -> packages/core/custom-elements.json
   | npm run build:skills-ref            -> packages/shared/src/skills/skills-reference.generated.ts
   | concaténé au guide rédigé à la main (packages/shared/src/skills/skills.ts, 6 599 lignes)
   v
dist/skills.json  ->  Studio IA (outils get_relevant_skills / get_skill)
                  ->  serveur MCP (mcp-server/, Claude Desktop, Cursor, Claude Code)
                  ->  skill Claude Code (skills/dsfr-data/, 34 références), npm run skills:install
                  ->  tableaux d'attributs des specs (npm run build:specs-tables)
                  ->  tampon de fraîcheur dist/skills-meta.json (generatedAt, libVersion, commit)
```

Deux règles tiennent la chaîne : **ne jamais éditer un artefact généré** (sept fichiers nommés dans
`CLAUDE.md`, et `tests/skills/skills-reference.test.ts` vérifie maillon par maillon que le manifeste
décrit les attributs réellement présents au runtime par introspection Lit), et **tout attribut
ajouté doit être tranché** : rangé dans une section d'une page de specs (`check:specs-tables`),
couvert ou exclu avec raison par le Studio IA (`check:studio-couverture`) et par le Builder
(`tests/apps/builder/couverture.test.ts`). À côté vit une skill métier écrite à la main
(`skills/dataviz-metier/`, ADR-136), qui emprunte le même canal.

L'intérêt pour l'agentic coding est double : l'agent qui travaille *sur* la bibliothèque est aussi un
consommateur de ces skills, et le même fichier sert l'usager final du Studio IA. Une dérive entre la
doc et le code casse un test, pas une démo.

### 2d. Les garde-fous : ce qui ne dépend pas de la lecture du modèle

Tout ce qui est en prose peut être ignoré. Le dispositif a donc déplacé un maximum de règles vers
des contrôles mécaniques.

**La CI bloquante sur chaque PR** (quatre workflows, `ci.yml` en 4 à 6 minutes, `verif-donnees.yml`
en 8 à 10, `builder-e2e.yml` en 2, `e2e-layout.yml`) :

| Garde | Ce qu'il tient |
|---|---|
| `check:accents` | accents et formes hors lexique dans tous les libellés UI (`scripts/check-french-accents.sh`, lexique `docs/ux/actions.md`) |
| `check:specs-tables` | chaque attribut rangé dans une page de specs, tableaux régénérés |
| `check:studio-couverture` | chaque attribut écrit par le Studio IA ou exclu avec raison |
| `check:reperes` | registre des repères d'interface à jour (ADR-143) |
| `check:sri` | empreintes SRI des bundles |
| `typecheck`, `typecheck:tests`, `lint`, `format:check` | dont la frontière lib/app par `no-restricted-imports` (#319) |
| `test:coverage` | les 8 971 tests Vitest |
| `build`, `build:apps`, tests de bundle | mode dev de la lib, bundle autonome, chargement différé de Parquet |
| `proxy-nginx`, `relais-nginx` | la configuration nginx réelle contre les tests du proxy borné et du relais |
| `verif` | la vérification des données en mode déterministe (voir ci-dessous) |
| `attendus` | les attendus de l'oracle Python régénérés doivent être identiques à ceux commités |
| cinq specs Playwright nommées | export HTML, diagnostic de mise en page, Studio (recette, navigation, parité) |
| `sca`, `secrets`, `sast` | Trivy (dépendances HIGH/CRITICAL et configuration des Dockerfiles), gitleaks (tout l'historique), Semgrep (`p/default`, `p/typescript`, `p/javascript`, `p/xss`, `p/security-audit`, SARIF remonté dans l'onglet Sécurité). CodeQL ne fait pas partie de `ci.yml` : il tourne à part dans `codeql.yml` |

**Les douze workflows de `.github/workflows/`**, et ce que chacun garde. « Bloquant » veut dire :
requis par la protection de `main` (voir ci-dessous) ; les autres informent, publient ou livrent.

| Fichier | Nom | Déclencheurs | Bloquant sur PR | Ce qu'il garde |
|---|---|---|---|---|
| `ci.yml` | CI | PR vers `main`, push sur `main` | oui : `quality`, `Proxy générique — nginx réel`, `Relais cachable — extrait nginx, nginx réel`, `Security — SCA & config`, `Security — Secrets`, `Security — SAST` (non : `changeset-check`, avertissement seul ; `Security — SCA advisory`, `continue-on-error`) | typecheck, lint, format, 8 971 tests, builds lib et apps, gardes des artefacts générés, nginx réel, Trivy, gitleaks, Semgrep |
| `verif-donnees.yml` | Vérification des données | PR vers `main`, push sur `main` | oui : `Chiffres affichés vs recalcul indépendant`, `Attendus figés de la troisième voix (Python stdlib)` | l'oracle déterministe (ADR-122) et les attendus Python identiques à ceux commités |
| `builder-e2e.yml` | Builder E2E | PR vers `main`, push sur `main` | oui : `Recette Builder et export (Playwright)` | les cinq specs Playwright du Builder et du Studio (export HTML, diagnostic, recette, navigation, parité) |
| `e2e-layout.yml` | E2E layout | PR vers `main`, push sur `main` | oui : `Mise en page mesurée (Playwright)` | seize specs qui mesurent des boîtes, des échelles et des pannes dans un vrai Chromium (ce que happy-dom ne calcule pas) |
| `codeql.yml` | CodeQL | PR vers `main`, push sur `main`, lundi 06:00 UTC, à la demande | non (alertes dans l'onglet Sécurité) | analyse `security-and-quality` du JavaScript/TypeScript et des workflows Actions eux-mêmes |
| `docker-scan.yml` | Docker image scan | push sur `main` et PR filtrés par chemins (`docker/**`…), lundi 07:00 UTC, à la demande | non (filtré par chemins ; CRITICAL fait échouer le job quand il tourne) | Trivy sur les deux images construites (`dsfr-data`, `dsfr-data-db`) |
| `dast.yml` | DAST | lundi 08:00 UTC, à la demande | non (`continue-on-error`, ADR-004) | OWASP ZAP baseline sur la pile complète (MariaDB + Express + nginx) montée dans le runner |
| `oracle.yml` | Oracle numérique (contrôles vivants) | chaque nuit 06:30 UTC, à la demande, PR portant le label `oracle` | jamais | les contrôles vivants contre les vraies API des portails (ADR-122) |
| `banc-studio.yml` | Banc de pertinence du Studio IA | PR touchant `apps/studio/**` ou `shared/ia`, chaque nuit 03:00 UTC, à la demande | non (`continue-on-error`, un modèle n'est pas déterministe ; `bmatge/dsfr-data` seulement) | la pertinence des réponses du Studio sur des scénarios, modèle réel de l'instance (#1112) |
| `guide-examples.yml` | Guide examples | chaque matin 06:00 UTC, à la demande | hors PR par choix (#632 : API tierces) | les exemples du guide chargent encore leurs données (un jeu renommé ou retiré casse la page sans commit) |
| `changeset-release.yml` | Release | push sur `main` | ce n'est pas un contrôle | maintient la PR de release Changesets ; à sa fusion, publie sur npm et pose le tag `v*` |
| `deploy-pages.yml` | Deploy to GitHub Pages | push sur `main` filtré par chemins (`specs/**`, `guide/**`, lib, widgets Grist), à la demande | ce n'est pas un contrôle | publie specs, guide et widgets Grist sur `bmatge.github.io/dsfr-data` |

Deux choses sont en chantier au 2026-11-25 :

- **Une exécution par PR, et `main` protégée.** Les quatre workflows bloquants tournaient **deux
  fois** : sur la PR, puis de nouveau sur le push de fusion vers `main` (même commit, même résultat),
  soit environ 20 minutes de calcul rejouées à chaque fusion, et sur le miroir en plus. Le chantier
  passe à une exécution par PR, et remplace la seconde par une **protection de `main` par ruleset** :
  toute modification passe par une PR ; les quatre contrôles (`quality`, nginx réel, sécurité,
  vérification des données et attendus, recette Builder, mise en page mesurée) sont **requis** ; la
  branche doit être **à jour** avec `main` au moment de fusionner (ce qui rend inutile la seconde
  exécution : le commit testé est celui qui est fusionné) ; le `push --force` et la suppression de
  `main` sont interdits, sans exception pour personne. Jusque-là, `main` n'avait **aucune**
  protection : la CI était informative, et rien n'empêchait un `git push origin main` depuis un
  poste.
- **Six alertes CodeQL `actions/unpinned-tag`** (`ci.yml` ×3, `docker-scan.yml`, `dast.yml`,
  `changeset-release.yml`) : les actions tierces `aquasecurity/trivy-action`, `zaproxy/action-baseline`
  et `changesets/action` sont référencées par un tag mobile (`@v0.36.0`, `@v2`) qu'un mainteneur
  compromis peut déplacer. Le traitement est l'**épinglage par SHA** du commit, avec le tag en
  commentaire pour que Dependabot (groupe `github_actions`) continue de proposer les bumps — fait
  par #1393 le 2026-11-25.

**Les test-gardes d'architecture** : des tests Vitest qui lisent le source et refusent un motif.
`tests/lib-app-boundary.test.ts` (aucun import app-side depuis la lib), `tests/transformer-mixin.test.ts`
et `tests/source-subscriber.test.ts` (pas de `subscribeToSource` manuel), `tests/proxy/garde-proxy-*.test.ts`
(le bornage du proxy, écrit quatre fois, a une seule source), `tests/shared/cdn-versions-alignment.test.ts`,
`tests/reperes/*`, `tests/skills/*`, et surtout `tests/oracle/guard.test.ts`, qui parcourt tout le
graphe d'imports de l'oracle et refuse `packages/`, `@dsfr-data/*` et `@/`. 86 fichiers de test lisent
le système de fichiers : c'est la part du dispositif qui garde des règles plutôt que des
comportements.

**L'oracle indépendant (ADR-122).** C'est la pièce la plus originale. Trois chiffres faux étaient
sortis en production (KPI à 11 au lieu de 3 080, plafond de 1 000 lignes sur un agrégat, moyenne non
pondérée) et avaient été trouvés par le banc d'essai, jamais par un test. La réponse : « tout chiffre
affiché a un contrôle ». Un second moteur de calcul, `tools/oracle/` (TypeScript, tableaux nus,
n'importe rien de la lib), recalcule chaque chiffre depuis les lignes brutes et le compare à ce que la
page **affiche**, dans un vrai navigateur. Onze manifestes dans `tests/verif-donnees/` : sept
déterministes (fixtures servies par `page.route`, zéro réseau, bloquants) et trois vivants (vraies
API des portails, joués la nuit par `oracle.yml`, jamais bloquants), plus le **canari**, un jeu de
quarante lignes écrites à la main qui porte un piège par ligne (`null` contre `0`, `'01'` contre `1`,
NFC contre NFD, doublon de clé, 1 001 lignes derrière un plafond de 1 000), chaque contrôle citant le
constat du banc qui l'a payé.

Trois raffinements méritent d'être retenus :

- **La troisième voix** (#880) : un garde d'imports garantit que l'oracle n'emprunte rien à la lib, pas
  qu'il ne *pense pas comme elle*. D'où `tools/oracle-py/oracle.py` (1 343 lignes, Python standard
  seulement, jamais pandas, dont les conventions sur les NaN sont précisément celles que le projet
  interdit), qui produit `tests/verif-donnees/attendus.json` (1 021 attentes, versionnées). Un attendu
  qui change se voit dans le diff d'une PR.
- **La preuve de mutation** : un contrôle n'est accepté qu'après avoir été vu **rouge** sur un défaut
  injecté dans la lib, puis le défaut retiré. « Un contrôle qui ne peut pas échouer ne garde rien. »
  Le README de l'oracle tient la liste des mutations éprouvées par domaine.
- **Le verdict d'une nuit rouge** : sur un écart en mode vivant, le spec relit la date de traitement
  publiée par le portail. Si elle n'a pas bougé, verdict « bibliothèque », et l'échec est **gelé** en
  un contrôle déterministe prêt à committer sous `tests/verif-donnees/gel/`. Si elle a bougé,
  verdict « donnée », rejoué une fois. La règle de vie : une nuit rouge est gelée ou requalifiée
  **sous 24 heures**, « jamais un troisième état ».

Le banc de pertinence du Studio IA (`tools/banc-studio/`, #1112) complète l'exactitude par la
pertinence : 12 scénarios rejouent la vraie boucle du Studio contre le modèle réel de l'instance,
chaque nuit, jamais bloquant.

### 2e. La boucle externe : un second projet qui reproduit et constate

[open-data-viz](https://github.com/bmatge/open-data-viz) est un dépôt séparé dont la question est :
« ce que trois portails Opendatasoft de l'État produisent est-il réalisable avec `dsfr-data` ? ». La
méthode : reproduire chaque visualisation du catalogue sur les mêmes jeux lus en direct (61 pages),
terminer chaque page par une analyse (simple / a coincé / verdict), et consigner chaque constat dans
un **registre** typé (`retours.json`, 201 entrées : `bug`, `amelioration`, `piege`, `limite-dure`,
`avantage`, `faux-probleme`) avec un champ `verifie` obligatoire décrivant l'observation. Les
constats deviennent des issues sur `dsfr-data` qui citent leur identifiant (`AM-0XX`, `BUG-0XX`).

Le banc est lui-même piloté par Claude Code (son `CLAUDE.md` fait 195 lignes et porte une table de
cinquante « pièges déjà payés »). Il a produit la matière de deux documents du projet :

- [`EVALUER-UNE-REPRODUCTION.md`](EVALUER-UNE-REPRODUCTION.md) et ses **quatre verdicts** à ne jamais
  confondre : natif · natif mais postérieur à la version chargée · prévu à un jalon · absent du
  source. La page a été écrite après que, sur 16 constats contestés, **11 visaient une capacité qui
  existait déjà**, et que la question « est-ce la bibliothèque, ou d'avoir voulu transposer un autre
  modèle ? » a fait retirer douze critiques au banc lui-même (#746).
- la règle des **changesets qui nomment les constats** (« résout le constat AM-0XX du banc
  d'essai ») : sans elle, le banc redépose ce qui est livré. Le coût a été mesuré sur le rapport du
  2026-09-10 : un bug déposé alors qu'il était livré depuis la 0.23.0, neuf « échecs muets » sur
  dix-sept déjà corrigés.

Le lien fonctionne dans les deux sens : le banc lit les skills de la lib par le serveur MCP, et la
skill métier `dataviz-metier` est née des cas du banc. Chaque constat corrigé est marqué par
version dans le registre (18 en 0.21.1, 15 en 0.22.0, 9 en 0.23.0...).

### 2f. Livraison et exploitation

- **Changesets** : chaque modification notable de `packages/core` ou `packages/shared` s'accompagne
  d'un fichier `.changeset/*.md` en français (la CI avertit sinon) ; le workflow `changeset-release.yml`
  maintient une PR de release qui, fusionnée, publie sur npm, pose le tag et la Release GitHub. Huit
  changesets attendent dans la PR #1363.
- **Deux remotes en un** : `origin` pousse à la fois sur `bmatge/dsfr-data` et sur le miroir
  d'organisation `mef-snum-miweb/dsfr-data`. Les fusions faites côté GitHub ne se propagent pas, d'où
  trois gestes manuels après chaque fusion ou release (resync de `main`, suppression de la branche
  sur le miroir, recréation de la Release), tous documentés dans `CLAUDE.md`.
- **Déploiement** : aucun workflow ne déploie. La skill `vps-spawn` lance `ssh vps "spawn up
  chartsbuilder ..."`, et le tampon de fraîcheur dit si le geste a été fait :
  `curl -s https://chartsbuilder.miweb.run/dist/skills-meta.json`. Au 2026-11-25 il annonce
  `libVersion 0.52.0, commit 3888e738` : exactement `origin/main`. L'instance est à jour ; c'est la
  publication npm qui est en retard.
- **Hygiène planifiée** : Dependabot hebdomadaire (groupes raisonnés, chaque règle commentée avec
  l'issue qui l'a motivée), CodeQL hebdomadaire et sur PR, scan Trivy de l'image Docker, DAST ZAP le
  lundi, exemples du guide rejoués chaque matin (`guide-examples.yml`), oracle vivant chaque nuit,
  banc du Studio chaque nuit.

### 2g. Une session type

1. `/session-start` : le vault est tiré, le brief s'affiche (fiche, `next-action`, dernière session,
   ADR récentes, issues ouvertes).
2. L'humain désigne l'issue. L'agent lit `CLAUDE.md`, ouvre `ARCHITECTURE.md` §12 si la modification
   est transverse, crée une branche.
3. Il écrit le code et le JSDoc, lance `npm run build:skills` si un attribut a changé, range
   l'attribut dans une page de specs, écrit ou étend un contrôle de l'oracle avec sa preuve de
   mutation, rejoue `npm run verif`, crée le changeset (en nommant le constat du banc s'il y en a un).
4. Il ouvre la PR ; la CI relit (quatre workflows). Sur les 20 dernières PR humaines, 13 ont été
   fusionnées avec un seul commit, 4 avec deux, 3 ont demandé de 4 à 18 commits.
5. L'humain relit, fusionne. Gestes manuels : resync du miroir, suppression de la branche miroir ;
   à la release, redéploiement et `curl` du tampon.
6. `/session-end` : note de session, `next-action` à jour, éventuelle ADR, commit et push du vault.

## 3. Analyse critique

### Ce qui a payé

- **Les règles motivées par un incident mesuré.** Chaque interdit de `CLAUDE.md` et chaque couplage
  d'`ARCHITECTURE.md` porte son numéro d'issue et souvent son chiffre. C'est ce qui rend la prose
  efficace sur un modèle : une règle expliquée est appliquée, une règle nue est négociée. Le §
  « Couplages non-évidents » est explicitement la réponse à des régressions à distance (par exemple
  #765 : une query qui délègue son `group-by` sur une source partagée réécrivait les données des
  voisins).
- **Générer plutôt qu'écrire.** La référence des skills, les tableaux de specs, les repères
  d'interface, le moteur de matching copié dans le MCP : partout où une connaissance existait en
  deux endroits, le second est devenu un artefact généré et un test vérifie l'alignement. Les
  « manques » documentaires que signalait le banc ont disparu de cette catégorie.
- **L'oracle a changé la nature de la confiance.** Avant ADR-122, un chiffre faux et plausible
  passait tous les tests ; après, la question du matin est « ce contrôle figé est-il rouge sur
  `main` ? ». La troisième voix en Python et la preuve de mutation sont des idées transposables à
  n'importe quel projet où l'agent écrit à la fois le code et ses tests : elles combattent
  précisément le risque que les deux se trompent de la même façon.
- **La boucle externe est ce qui a trouvé les vrais bugs.** Les trois chiffres faux de l'été, la
  troncature silencieuse à 1 000 lignes, le tri Tabular qui perd des lignes : tous viennent du banc,
  aucun de la suite de tests. Un second dépôt qui *utilise* la bibliothèque comme un tiers vaut plus
  qu'une couverture supplémentaire.
- **Le vault a rendu les sessions reprenables.** `/session-start` donne en une minute l'état exact où
  l'on s'est arrêté, et les 37 ADR relues en octobre ont permis de retirer ce qui n'était plus vrai
  plutôt que de l'accumuler.

### Ce que ça coûte

- **Un volume de prose à maintenir qui dépasse celui de bien des codes.** `ARCHITECTURE.md` fait
  34 206 mots et a été modifié 128 fois ; le README de l'oracle 23 373 mots, 109 modifications ;
  `CLAUDE.md` 51. Ce texte est lu par le modèle à chaque session (en tout ou partie) : c'est un coût
  en jetons à chaque démarrage, et un coût en attention humaine à chaque relecture. Il n'existe pas de
  mesure de ce que le dispositif consomme en jetons ; voir §4.
- **Des gestes manuels à chaque release**, tous documentés, aucun automatisé : fusion de la PR de
  release, resync du miroir, tags et Release sur le miroir, suppression des branches mortes
  (74 branches accumulées le 2026-09-02), redéploiement du VPS, `curl` du tampon. L'oubli de l'un d'eux
  a déjà eu un coût mesuré (#733 : trois agents induits en erreur par une instance en retard).
- **La CI.** Environ 20 minutes de calcul par PR en comptant les quatre workflows, et le dossier
  `tests/builder-e2e/` complet dépasse l'heure (d'où le choix de n'en rendre bloquants que cinq
  specs, le reste étant une recette manuelle, #868). Les 146 PR Dependabot fusionnées ont chacune
  payé ce prix.

### Fragilités

- **Tout repose sur une personne et un poste.** Le vault est local (synchronisé sur un dépôt privé),
  le déploiement passe par un alias SSH personnel, les PR sont relues par une seule paire d'yeux. La
  fiche projet du vault pointe encore des chemins `file:///Users/bertrand/...` (macOS) alors que ce
  poste est Linux, et le dépôt existe en **deux clones** sur la machine (`~/Developer/GitHub/dsfr-data`
  et `~/Documents/bertrand/Github/dsfr-data`) : lequel fait foi n'est écrit nulle part.
- **`main` n'était pas protégée** (constat du 2026-11-25). Ni protection de branche ni ruleset
  (`gh api repos/bmatge/dsfr-data/rulesets` : vide). Les quatre workflows bloquants l'étaient par
  convention : rien n'exigeait qu'ils soient verts pour fusionner, et rien n'interdisait un push
  direct ou un `push --force` sur `main`. Pendant huit mois, « jamais de commit sur `main` » et
  « la CI est bloquante » n'ont tenu que par la lecture du modèle et la discipline de l'auteur ;
  aucune garantie que la CI ait été verte avant un merge. Le ruleset décrit en 2d (PR obligatoire,
  quatre contrôles requis, branche à jour, force push interdit) répond à ce constat.
- **L'enforcement mécanique des interdits globaux n'est pas en place sur ce poste.** ADR-075 et
  `50-Meta/HARNESS.md` annoncent des hooks `PreToolUse` bloquants (`guard-bash.py`, `guard-files.py`)
  et un journal d'audit (`audit-log.py`) comme « actifs ». Sur ce poste : pas de dossier
  `~/.claude/hooks/`, pas de clé `hooks` dans `~/.claude/settings.json`, pas de `~/.claude/audit/`,
  pas de `~/.claude/agents/` (la carte cite deux agents), et le `settings.json` ne contient aucune
  allowlist alors que le README du mirror en décrit 64 entrées. Les scripts existent dans le mirror
  du vault, mais le câblage n'a pas suivi la machine. Autrement dit, aujourd'hui, « jamais de commit
  sur `main` » ne tient que par la lecture du modèle, ce que l'ADR-075 identifiait justement comme
  la faiblesse à corriger.
- **La règle de vie de l'oracle n'est pas tenue.** `oracle.yml` est rouge **chaque nuit depuis au
  moins le 2026-11-16** (neuf nuits consécutives au 2026-11-24), avec trois verdicts « bibliothèque »
  (KPI `k-etp` : lib 503 823 contre oracle et serveur 579 114 ; KPI `k-femmes` : 64,9 % contre 65,1 ;
  URL `ssmsi-notin-entre-guillemets`) et neuf « indéterminé ». Le dossier `tests/verif-donnees/gel/`
  est vide et aucune issue `verif-donnees` ne les porte. Le dispositif dit « sous 24 h, jamais un
  troisième état » ; il est dans le troisième état depuis une semaine. Ce n'est pas un défaut de
  l'oracle, c'est l'absence de quelqu'un pour lire le rapport du matin, et le texte le prévoyait :
  « un contrôle vivant qu'il faut interpréter le matin est un contrôle qu'on finit par ignorer ».
- **Les règles vivent en prose et dépendent de la lecture du modèle.** C'est le pari du dispositif,
  et il est explicitement compensé par les gardes mécaniques. Mais tout ce qui n'a pas de garde est
  nu : la convention « un seul numéro d'issue, jamais de lettre de lot » a été écrite après qu'une
  entrée d'`ARCHITECTURE.md` avait mélangé trois schémas (#874).
- **La dérive doc/code existe, surtout dans le vault.** Le dépôt tient bien (toutes les commandes
  `npm run` citées dans `CLAUDE.md` et les docs existent dans `package.json` ; tous les fichiers cités
  existent). Les écarts trouvés sont plus bas :
  - `docs/AI-SKILLS.md` parle d'une « table des 33 références » ; `skills/dsfr-data/references/` en
    compte 34 (34 skills dans `skills.ts`, 35 avec la skill métier dans `skills-meta.json`) —
    corrigé le 2026-11-25 ;
  - `.changeset/README.md` décrit une procédure de release (`npx changeset version`,
    `npm run sync-versions`, tag `vX.Y.Z`) différente de celle de `CLAUDE.md` (`npm run
    version-packages`, qui enchaîne aussi `build:shared` et `build:skills-claude`) ; deux schémas de
    tags coexistent (77 `v*`, 73 `dsfr-data@*`) ;
  - la section « Documentation » du `README.md` ne lie pas cinq fichiers de `docs/` (`RELAY`,
    `security-dev-guide`, `security-incident-response`, `RAPPORT-dsfr-chart-2.1-cartes`,
    `PLAN_REMEDIATION_REVUE_2026-06`) — reliés le 2026-11-25 ;
  - la fiche projet du vault annonce « `dsfr-data` **v0.11.0** publiée » (réel : 0.52.0), liste
    `builder-ia` dans la stack et cite `apps/builder-ia/src/skills.ts` et
    `tests/apps/builder-ia/skills.test.ts` dans sa section Architecture (app retirée par #1081), donne
    `./deploy-server.sh` dans ses commandes (absent) et « release-publish (CI sur tag v*) » (périmé),
    tient un bloc « Backlog » daté du 2026-09-07 dont les trois epics (#602, #255, #187) sont fermés,
    garde dans « Focus courant » un bloc « Prochaine action importante (2026-09-27) » tranché le
    2026-10-02, et pointe `open-data-viz/docs/rapport-dsfr-data-2026-09-27.md`, qui n'existe pas
    (le rapport vit dans `export/rapport-pour-dsfr-data.md`) ; sa `next-action` (« Dependabot
    #1372-1375 ») est aux trois quarts faite — fiche remise d'équerre le 2026-11-25 ;
  - `~/.claude/CLAUDE.md` liste deux skills (`vibelab-new`, `vps-spawn`) ; le dossier en contient
    cinq, et `HARNESS.md` en nomme deux autres (`vibelab-access`, `vibe-lab-user`) qui ne sont pas sur
    ce poste.

  Le motif est net : ce qui est gardé par un test ne dérive pas ; ce qui est en prose dans le vault
  dérive en quelques semaines. La règle d'hygiène du vault (« `/audit-vault` en début de mois ») n'a
  pas de trace d'exécution récente.

### Biais

- **Le banc est aussi piloté par Claude.** Son indépendance est réelle au niveau du code (il
  consomme la lib publiée par CDN, il n'importe rien) et des règles (champ `verifie` obligatoire, « un
  constat corrigé ne s'efface pas »), mais relative au niveau de l'interprétation : le même modèle,
  les mêmes habitudes, parfois les mêmes angles morts. Les 16 constats infondés du lot 10 et les
  « trois agents induits en erreur le même jour » (#733) sont des erreurs d'agent, pas d'humain ; le
  dispositif les a rattrapées par des règles écrites, pas par une relecture indépendante.
- **Le banc est en retard sur la bibliothèque** : il charge `dsfr-data@0.33.0` quand la lib est en
  0.52.0. C'est le verdict « natif mais postérieur à la version chargée » appliqué au banc lui-même.
- **L'auteur écrit les règles, l'agent les applique, l'auteur juge le résultat.** Il n'y a pas de
  second humain dans la boucle, et aucune des deux voix n'est extérieure au projet.

## 4. Ce qui manque, et une piste pour chacun

| Manque | Constat | Piste | Effort | Impact |
|---|---|---|---|---|
| **Traitement des nuits rouges** | `oracle.yml` rouge depuis 9 nuits, `gel/` vide, règle des 24 h non tenue | Un job qui, sur verdict « bibliothèque », **ouvre l'issue et pousse le gel sur une branche** automatiquement (le fichier est déjà prêt dans `out/gel/`) ; une tâche planifiée Claude Code qui lit le rapport chaque matin et propose le geste | faible | fort |
| **Enforcement des interdits sur ce poste** | hooks d'ADR-075 absents de `~/.claude/`, `settings.json` sans allowlist ni hooks | Relancer `bootstrap.sh` et faire **vérifier** le câblage par `/session-start` (qui échoue bruyamment si `hooks` manque) ; ajouter cette vérification à `/audit-vault` | faible | fort |
| **Automatisation post-release** | resync miroir, Release miroir, suppression de branches, redéploiement : tous manuels, tous documentés | Un workflow `post-release.yml` déclenché par le tag : push vers le miroir (secret `MIRROR_TOKEN`), `gh release create` sur le miroir, suppression de la branche ; le redéploiement reste manuel (clé SSH) mais un job vérifie le tampon et **ouvre une issue si `libVersion` est en retard** | moyen | fort |
| **Maintenance préventive planifiée** | Dependabot existe ; rien pour : audit du vault, revue des issues dormantes, relecture des ADR, purge des branches miroir, publication npm en attente (8 changesets depuis trois semaines) | Un calendrier écrit (`docs/MAINTENANCE.md` ou une issue récurrente) : mensuel `/audit-vault`, trimestriel relecture ADR (la revue d'octobre a montré le rendement), hebdomadaire « y a-t-il une PR de release à fusionner ? » ; le workflow `schedule` de Claude Code peut porter le rappel | faible | moyen |
| **Hygiène de la fiche projet** | version, stack, commandes, backlog, focus : cinq blocs périmés | Faire de `/sync-vault` un geste **mécanique** qui réécrit version, stack et commandes depuis `package.json`, et de `/session-end` un geste qui archive les blocs de « Focus courant » de plus de 60 jours | faible | moyen |
| **Roadmap** | issues GitHub + « Focus courant » en prose ; 11 jalons créés sur GitHub mais la priorisation ne vit nulle part de lisible pour un tiers | Utiliser les jalons GitHub (ou un Project) comme seule vue de priorisation, et faire lire la vue par `/session-start` à la place du bloc en prose | moyen | moyen |
| **Observabilité du dispositif lui-même** | aucune mesure des jetons, du temps par session, du taux de PR vertes au premier coup (mesuré ici à la main : 13/20 en un commit) | Un script qui agrège par semaine : PR fusionnées, commits par PR, durée CI, nuits rouges, et dépose un tableau dans le vault ; le journal `audit-log.py` prévu par ADR-075 une fois câblé | moyen | moyen |
| **Transmissibilité** | tout ce qui n'est pas dans le dépôt vit dans un vault privé et un poste ; un second humain n'a ni droits sur le VPS ni accès au vault ; `CONTRIBUTING.md` ne mentionne pas le mode de travail | Ce document est un début. Ajouter : qui a quel accès (VPS, npm, miroir), ce qu'un second humain peut faire sans le vault, et une procédure de passation ; envisager d'ouvrir le vault (ou sa partie dsfr-data) au miroir d'organisation | moyen | fort |
| **Sécurité : ce que la CI ne couvre pas** | CodeQL (JS), Trivy (dépendances, config, image), gitleaks, ZAP baseline hebdomadaire : solide ; rien ne vérifie les **sorties de l'agent** (prompt injection via données ouvertes dans le Studio IA, secrets dans le vault poussé sur GitHub) ni les dépendances du serveur MCP hors workspace | Un test de non-régression sur les garde-fous du Studio (le banc de pertinence peut porter des scénarios adverses) ; gitleaks sur le dépôt du vault ; inclure `mcp-server/` dans `sca` | moyen | moyen |
| **Tests du harnais lui-même** | les slash commands et les skills (426 + 636 lignes de prose) ne sont jamais testés ; une régression dans `/session-end` se verrait à la session suivante | Un scénario de recette par skill (ce que la skill doit produire sur un dépôt jouet), rejoué quand la skill change ; le `skill-creator` de Claude Code sait évaluer une skill | moyen | faible |
| **Deux clones du dépôt sur le poste** | `~/Developer/GitHub/dsfr-data` et `~/Documents/bertrand/Github/dsfr-data` | En garder un (ou un lien symbolique), et le dire dans la fiche projet | faible | faible |
| **Documentation non reliée** | cinq docs hors de la section « Documentation » du README ; deux procédures de release qui divergent | Relier ou archiver ; supprimer la procédure de `.changeset/README.md` au profit de `CLAUDE.md` | faible | faible |

Classement par rendement : les deux premières lignes sont les plus rentables (quelques heures, et
elles remettent le dispositif en accord avec ce qu'il dit de lui-même). L'automatisation post-release
et la transmissibilité sont les deux chantiers qui comptent si quelqu'un d'autre doit un jour tenir
le projet.

**Suites, le soir même (2026-11-25).** Le tableau ci-dessus est l'état du matin ; six lignes ont bougé
dans la journée, par trois chantiers d'agents puis quelques gestes du propriétaire :

- *Traitement des nuits rouges* : `oracle.yml` gèle lui-même une nuit « bibliothèque » en PR brouillon
  avec son issue (#1402) ; une routine cloud Claude Code « oracle du matin » lit le run de la veille
  chaque jour à 07:15 UTC et commente l'issue. Les neuf nuits rouges du constat étaient une donnée qui
  avait changé et une clause périmée, pas la lib (#1397, #1396).
- *Enforcement des interdits* : hook `guard-git.sh` versionné dans le dépôt (#1398, #1403, #1404) et
  installé globalement ; `main` protégée par ruleset.
- *Automatisation post-release* : `mirror-sync.yml` (#1399) pousse `main`, tags et Releases vers le
  miroir ; `maintenance.yml` rappelle le redéploiement si l'instance est en retard. Un seul secret,
  `AUTOMATION_TOKEN`, PAT **classic** : un fine-grained n'a qu'un propriétaire et ne couvre pas l'org.
- *Maintenance préventive* : [`MAINTENANCE.md`](MAINTENANCE.md) et `maintenance.yml` (#1400), issues
  `maintenance` chaque lundi.
- *Roadmap* : onze jalons livrés fermés, jalons `0.54.0` et « Maintenance du dispositif », et un
  **GitHub Project « dsfr-data — roadmap »** (<https://github.com/users/bmatge/projects/4>) comme
  vue de priorisation unique.
- *Documentation non reliée* : #1394.

Restent ouverts : transmissibilité, observabilité du dispositif, sécurité hors CI, tests du harnais,
hygiène mécanique de la fiche projet, les deux clones.

## 5. Reproduire ailleurs : le kit minimal

Pour un collègue qui démarre un projet avec Claude Code, dans l'ordre, et avec le pourquoi.

1. **Un `CLAUDE.md` à la racine, court, avec des règles motivées.** Commandes, conventions, puis
   deux listes « DOIT » / « ne doit JAMAIS », chaque ligne avec la raison (et, dès qu'il existe, le
   numéro de l'incident). Le modèle applique une règle expliquée ; il négocie une règle nue.
   Commencer petit ; ce fichier grossit avec les incidents, pas avant.
2. **Une CI bloquante dès la première semaine**, même minuscule : typecheck, lint, tests, et un
   premier test-garde qui lit le source (par exemple « aucun import de X depuis Y »). Le point n'est
   pas la couverture, c'est d'avoir un endroit où une règle cesse d'être de la prose. Chaque fois
   qu'une règle du `CLAUDE.md` est violée une seconde fois, elle déménage en CI.
3. **Un journal de session et une fiche projet hors du dépôt**, avec deux gestes rituels de début et
   de fin (`/session-start`, `/session-end`). Un fichier Markdown suffit au départ. La seule règle
   non négociable : la fin de session écrit **la prochaine action** en une ligne. C'est ce qui rend
   la session suivante reprenable en une minute, par soi-même ou par l'agent.
4. **Des ADR atomiques dès la première décision structurante**, et une relecture périodique contre
   le code. Trois mois plus tard, c'est le seul endroit où le « pourquoi » existe encore ; la relecture
   est ce qui empêche l'accumulation de décisions mortes.
5. **Un second regard qui n'importe rien du code.** Selon le projet : un oracle qui recalcule, un
   banc d'essai qui consomme le paquet publié comme un tiers, ou simplement un jeu de données piège
   (le « canari ») joué dans un vrai navigateur. Avec un agent qui écrit le code et ses tests, c'est la
   pièce qui attrape ce que les deux ratent ensemble ; exiger la preuve de mutation (le contrôle vu
   rouge) pour chaque contrôle ajouté.
6. **Générer la connaissance plutôt que l'écrire**, dès qu'une information existe en deux endroits
   (doc et code, référence et manifeste) : un script qui produit l'un depuis l'autre et un test qui
   refuse l'écart. C'est ce qui fait que, huit mois plus tard, la documentation que lit l'agent est
   encore vraie.

Ce que ce kit ne donne pas, et que ce projet n'a pas encore non plus : un second humain. Le
dispositif décrit ici rend le travail d'une personne et d'un agent reprenable et vérifiable ; il ne
le rend pas transmissible sans les pistes du §4.

## Annexes : où regarder

- Contrat : [`CLAUDE.md`](../CLAUDE.md), [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) (§12, §13),
  [`docs/EVALUER-UNE-REPRODUCTION.md`](EVALUER-UNE-REPRODUCTION.md), [`docs/ux/actions.md`](ux/actions.md).
- Garde-fous : [`.github/workflows/`](../.github/workflows/), [`scripts/`](../scripts/),
  [`tests/oracle/guard.test.ts`](../tests/oracle/guard.test.ts), [`tests/lib-app-boundary.test.ts`](../tests/lib-app-boundary.test.ts).
- Oracle : [`tools/oracle/README.md`](../tools/oracle/README.md), [`tools/oracle-py/oracle.py`](../tools/oracle-py/oracle.py),
  [`tests/verif-donnees/`](../tests/verif-donnees/), [`tools/banc-studio/README.md`](../tools/banc-studio/README.md).
- Connaissance générée : [`docs/AI-SKILLS.md`](AI-SKILLS.md), [`packages/shared/src/skills/`](../packages/shared/src/skills/),
  [`skills/dsfr-data/`](../skills/dsfr-data/), [`mcp-server/`](../mcp-server/).
- Livraison : [`.changeset/`](../.changeset/), [`docs/DEPLOYMENT.md`](DEPLOYMENT.md), [`docs/CONTRIBUTING.md`](CONTRIBUTING.md).
- Hors dépôt : `~/.claude/CLAUDE.md`, `~/.claude/commands/`, `~/.claude/skills/`,
  `~/Documents/Obsidian/` (`CLAUDE.md`, `10-Projects/dsfr-data.md`, `30-Knowledge/ADR/`,
  `50-Meta/HARNESS.md`, `50-Meta/claude-code-config/`), `~/Developer/GitHub/open-data-viz/`.
