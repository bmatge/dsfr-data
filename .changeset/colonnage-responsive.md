---
'dsfr-data': minor
---

feat(core) : colonnage responsive, une échelle mobile-first sur `per-row` et `span`

Le repli mobile était binaire et câblé : quatre KPI donnaient quatre colonnes au-dessus de 768 px
et quatre lignes empilées en dessous, alors que sur téléphone 2 × 2 se lit mieux. `per-row` et
`span` acceptent désormais une échelle mobile-first, en termes séparés par des espaces :

```html
<dsfr-data-kpi-group per-row="2 md:4">…</dsfr-data-kpi-group>
<dsfr-data-display source="d" per-row="1 sm:2 lg:3">…</dsfr-data-display>
<dsfr-data-facets source="d" span="annee:12 md:3 | type:12 md:6"></dsfr-data-facets>
```

Le premier terme vaut sous le premier point de rupture, puis chaque `bp:valeur` à partir du sien :
`sm` (576 px), `md` (768), `lg` (992), `xl` (1248). Les points de rupture sont ceux du DSFR, rendus
par ses classes `fr-col-{bp}-N` sur `display` et `facets`, et par des règles générées sur
`kpi-group`. **Une valeur nue garde exactement son rendu actuel.** Sur les facettes, `|` sépare les
facettes et l'espace sépare les paliers. Un point de rupture inconnu ou une valeur hors de la grille
est une erreur de configuration nommée.

`cols` et `col` ne prennent pas l'échelle et gardent leur sens (ADR-112). La largeur des encarts de
carte suivra à part.

Suite de #789.
