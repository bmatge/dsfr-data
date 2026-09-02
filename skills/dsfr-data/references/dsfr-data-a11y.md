# dsfr-data-a11y

> Composant accessibilité unifie : tableau de données, téléchargement CSV et description textuelle
>
> Déclencheurs : raw-data, télécharger, download, csv, accessibilité, a11y, lecteur écran, screen reader, aria, tableau accessible, table, description graphique, chart-a11y

## dsfr-data-a11y — Companion d'accessibilité unifie

Composant companion qui ameliore l'accessibilité d'une visualisation en offrant
trois alternatives activables independamment :
1. **Tableau accessible** (`table`) : table HTML avec les données du graphique
2. **Téléchargement CSV** (`download`) : bouton pour exporter les données brutes
3. **Description textuelle** (`description`) : transcription libre du contenu du graphique

Le contenu est replie dans un accordeon DSFR par défaut.

### Attributs

| Attribut | Type | Défaut | Description |
|----------|------|--------|-------------|
| source | String | `""` | ID du dsfr-data-source ou dsfr-data-query |
| for | String | `""` | ID de l'element cible pour la liaison ARIA + skip link |
| table | Boolean | `false` | Active l'affichage du tableau de données |
| download | Boolean | `false` | Active le bouton de téléchargement CSV |
| filename | String | `"données.csv"` | Nom du fichier CSV téléchargé |
| description | String | `""` | Description textuelle du graphique |
| label-field | String | `""` | Colonne pour les labels du tableau |
| value-field | String | `""` | Colonne(s) pour les valeurs du tableau (separees par virgules) |
| label | String | `""` | Libelle personnalise de la section accessible |
| no-auto-aria | Boolean | `false` | Desactive ARIA automatique et skip link |

Si ni `table`, ni `download`, ni `description` ne sont définis, les trois sont affiches par défaut.

### Fonctionnement ARIA (attribut `for`)

Quand `for="mon-graph"` est défini :
1. Un **skip link** est injecte dans le graphique cible (visible au focus clavier)
2. `aria-describedby` pointe vers un resume concis dans le composant
3. `aria-details` pointe vers le tableau de données (si `table` est active)
4. A la deconnexion, tout est nettoye automatiquement

### Exemple basique
```html
<dsfr-data-chart id="mon-graph" source="data" type="bar"
  label-field="region" value-field="total">
</dsfr-data-chart>
<dsfr-data-a11y for="mon-graph" source="data" table download></dsfr-data-a11y>
```

### Avec description textuelle
```html
<dsfr-data-a11y for="mon-graph" source="data"
  table download
  description="Ce graphique montre la repartition par region. L'Ile-de-France est en tete.">
</dsfr-data-a11y>
```

### Avec colonnes personnalisees
```html
<dsfr-data-a11y for="mon-graph" source="data"
  table download
  label-field="region" value-field="population,budget"
  filename="export-regions.csv">
</dsfr-data-a11y>
```

### Mode manuel (sans ARIA automatique)
```html
<dsfr-data-a11y source="data" no-auto-aria table download></dsfr-data-a11y>
```

### Cohabitation avec DataBox
Si le graphique cible utilise l'attribut `databox`, ne PAS ajouter les attributs
`table` et `download` sur dsfr-data-a11y (DataBox les fournit déjà avec un meilleur
rendu : switch chart/tableau integre, CSV natif). Conserver uniquement :
- `for` + `source` (obligatoires)
- `description` (texte accessible pour lecteurs d'écran)

```html
<!-- Avec DataBox : pas de table ni download sur a11y -->
<dsfr-data-chart id="chart" source="data" type="bar"
  label-field="region" value-field="total"
  databox databox-title="Population" databox-download>
</dsfr-data-chart>
<dsfr-data-a11y for="chart" source="data"
  description="L'Ile-de-France concentre la majorite.">
</dsfr-data-a11y>
```

### Notes
- Le contenu est dans un accordeon DSFR (replie par défaut)
- Le CSV utilise le separateur `;` (standard francais)
- Le tableau est limite a 100 lignes ; le CSV contient toutes les données
- Compatible avec tous les composants de rendu (chart, datalist, display, kpi)

### Référence `<dsfr-data-a11y>` (générée depuis le code)

**Rôle pipeline** : affichage (`SourceSubscriberMixin`) — feuille du pipeline : consomme `source`, n’émet pas de données.

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `description` | `string` | `""` (vide) | Description textuelle du graphique, lue par les lecteurs d'ecran. |
| `download` | `boolean` | `false` | Affiche le bouton de telechargement CSV. |
| `filename` | `string` | `'données.csv'` | Nom du fichier CSV telecharge. |
| `for` | `string` | `""` (vide) | Id de l'element cible (graphique, carte) pour la liaison ARIA et le lien d'evitement. |
| `label` | `string` | `""` (vide) | Libelle personnalise de la section accessible. |
| `label-field` | `string` | `""` (vide) | Colonne utilisee pour les labels du tableau. |
| `no-auto-aria` | `boolean` | `false` | Desactive la pose automatique des attributs ARIA et du lien d'evitement. |
| `source` | `string` | `""` (vide) | Id de la source (ou du transformateur) dont ce complement accessible consomme les donnees. |
| `table` | `boolean` | `false` | Affiche le tableau de donnees equivalent au graphique. |
| `value-field` | `string` | `""` (vide) | Colonne(s) utilisee(s) pour les valeurs du tableau (separees par des virgules). |



**Événements** (émis sur `document` : ecouter via `document.addEventListener`, filtrer sur `detail.sourceId`)

| Événement | Payload | Direction | Quand |
|---|---|---|---|
| `dsfr-data-loaded` | `{ sourceId, data }` | écoute | Nouvelles données publiées par la source désignée par `source`. |
| `dsfr-data-error` | `{ sourceId, error }` | écoute | Erreur amont. |
| `dsfr-data-loading` | `{ sourceId }` | écoute | Chargement amont démarré. |


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
