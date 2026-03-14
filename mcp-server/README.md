# mcp-server/

Serveur MCP (Model Context Protocol) exposant les skills dsfr-data aux outils IA (Claude Desktop, Cursor, Claude.ai).

## Fonctionnement

Le serveur MCP permet aux assistants IA de generer du code dsfr-data en leur fournissant les specifications des composants (skills) comme contexte.

## Usage

```bash
npx dsfr-data-mcp                          # Mode stdio (Claude Desktop, Cursor)
npx dsfr-data-mcp --http                   # Mode HTTP (Claude.ai)
npx dsfr-data-mcp --skills-file skills.json # Mode hors-ligne
```

## Contenu

```
mcp-server/
  package.json    # Definition du package et du binaire dsfr-data-mcp
  src/index.ts    # Implementation du serveur MCP
  dist/           # Build output (genere)
```

## Notes

- Au demarrage, le serveur recupere dynamiquement les skills depuis le serveur de production.
- Le mode `--skills-file` permet de fonctionner sans connexion reseau.
