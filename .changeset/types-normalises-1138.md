---
'dsfr-data': patch
---

`describeFieldTypes` rend un type normalisé (#1138, suite de #980) : `number`, `text`, `date`, `bool`, `geo` ou `other` (nouveau type exporté `FieldKind`). L'adaptateur Opendatasoft traduit ses types bruts (`int`, `double`, `decimal` → `number`…) ; l'avertissement « comparée en TEXTE » ne connaît plus aucun type de fournisseur, et son message ne parle plus du « refine du portail ». Changement visible : la preuve citée devient « type nombre déclaré par le jeu » au lieu de « type « int » déclaré par le jeu », et un adaptateur tiers doit rendre ces types normalisés.
