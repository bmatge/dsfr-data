# Maintenance du dispositif — calendrier, côté humain et côté machine

> Ce que le dispositif demande pour rester en accord avec ce qu'il dit de lui-même, et à quel
> rythme. Né de l'état des lieux [`AGENTIC-CODING.md`](AGENTIC-CODING.md) § « Ce qui manque »
> (2026-11-25) : nuits rouges non traitées pendant six semaines, release en attente trois
> semaines, carte du harnais annonçant des hooks absents. Décision : ADR-169 du vault
> (« les interdits sont tenus par la machine, et la maintenance est planifiée »).
>
> Règle de lecture : **la machine ouvre, l'humain tranche**. Chaque rituel ci-dessous dit ce
> qui est automatique (un workflow pose une issue, un hook bloque), ce qui reste à faire à la
> main, et la commande exacte. Un rituel sans commande est un vœu.

## 1. Chaque jour — la nuit de l'oracle et le banc Studio

**La nuit de l'oracle.** `oracle.yml` (cron `30 6 * * *`, UTC) rejoue les contrôles vivants
contre les vraies API, ~7 min. GitHub honore ce cron avec retard sur un dépôt chargé : les
runs planifiés de novembre 2026 sont partis entre 13 h 40 et 18 h UTC. « La nuit » se lit donc
le matin **pour le run de la veille**.

- **Automatique** : sur un échec, le workflow dépose l'artefact `oracle-results` (rapport,
  `expected.json`, `banc.md`, et les gels prêts dans `tools/oracle/out/gel/`) et ouvre ou
  met à jour une issue **« Oracle : nuit rouge du <date> »**. La routine Claude Code du matin
  (§ 6, quand elle est installée) y commente une classification des verdicts.
- **À la main** : lire le décompte en tête du rapport (« Verdicts de la nuit — n × … »), puis
  appliquer la règle des 24 h (§ 6). Commandes :

  ```bash
  gh run list --workflow=oracle.yml --event schedule --limit 3
  gh run view <id> --log | grep -E 'Verdicts de la nuit|ÉCHEC'
  gh run download <id> -D /tmp/oracle-<id>      # artefact : rapport + out/gel/
  ```

**Le banc de pertinence du Studio IA** (`banc-studio.yml`, nuit, dispatch, PR touchant au
Studio) : jamais bloquant, un taux par scénario. Lire le résumé du dernier run ; un taux qui
baisse de plus de dix points sur un scénario ouvre une issue `app:studio`.

```bash
gh run list --workflow=banc-studio.yml --limit 3
```

## 2. Chaque lundi — les issues `maintenance`

`maintenance.yml` (hebdomadaire) vérifie l'état du dispositif et **ouvre une issue par constat**,
label `maintenance`, jalon « Maintenance du dispositif ». Lundi, on les lit et on les ferme en
faisant le geste. Il n'y a rien à deviner : chaque issue porte sa commande ; les voici en
résumé.

| Constat (issue ouverte par le workflow) | Geste | Commande |
|---|---|---|
| **Release en attente** — la PR `chore: release` (`changeset-release/main`) est ouverte depuis plus de 7 jours | La merger (merge commit ou squash, les deux conviennent au workflow changesets), puis § 5 | `gh pr list --head changeset-release/main` · `gh pr merge <n> --merge` |
| **Miroir en retard** — `mef-snum-miweb/dsfr-data` n'est pas au même commit que `main` | Resynchroniser (`mirror-sync.yml` le fait à chaque push sur main une fois son secret posé ; sinon à la main) | `git fetch origin && git push mef refs/remotes/origin/main:refs/heads/main && git push mef --tags` |
| **Tampon de fraîcheur en retard** — `libVersion` servie par `chartsbuilder` < version npm | Redéployer (§ 5) | `curl -s https://chartsbuilder.miweb.run/dist/skills-meta.json` |
| **Issues dormantes** — ouvertes, sans activité depuis 90 jours | Trancher : fermer avec un mot, ou poser un jalon | `gh issue list --search "updated:<$(date -d '-90 days' +%F) is:open"` |
| **Dependabot ancien** — PR `dependencies` de plus de 14 jours | Merger le lot (après CI verte) ou fermer avec la raison ; un lot par semaine évite l'empilement | `gh pr list --label dependencies` |
| **Branches mortes sur le miroir** — `gh pr merge --delete-branch` ne supprime que sur bmatge | Supprimer sur le miroir | `git push https://github.com/mef-snum-miweb/dsfr-data.git --delete <branche>` |

