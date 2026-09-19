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

À côté de la skill **technique** générée vit une skill **métier écrite à la main**,
[`skills/dataviz-metier/`](../skills/dataviz-metier/README.md) (ADR-136) : le regard d'une agence
de dataviz et d'un datajournaliste — quelle question, pour quel lecteur, quelle forme, échelles
honnêtes, sens des variations, phrase de lecture, tableau équivalent, ce qu'on ne montre pas —
chaque règle ancrée dans un cas du banc d'essai open-data-viz et traduite en geste `dsfr-data`.
Elle suit le même chemin que la skill technique : `skills.json`, serveur MCP, `skills:install`
(voir § 1 bis).

## 1. Skill Claude Code (`skills/dsfr-data/`)

Installation par outil (Claude Code, Codex, Cursor, Gemini CLI, Copilot…) : voir
[`skills/dsfr-data/README.md`](../skills/dsfr-data/README.md).

Format standard « Agent Skills » : un `SKILL.md` (index : principe du pipeline, table des 33
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

Le script crée un lien symbolique `.claude/skills/<nom>` (ou `~/.claude/skills/<nom>`) vers
chaque dossier `skills/<nom>/` porteur d'un `SKILL.md` — la skill générée **et** les skills
écrites à la main : elles suivent vos `git pull` sans réinstallation. Sur un poste sans droit de
créer des liens (Windows), ajoutez `--copy` (à relancer après chaque mise à jour). `--only <nom>`
n'installe qu'une skill ; `--uninstall` retire les liens.

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

## 1 bis. Skills écrites à la main (`skills/<nom>/`, ADR-136)

Une skill qui n'a pas de source dans le code — la skill métier `dataviz-metier` — vit dans un
dossier frère de la skill générée, au même format (`SKILL.md` avec frontmatter `name` /
`description`, une ligne « Déclencheurs : … », `references/*.md`). Son markdown **est** la
source : on l'édite directement, et `npm run build:skills` ne la touche pas.

Pour qu'elle voyage par le même canal que la skill technique, `scripts/build-skills-json.ts`
ajoute à `skills.json` toute skill markdown trouvée dans `skills/` hors dossier généré
(`scripts/lib/markdown-skills.ts` : id camelCase dérivé du dossier — `dataviz-metier` →
`datavizMetier` —, déclencheurs lus sur la ligne « Déclencheurs », contenu autoportant = corps du
`SKILL.md` puis références concaténées). Le serveur MCP et le client skills du studio la servent
donc comme les autres (`list_skills`, `get_relevant_skills`, `get_skill("datavizMetier")`) ;
`skills-meta.json` la compte.

Ce que ce chemin **ne couvre pas** : le builder-IA lit `SKILLS` (`apps/builder-ia/src/skills.ts`)
directement, pas `skills.json` — il ne voit pas les skills markdown. Les y faire entrer est une
décision à part (ADR-136, § Révision).

Garde : `tests/skills-markdown.test.ts` vérifie la forme (même frontmatter que la skill générée,
références citées ⇔ présentes, id sans collision) et que la skill remonte par le moteur de
matching partagé sur des questions métier sans passer devant la skill technique sur une question
de syntaxe.

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

Tableau JSON des 34 skills : `id`, `name`, `description`, `trigger[]`, `content` (markdown complet),
`sections` (`guide` / `reference` / `exemples` / `pieges`) et `availableSections`. Servi par toute
instance déployée sur `/dist/skills.json`.

### Tampon de fraîcheur — `skills-meta.json` (#733)

À côté, sur `/dist/skills-meta.json` : `{ generatedAt, libVersion, commit, skills }`. Il **date
l'instance servie**, pas le dépôt — rien ne déploie le VPS automatiquement, la mise en production
est un `ssh vps "spawn up"` manuel, et une instance peut donc être en retard de plusieurs versions.
Sans lui, impossible de distinguer « le code ne documente pas X » de « l'instance est ancienne » :
trois agents s'y sont trompés le même jour, dont un jusqu'à la rédaction d'un faux manque.

Le serveur MCP le rend dans l'en-tête de `list_skills` et dans `/health`
(`libVersion`, `generatedAt`, `commit`, à `null` face à une instance antérieure à #733).

C'est un fichier **séparé** parce que `skills.json` est un tableau au premier niveau et que des
consommateurs déjà déployés le lisent tel quel (le serveur MCP, distribué séparément de l'instance
dont il télécharge les fiches ; le client skills du studio, qui teste `Array.isArray`).

## Mettre à jour

Tout vient du code : après une modification d'un composant (attribut, événement, slot, variable
CSS → JSDoc) ou du guide rédigé (`apps/builder-ia/src/skills.ts`) :

```bash
npm run build:skills
```

régénère le manifeste custom-elements, la référence, le moteur de matching du MCP, `skills.json`
**et** `skills/dsfr-data/`. Les fichiers générés sont commités ; un test (`tests/skills-export.test.ts`)
échoue si l'export n'est plus le rendu exact des skills. Ne jamais éditer `skills/dsfr-data/` à la main.

Une skill écrite à la main (`skills/dataviz-metier/`) se met à jour en éditant son markdown ;
`npm run build:skills` la reprend dans `skills.json`, et `tests/skills-markdown.test.ts` en
vérifie la forme.
