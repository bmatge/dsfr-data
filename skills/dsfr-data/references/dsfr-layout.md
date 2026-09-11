# Mise en page DSFR

> Grille 12 colonnes, points de rupture, alignements, espacements et classes utilitaires du DSFR pour composer la page complete d'un tableau de bord
>
> Déclencheurs : grille, grid, colonnage, mise en page, layout, gabarit, maquette, template, edito, aligne, centrer, hauteur, espacement, marge externe, gouttiere, responsive, mobile, breakpoint, point de rupture, deux colonnes, trois colonnes, cote a cote, encadre, utilitaire, dsfr-utils, fr-grid-row, fr-col, fr-container, tableau de bord, dashboard

## Mise en page DSFR d'un tableau de bord

Les autres fiches disent quoi mettre dans la page (source, transformation, graphique).
Celle-ci dit **où le poser** : la grille 12 colonnes du DSFR, ses points de rupture, ses
gouttières, ses espacements, et les classes utilitaires qui permettent de fabriquer un
encadré quand aucun composant DSFR ne correspond.

Un tableau de bord n'est pas une suite de graphiques empilés : c'est une page éditoriale
(un titre, un chapô, des sections, des indicateurs, des visualisations, des sources) qui
doit rester lisible de 320 px à 1440 px. Tout ce qui suit est vérifié sur DSFR 1.14.

### La structure obligatoire : container → row → col

Trois niveaux, jamais deux, jamais quatre :

```html
<div class="fr-container">                         <!-- marges externes + largeur max -->
  <div class="fr-grid-row fr-grid-row--gutters">   <!-- une ligne -->
    <div class="fr-col-12 fr-col-md-6">            <!-- une cellule -->
      <dsfr-data-chart ...></dsfr-data-chart>      <!-- le contenu -->
    </div>
  </div>
</div>
```

La cellule `fr-col-*` est **obligatoire** entre la ligne et le contenu. Les gouttières sont
posées par la règle `.fr-grid-row--gutters > [class^=fr-col-]` : un `<dsfr-data-chart>`
placé en enfant direct de `fr-grid-row` ne reçoit aucun padding, et la marge négative de la
ligne (`-0.5rem`) déborde alors de chaque côté.

`fr-container--fluid` remplace `fr-container` quand la page doit occuper toute la largeur
(une carte pleine page, un bandeau de couleur). Il supprime les marges externes et la
largeur maximale.

### Points de rupture et largeurs

| Mise en page | Largeur écran | Gouttière | `fr-container` |
|---|---|---|---|
| XS | 0 à 575 px | 16 px | marges 16 px |
| SM | 576 à 767 px | 16 px | marges 16 px |
| MD | 768 à 991 px | 16 px | marges 16 px |
| LG | 992 à 1247 px | 24 px | marges 24 px |
| XL | 1248 px et plus | 24 px | marges 24 px, largeur max 1248 px |

