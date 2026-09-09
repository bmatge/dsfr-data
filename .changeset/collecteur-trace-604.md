---
'dsfr-data': minor
---

Collecteur de trace du pipeline (#604) — socle du volet Diagnostic.

Nouveau module `@dsfr-data/shared` `debug/` : un seul ecouteur sur le bus
global suffit a observer l'integralite d'un pipeline, sans modifier aucun
composant.

- `snapshotGraph()` reconstruit la topologie depuis le DOM (`id` / `source`,
  `left`/`right` pour join), donne une cle synthetique aux afficheurs sans id
  et signale les amonts declares mais absents de la page.
- `DataflowRecorder` tient un journal borne et l'etat par etape, avec sa
  propre copie des donnees : une etape retiree du DOM voit son cache global
  efface, sa trace doit survivre.
- `formatTrace()` rend le tout en texte francais — la meme chaine servira au
  volet, au chat et a l'outil de l'assistant.
- Detection de quiescence explicite : le silence seul ne suffit pas, une
  source en cours de chargement n'emet rien.

Aucun impact sur les bundles publies : le module est app-side.
