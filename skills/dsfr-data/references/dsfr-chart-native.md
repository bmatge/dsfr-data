# Composants DSFR Chart natifs

> Attributs detailles des composants line-chart, bar-chart, pie-chart, etc.
>
> Déclencheurs : dsfr, natif, officiel, accessibilité, rgaa, bar-chart, line-chart, pie-chart, map-chart, gauge-chart

## Composants DSFR Chart natifs

Les composants DSFR Chart sont des Web Components Vue utilises en interne par dsfr-data-chart.
En usage direct (sans dsfr-data-chart), ils acceptent des données au format JSON stringifie.

NOTE : preferer dsfr-data-chart qui gere automatiquement le format de données.
N'utiliser les composants natifs que pour des cas avances.

### Format des données
```html
x='[["Jan","Fev","Mar"]]'     <!-- Labels (tableau imbrique) -->
y='[[100, 200, 150]]'         <!-- Valeurs (tableau imbrique) -->
<!-- Multi-séries -->
x='[["Jan","Fev"],["Jan","Fev"]]'
y='[[100, 200],[150, 180]]'
name='["Série A","Série B"]'
```

### <bar-chart>
- horizontal : barres horizontales
- stacked : barres empilees
- highlight-index='[3]' : mettre en avant une barre

### <line-chart>
- x-min, x-max, y-min, y-max : limites des axes

### <pie-chart>
- fill="true" : camembert plein (défaut: anneau/donut)

### <gauge-chart>
- percent : valeur actuelle (0-100)
- init : valeur de depart
- target : valeur cible

### <scatter-chart>
- x, y : coordonnees des points

### <radar-chart>
- Multi-séries pour comparer des profils
- scale-min, scale-max : bornes de l'echelle radiale (via y-min/y-max de dsfr-data-chart)

### <map-chart> (cartes choroplethes — API unifiee DSFR Chart 2.1)
- level : decoupage — "dep" (défaut), "reg", "aca", "monde"
- data : JSON code -> valeur, selon le level :
  - level="dep" : data='{"75": 95, "69": 78, "2A": 60}' (codes 01-95, 2A, 2B, 971-976)
  - level="reg" : data='{"11": 95, "84": 78}' (codes region INSEE)
  - level="aca" : data='{"PARIS": 95, "LYON": 78}' (noms d'academie majuscules)
  - level="monde" : data='{"FR": 95, "US": 78}' (ISO 3166-1 alpha-2)
- name : nom de l'indicateur
- value-nat : valeur nationale de reference
- selected-palette : palette de couleurs

### <map-chart-reg region="..."> (zoom sur UNE region)
- Zoome sur une region donnee, data par departement de cette region
- Ex : region="11" data='{"75": 95, "92": 78}'

### Attributs communs
- selected-palette : categorical, sequentialAscending, sequentialDescending, divergentAscending, divergentDescending, neutral, default
- unit-tooltip : unite dans les info-bulles
- name : noms des séries en JSON
