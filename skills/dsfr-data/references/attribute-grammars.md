# Grammaires d’attributs et voies natives

> Par attribut, la grammaire exacte et la voie native a essayer AVANT d’ecrire un script : split, round, format compact, decimales et unite d’un KPI, format date, compteur de resultats, facettes radio/select/cascade, annee en cours, cles de jointure, valeurs nulles, fond de carte neutre ou administratif, nom de serie, treemap
>
> Déclencheurs : grammaire, voie native, decouper, separateur, multivalu, split, arrondir, arrondi, decimales, compact, abrege, unite, date de mise a jour, derniere mise a jour, nombre de resultats, compteur de resultats, total serveur, choix unique, bouton radio, boutons radio, liste deroulante, cascade, facettes dependantes, annee en cours, annee courante, cle de jointure, cles de jointure, zero initial, non renseigne, valeurs nulles, valeur nulle, is not null, isnotnull, fond neutre, fond gris, niveaux de gris, fond de carte, fond administratif, nom de serie, nom de la serie, treemap

## Grammaires d’attributs et voies natives

Douze demandes sur cinquante-quatre d’un banc d’essai ont fini en script ou en
composant custom alors qu’un attribut existant faisait le travail — presque toujours
faute d’avoir lu la grammaire exacte de l’attribut ou essaye un mode existant.
Cette fiche rappelle, par besoin, la grammaire et la voie native. La regle :
**chercher l’attribut avant d’ecrire du JavaScript**.

### Decouper une colonne multivaluee (split, separateur)

`dsfr-data-normalize split` : entrees separees par **virgule**, et dans chaque
entree le **premier `:`** separe le champ du separateur. Le separateur peut donc
etre n’importe quel caractere, y compris `|`, `;` ou `/` :

```html
<!-- "risques" contient "inondation|seisme|feu" -> tableau de 3 valeurs -->
<dsfr-data-normalize id="clean" source="raw" split="risques:|, tags:;"></dsfr-data-normalize>
<dsfr-data-facets id="f" source="clean" fields="risques"></dsfr-data-facets>
```

- Sans separateur (`split="tags"`), c’est la virgule.
- Chaque element est trime, les vides sont ecartes ; une chaine vide donne `[]`.
- Le decoupage s’applique **apres** `replace` (un « N/A » remplace par vide donne `[]`)
  et **avant** `numeric` / `compute`.
- `dsfr-data-facets` traite le tableau comme un champ multi-valeurs : une entree
  de facette par element, et une ligne matche des qu’un de ses elements est choisi.

### Arrondir un nombre (round, decimales)

`dsfr-data-normalize round` existe : `"champ"` arrondit a l’entier, `"champ:2"` a
2 decimales. Entrees separees par virgule :

```html
<dsfr-data-normalize id="clean" source="raw" numeric="taux, montant" round="taux:2, montant"></dsfr-data-normalize>
```

- `round` n’agit que sur des **nombres** : convertir d’abord avec `numeric` (ou
  `numeric-auto`) si le champ arrive en chaine.
- Il cible le **nom d’origine** du champ (`rename` s’applique apres).
- Inutile pour un KPI : `dsfr-data-kpi format` arrondit lui-meme a l’affichage.

### Abreger un grand nombre : format compact (14,8 M)

`dsfr-data-kpi format="compact"` existe : 14 785 684 -> « 14,8 M », 6 676 -> « 6,7 k »
(notation compacte fr-FR, 1 decimale max). Les six formats : `nombre` (defaut),
`pourcentage`, `euro`, `decimal`, `compact`, `date`.

```html
<dsfr-data-kpi source="stats" value="population:sum" format="compact" label="Habitants"></dsfr-data-kpi>
<dsfr-data-kpi source="budget" value="montant:sum" format="compact" unit="€" label="Budget"></dsfr-data-kpi>
```

### Decimales et unite d'un KPI (decimals, unit)

- `decimals="3"` fixe les decimales affichees : `format="euro" decimals="3"` -> « 1,749 € ».
  Ne PAS ecrire `format="euro:3"` (refuse, erreur de configuration).
- `unit="€"` accole une unite apres la valeur (espace insecable) : `format="compact" unit="€"`
  -> « 44,9 Md € ». Inutile avec `euro` et `pourcentage`, qui portent deja leur symbole.

```html
<dsfr-data-kpi source="carburants" value="gazole_prix:avg" format="euro" decimals="3" label="Gazole"></dsfr-data-kpi>
```

