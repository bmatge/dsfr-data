# Skill « dsfr-data » pour les assistants de code

Ce dossier donne à un assistant IA (Claude Code, Codex, Cursor, Gemini CLI, Copilot…) la
connaissance nécessaire pour écrire du code dsfr-data correct : attributs, événements et slots
de chaque composant (générés depuis le code), patterns de composition, pièges connus.

- `SKILL.md` — l'index, au format standard « Agent Skills » (frontmatter `name` / `description`
  + corps court) : principe du pipeline, table des 29 références avec leurs déclencheurs, règles
  transverses. C'est le seul fichier que l'assistant lit d'emblée.
- `references/<composant>.md` — le contenu complet de chaque skill, lu à la demande.

Le dossier est du markdown pur, sans dépendance : il s'installe en le copiant ou en le liant là
où votre outil cherche ses skills. Il est **généré** par `npm run build:skills` (ne pas l'éditer à
la main) et suit vos `git pull` si vous l'installez par lien symbolique.

## Claude Code

Skill de projet (chargée dans toute session ouverte dans ce repo) :

```bash
npm run skills:install
```

Skill utilisateur (toutes vos sessions, utile pour intégrer dsfr-data dans un autre site) :

```bash
npm run skills:install -- --global
```

Le script crée un lien symbolique `.claude/skills/dsfr-data` (ou `~/.claude/skills/dsfr-data`) vers
ce dossier. Options : `--copy` (copie, pour un poste sans droits de lien symbolique — à relancer
après chaque mise à jour), `--uninstall`. Sans le script :

```bash
ln -s "$(pwd)/skills/dsfr-data" ~/.claude/skills/dsfr-data
```

Vérifier : demander « un graphique en barres dsfr-data sur un dataset OpenDataSoft groupé par
région » — la réponse doit s'appuyer sur la référence `dsfr-data-query` et l'alias
`population__sum`.

## Codex (OpenAI Codex CLI)

Codex lit le même format `SKILL.md`. Installez le dossier parmi ses skills, au niveau utilisateur :

```bash
mkdir -p ~/.codex/skills
ln -s "$(pwd)/skills/dsfr-data" ~/.codex/skills/dsfr-data
```

Si votre version de Codex ne charge pas encore les skills (ou pour un dépôt partagé), pointez-le
depuis le fichier d'instructions du projet, `AGENTS.md` à la racine :

```markdown
## dsfr-data
Avant d'écrire du code utilisant les composants `dsfr-data-*`, lire `skills/dsfr-data/SKILL.md`
puis la référence du composant concerné dans `skills/dsfr-data/references/`.
```

## Cursor

Règle de projet qui renvoie vers la skill (`.cursor/rules/dsfr-data.mdc`) :

```markdown
---
description: Composants dataviz dsfr-data (DSFR)
globs: ["**/*.html", "**/*.ts", "**/*.js"]
---
Avant d'écrire du code `dsfr-data-*`, lire @skills/dsfr-data/SKILL.md puis la référence du
composant dans @skills/dsfr-data/references/.
```

Ou, plus direct, ajoutez `skills/dsfr-data/SKILL.md` au contexte (`@Files`) de la conversation.

## Gemini CLI, GitHub Copilot, autres outils à fichier d'instructions

Le principe est le même : un fichier d'instructions du projet qui renvoie vers `SKILL.md`.

- Gemini CLI : `GEMINI.md` à la racine, même paragraphe que pour `AGENTS.md`.
- GitHub Copilot : `.github/copilot-instructions.md`, idem.
- Claude.ai / Claude Desktop (projets) : ajoutez `SKILL.md` et les références utiles aux
  connaissances du projet.

## Serveur MCP (toutes les IA compatibles)

Pour un accès dynamique (recherche de skills par question, sections à la demande, génération de
widget), le repo fournit un serveur MCP : voir [`docs/AI-SKILLS.md`](../../docs/AI-SKILLS.md) et
[`mcp-server/README.md`](../../mcp-server/README.md).

## Mise à jour

```bash
git pull
npm run build:skills   # seulement si vous modifiez les composants ou le guide des skills
```

Les exemples désignent la bibliothèque par `https://VOTRE_INSTANCE/dist` (CDN
`https://cdn.jsdelivr.net/npm/dsfr-data@0/dist`, ou `/dist` de votre instance) et les proxys par
des chemins relatifs à votre instance Charts builder.