Les classes de colonne : `fr-col-N` (N sur 12), `fr-col-{sm,md,lg,xl}-N` à partir du point
de rupture, `fr-col` sans chiffre (partage à parts égales l'espace restant).

Le DSFR est **mobile first** : `fr-col-12 fr-col-md-6` veut dire « pleine largeur, puis
moitié à partir de 768 px ». Toujours écrire la valeur mobile en premier, sinon le bloc
reste à sa largeur de bureau sur téléphone.

Largeurs conseillées pour un tableau de bord :

| Contenu | Cellule |
|---|---|
| Rangée de 4 indicateurs | `fr-col-12 fr-col-sm-6 fr-col-lg-3` |
| Deux graphiques côte à côte | `fr-col-12 fr-col-md-6` |
| Graphique + commentaire éditorial | `fr-col-12 fr-col-lg-8` puis `fr-col-12 fr-col-lg-4` |
| Tableau (`dsfr-data-list`) | `fr-col-12` — les colonnes d'un tableau ne se réduisent pas |
| Carte Leaflet | `fr-col-12` ou `fr-col-12 fr-col-lg-8` |
| Corps de texte | 8 colonnes maximum (recommandation DSFR) |

### Gouttières et marges externes

Quatre combinaisons, et rien d'autre à écrire :

| Besoin | Classes |
|---|---|
| Marges externes, pas de gouttière (défaut) | `fr-container` + `fr-grid-row` |
| Marges externes et gouttières | `fr-container` + `fr-grid-row fr-grid-row--gutters` |
| Pleine largeur, pas de gouttière | `fr-container--fluid` + `fr-grid-row` |
| Pleine largeur avec gouttières | `fr-container--fluid` + `fr-grid-row fr-grid-row--gutters` |

Sur un tableau de bord, `fr-grid-row--gutters` est le défaut souhaitable : sans lui, deux
graphiques voisins se touchent. `fr-grid-row--no-gutters` annule les gouttières sur une
ligne précise ; les variantes `fr-grid-row-{sm,md,lg,xl}--gutters` ne les activent qu'à
partir d'un point de rupture.

### Alignement vertical et horizontal

Les cellules d'une même ligne **ont déjà la même hauteur** : `fr-grid-row` est un conteneur
flex et ses cellules s'étirent par défaut. Une carte courte et une carte longue posées côte
à côte se terminent à la même hauteur sans rien ajouter.

| Modificateur sur `fr-grid-row` | Effet |
|---|---|
| `--top` `--middle` `--bottom` | alignement vertical des cellules |
| `--left` `--center` `--right` | répartition horizontale quand la ligne ne fait pas 12 colonnes |

Et par cellule : `fr-col--top`, `fr-col--middle`, `fr-col--bottom`.

Poser `fr-grid-row--middle` **annule l'étirement** : chaque cellule reprend la hauteur de
son contenu et les blocs cessent de s'aligner en bas. Ne l'utiliser que pour centrer un
contenu court en face d'un contenu long (un intitulé en face d'un graphique), jamais sur
une rangée de cartes ou d'indicateurs.

`--center` sert quand la ligne ne remplit pas les 12 colonnes : une seule visualisation en
`fr-col-lg-8` dans une ligne `fr-grid-row--center` est centrée au lieu d'être collée à
gauche.

### Décalages

`fr-col-offset-N` laisse N colonnes vides à gauche du bloc, `fr-col-offset-N--right` à
droite, et les points de rupture s'appliquent comme aux colonnes
(`fr-col-offset-1 fr-col-offset-md-3`). Un chapô lisible se pose ainsi :

```html
<div class="fr-grid-row">
  <div class="fr-col-12 fr-col-lg-8 fr-col-offset-lg-2">
    <p class="fr-text--lead">Ce que cette page montre, en deux phrases.</p>
  </div>
</div>
```

### Espacements : l'échelle en v

Le DSFR espace en multiples de 4 px. Le suffixe `v` vaut 4 px : `fr-mb-6v` = 24 px.
La nomenclature `w` (multiples de 8 px, `fr-mb-3w` = 24 px) existe encore mais elle est
**dépréciée** par le DSFR : écrire les nouvelles valeurs en `v`.

| Repère | Classe | Valeur |
|---|---|---|
| 8 px | `fr-mb-2v` | 0.5 rem |
| 16 px | `fr-mb-4v` | 1 rem |
| 24 px | `fr-mb-6v` | 1.5 rem |
| 32 px | `fr-mb-8v` | 2 rem |
| 48 px | `fr-mb-12v` | 3 rem |
| 64 px | `fr-mb-16v` | 4 rem |

L'échelle va de `1v` à `32v` (128 px).

Grammaire : `fr-` + `m` (margin) ou `p` (padding) + direction + `-` + valeur.
Directions : rien (les quatre côtés), `t` haut, `b` bas, `l` gauche, `r` droite,
`x` gauche+droite, `y` haut+bas. Valeurs spéciales : `0` (`fr-m-0`), `auto`
(`fr-mx-auto`), et le préfixe `n` pour une marge négative (`fr-mt-n2v`).

