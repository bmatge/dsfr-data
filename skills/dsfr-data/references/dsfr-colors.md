# Couleurs DSFR

> Palette officielle du Design System de l'État
>
> Déclencheurs : couleur, color, palette, style

## Couleurs et palettes DSFR

### Couleurs hex du DSFR (tokens du design system)
- **Bleu France**: #000091
- **Emeraude**: #009081 (succes)
- **Marianne**: #C9191E (erreur)
- **Orange**: #FF9940 (avertissement)
- **Violet**: #A558A0
- **Bleu ciel**: #417DC4
- **Vert foret**: #18753C

Ce sont les couleurs du DSFR, pas celles des graphiques : DSFR Chart applique
ses propres palettes (ci-dessous), et `dsfr-data-chart` les lui transmet sans
les modifier. Pour imposer une couleur a une serie, utiliser `color-map`
(`color-map="Realise:#000091,Objectif:#C9191E"`).

### Palettes DSFR Chart (attribut selected-palette, defaut categorical) — version 2.1.1, theme clair
| Palette | Ce que DSFR Chart fait vraiment |
|---------|-----------------|
| categorical | 8 couleurs (#5C68E5 #82B5F2 #29598F #31A7AE #81EEF5 #B478F1 #CFB1F5 #CECECE), UNE PAR SERIE : une serie unique est entierement #5C68E5. Camembert : une couleur par part. Surtout des bleus et violets, trois tons tres clairs : contraste faible sur des courbes multiples |
| default | Une seule couleur, #5C68E5 (ce n'est PAS le Bleu France #000091) |
| sequentialAscending | 10 tons #DBDAFF -> #00005F, la couleur suit la VALEUR (bar, pie) : la plus grande valeur est la plus CLAIRE. Sur une carte : du plus petit (clair) au plus grand (fonce) |
| sequentialDescending | Memes 10 tons inverses : la plus grande valeur est la plus foncee ; carte du plus petit (fonce) au plus grand (clair) |
| divergentAscending | 4 tons vert -> jaune -> orange -> rouge (#298641 #ADA816 #ED8308 #E91719), une couleur PAR SERIE. Pas de centre, pas de notion d'ecart. Camembert : une seule couleur |
| divergentDescending | Memes 4 tons, du rouge au vert |
| neutral | Un seul gris #B1B1B1. Avec highlight-index (bar) : les barres citees en #5C68E5, les autres grises |

Un nom inconnu retombe sur categorical. Le theme sombre a ses propres valeurs.

### Bonnes pratiques
- Plusieurs series (courbes, barres groupees) : `categorical`, ou `color-map` quand le contraste entre series ne suffit pas
- Une serie unique : `default` ou `categorical` rendent pareil ; `sequentialDescending` pour colorer selon la valeur (grande = foncee)
- Camembert : `categorical` (une couleur par part)
- Cartes (map, map-reg, map-aca, map-monde) : `sequentialAscending` ; jamais categorical, default ni neutral (echelle de la premiere a la derniere couleur)
- Mettre une barre en avant : `neutral` + `highlight-index`, les deux ensemble
- Les divergentes sont un vert -> rouge : a eviter seules (daltonisme), preferer `color-map`
