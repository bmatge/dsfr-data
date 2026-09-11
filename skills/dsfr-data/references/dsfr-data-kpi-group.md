# dsfr-data-kpi-group

> Conteneur grille responsive pour grouper plusieurs KPIs
>
> Déclencheurs : grouper, grille, kpi-group, plusieurs kpi, groupe, dashboard kpi, colonnes kpi

## <dsfr-data-kpi-group> - Groupe de KPIs en grille

Conteneur qui dispose plusieurs `<dsfr-data-kpi>` dans une grille CSS 12 colonnes responsive.

### Attributs
| Attribut | Type | Défaut | Requis | Description |
|----------|------|--------|--------|-------------|
| per-row | String | `""` | non | Nombre de KPI par ligne (1, 2, 3, 4, 6, 12), prime sur `cols` (#790) |
| cols | Number | `3` | non | Ancien nom de `per-row`, même sens (un NOMBRE) — toujours accepté |
| gap | String | `"md"` | non | Espacement : sm (0.5rem), md (1rem), lg (1.5rem) |
| aria-label | String | `""` | non | Label accessible pour le groupe |

### Fonctionnement
- Grille CSS 12 colonnes (systeme DSFR)
- Chaque enfant occupe `12 / per-row` colonnes par défaut (`span` sur un KPI pour une autre largeur)
- L'attribut `col` sur un enfant `<dsfr-data-kpi>` override la largeur (1-12)
- Responsive : empile en mobile (<768px), grille complete en desktop
- `role="group"` automatique pour l'accessibilité

### Exemples
```html
<!-- 3 KPIs egaux -->
<dsfr-data-kpi-group per-row="3">
  <dsfr-data-kpi source="data" valeur="count" label="Total"></dsfr-data-kpi>
  <dsfr-data-kpi source="data" valeur="avg:score" label="Moyenne"></dsfr-data-kpi>
  <dsfr-data-kpi source="data" valeur="max:score" label="Maximum"></dsfr-data-kpi>
</dsfr-data-kpi-group>

<!-- KPIs avec largeurs differentes -->
<dsfr-data-kpi-group>
  <dsfr-data-kpi source="data" valeur="sum:ca" label="CA total" span="6"></dsfr-data-kpi>
  <dsfr-data-kpi source="data" valeur="avg:marge" label="Marge moyenne" span="3"></dsfr-data-kpi>
  <dsfr-data-kpi source="data" valeur="count" label="Transactions" span="3"></dsfr-data-kpi>
</dsfr-data-kpi-group>

<!-- 4 KPIs avec espacement large -->
<dsfr-data-kpi-group per-row="4" gap="lg">
  <dsfr-data-kpi source="data" valeur="sum:population" label="Population" format="nombre"></dsfr-data-kpi>
  <dsfr-data-kpi source="data" valeur="avg:score" label="Score moyen" format="pourcentage"></dsfr-data-kpi>
  <dsfr-data-kpi source="data" valeur="min:prix" label="Prix min" format="euro"></dsfr-data-kpi>
  <dsfr-data-kpi source="data" valeur="max:prix" label="Prix max" format="euro"></dsfr-data-kpi>
</dsfr-data-kpi-group>
```

### Référence `<dsfr-data-kpi-group>` (générée depuis le code)

**Rôle pipeline** : autonome — n’utilise pas les mixins d’abonnement du pipeline (voir les événements ci-dessous).

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `cols` | `number` | `3` | Nombre de KPI par ligne par défaut (1-12). Chaque enfant occupe Math.floor(12/cols) colonnes. Même rôle que `per-row`, qui est préféré : `cols` désigne une LARGEUR sur `dsfr-data-facets` (#790). Toujours accepté, avec le même sens. |
| `gap` | `'sm' \| 'md' \| 'lg'` | `'md'` | Espacement entre KPIs : sm (0.5rem), md (1rem), lg (1.5rem) |
| `per-row` | `string` | `""` (vide) | Nombre de KPI par ligne à partir de 768 px (en dessous : un par ligne) — 1, 2, 3, 4, 6 ou 12, les diviseurs de la grille. Échelle mobile-first (#789) : `per-row="2 md:4"` — deux KPI par ligne sur téléphone, quatre à partir de 768 px ; avec un terme de base ou un palier `sm`, le repli forcé sur une colonne ne s'applique plus. Remplace `cols`, même sens (#790) ; prime sur `cols` s'ils sont posés ensemble. Un KPI qui porte `span` (ou `col`) garde sa propre largeur. |



**Événements** — aucun.


**Slots**

| Slot | Description |
|---|---|
| `(défaut)` | Les `<dsfr-data-kpi>` a disposer dans la grille DSFR 12 colonnes. |

**Variables CSS publiques**

| Variable | Défaut | Description |
|---|---|---|
| `--dsfr-data-kpi-group-gap` | `1rem` | Gouttiere entre les KPI. Pilotee par l'attribut `gap` (sm/md/lg), surchargeable par la page. |