**Un seul point de rupture existe pour les espacements : `md`** (`fr-mt-md-8v`).
Il n'y a ni `fr-mt-lg-*` ni `fr-mt-sm-*` — une classe inventée sur ce modèle ne fait
simplement rien.

Rythme vertical d'un tableau de bord :

- entre deux cellules d'une même ligne : rien, `fr-grid-row--gutters` s'en charge ;
- entre deux lignes de la grille : `fr-mb-6v` (24 px) ou `fr-mb-8v` (32 px) sur la ligne ;
- avant un titre de section : `fr-mt-12v` (48 px) ;
- les titres `h1`–`h6` et les paragraphes portent déjà 24 px de marge basse : ne pas
  ajouter de `fr-mb-*` sauf pour la réduire (`fr-mb-2v` sous un surtitre).

### Fabriquer une boîte absente du DSFR

Quand aucun composant ne correspond (un encadré de sources, une légende maison, un bandeau
de contexte), la composition se fait avec les classes utilitaires plutôt qu'avec du CSS
inventé :

```html
<div class="fr-p-4v fr-background-alt--grey fr-border-default--grey">
  <p class="fr-text--sm fr-mb-0">Source : ministère X, données arrêtées au 31/12/2025.</p>
</div>
```

Ce que fournit `utility.css` et qui sert à cela :

| Famille | Classes |
|---|---|
| Fonds | `fr-background-default--grey`, `fr-background-alt--grey`, `fr-background-contrast--grey`, et les mêmes en `--blue-france`, `--green-emeraude`… |
| Bordures | `fr-border-default--grey`, `fr-border-plain--info` / `--success` / `--warning` / `--error`, `fr-border-width-0-5v` / `-1v` / `-2v` |
| Texte | `fr-text--xs` `--sm` `--lg` `--lead`, `fr-text-mention--grey`, `fr-text-title--blue-france`, `fr-h1`…`fr-h6` (donner l'apparence d'un titre sans changer le niveau sémantique) |
| Visibilité | `fr-hidden`, `fr-hidden-{sm,md,lg,xl}`, `fr-unhidden`, `fr-unhidden-{sm,md,lg,xl}` |

**Ce que le DSFR ne fournit pas** : aucune classe utilitaire pour `display`, `flex`, `gap`,
`width`, `height`, `position`, `order`, `border-radius` ni `box-shadow`. `fr-flex`,
`fr-align-items-center`, `fr-h-100`, `fr-shadow` n'existent pas — les écrire ne produit
rien. Pour ces besoins, écrire une règle CSS nommée dans un `<style>` de la page ; et
comme le DSFR est un système plat, ne pas y ajouter d'ombre portée ni d'arrondi.

### Composants éditoriaux de cadrage

Pour tout ce qui n'est pas une visualisation, le DSFR a déjà le bloc qu'il faut :

```html
<!-- Mise en avant : une information complémentaire, 1 ou 2 par page au maximum -->
<div class="fr-callout">
  <h3 class="fr-callout__title">Ce que montre cet indicateur</h3>
  <p class="fr-callout__text">Le taux est calculé sur les seuls dossiers clos.</p>
</div>

<!-- Mise en exergue : une phrase clef dans le fil du texte -->
<div class="fr-highlight">
  <p>La hausse de 2025 tient à un changement de périmètre.</p>
</div>

<!-- Badge : un état, une date de mise à jour -->
<p class="fr-badge fr-badge--info fr-badge--sm fr-badge--no-icon">Mise à jour : mars 2026</p>
```

