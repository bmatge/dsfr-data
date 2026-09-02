# Couleurs DSFR

> Palette officielle du Design System de l'État
>
> Déclencheurs : couleur, color, palette, style

## Couleurs et palettes DSFR

### Couleurs hex principales
- **Bleu France**: #000091 (couleur par défaut)
- **Emeraude**: #009081 (succes)
- **Marianne**: #C9191E (erreur)
- **Orange**: #FF9940 (avertissement)
- **Violet**: #A558A0
- **Bleu ciel**: #417DC4
- **Vert foret**: #18753C

### Palettes DSFR Chart (attribut selected-palette)
| Palette | Usage recommande |
|---------|-----------------|
| categorical | Comparer des groupes distincts (défaut pour bar, pie, radar) |
| sequentialAscending | Gradient clair -> fonce (recommande pour map, classements) |
| sequentialDescending | Gradient fonce -> clair |
| divergentAscending | Echelle divergente (ecarts positifs/negatifs) |
| divergentDescending | Echelle divergente inversee |
| neutral | Neutre, utiliser avec highlight-index pour mettre en avant 1 barre |
| default | Bleu France seul (série unique) |

### Bonnes pratiques
- Utiliser `categorical` pour pie, radar et comparaisons multi-catégories
- Utiliser `sequentialAscending` pour les cartes (map, map-reg, map-aca, map-monde)
- Utiliser `neutral` + `highlight-index` pour mettre en avant une valeur
- Assurer un contraste suffisant (conformite RGAA)
- Eviter le rouge/vert seuls (daltonisme) - les palettes DSFR sont concues pour ca
