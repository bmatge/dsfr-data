# Banc de pertinence du Studio IA (#1112)

`verif-donnees` et l'oracle vérifient l'**exactitude** des chiffres affichés. Ce banc mesure la
**pertinence** du Studio IA : pour une demande réelle et un jeu de données, le modèle compose-t-il
le document attendu, sans rien inventer ni rien ajouter, et dit-il ce qu'il faut dire ?

Le banc rejoue la **vraie** boucle du Studio (`runStudioLoop`), avec le vrai prompt
(`buildSystemPrompt`), le vrai document (`document.ts`), le vrai export (`generateDashboardHTML`)
et le vrai lint de balisage. Rien n'est copié : il compose l'appel comme `sendMessage` de
`apps/studio/src/main.ts`, et ajoute seulement un transport qui **enregistre** (appels d'outils,
tours, jetons, latence) sans rien modifier. Pas de navigateur : la boucle tourne sous Node.

## Lancer

```bash
npm run banc:studio                                  # tous les scénarios, 3 répétitions
npm run banc:studio -- --pr --repetitions 1          # sous-ensemble de PR (ce que joue la CI)
npm run banc:studio -- --scenario aides-nationales,kpi-total --repetitions 5
npm run banc:studio -- --instance http://localhost:5173   # une autre instance
```

| Option | Variable d'environnement | Défaut |
|---|---|---|
| `--instance` | `BANC_STUDIO_INSTANCE` | `https://chartsbuilder.miweb.run` |
| `--repetitions` | `BANC_STUDIO_REPETITIONS` | 3 |
| `--pause` (ms entre deux appels) | `BANC_STUDIO_PAUSE_MS` | 10000 |
| `--scenario` (ids, virgules) | `BANC_STUDIO_SCENARIOS` | tous |
| `--pr` | `BANC_STUDIO_PR=1` | non |

Aucun `build:shared` n'est nécessaire : la configuration de vite-node du banc (`vite.config.ts`)
pointe `@dsfr-data/shared` sur les **sources**, comme vitest. Le banc mesure le code de la branche.

**Accès au modèle.** Par le même chemin que le Studio en ligne : le mode serveur de l'instance
(`GET /ia-server-config`, puis `POST /ia-proxy-default`), dont le proxy porte la clé côté serveur.
**Aucun secret.** Le proxy impose son modèle (`IA_DEFAULT_MODEL`) : le rapport l'affiche. Le banc
lit aussi les fiches de documentation de l'instance (`/dist/skills.json`) et son tampon de
fraîcheur (`/dist/skills-meta.json`, version de la lib et commit, repris dans le rapport).

**Seul écart avec le Studio en ligne** : sous Node, il n'y a pas d'aperçu à observer. Les outils
de diagnostic restent déclarés (même prompt, mêmes outils, même budget de 12 tours qu'en ligne),
mais répondent qu'aucune trace n'est disponible.

## Coût et sobriété

Le plafond du proxy (`IA_MAX_RPM`, **10 appels par minute, tous usagers confondus**) est partagé
avec les usagers du Studio. D'où :

- **10 s entre deux débuts d'appel** par défaut (6 par minute au plus) ;
- en PR, **trois scénarios** (`pr: true`), **une** répétition : une dizaine d'appels ;
- la nuit, le jeu complet (7 scénarios × 3) : une centaine d'appels, une vingtaine de minutes ;
- un seul banc à la fois (groupe de concurrence global du workflow), et le miroir
  `mef-snum-miweb` ne le lance pas ;
- le transport commun rejoue un 429 (trois fois au plus, `Retry-After` plafonné à 10 s) ; au-delà,
  l'essai est compté **en erreur**, à part : il mesure la passerelle, pas le Studio.

Le banc s'annonce par ses en-têtes (`User-Agent: dsfr-data-banc-studio/1 (…)`,
`X-Dsfr-Data-Banc: studio`). Le proxy IA (`scripts/ia-default-server.js`) ne les exploite pas
aujourd'hui : il ne journalise pas l'appelant, et le plafond ne distingue pas le banc des usagers.
Seul le journal d'accès de nginx garde le User-Agent.

## Scénarios et critères

Un scénario (`scenarios.ts`) : un jeu de données (`fixtures.ts`), un ou plusieurs messages de
l'usager, et les attentes, écrites dans le vocabulaire des **outils** du Studio
(`BLOCK_SPEC_SCHEMA`, camelCase), pas dans celui des attributs HTML.

