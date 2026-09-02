# Types de graphiques

> Quand utiliser quel type de graphique
>
> Déclencheurs : quel graphique, quel type, quel chart, recommand

## Choix du type de graphique

Guide pour choisir le type de visualisation adapte aux données.

### Barres verticales (bar)
- **Quand** : comparer des catégories (5-15 ideal)
- **Champs** : label-field (catégories), value-field (valeurs)
- **Options** : `horizontal` (barres horizontales), `stacked` (empile)
- **Supporte** : value-field-2 ou value-fields pour N séries, highlight-index

### Lignes (line)
- **Quand** : evolution temporelle, tendances
- **Champs** : label-field (dates/temps), value-field (valeurs)
- **Supporte** : value-field-2 ou value-fields pour comparaison, x-min/x-max/y-min/y-max

### Combine barres + ligne (bar-line)
- **Quand** : comparer 2 metriques differentes (ex: CA en barres + objectif en ligne)
- **Champs** : label-field, value-field (barres), value-field-2 (ligne)
- **Options** : unit-tooltip (barres), unit-tooltip-bar (ligne)

### Camembert / Anneau (pie)
- **Quand** : parts d'un tout (100%), max 5-7 segments
- **Champs** : label-field (catégories), value-field (valeurs)
- **Options** : `fill` (true = camembert plein, false = anneau par défaut)

### Radar
- **Quand** : profils multicriteres, comparaison de dimensions
- **Champs** : label-field (criteres), value-field (scores)
- **Supporte** : value-field-2 ou value-fields pour comparer plusieurs profils, y-min/y-max pour fixer l'echelle radiale (recommande : sans bornes, le centre du radar = minimum des donnees, ce qui est trompeur)

### Nuage de points (scatter)
- **Quand** : correlation entre deux variables numériques
- **Champs** : label-field (axe X numérique), value-field (axe Y)

### Jauge (gauge)
- **Quand** : progression vers un objectif (0-100%)
- **Champs** : gauge-value uniquement (PAS de label-field ni source obligatoire)

### KPI (kpi - composant dsfr-data-kpi)
- **Quand** : afficher UNE valeur clé (total, moyenne, comptage)
- **Champs** : valeur (expression d'agrégation), PAS de label-field
- **Options** : format (nombre, pourcentage, euro), couleur, seuils

### Carte departements (map)
- **Quand** : données geographiques par departement francais
- **Champs** : code-field (code INSEE: 01-95, 2A, 2B, 971-976), value-field
- **Palette recommandee** : sequentialAscending

### Carte regions (map-reg)
- **Quand** : données geographiques par region francaise
- **Champs** : code-field (code region), value-field

### Carte academies (map-aca)
- **Quand** : données education par academie
- **Champs** : code-field (nom d'academie en majuscules : PARIS, LYON, STRASBOURG...), value-field

### Carte mondiale (map-monde)
- **Quand** : données internationales par pays
- **Champs** : code-field (code pays ISO 3166-1 : alpha-2 "FR", alpha-3 "FRA" ou numerique "250" — convertis automatiquement en alpha-2), value-field
- **Palette recommandee** : sequentialAscending

### Séries multiples (bar, line, bar-line, radar)
Utiliser `value-field-2` pour une seconde série, ou `value-fields` pour plusieurs séries supplementaires (separees par virgules).
Definir les noms avec `name='["Série 1","Série 2","Série 3"]'`.
Exemple multi-séries : `value-field="ca" value-fields="budget,objectif" name='["CA","Budget","Objectif"]'`