### Afficher une date (format date, min/max sur dates ISO)

`format="date"` rend une chaine ISO en JJ/MM/AAAA ; `min`/`max` acceptent une colonne de
dates ISO (la plus ancienne / la plus recente), `first`/`last` la chaine brute :

```html
<dsfr-data-kpi source="carburants" value="maj:max" format="date" label="Derniere mise a jour"></dsfr-data-kpi>
```

### Compteur de resultats et total serveur (count, server-search)

- `dsfr-data-search count` affiche « N resultats » sous le champ. Avec
  `server-search`, N est le **total serveur** (meta `total` de la source), pas la
  taille de la page recue.
- `dsfr-data-list` et `dsfr-data-display` affichent aussi « N resultats » avec le
  total serveur des que la source amont est en pagination serveur
  (`dsfr-data-source server-side page-size="50"`).

```html
<dsfr-data-source id="src" api-type="opendatasoft" base-url="..." dataset-id="..." server-side page-size="50"></dsfr-data-source>
<dsfr-data-search id="q" source="src" server-search count></dsfr-data-search>
<dsfr-data-list source="q" columns="nom, ville"></dsfr-data-list>
```

Pas de compteur a coder : ni `document.querySelectorAll`, ni ecoute manuelle
de `dsfr-data-source-loaded`.

### Facettes : choix unique, boutons radio, liste deroulante (display)

`dsfr-data-facets display="champ:mode | champ2:mode"` (entrees separees par `|`).
Les modes et ce qu’ils rendent :

| Mode | Rendu | Selection |
|------|-------|-----------|
| `checkbox` (defaut) | cases a cocher en ligne | multiple (OU intra-facette) |
| `select` | `<select class="fr-select">` natif, en ligne | **unique** |
| `radio` | **dropdown** repliable contenant des boutons radio + recherche | unique |
| `multiselect` | dropdown repliable avec cases a cocher + « tout selectionner » | multiple |

Donc : « un choix unique visible directement » = `champ:select`. `radio` n’est pas
une rangee de boutons radio en ligne mais un menu deroulant ; c’est documente, pas un
bug. Une facette en `select` ou `radio` est exclusive d’office, sans `disjunctive`.

### Facettes en cascade (server-facets)

Avec `server-facets` (adapters OpenDataSoft et Grist), les valeurs et compteurs de
chaque facette sont recalcules **cote serveur en tenant compte des selections des
autres facettes** : choisir une region reduit la liste des departements, avec les
bons compteurs. C’est la cascade native ; `fields` est obligatoire dans ce mode.

```html
<dsfr-data-source id="src" api-type="opendatasoft" base-url="..." dataset-id="..." server-side page-size="50"></dsfr-data-source>
<dsfr-data-facets id="f" source="src" server-facets fields="region, departement"
  display="region:select | departement:select"></dsfr-data-facets>
```

En mode local (sans `server-facets`), les compteurs se recalculent aussi selon
les autres selections — sur les donnees deja chargees. Sur Tabular ou generique,
`static-values` fournit les listes (sans compteurs).

### Filtrer sur l’annee en cours (current-year)

`dsfr-data-context-filter operator="current-year"` produit la plage
`[1er janvier, 1er janvier suivant)` de l’annee courante, recalculee a chaque
emission — sans `new Date()` dans la page. L’UI associee est une case a cocher :
cochee = filtre actif, decochee = filtre retire.

```html
<input type="checkbox" id="cette-annee" checked>
<label for="cette-annee">Annee en cours</label>
<dsfr-data-context sources="src">
  <dsfr-data-context-filter field="date_debut" operator="current-year" ui="cette-annee"></dsfr-data-context-filter>
</dsfr-data-context>
```

Meme famille : `year-of` (annee choisie dans un select), `month-of`, `last-n-days`,
`lt-day-after` (borne haute inclusive).

### Cles de jointure : comparaison en chaine (join on)

`dsfr-data-join on="cle"` (ou `on="cle_gauche=cle_droite"`, multi-cle par virgule)
compare les cles **converties en chaine, sans trim ni completion** :

- `201` (nombre) et `"201"` (chaine) **se joignent** ;
- `"0201"` et `"201"` **ne se joignent pas** (zero initial) ;
- `" 201"` et `"201"` ne se joignent pas (espace) : passer par `normalize trim` en amont ;
- `null` et `""` valent tous deux la cle vide et se joignent **entre eux** —
  filtrer les lignes sans cle (`where="cle:isnotnull"`) avant de joindre.

