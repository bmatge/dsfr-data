# Skill « dataviz-metier » — le sens avant la syntaxe

Le regard d'une agence de dataviz, d'un studio de data storytelling, d'un datajournaliste sur un
graphique, une carte ou un KPI DSFR : quelle question, pour quel lecteur, quelle forme, quelle
échelle, quel sens, quelle phrase, quel tableau équivalent, et ce qu'on ne montre pas. Chaque
principe est ancré dans un cas réel du banc d'essai
[open-data-viz](https://github.com/bmatge/open-data-viz) et traduit, quand un attribut porte la
réponse, en geste `dsfr-data` vérifié au navigateur.

- `SKILL.md` — l'index : sept questions dans l'ordre, règles transverses, ce que le skill ne
  fait pas. Le seul fichier lu d'emblée.
- `references/*.md` — une référence par question, plus une grille de relecture en douze points.

Ce dossier est **écrit à la main** (ADR-136) : contrairement à `../dsfr-data/`, généré depuis le
code, sa source est ici. Il est servi par le même canal que la skill technique — `skills.json`
(donc le serveur MCP et le client skills du studio) via `npm run build:skills` — et s'installe
avec elle :

```bash
npm run skills:install                    # les deux skills, en lien symbolique, dans .claude/skills/
npm run skills:install -- --global        # dans ~/.claude/skills/ (toutes les sessions)
npm run skills:install -- --only dataviz-metier
```

Complémentaire du skill `dataviz` livré avec Claude Code (méthode de forme et de couleur,
indépendante du design system) : celui-ci est éditorial, ancré DSFR et dans les données
publiques françaises. Pour les autres assistants (Codex, Cursor, Gemini CLI…), la procédure de
`../dsfr-data/README.md` s'applique telle quelle à ce dossier.

Mettre à jour : éditer le markdown, relancer `npm run build:skills` (le test
`tests/skills-markdown.test.ts` vérifie la forme : frontmatter, déclencheurs, liens de références).
