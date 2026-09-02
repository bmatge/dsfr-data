# dsfr-data-kpi-group

> Conteneur grille responsive pour grouper plusieurs KPIs
>
> Déclencheurs : grouper, grille, kpi-group, plusieurs kpi, groupe, dashboard kpi, colonnes kpi

## <dsfr-data-kpi-group> - Groupe de KPIs en grille

Conteneur qui dispose plusieurs `<dsfr-data-kpi>` dans une grille CSS 12 colonnes responsive.

### Attributs
| Attribut | Type | Défaut | Requis | Description |
|----------|------|--------|--------|-------------|
| cols | Number | `3` | non | Nombre de colonnes par défaut (1-12) |
| gap | String | `"md"` | non | Espacement : sm (0.5rem), md (1rem), lg (1.5rem) |
| aria-label | String | `""` | non | Label accessible pour le groupe |

### Fonctionnement
- Grille CSS 12 colonnes (systeme DSFR)
- Chaque enfant occupe `Math.floor(12 / cols)` colonnes par défaut
- L'attribut `col` sur un enfant `<dsfr-data-kpi>` override la largeur (1-12)
- Responsive : empile en mobile (<768px), grille complete en desktop
- `role="group"` automatique pour l'accessibilité

### Exemples
```html
<!-- 3 KPIs egaux -->
<dsfr-data-kpi-group cols="3">
  <dsfr-data-kpi source="data" valeur="count" label="Total"></dsfr-data-kpi>
  <dsfr-data-kpi source="data" valeur="avg:score" label="Moyenne"></dsfr-data-kpi>
  <dsfr-data-kpi source="data" valeur="max:score" label="Maximum"></dsfr-data-kpi>
</dsfr-data-kpi-group>

<!-- KPIs avec largeurs differentes -->
<dsfr-data-kpi-group>
  <dsfr-data-kpi source="data" valeur="sum:ca" label="CA total" col="6"></dsfr-data-kpi>
  <dsfr-data-kpi source="data" valeur="avg:marge" label="Marge moyenne" col="3"></dsfr-data-kpi>
  <dsfr-data-kpi source="data" valeur="count" label="Transactions" col="3"></dsfr-data-kpi>
</dsfr-data-kpi-group>

<!-- 4 KPIs avec espacement large -->
<dsfr-data-kpi-group cols="4" gap="lg">
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
| `cols` | `number` | `3` | Nombre de colonnes par défaut (1-12). Chaque enfant occupe Math.floor(12/cols) colonnes. |
| `gap` | `'sm' \| 'md' \| 'lg'` | `'md'` | Espacement entre KPIs : sm (0.5rem), md (1rem), lg (1.5rem) |



**Événements** — aucun.


**Slots**

| Slot | Description |
|---|---|
| `(défaut)` | Les `<dsfr-data-kpi>` a disposer dans la grille DSFR 12 colonnes. |

**Variables CSS publiques**

| Variable | Défaut | Description |
|---|---|---|
| `--dsfr-data-kpi-group-gap` | `1rem` | Gouttiere entre les KPI. Pilotee par l'attribut `gap` (sm/md/lg), surchargeable par la page. |