Pour harmoniser un code numerique a zero initial des deux cotes, `numeric="code"`
sur les deux sources (`"0201"` -> `201`) suffit — sauf codes non numeriques
(`2A`, `2B`), a traiter avec `replace-fields`.

### Valeurs nulles, non renseignees : isnull / isnotnull

Deux dialectes selon l’endroit :

- `dsfr-data-query where="champ:isnotnull"` (syntaxe colon, sans valeur) ; inverse `champ:isnull`.
- `dsfr-data-source where` parle le dialecte du provider : ODSQL `champ is not null`
  sur OpenDataSoft ; sur Tabular, la syntaxe colon (`champ:isnotnull`) est traduite.

Un groupe « (vide) » dans un graphique vient presque toujours de lignes a valeur
nulle : filtrer avec `isnotnull` plutot que de post-traiter les donnees.

### Fond de carte neutre, grise, niveaux de gris

Il n’existe **pas** de « plan IGN clair » en raster libre : les presets sont
`ign-plan`, `ign-ortho`, `ign-cadastre`, `osm-fr`, `osm-standard`, `opentopomap`
(les fonds CARTO Positron/Dark exigent desormais une cle API et sont retires).
`dsfr-data-map` rend en **light DOM** : un filtre CSS de la page sur le calque des
tuiles suffit pour un fond neutre, sans changer de fournisseur.

```html
<style>
  dsfr-data-map .leaflet-tile-pane { filter: grayscale(1) opacity(0.65); }
</style>
<dsfr-data-map center="46.6,2.3" zoom="6" tiles="ign-plan">...</dsfr-data-map>
```

### Fond administratif (contours) sans tuiles

Pour des contours de regions/departements en habillage, ne pas chercher un fond
raster : un **GeoJSON simplifie statique** (fichier hebergé avec la page) charge par
une source avec `transform="features"`, rendu en couche `geoshape` **`no-interactive`**
(pas de clic, tooltip ni popup, et sans effet sur le cadrage automatique) :

```html
<dsfr-data-source id="contours" url="/geo/departements-simplifies.geojson" transform="features"></dsfr-data-source>
<dsfr-data-map center="46.6,2.3" zoom="6">
  <dsfr-data-map-layer source="contours" type="geoshape" no-interactive
    color="#666" fill-opacity="0.05"></dsfr-data-map-layer>
  <dsfr-data-map-layer source="points" type="marker" lat-field="lat" lon-field="lon"></dsfr-data-map-layer>
</dsfr-data-map>
```

Chaque `Feature` porte sa `geometry`, detectee automatiquement (pas de `geo-field`
a poser). Les proprietes sont sous `properties.*`.

### Nom de serie dans un graphique (name)

`dsfr-data-chart name="Effectif"` : une **chaine simple** suffit partout (graphiques
et cartes). Pour les graphiques, le composant l’enveloppe lui-meme dans le tableau
JSON attendu par DSFR Chart (`["Effectif"]`) ; un tableau JSON explicite
(`name='["2023", "2024"]'`) reste possible pour nommer plusieurs series.
Sans `name`, les series prennent l’alias inline `champ:Libellé` de `value-field(s)`
(`value-field="Panier_moyen:Panier moyen"` → légende « Panier moyen »), sinon le nom
des champs, ou les valeurs de `series-field`. Même grammaire sur `value-cols` de
`dsfr-data-unpivot` pour renommer les variables dépliées à la source.

### Treemap : la voie native est le barres horizontales

DSFR Chart n’a **pas** de treemap (ni sunburst). Pour une repartition par
categorie, le substitut conforme est le graphique en barres horizontales, trie :

```html
<dsfr-data-query id="rep" source="src" group-by="categorie" aggregate="montant:sum" order-by="montant__sum:desc"></dsfr-data-query>
<dsfr-data-chart source="rep" type="bar" horizontal label-field="categorie" value-field="montant__sum"></dsfr-data-chart>
```

Ne pas importer une bibliotheque tierce pour un treemap dans une page DSFR.

### Regle generale

Avant tout script : (1) lire la grammaire de l’attribut dans la reference du
composant (`get_skill(id, "reference")`), (2) essayer le mode existant
(`display`, `format`, `operator`, `transform`), (3) seulement ensuite envisager
du JavaScript. Une virgule ou un `:` mal place est la premiere cause de « ca ne
marche pas ».
