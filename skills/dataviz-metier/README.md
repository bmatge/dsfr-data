# Skill « dataviz-metier » — raconter avant de dessiner, le sens avant la syntaxe

Le regard d'une agence de dataviz, d'un studio de data storytelling, d'un datajournaliste sur
une visualisation de données publiques DSFR : trouver l'histoire dans un jeu, choisir l'angle,
structurer une page comme un récit, choisir la forme qui raconte, écrire des titres-messages —
et rester honnête (échelles, moyennes de taux, sens des variations, ce qu'on ne montre pas,
tableau équivalent). Chaque principe est ancré dans un cas réel du banc d'essai
[open-data-viz](https://github.com/bmatge/open-data-viz) et traduit, quand un attribut porte la
réponse, en geste `dsfr-data` vérifié au navigateur.

La skill est **multiniveau** et **économe** : `SKILL.md` est le seul fichier lu d'emblée ; il
fait choisir un niveau d'effort, et chaque niveau n'ouvre que ses références.

| Niveau | Pour quoi | Références ouvertes |
|---|---|---|
| base | un graphique, une carte, un KPI | `niveau-base.md` seule |
| intermédiaire | un bloc, une petite page | `trouver-l-histoire`, `choisir-la-forme`, `grille-de-relecture` (+ `structure-narrative` si les blocs s'enchaînent) |
| avancé | une page, un récit, une refonte | les précédentes, puis la table de routage du `SKILL.md` au besoin |

- `SKILL.md` — l'index : le choix du niveau et sa règle de déclenchement (poser la question
  quand les signaux manquent ; repli intermédiaire annoncé là où aucune réponse ne peut
  arriver), la table de routage situation → référence, les règles transverses.
- `references/niveau-base.md` — tout le niveau base en une référence autonome.
- `references/trouver-l-histoire.md`, `structure-narrative.md`, `choisir-la-forme.md`,
  `titres-et-mots.md`, `anti-patterns.md` — l'**attaque** éditoriale : l'histoire, l'ordre, la
  forme, les mots, ce qu'on ne fait pas.
- `references/question-et-lecteur.md`, `echelles-honnetes.md`, `sens-des-variations.md`,
  `annotation.md`, `ce-qu-on-ne-montre-pas.md`, `accessibilite-comme-sens.md`,
  `forme-cas-du-banc.md` — la **défense** : l'honnêteté du chiffre, avec les cas du banc.
- `references/cas-d-ecole-portrait-federation.md` — le raisonnement complet sur un jeu réel.
- `references/grille-de-relecture.md` — cinq, dix ou dix-huit vérifications selon le niveau.

Chaque référence est autonome (lisible seule), ouverte par un en-tête `> …`, une ligne
`> Déclencheurs : …` et une ligne `> Niveaux : …`.

Ce dossier est **écrit à la main** (ADR-136) : contrairement à `../dsfr-data/`, généré depuis le
code, sa source est ici. Il est servi par le même canal que la skill technique — `skills.json`
(donc le serveur MCP et le client skills du studio) via `npm run build:skills` — et s'installe
avec elle :

```bash
npm run skills:install                    # les deux skills, en lien symbolique, dans .claude/skills/
npm run skills:install -- --global        # dans ~/.claude/skills/ (toutes les sessions)
npm run skills:install -- --only dataviz-metier
```

Côté `skills.json`, le contenu est concaténé (corps puis références) et découpé en quatre
sections génériques (guide, référence, exemples, pièges) par `packages/shared/src/skills/skills-sections.ts`
selon les titres `##` / `###` : le niveau et la référence ne sont pas encore adressables par
`get_skill`. Les titres des sections sont choisis pour se classer correctement (« Exemple »,
« Cas d'usage » → exemples ; « Piège », « Règle » → pièges).

Complémentaire du skill `dataviz` livré avec Claude Code (méthode de forme et de couleur,
indépendante du design system) et de la fiche `pagePatterns` de la skill `dsfr-data` (gabarits
de page) : celui-ci est éditorial, ancré DSFR et dans les données publiques françaises. Pour les
autres assistants (Codex, Cursor, Gemini CLI…), la procédure de `../dsfr-data/README.md`
s'applique telle quelle à ce dossier.

Mettre à jour : éditer le markdown, relancer `npm run build:skills` (le test
`tests/skills-markdown.test.ts` vérifie la forme : frontmatter, déclencheurs, liens de références,
matching). Tout attribut cité se vérifie dans `../dsfr-data/references/` avant d'être écrit.
