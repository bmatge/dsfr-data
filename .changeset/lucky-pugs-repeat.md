---
'dsfr-data': patch
---

Hygiène interne : les motifs à quantificateur imbriqué signalés « unsafe » par
eslint-plugin-security sont réécrits en parcours linéaire, à comportement
identique (#843).

- `opendatasoft-adapter` : la reconnaissance d'un littéral numérique nu et d'un
  chemin pointé (`table.champ`) passe par un découpage plutôt que par un motif
  imbriqué.
- `dsfr-data-chart` : la détection d'une date ISO devient un test de préfixe
  `AAAA-MM-JJ` suivi d'un contrôle du séparateur d'heure.
- `shared/utils/to-boolean` : la reconnaissance d'un nombre décimal simple lit
  la chaîne caractère par caractère.
- `shared/providers/tabular` : le segment de langue optionnel du permalien
  data.gouv.fr s'écrit sans quantificateur imbriqué.

Aucun changement d'API ni de rendu.