Les autres blocs utiles à un tableau de bord : `fr-summary` (sommaire des sections en tête
de page longue), `fr-tabs` (plusieurs vues d'un même jeu), `fr-accordion` (méthodologie
repliée), `fr-notice` (bandeau d'avertissement en haut de page), `fr-card` et `fr-tile`
(entrées vers d'autres pages), `fr-alert` (erreur ou information ponctuelle).

Les cartes `fr-card` occupent toute la hauteur de leur cellule : une rangée de cartes de
contenus inégaux reste alignée sans CSS supplémentaire. Une boîte fabriquée à la main, elle,
garde la hauteur de son contenu.

### Gabarit — exemple d'une page d'observatoire

Lecture descendante : qui parle, ce qu'on mesure, les chiffres clefs, les visualisations,
la méthode. C'est le gabarit par défaut d'une page publiée.

```html
<div class="fr-container fr-my-8v">

  <!-- 1. En-tete editorial -->
  <div class="fr-grid-row">
    <div class="fr-col-12 fr-col-lg-8">
      <p class="fr-text--sm fr-text-mention--grey fr-mb-1v">Observatoire territorial</p>
      <h1>Équipement des communes en bornes de recharge</h1>
      <p class="fr-text--lead">Répartition et évolution du parc, par région, depuis 2020.</p>
      <p class="fr-badge fr-badge--info fr-badge--sm fr-badge--no-icon">Données au 31/12/2025</p>
    </div>
  </div>

  <!-- 2. Le pipeline de donnees : invisible, pose une seule fois -->
  <dsfr-data-source id="src" api-type="opendatasoft"
    base-url="https://odre.opendatasoft.com" dataset-id="bornes-irve"></dsfr-data-source>
  <dsfr-data-query id="par-region" source="src"
    group-by="region" aggregate="nb_bornes:sum" order-by="nb_bornes__sum:desc"></dsfr-data-query>

  <!-- 3. Chiffres clefs : kpi-group fait SA grille, pas de fr-col autour -->
  <dsfr-data-kpi-group per-row="4" gap="md" class="fr-mb-8v">
    <dsfr-data-kpi source="src" value="count" label="Communes équipées"></dsfr-data-kpi>
    <dsfr-data-kpi source="src" value="nb_bornes:sum" label="Bornes installées"></dsfr-data-kpi>
    <dsfr-data-kpi source="src" value="nb_bornes:avg" label="Moyenne par commune" decimals="1"></dsfr-data-kpi>
    <dsfr-data-kpi source="src" value="puissance:max" label="Puissance maximale" unit="kW"></dsfr-data-kpi>
  </dsfr-data-kpi-group>

  <!-- 4. Visualisations -->
  <h2 class="fr-mt-12v">Répartition territoriale</h2>
  <div class="fr-grid-row fr-grid-row--gutters fr-mb-8v">
    <div class="fr-col-12 fr-col-lg-8">
      <dsfr-data-chart id="g-region" source="par-region" type="bar" horizontal
        label-field="region" value-field="nb_bornes__sum"
        selected-palette="categorical"></dsfr-data-chart>
      <dsfr-data-a11y for="g-region" source="par-region" table download></dsfr-data-a11y>
    </div>
    <div class="fr-col-12 fr-col-lg-4">
      <div class="fr-callout">
        <h3 class="fr-callout__title">Trois régions concentrent la moitié du parc</h3>
        <p class="fr-callout__text">L'écart tient d'abord à la densité de population.</p>
      </div>
    </div>
  </div>

  <!-- 5. Le detail : un tableau prend toujours 12 colonnes -->
  <h2 class="fr-mt-12v">Le détail commune par commune</h2>
  <div class="fr-grid-row fr-mb-8v">
    <div class="fr-col-12">
      <dsfr-data-list source="src" columns="commune:Commune, region:Région, nb_bornes:Bornes" pagination="20"></dsfr-data-list>
    </div>
  </div>

  <!-- 6. Methode et sources : boite fabriquee avec les utilitaires -->
  <div class="fr-p-4v fr-background-alt--grey fr-border-default--grey">
    <h3 class="fr-h6 fr-mb-2v">Sources et méthode</h3>
    <p class="fr-text--sm fr-mb-0">Jeu « bornes-irve », ODRÉ. Agrégation par région
      sur le champ déclaratif ; les communes sans déclaration sont absentes.</p>
  </div>

</div>
```

### Gabarit — exemple d'un tableau de bord filtré

Les filtres partagés se posent en haut, sur toute la largeur, au-dessus des visualisations
qu'ils pilotent : l'usager doit voir ce qu'il filtre avant de voir le résultat. La barre de
filtres est une ligne de grille ordinaire ; `dsfr-data-context` et ses filtres, eux, ne
dessinent rien et se posent à côté.

```html
<div class="fr-container fr-my-8v">
  <h1>Suivi des dossiers</h1>

  <dsfr-data-source id="src" api-type="opendatasoft"
    base-url="https://data.exemple.gouv.fr" dataset-id="dossiers"></dsfr-data-source>

  <!-- Barre de filtres : chaque controle occupe un tiers a partir de 768 px -->
  <div class="fr-grid-row fr-grid-row--gutters fr-mb-2v">
    <div class="fr-select-group fr-col-12 fr-col-md-4">
      <label class="fr-label" for="ui-region">Région</label>
      <select class="fr-select" id="ui-region"><option value="">Toutes</option></select>
    </div>
    <div class="fr-select-group fr-col-12 fr-col-md-4">
      <label class="fr-label" for="ui-annee">Année</label>
      <select class="fr-select" id="ui-annee"><option value="">Toutes</option></select>
    </div>
    <div class="fr-col-12 fr-col-md-4">
      <dsfr-data-search source="src" context="ctx" fields="objet"
        placeholder="Rechercher un objet"></dsfr-data-search>
    </div>
  </div>

  <dsfr-data-context id="ctx" sources="src" url-sync>
    <dsfr-data-context-filter field="region" operator="eq" ui="ui-region"></dsfr-data-context-filter>
    <dsfr-data-context-filter field="annee" operator="eq" ui="ui-annee"></dsfr-data-context-filter>
  </dsfr-data-context>
  <dsfr-data-context-tags for="ctx"></dsfr-data-context-tags>

  <!-- Le resultat : deux colonnes egales, donc deux graphiques de meme hauteur -->
  <dsfr-data-query id="par-statut" source="src" group-by="statut" aggregate="id:count"></dsfr-data-query>
  <dsfr-data-query id="par-mois" source="src" group-by="mois" aggregate="id:count" order-by="mois:asc"></dsfr-data-query>

  <div class="fr-grid-row fr-grid-row--gutters fr-mt-8v">
    <div class="fr-col-12 fr-col-md-6">
      <h2 class="fr-h4">Par statut</h2>
      <dsfr-data-chart source="par-statut" type="pie"
        label-field="statut" value-field="id__count"></dsfr-data-chart>
    </div>
    <div class="fr-col-12 fr-col-md-6">
      <h2 class="fr-h4">Par mois</h2>
      <dsfr-data-chart source="par-mois" type="line"
        label-field="mois" value-field="id__count"></dsfr-data-chart>
    </div>
  </div>
</div>
```

### Gabarit — exemple d'une carte et de son panneau

Une carte Leaflet a besoin d'une hauteur explicite. Son attribut `height` accepte un
pourcentage, qui est alors un **ratio de sa propre largeur** : la carte reste proportionnée
quand la colonne rétrécit, ce qu'une hauteur en pixels ne fait pas. Défaut : `500px`.

```html
<div class="fr-grid-row fr-grid-row--gutters">
  <div class="fr-col-12 fr-col-lg-8">
    <dsfr-data-map height="60%" center="46.6,2.4" zoom="5">
      <dsfr-data-map-layer id="couche" source="src" type="geoshape"
        fill-field="valeur" selected-palette="sequentialAscending"></dsfr-data-map-layer>
      <dsfr-data-map-legend for="couche" label="Valeur"></dsfr-data-map-legend>
    </dsfr-data-map>
  </div>
  <div class="fr-col-12 fr-col-lg-4">
    <!-- per-row="1" : un indicateur par ligne dans une colonne etroite -->
    <dsfr-data-kpi-group per-row="1" gap="md">
      <dsfr-data-kpi source="src" value="valeur:sum" label="Total"></dsfr-data-kpi>
      <dsfr-data-kpi source="src" value="valeur:avg" label="Moyenne" decimals="1"></dsfr-data-kpi>
    </dsfr-data-kpi-group>
  </div>
</div>
```

### Pièges de mise en page

- **`dsfr-data-kpi-group` fait sa propre grille.** Il dispose ses enfants dans une grille
  CSS 12 colonnes à lui (shadow DOM), pilotée par son attribut `per-row` (échelle responsive
  possible : `per-row="2 md:4"` pour 2 × 2 sur téléphone) et par l'attribut `span` de chaque
  `dsfr-data-kpi`. Ne pas l'envelopper dans des `fr-col-*`, et ne pas poser
  de classe `fr-col-*` sur les KPI enfants : ces classes n'atteignent pas sa grille et ne
  font rien. Tous les autres composants `dsfr-data-*` rendent en DOM clair, où les classes
  `fr-*` s'appliquent normalement.
- **Un élément personnalisé est `display: inline` par défaut.** `<dsfr-data-chart>` n'est
  pas un bloc : lui poser une hauteur, un fond ou une bordure directement ne donne rien.
  Envelopper dans un `<div>`, ou déclarer `dsfr-data-chart { display: block; }` dans la page.
- **Les cellules s'étirent déjà.** Ajouter `fr-grid-row--middle` pour « bien aligner »
  produit l'effet inverse : l'étirement est annulé et les blocs se décalent.
- **La hauteur d'un graphique suit sa largeur.** DSFR Chart dessine avec un ratio de 2
  (largeur / hauteur) ; deux colonnes de largeurs différentes donnent donc deux graphiques
  de hauteurs différentes. `dsfr-data-chart` n'expose pas d'attribut de hauteur : si
  l'alignement bas compte, mettre les deux graphiques dans des colonnes de même largeur, ou
  fixer une hauteur en CSS sur `.dsfr-data-chart__wrapper`.
- **Pas de `fr-container` dans un `fr-container`.** Les marges externes s'additionnent et la
  page se rétrécit à chaque niveau. Un seul par page, à la racine du contenu.
- **Somme des colonnes au-delà de 12** : la ligne passe à la ligne suivante. C'est parfois
  voulu (une galerie de cartes), jamais par accident.
- **Espacements responsifs** : seul `md` existe. `fr-mt-lg-8v` n'a aucun effet.
- **`fr-hidden-md`** masque à partir de 768 px, `fr-unhidden-md` réaffiche à partir de
  768 px. Ne jamais masquer en mobile un contenu qui porte de l'information : un graphique
  qui disparaît sous 768 px doit être remplacé par son tableau (`dsfr-data-a11y`), pas
  supprimé.
- **Un tableau ne se réduit pas.** `dsfr-data-list` rend un `fr-table` qui défile
  horizontalement ; dans une demi-colonne, l'usager scrolle au lieu de lire. Lui donner
  `fr-col-12`, ou réduire le nombre de colonnes affichées.

### Règles

1. Trois niveaux : `fr-container` → `fr-grid-row` → `fr-col-*` → contenu. Le contenu n'est
   jamais enfant direct d'une ligne.
2. Écrire la largeur mobile d'abord (`fr-col-12` puis `fr-col-md-*`).
3. `fr-grid-row--gutters` par défaut sur un tableau de bord.
4. Espacer en `v` ; laisser les titres et paragraphes porter leur marge native.
5. Aucune classe utilitaire inventée : si `fr-quelque-chose` n'est pas dans cette fiche ou
   dans la documentation DSFR, elle n'existe pas. Écrire une règle CSS nommée.
6. Un composant DSFR existant (callout, highlight, card, notice, tabs) avant toute boîte
   fabriquée à la main.
7. Vérifier la page à 320 px avant de la livrer : c'est la résolution de maquette mobile du
   DSFR, et c'est là que les mises en page fixes se cassent.