Une issue `maintenance` qui survit à deux lundis est un défaut du calendrier, pas du dépôt :
on change le rituel (ou on automatise le geste), on ne laisse pas l'issue.

## 3. Chaque mois — vault, Dependabot, VPS, secrets

1. **`/audit-vault`** (slash command Claude Code) : fiches sans `next-action`, sessions sans
   lien projet, ADR orphelines. Le rapport dit quoi corriger ; `--fix` propose les corrections.
2. **Revue des PR Dependabot restantes** : ce que le lundi n'a pas absorbé. Grouper par lot
   (`chore(deps): lot Dependabot du <date> (n PR)`), comme #1390.
3. **`.env` du VPS** : vérifier qu'il porte toujours ce que le serveur attend (`docs/DEPLOYMENT.md`
   § self-hosted) — **lecture seule**, jamais de régénération des secrets de prod
   (`ENCRYPTION_KEY`, `JWT_SECRET`, `DB_*`) ; une variable manquante se signale à Bertrand.
   ```bash
   ssh vps "grep -oE '^[A-Z_]+=' /opt/apps/chartsbuilder/.env | sort"
   curl -s https://chartsbuilder.miweb.run/ia-server-config     # doit rester available:true
   ```
4. **Secrets qui expirent** :
   - **`AUTOMATION_TOKEN`** (PAT GitHub **classic** du compte bmatge, scopes `repo` + `workflow`,
     utilisé par les workflows qui écrivent sur le dépôt ou le miroir — un PAT fine-grained n'a
     qu'un propriétaire de ressources et ne peut pas écrire sur le miroir de l'organisation, 403
     constaté le 2026-11-25) : un PAT a une **date d'expiration**. La lire sur
     https://github.com/settings/tokens (compte bmatge, le jeton nommé pour ce dépôt) ; le
     secret est posé dans Settings → Secrets and variables → Actions du dépôt (`gh secret list`
     donne la date de mise à jour, pas l'expiration — seule la page des tokens la connaît).
     Régénérer **avant** l'échéance et reposer : `gh secret set AUTOMATION_TOKEN`.
   - **`NPM_TOKEN`** (publication) : même vérification sur https://www.npmjs.com/settings/~/tokens.
   - Clé Albert du `.env` du VPS (`IA_DEFAULT_KEY`) : pas d'expiration connue, mais un quota ;
     `IA_DEFAULT_ENABLED=false` la préserve avant une démonstration (#1377).

## 4. Chaque trimestre — ADR et jalons

- **Relecture des ADR** `project: dsfr-data`, méthode de la revue du 2026-10-22
  (`~/Documents/Obsidian/30-Knowledge/dsfr-data-revue-adr-2026-10-22.md`) : pour chaque ADR,
  la décision est-elle **dans le code** (grep), les conséquences négatives sont-elles encore
  vraies, les issues citées sont-elles closes, le statut dit-il la vérité ? Verdicts : tient ·
  à amender · à passer `accepted` · à remplir · à fusionner · à retirer (`superseded`). Les
  quatre points qui exigent un arbitrage du propriétaire sont posés, pas tranchés.
- **Revue des jalons GitHub** : fermer les jalons livrés (onze jalons de 0.21 à la dette de
  septembre étaient encore ouverts à 0 issue ouverte le 2026-11-25), déplacer ce qui glisse,
  vérifier que « 0.x.0 » suivant existe et porte les évolutions de la lib promises.
  ```bash
  gh api repos/bmatge/dsfr-data/milestones --jq '.[] | "\(.number) \(.title) open=\(.open_issues)"'
  gh api -X PATCH repos/bmatge/dsfr-data/milestones/<n> -f state=closed
  ```

## 5. À chaque release

Le détail vit dans `CLAUDE.md` § « Versioning et Releases » ; ceci est la **répartition**
automatique / manuel.

| Étape | Qui | Vérification |
|---|---|---|
| Changesets accumulés → PR `chore: release` | `changeset-release.yml`, à chaque push sur main | `gh pr list --head changeset-release/main` |
| Merge de la PR de release | **humain** (ou agent autorisé) | `gh pr merge <n> --merge` |
| Publication npm, tags `dsfr-data@X.Y.Z` et `vX.Y.Z`, Release GitHub sur bmatge | `changeset-release.yml` | `npm view dsfr-data version` · `gh release view dsfr-data@X.Y.Z` |
| Resync du miroir (main + tags) et Release recréée sur le miroir | `mirror-sync.yml` quand son secret est posé ; **sinon à la main** | `git push mef refs/remotes/origin/main:refs/heads/main && git push mef --tags` puis les deux commandes `gh release view … -R bmatge … > notes.md` / `gh release create … -R mef-snum-miweb/dsfr-data …` du CLAUDE.md |
| **Redéploiement de `chartsbuilder`** | **toujours manuel** (clé SSH, aucun workflow ne déploie) | voir ci-dessous |

```bash
ssh vps "spawn up chartsbuilder git@github.com:bmatge/dsfr-data.git --dns api --mail real --keep"   # ~3 min
curl -s https://chartsbuilder.miweb.run/dist/skills-meta.json   # libVersion = la version publiée
curl -s https://chartsbuilder.miweb.run/ia-server-config        # available:true (le .env n'est pas touché)
```

Sans ce dernier geste, l'instance publique sert les fiches et le guide de la version précédente,
et un lecteur ne peut pas le savoir (#733). La release 0.53.0 du 2026-11-25 a suivi cette
chaîne de bout en bout : merge 12:10 UTC, npm et Release 12:10, miroir 12:12, `libVersion`
0.53.0 servie 12:14.

## 6. La règle des 24 h de l'oracle

Une nuit rouge est traitée **sous 24 h** et n'a que **deux sorties** (`tools/oracle/README.md`
§ « La règle de vie ») ; le verdict mécanique de la nuit n'est qu'un point de départ.

| Verdict de la nuit | Ce qu'il veut dire | Geste |
|---|---|---|
| **bibliothèque** | la date de traitement du portail n'a pas bougé entre l'attendu et l'observation ; le gel est prêt dans `out/gel/<id>-gel.json` | **Relire avant de geler** : un plafond atteint (`max-records`, `limit`) ou une clause de manifeste périmée donnent ce verdict à tort (#1396 : 12 000 affiché = plafond, 13 982 au serveur). Défaut confirmé → copier le gel sous `tests/verif-donnees/gel/`, committer, ouvrir une issue `verif-donnees` « verif: <contrôle> — lib X vs oracle Y (nuit du <date>) » ; le contrôle figé reste rouge sur main jusqu'au correctif. Pas de défaut → requalifier. |
| **donnée, rejoué** | le portail a republié entre les deux lectures ; le contrôle a été rejoué et seul le second passage compte | rien, si le rejeu est vert ; sinon traiter comme indéterminé |
| **indéterminé** | pas de date d'un côté (Tabular, Melodi, export sans catalogue) | lire les deux chiffres et l'URL : API indisponible (rien à faire, noter) · jeu modifié ou disparu · clause périmée (le comportement attendu n'est plus celui que la doc promet, cf. `ssmsi-notin` et #1312) → **mettre à jour le contrôle vivant**, ou le passer en `skip` avec la RAISON et les deux chiffres |

Deux gestes, donc : **geler** (verdict bibliothèque confirmé) ou **requalifier** (tout le reste).
Jamais un troisième état ; jamais de contrôle adouci ou supprimé. Preuve attendue dans la PR :
le ou les contrôles rejoués en vivant (`VERIF_MODE=live`, un spec filtré par `-g`), avec leurs
chiffres. La PR de requalification des nuits du 2026-10-15 au 2026-11-24 est le modèle (#1397).

## 7. Les garde-fous du harnais, et comment les tester

Les interdits du `CLAUDE.md` sont tenus **deux fois** : par la machine côté poste, par GitHub
côté dépôt. La prose exprime l'intention ; ce qui suit l'applique.

**Hook Claude Code `PreToolUse` (côté poste, versionné).** `.claude/settings.json` câble
`scripts/claude-hooks/guard-git.sh` sur l'outil Bash. Le script lit la commande en JSON sur
stdin, examine chaque segment (`&&`, `||`, `;`, `|`, sous-shells), et bloque (exit 2, message
en français qui renvoie au CLAUDE.md) : `git push` forcé sous toutes ses formes ; `git push`
vers `main`/`master` d'un remote qui pointe sur bmatge/dsfr-data (la resync du miroir
`git push mef …` reste permise) ; `git commit` / `merge` / `cherry-pick` / `revert` sur main ;
`git rebase` et `git pull --rebase` ; `git stash` nu, `pop`, `save`, ou `push` sans `-m`
(pile partagée entre les worktrees). Tout le reste passe sans ralentir (sortie immédiate si
la commande ne nomme pas `git`). Contournement humain : préfixe `HARNESS_ALLOW=1`, réservé à
une autorisation explicite de Bertrand dans la conversation. Un dépôt qui committe sur main
**par design** (le vault Obsidian, ADR-022) se déclare une fois, `git config harness.allow-main
true` : seule la règle du commit sur main s'y relâche, les autres tiennent — c'est ce qui permet
d'installer le même script globalement sans casser `/session-end`.

```bash
echo '{"tool_input":{"command":"git push --force origin x"}}' | bash scripts/claude-hooks/guard-git.sh; echo $?   # 2 + message
echo '{"tool_input":{"command":"git status"}}' | bash scripts/claude-hooks/guard-git.sh; echo $?                  # 0, silence
npm run test:run -- tests/hooks        # 68 cas : bloqués, autorisés, dépôt déclaré harness.allow-main, dépôts temporaires
npm run typecheck:tests
```

Le hook est chargé à l'ouverture d'une session dans le dépôt (après acceptation de la
confiance du dossier) ; `$CLAUDE_PROJECT_DIR` désigne la racine où la session a démarré, donc
le script du checkout principal, et `cwd` suit le worktree courant. Le même script peut être
installé **globalement** (tous les dépôts) : voir
`~/Documents/Obsidian/50-Meta/claude-code-config/README.md` § « Installer les hooks globalement ».

**Ruleset GitHub (côté dépôt).** Un ruleset protège `main` : pas de push direct, pas de
suppression, pas de force push, PR obligatoire avec les checks requis. Il tient même quand le
hook est absent (autre poste, `gh`, interface web). Le lire et le tester :

```bash
gh api repos/bmatge/dsfr-data/rulesets --jq '.[] | "\(.id) \(.name) \(.enforcement)"'
gh api repos/bmatge/dsfr-data/rules/branches/main --jq '.[].type'
git push origin HEAD:main      # depuis une branche de travail : refusé par GitHub (et, avant lui, par le hook)
```

**Ce que ni l'un ni l'autre ne tient** : l'édition d'un `.env*` par l'agent (le hook global
`guard-files.py` du vault le fait, quand il est installé), l'installation d'une dépendance non
listée (règle de prose, permission `npm install` retirée de l'allowlist globale), les gestes
sur le VPS (`spawn down`, `prune` : journalisés par `audit-log.py` quand il est installé,
jamais bloqués). Ces trois-là restent des règles de lecture.
