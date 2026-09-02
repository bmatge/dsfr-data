# Skills IA dsfr-data — utilisation locale par un développeur

La connaissance qui permet à un assistant IA de générer du code dsfr-data correct (attributs,
événements, pièges, patterns de composition) est maintenue dans le repo et **générée depuis le
code** (`npm run build:skills`, #512). Elle est exposée sous trois formes, du plus simple au plus
intégré.

| Forme | Pour qui | Où |
|---|---|---|
| **Skill Claude Code** (`skills/dsfr-data/`) | un dev qui travaille dans Claude Code | ce repo, ou n'importe quel projet qui consomme la lib |
| **Serveur MCP** (`mcp-server/`) | Claude Desktop, Cursor, Claude.ai, Claude Code | local (stdio) ou HTTP |
| **`skills.json`** brut | tout autre outil | `packages/core/dist/skills.json`, ou `https://chartsbuilder.miweb.run/dist/skills.json` |

Les trois sont produits par la même chaîne et disent la même chose ; la skill Claude Code et le
MCP découpent chaque skill en sections (`guide`, `reference`, `exemples`, `pieges`) pour ne
charger que l'utile.

## 1. Skill Claude Code (`skills/dsfr-data/`)

Format standard « Agent Skills » : un `SKILL.md` (index : principe du pipeline, table des 29
références avec leurs déclencheurs, règles transverses) et `references/<composant>.md` (contenu
complet de chaque skill, chargé à la demande). Claude Code lit le `SKILL.md` quand la demande
correspond à sa description, puis ouvre la référence du composant concerné.

### Installer

Dans ce repo (skill **de projet**, chargée dans toute session Claude Code ouverte ici) :

```bash
npm run skills:install
```

Pour toutes vos sessions, quel que soit le projet (skill **utilisateur**) — utile quand vous
intégrez dsfr-data dans un autre site :

```bash
npm run skills:install -- --global
```

Le script crée un lien symbolique `.claude/skills/dsfr-data` (ou `~/.claude/skills/dsfr-data`)
vers `skills/dsfr-data/` : la skill suit vos `git pull` sans réinstallation. Sur un poste sans
droit de créer des liens (Windows), ajoutez `--copy` (à relancer après chaque mise à jour).
`--uninstall` retire le lien.

Vérifier : ouvrir Claude Code dans le repo et demander par exemple *« un graphique en barres
dsfr-data sur un dataset OpenDataSoft groupé par région »* — la réponse doit citer la référence
`dsfr-data-query` et l'alias `population__sum`.

### Sans Claude Code

Le dossier est du markdown pur : copiez `skills/dsfr-data/` dans l'espace de connaissance de
votre outil (projet Claude.ai, `.cursor/rules`, dossier de contexte…). Le `SKILL.md` seul suffit
comme index ; les références se lisent ensuite au besoin.

### Repères neutres dans les exemples

Les skills du builder-IA citent l'instance qui les sert (proxy, URL de la bibliothèque). L'export
est **indépendant du poste** : `https://VOTRE_INSTANCE/dist` désigne l'URL de la bibliothèque
(CDN `https://cdn.jsdelivr.net/npm/dsfr-data@0/dist`, ou `/dist` de votre instance) et les chemins
`/…-proxy/` sont relatifs à votre instance Charts builder.

## 2. Serveur MCP (`mcp-server/`)

Le serveur expose `list_skills`, `get_relevant_skills(question)`, `get_skill(id, section)` et
`generate_widget_code`. Détails et options dans [`mcp-server/README.md`](../mcp-server/README.md).

```bash
cd mcp-server && npm ci && npm run build
```

Configuration côté client (stdio), à adapter au chemin de votre clone :

```json
{
  "mcpServers": {
    "dsfr-data": {
      "command": "node",
      "args": ["/chemin/vers/dsfr-data/mcp-server/dist/index.js", "--skills-file", "/chemin/vers/dsfr-data/packages/core/dist/skills.json"]
    }
  }
}
```

- Claude Desktop : `claude_desktop_config.json` ; Cursor : `.cursor/mcp.json` ;
- Claude Code : `claude mcp add dsfr-data -- node /chemin/vers/dsfr-data/mcp-server/dist/index.js --skills-file …` ;
- sans `--skills-file`, le serveur lit les skills de l'instance publique (`--url` pour une autre instance).

Le `--skills-file` local exige un `npm run build` à la racine (il produit `packages/core/dist/skills.json`).

## 3. `skills.json`

Tableau JSON des 29 skills : `id`, `name`, `description`, `trigger[]`, `content` (markdown complet),
`sections` (`guide` / `reference` / `exemples` / `pieges`) et `availableSections`. Servi par toute
instance déployée sur `/dist/skills.json`.

## Mettre à jour

Tout vient du code : après une modification d'un composant (attribut, événement, slot, variable
CSS → JSDoc) ou du guide rédigé (`apps/builder-ia/src/skills.ts`) :

```bash
npm run build:skills
```

régénère le manifeste custom-elements, la référence, le moteur de matching du MCP, `skills.json`
**et** `skills/dsfr-data/`. Les fichiers générés sont commités ; un test (`tests/skills-export.test.ts`)
échoue si l'export n'est plus le rendu exact des skills. Ne jamais éditer `skills/dsfr-data/` à la main.