| Scénario | PR | Ce qu'on attend |
|---|---|---|
| `aides-nationales` | oui | Données longues ville × aide (#1108) : une carte, `groupField:"Ville"`, `popupMode` en volet, et l'avertissement sur « Nombre total d'actions », total par ville répété sur chaque ligne. Ni filtre ni tableau. |
| `barres-triees` | oui | Barres (`bar` ou `horizontalBar`), `labelField:"Région"`, `valueField:"Population"`, `sortOrder:"desc"`. |
| `kpi-total` | | `kpi`, `valueField:"Population"`, `aggregation:"sum"`. |
| `tableau-pagine` | | `datalist`, `pagination:10`. |
| `carte-points` | | Couche `marker`/`circle`, coordonnées, `tooltipField:"Nom"`, **sans** `groupField` (une ligne par musée). |
| `demande-impossible` | oui | Un formulaire de saisie : le dire d'emblée, sans toucher au document, en 4 appels au plus. |
| `modification` | | Deux messages : barres, puis « passe-le en camembert » — un seul graphique à la fin (`pie`/`doughnut`). |

Les critères (`criteres.ts`) sont **déterministes** — pas de juge LLM dans ce premier lot. Chacun
rend `ok`, `échec` ou `sans objet` :

| Critère | Ce qu'il lit |
|---|---|
| Blocs attendus | Chaque bloc attendu a un bloc du document qui porte ses options (pour une carte : au moins une couche). |
| Aucune option hors schéma | Chaque appel d'outil relu contre le schéma **envoyé au modèle** : option inconnue, valeur hors `enum`, type, requis. `document.ts` ignore une option inconnue sans bruit : seul le banc la voit. |
| Pas de bloc non demandé | Chaque bloc du document a la forme (nature, type de graphique) d'un bloc attendu ou toléré. |
| Avertissements attendus | Groupes de mots-clés dans les réponses (casse, accents, apostrophes ignorés). |
| Impossible dit d'emblée | Aucune action sur le document, et la première réponse dit l'impossibilité. |
| Code généré valide | Lint de balisage (`lintMarkup`, contrat des composants) sans erreur sur l'export. |
| Fin propre | `finish` ou réponse en texte, sans épuiser le plafond de tours ; aucune réponse vide. |
| Tours dans le budget | Appels au modèle ≤ `maxTours` (défaut : 6 par message). |

Les réponses du modèle sont des entrées externes : elles sont comparées (`includes` sur un texte
normalisé), jamais exécutées ; aucune expression régulière n'est construite à partir d'elles.

## Ajouter un scénario

1. Un jeu dans `fixtures.ts` : petit, écrit à la main, **fidèle** à une forme réelle (format long,
   total répété, coordonnées…). C'est la lecture du modèle qu'on mesure, pas un volume.
2. Une entrée dans `SCENARIOS` : `messages` tels qu'un usager les écrirait, `attendu.blocs` (options
   clés seulement : ce qui fait qu'on a répondu à la demande), `toleres` si un bloc de plus est
   acceptable, `avertissements` / `refus` en groupes de variantes. `pr: true` seulement s'il est
   parmi les plus discriminants : chaque scénario de PR coûte des appels sur un plafond partagé.
3. Dans `tests/banc-studio/banc-studio.test.ts`, un essai simulé qui passe au **vert**, puis la
   même conversation avec un défaut qui le fait passer au **rouge** : une attente qui ne peut pas
   échouer ne mesure rien.

## Lire le rapport

`tools/banc-studio/out/rapport.json` (ignoré par git) et `rapport.md`, aussi rendu dans le résumé
du job et versé en artefact (`banc-studio-rapport`, 30 jours).

- **Par scénario** : « Complet » = essais dont tous les critères évalués sont verts ; puis un taux
  par critère (`ok / évalués`), les moyennes de tours, jetons et latence, les essais en erreur.
- **Par critère** : le même taux, tous scénarios confondus.
- **Coût** : appels, jetons (entrée, sortie), latence cumulée, durée totale pauses comprises.
- **Échecs et erreurs** : une ligne par critère rouge, avec son écart (« groupField : attendu
  "Ville", obtenu absent »), pour relire un essai sans le rejouer. Le JSON garde en plus les
  réponses du modèle et les blocs du document final.

Un taux n'a de sens qu'avec ses répétitions : 1 sur 1 et 3 sur 3 ne disent pas la même chose. Le
banc **mesure** : un critère rouge ne change pas le code de sortie ; seul un banc qui n'a rien pu
mesurer (mode serveur fermé, tous les essais en erreur) sort en 1.

## En CI

`.github/workflows/banc-studio.yml`, **non bloquant** (`continue-on-error`) :

- sur une PR qui touche `apps/studio/**`, `packages/shared/src/ia/**`,
  `packages/shared/src/dashboard/**` ou le banc lui-même : sous-ensemble de PR, 1 répétition ;
- chaque nuit sur `main` : jeu complet, 3 répétitions — la référence ;
- `workflow_dispatch` : répétitions, scénarios et instance au choix (comparer une instance qui sert
  un autre modèle).

Suite prévue : comparer le rapport d'une PR à la dernière nuit de `main`, et rendre bloquante une
**régression nette** une fois la variance connue.
