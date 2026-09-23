# mcp-server/

Serveur MCP (Model Context Protocol) exposant les skills dsfr-data aux outils IA (Claude Desktop, Claude Code, Cursor, Claude.ai).

## Fonctionnement

Le serveur MCP permet aux assistants IA de generer du code dsfr-data en leur fournissant les specifications des composants (skills) comme contexte. Au demarrage, il recupere les skills depuis `{baseUrl}/dist/skills.json` sur l'instance dsfr-data configuree — par defaut l'instance publique `https://chartsbuilder.miweb.run`, toujours a jour.

## Usage

Le package n'est **pas publie sur npm** (la distribution separee a ete abandonnee en 2026-04). Il s'utilise en local depuis le repo :

```bash
cd mcp-server
npm ci && npm run build

node dist/index.js                            # Mode stdio (Claude Desktop, Claude Code, Cursor)
node dist/index.js --http                     # Mode HTTP (Claude.ai, port 3001)
node dist/index.js --skills-file skills.json  # Mode hors-ligne (fichier local)
node dist/index.js --url https://mon-domaine.gouv.fr   # Instance dsfr-data custom
```

En deploiement Docker, le serveur MCP est construit et lance par l'image du repo (`Dockerfile.db` execute `npm ci && npm run build` dans `mcp-server/`) et sert le mode HTTP derriere nginx.

## Configuration de l'instance source

L'URL de base d'ou sont tires les skills se resout dans cet ordre :

1. Option CLI `--url <domaine>` ;
2. Variable d'environnement `DSFR_DATA_BASE_URL` ;
3. Defaut : l'instance publique `https://chartsbuilder.miweb.run`.

Le mode `--skills-file` court-circuite le reseau et charge un `skills.json` local (genere par le build de la lib dans `packages/core/dist/skills.json`).

## Outils

| Outil | Parametres | Rend |
|---|---|---|
| `list_skills` | — | chaque skill avec ses sections, et pour une skill a niveaux (`datavizMetier`) ses niveaux et ses references |
| `get_skill` | `skill_id`, puis **un seul** de `section` (`guide`, `reference`, `exemples`, `pieges`, `tout`), `niveau` (`base`, `intermediaire`, `avance`) ou `reference` | la fiche, une section, un niveau ou une reference |
| `get_relevant_skills` | `message`, `section` optionnelle | les fiches qui correspondent ; pour une skill a niveaux, son index et ce qui est adressable |
| `generate_widget_code` | `chart_type` optionnel | la specification pour generer un widget |
| `diagnose_widget_code` | `html` | l'analyse statique d'un balisage |

### Skill a niveaux : `datavizMetier` (#1035)

La skill metier ecrite a la main (`skills/dataviz-metier/`) a trois niveaux d'effort ; la table
« Choisir le niveau » de son `SKILL.md` dit quelles references chacun ouvre.

```
get_skill("datavizMetier", niveau: "base")            # un graphique : index + niveau-base
get_skill("datavizMetier", niveau: "intermediaire")   # un bloc : index + 4 references
get_skill("datavizMetier", niveau: "avance")          # une page : les precedentes + le cas d'ecole
get_skill("datavizMetier", reference: "choisir-la-forme")   # une seule reference
get_skill("datavizMetier")                            # intermediaire, ANNONCE comme defaut
get_skill("datavizMetier", section: "tout")           # la fiche entiere (~1 400 lignes)
```

`niveau`, `reference` et `section` sont exclusifs. Une `reference` est choisie dans la liste
publiee (`list_skills`), jamais concatenee a un chemin ; inconnue, elle rend la liste valide.
Face a une instance anterieure a #1035 (pas de `levels` dans `skills.json`), `get_skill` sans
parametre rend la fiche entiere, comme avant.

## Contenu

```
mcp-server/
  package.json    # Definition du package et du binaire dsfr-data-mcp
  src/index.ts    # Implementation du serveur MCP
  src/skills.ts   # Selection section / niveau / reference, routage HTTP
  src/cli.ts      # Parsing des options CLI (--url, --http, --skills-file)
  src/*.generated.ts  # Copies GENEREES (npm run build:skills) : matching, niveaux, contrat
  dist/           # Build output (genere)
```

## Notes

- `mcp-server/` est **hors workspace npm** : il a son propre `package-lock.json` et `node_modules`.
- Les skills refletent l'etat de l'instance interrogee ; pour des skills alignes sur votre checkout local, buildez la lib (`npm run build` a la racine) puis utilisez `--skills-file ../packages/core/dist/skills.json`.
