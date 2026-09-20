# Gabarits de page

> Quatre familles de pages de donnees publiques (localisateur, tableau de bord, corpus, portrait) et huit gabarits : quelle page pour quelle question, ou placer les filtres (barre ou colonne), et quand demander l'avis de l'usager plutot que trancher
>
> Déclencheurs : gabarit de page, patterns de page, famille de page, structure de la page, plan de page, quelle page, page entiere, refonte, colonne de filtres, barre de filtres, ou placer les filtres, filtres a gauche, barre collante, sticky, sommaire, onglets thematiques, localisateur, annuaire, carte et liste, corpus, moteur de recherche, portrait, portrait de territoire, fiche etablissement, observatoire

## Gabarits de page : quelle page pour quelle question

Quatre fiches se suivent et ne se remplacent pas. Celle-ci est la deuxième.

| Fiche | Ce qu'elle tranche | Quand la lire |
|---|---|---|
| `dataviz-metier` (`skills/dataviz-metier/`, ADR-136 ; servie par le MCP sous l'id `datavizMetier`) | **Quelle forme pour quelle question** : quel graphique, quelle échelle, quelle moyenne honnête, quelle phrase de lecture, ce qu'on ne montre pas | avant d'écrire la moindre syntaxe |
| **`pagePatterns` (cette fiche)** | **Quelle page pour quelle question** : quelle famille de gabarit, où vont les filtres, dans quel ordre le lecteur descend | quand la demande porte sur une **page entière**, pas sur un composant isolé |
| `dsfrLayout` | **Comment la poser** : grille 12 colonnes, points de rupture, gouttières, espacements, pièges | juste après, pour traduire le gabarit choisi en `fr-container` / `fr-grid-row` / `fr-col-*` |
| `compositionPatterns` | **Quoi brancher dedans** : pipeline source → transformation → affichage | en parallèle, dès qu'il y a de la donnée |

Les huit gabarits ci-dessous sont relevés sur des pages de l'État réellement en ligne
(banc d'essai `open-data-viz`). Ce ne sont pas des propositions esthétiques : ce sont les
quatre manières dont une page de donnée publique est effectivement lue.

### Étape 1 — la question de la page détermine la famille

| Ce que le lecteur vient chercher | Famille | Zone d'action principale |
|---|---|---|
| « Où sont les X ? » — un lieu, une adresse, une répartition sur le territoire | **A — Localisateur** | une carte, doublée d'une liste |
| « Combien, comparé à quoi ? » — des agrégats, des évolutions, des écarts | **B — Tableau de bord** | une grille de graphiques |
| « Trouver le bon document » — un texte, une fiche, un enregistrement précis | **C — Corpus** | une liste de résultats paginée |
| « Dis-moi tout sur X » — une entité choisie, vue sous tous ses angles | **D — Portrait** | des sections ou des onglets thématiques |

Deux repères quand l'énoncé hésite :

- la donnée porte-t-elle des **individus nommés** (une commune, un établissement, une
  entreprise) ou des **agrégats** ? Individus → A ou C ; agrégats → B.
- le lecteur **choisit-il une entité avant de lire** ? Oui → D, et il n'y a alors pas de
  facettes du tout : un seul sélecteur pilote toute la page.

### Étape 2 — le nombre de leviers détermine la variante

| Famille | Variante | On la choisit quand |
|---|---|---|
| A | **A1** colonne de filtres + carte à sa droite, liste en dessous | 5 filtres ou plus, ou des facettes à compteurs |
| A | **A2** barre de filtres, carte et liste côte à côte | 2 à 4 filtres, et le lecteur cherche **un** lieu précis plus qu'une répartition |
| B | **B1** colonne de filtres + grille de graphiques sur 2 colonnes | beaucoup de facettes (cases à cocher avec compteurs) |
| B | **B2** barre de filtres collante + sections thématiques numérotées | peu de dimensions (année, territoire, type) mais beaucoup de vues : la page se lit comme un rapport |
| C | **C1** recherche en bandeau, facettes en colonne, graphique de contexte replié | corpus de référence que l'on interroge (textes, catalogues) |
| C | **C2** filtres en barre, résultats à gauche, graphiques de contexte à droite | corpus **à flux** (rappels, signalements) où la temporalité compte |
| D | **D1** sélecteur en bandeau + onglets thématiques | 4 thèmes ou plus, **indépendants** les uns des autres |
| D | **D2** sélecteur + sommaire ancré à gauche, sections empilées | le lecteur veut tout voir d'un coup, ou la fiche doit s'imprimer |

### Le socle commun aux quatre familles

Quelle que soit la famille, la page s'ouvre sur un **bandeau pleine largeur** qui dit
« combien » **avant** de montrer quoi que ce soit :

1. le champ de recherche, large et seul sur sa ligne (`dsfr-data-search`) — seulement si le
   jeu contient des individus nommés ;
2. le compteur de résultats et les filtres actifs (`dsfr-data-context-tags`) ;
3. les indicateurs (`dsfr-data-kpi-group`), qui répondent à la recherche qui vient d'être
   faite.

Puis vient la **zone d'action**, où les filtres ne sont plus au-dessus de la donnée mais
**alignés horizontalement avec elle** quand ils sont en colonne. C'est ce qui différencie
une page de consultation d'un formulaire : on voit son levier et son effet dans le même
champ de vision.

```html
<!-- Le bandeau : une ligne par étage, toujours pleine largeur -->
<div class="fr-container fr-my-6v">
  <div class="fr-grid-row fr-mb-4v">
    <div class="fr-col-12 fr-col-lg-8">
      <dsfr-data-search source="src" context="ctx" fields="nom, commune"
        placeholder="Un mot, une commune, un code postal…"></dsfr-data-search>
    </div>
  </div>
  <dsfr-data-context-tags for="ctx" class="fr-mb-4v"></dsfr-data-context-tags>
  <dsfr-data-kpi-group per-row="2 md:4" gap="md">
    <dsfr-data-kpi source="src" value="count" label="Établissements"></dsfr-data-kpi>
    <dsfr-data-kpi source="src" value="count:visite:Oui" label="Visite autorisée"></dsfr-data-kpi>
    <dsfr-data-kpi source="src" value="departement:distinct" label="Départements couverts"></dsfr-data-kpi>
    <dsfr-data-kpi source="src" value="activite:distinct" label="Activités"></dsfr-data-kpi>
  </dsfr-data-kpi-group>
</div>
```

### Filtres : barre ou colonne — la règle

Cette fiche et `dsfrLayout` disaient deux choses différentes ; voici la règle unique, qui
vaut pour les deux.

| Situation | Emplacement |
|---|---|
| 1 à 4 filtres, sans compteurs | **barre horizontale**, pleine largeur, au-dessus de la zone d'action |
| 5 filtres ou plus, ou des facettes à compteurs (`dsfr-data-facets`) | **colonne latérale** `fr-col-12 fr-col-md-4 fr-col-lg-3`, la donnée occupant les colonnes restantes |
| Peu de filtres mais une page longue (plusieurs sections de graphiques) | **barre collante** (`position: sticky; top: 0`) : les filtres suivent le lecteur |
| Un seul levier (un sélecteur d'entité, famille D) | **bandeau**, jamais de colonne : une colonne pour un seul contrôle est un gâchis de largeur |

Trois conséquences :

- les filtres en colonne restent **alignés avec la donnée**, pas empilés au-dessus d'elle ;
- sous 768 px la colonne repasse au-dessus de la donnée (`fr-col-12`), ce qui est le
  comportement attendu : sur téléphone, on filtre puis on descend lire ;
- les filtres actifs restent visibles en chips (`dsfr-data-context-tags`) **dans les deux
  cas** — c'est le seul moyen de savoir ce qui est en train d'être caché.

### En cas de doute, demander

La règle ci-dessus n'est pas un dogme, et ses critères sont parfois indécidables au moment
d'écrire le code : le nombre de filtres n'est pas toujours connu (il dépend des champs du
jeu), 4 filtres à compteurs peuvent justifier une colonne, un corpus peut se lire comme un
tableau de bord.

**Quand le choix change la page et que le critère n'est pas tranché, poser la question à
l'usager avant de produire le code.** Une question courte, deux options nommées, une
recommandation :

> « Ce jeu a 5 facettes mais peu de valeurs par facette. Je peux les poser en colonne à
> gauche de la carte (recommandé : les compteurs restent lisibles), ou en barre au-dessus
> pour laisser toute la largeur à la carte. Laquelle ? »

Les cas qui méritent la question, et non un choix imposé :

- **4 à 6 filtres** — la frontière exacte entre barre et colonne ;
- **famille ambiguë** — une page qui liste des établissements *et* compare des agrégats
  peut être un A ou un B ; la question est « le lecteur cherche-t-il un établissement, ou
  une répartition ? » ;
- **D1 ou D2** — onglets ou sections empilées : cela dépend de si la fiche doit s'imprimer,
  ce que le code ne peut pas deviner ;
- **la place de la carte** — pleine largeur ou à côté de la liste.

Ne pas poser la question quand la règle tranche : 12 facettes vont en colonne, point.

### Famille A — Localisateur

« Où sont les X ? » La carte est l'action principale, la liste sa **transcription** : même
sélection, deux lectures. Pages de référence : entreprises du patrimoine vivant, Qualité
Tourisme, annuaire DGFiP, centres de contrôle technique, annuaire des internats.

```html
<!-- A1 — colonne de filtres, carte à sa hauteur, liste en pleine largeur dessous -->
<div class="fr-container">
  <div class="fr-grid-row fr-grid-row--gutters">

    <div class="fr-col-12 fr-col-md-4 fr-col-lg-3">
      <h2 class="fr-h6">Filtrer</h2>
      <dsfr-data-facets id="filtres" context="ctx" source="src"
        fields="univers, secteur, region, departement, visite"
        labels="univers:Univers | secteur:Secteur | region:Région | departement:Département | visite:Visite autorisée"
        searchable="secteur"></dsfr-data-facets>
    </div>

    <div class="fr-col-12 fr-col-md-8 fr-col-lg-9">
      <h2 class="fr-h5">Où sont les entreprises labellisées</h2>
      <dsfr-data-map height="60%" center="46.6,2.4" zoom="5">
        <dsfr-data-map-layer id="pts" source="filtres" type="marker"></dsfr-data-map-layer>
      </dsfr-data-map>
    </div>

    <div class="fr-col-12">
      <h2 class="fr-h5">Les entreprises</h2>
      <dsfr-data-list source="filtres"
        columns="nom:Nom, commune:Commune, secteur:Secteur, region:Région"
        pagination="20"></dsfr-data-list>
    </div>

  </div>
</div>
```

**A2** remplace la colonne par une barre (`fr-grid-row` de `fr-col-12 fr-col-md-3`) et pose
la carte et la liste côte à côte — `fr-col-12 fr-col-lg-7` pour la carte, `fr-col-12
fr-col-lg-5` pour la liste, cette dernière avec une hauteur fixe et son propre défilement.
À réserver aux annuaires où l'on cherche **un** lieu précis.

Règles de la famille :

- la liste n'est jamais facultative : c'est la version lisible de la carte, et la seule
  utilisable au clavier et au lecteur d'écran ;
- une carte a besoin d'une hauteur explicite ; `height="60%"` est un ratio de sa **propre
  largeur**, donc elle reste proportionnée quand la colonne rétrécit ;
- la recherche sort de la colonne de filtres : champ large, un seul geste d'entrée.

### Famille B — Tableau de bord statistique

« Combien, comparé à quoi ? » Les filtres pilotent des **agrégats**, pas des individus.
Pages de référence : prix des carburants, fiscalité locale, IPS des collèges et lycées,
comptabilité générale, plan de relance.

```html
<!-- B1 — colonne de facettes, graphiques par deux, carte de détail en pleine largeur -->
<div class="fr-container">
  <div class="fr-grid-row fr-grid-row--gutters">

    <div class="fr-col-12 fr-col-md-4 fr-col-lg-3">
      <h2 class="fr-h6">Filtrer</h2>
      <dsfr-data-facets id="filtres" context="ctx" source="src"
        fields="carburant, region, departement, services"></dsfr-data-facets>
    </div>

    <div class="fr-col-12 fr-col-md-8 fr-col-lg-9">
      <div class="fr-grid-row fr-grid-row--gutters">
        <div class="fr-col-12 fr-col-xl-6">
          <h3 class="fr-h6">Prix moyen par carburant</h3>
          <dsfr-data-chart source="par-carburant" type="bar"
            label-field="carburant" value-field="prix__avg"></dsfr-data-chart>
        </div>
        <div class="fr-col-12 fr-col-xl-6">
          <h3 class="fr-h6">Prix du gazole par région</h3>
          <dsfr-data-map height="50%">
            <dsfr-data-map-layer id="choro" source="par-region" type="geoshape"
              fill-field="prix__avg" selected-palette="sequentialAscending"></dsfr-data-map-layer>
          </dsfr-data-map>
        </div>
      </div>
    </div>

  </div>
</div>
```

**B2** remplace la colonne par une barre collante et organise la page en **sections
numérotées**, chacune ouverte par sa *phrase de lecture* — la thèse du bloc, avant le
graphique (voir `dataviz-metier`) :

```html
<div class="fr-container">
  <div class="fr-grid-row fr-grid-row--gutters fr-mb-6v" style="position:sticky;top:0;z-index:10;background:var(--background-default-grey)">
    <div class="fr-col-12 fr-col-md-3"><!-- Année --></div>
    <div class="fr-col-12 fr-col-md-3"><!-- Région --></div>
    <div class="fr-col-12 fr-col-md-3"><!-- Type --></div>
    <div class="fr-col-12 fr-col-md-3"><!-- Strate --></div>
  </div>

  <h2>1. Les taux</h2>
  <p class="fr-text--lead">Les communes de moins de 2 000 habitants affichent le taux le plus élevé.</p>
  <div class="fr-grid-row fr-grid-row--gutters">
    <div class="fr-col-12 fr-col-md-6"><!-- Taux par strate --></div>
    <div class="fr-col-12 fr-col-md-6"><!-- Choroplèthe --></div>
  </div>

  <h2 class="fr-mt-8v">2. L'évolution</h2>
  <div class="fr-grid-row">
    <div class="fr-col-12"><!-- Série 2012 → 2026, pleine largeur -->
    </div>
  </div>
</div>
```

Règles de la famille :

- **2 colonnes par défaut**, pleine largeur pour une série temporelle longue ou une carte ;
- la recherche n'est présente que si le jeu a des individus nommés (commune, établissement) ;
- deux graphiques censés se comparer vont dans des colonnes de **même largeur** : DSFR Chart
  dessine à ratio constant, deux largeurs différentes donnent deux hauteurs différentes.

### Famille C — Corpus documentaire

« Trouver le bon document. » La recherche est l'action, la liste le résultat, le graphique
un **contexte** — jamais l'inverse. Pages de référence : BOFiP, Rappel Conso, Signal Conso,
catalogues Bercy et Éducation, aides de minimis.

**C1** — le champ est grand et seul : c'est une page de recherche, pas un tableau de bord.

- les indicateurs deviennent une **ligne de compteurs sobre** sous le champ (« 9 148
  documents · 2 séries · dernier ajout : hier »), pas des tuiles ;
- le graphique de contexte (répartition par année, par catégorie) est posé **replié** dans
  un `fr-accordion` : il ne repousse pas les résultats hors de l'écran ;
- les facettes vont en colonne (`fr-col-12 fr-col-md-4 fr-col-lg-3`), les résultats
  occupent le reste.

**C2** — pour les corpus à flux, les facettes passent en barre et la colonne de droite est
libérée pour des graphiques de contexte (par catégorie, par mois) restant visibles au
défilement :

```html
<div class="fr-container">
  <!-- Filtres en barre, pleine largeur : c'est d'ici que l'on filtre -->
  <div class="fr-grid-row fr-grid-row--gutters fr-mb-4v">
    <div class="fr-col-12 fr-col-md-4"><!-- Catégorie --></div>
    <div class="fr-col-12 fr-col-md-4"><!-- Risque --></div>
    <div class="fr-col-12 fr-col-md-4"><!-- Période --></div>
  </div>
  <dsfr-data-context-tags for="ctx" class="fr-mb-4v"></dsfr-data-context-tags>

  <div class="fr-grid-row fr-grid-row--gutters">
    <div class="fr-col-12 fr-col-lg-8">
      <dsfr-data-list source="filtres" pagination="20"></dsfr-data-list>
    </div>
    <div class="fr-col-12 fr-col-lg-4" style="position:sticky;top:1rem;align-self:flex-start">
      <h3 class="fr-h6">Par catégorie</h3>
      <dsfr-data-chart source="par-categorie" type="bar" horizontal
        label-field="categorie" value-field="id__count"></dsfr-data-chart>
      <h3 class="fr-h6 fr-mt-4v">Par mois</h3>
      <dsfr-data-chart source="par-mois" type="line"
        label-field="mois" value-field="id__count"></dsfr-data-chart>
    </div>
  </div>
</div>
```

**Les graphiques de la colonne de droite ne sont pas cliquables.** `dsfr-data-chart`
n'émet aucun événement de clic ; on filtre par la barre du haut, et le graphique montre
l'effet du filtre. Ne jamais écrire « cliquez une barre pour filtrer » : ce serait une
promesse que la bibliothèque ne tient pas.

Règles de la famille :

- les résultats gardent la **colonne large** : le titre d'un document ne doit pas se replier
  sur quatre lignes ;
- `position: sticky` sur la colonne de droite exige `align-self: flex-start` — sans lui, la
  cellule est étirée par `fr-grid-row` et le collage n'a aucun effet.

### Famille D — Portrait d'une entité

« Dis-moi tout sur X. » Un seul sélecteur pilote toute la page ; **pas de facettes**. Pages
de référence : portrait de territoire, portrait de fédération (Sports), fiche établissement
Carto Pix, sélecteur d'académie.

Le sélecteur d'entité mérite le bandeau, et souvent un second contrôle « comparer à »
(France, académie, moyenne de la strate). **Chaque indicateur porte sa référence** — c'est
ce qui rend un portrait lisible : `description` sert exactement à cela.

```html
<!-- D1 — sélecteur en bandeau, puis onglets thématiques -->
<div class="fr-container">
  <div class="fr-grid-row fr-grid-row--gutters fr-mb-4v">
    <div class="fr-col-12 fr-col-md-6"><!-- Territoire : Gironde (33) --></div>
    <div class="fr-col-12 fr-col-md-3"><!-- Comparer à : France --></div>
  </div>

  <dsfr-data-kpi-group per-row="2 md:4" gap="md" class="fr-mb-6v">
    <dsfr-data-kpi source="territoire" value="licencies:sum" label="Licenciés"
      description="19,4 % — France : 22,1 %"></dsfr-data-kpi>
    <dsfr-data-kpi source="territoire" value="equipements:sum" label="Équipements"
      description="3,0 ‰ — France : 3,4 ‰"></dsfr-data-kpi>
  </dsfr-data-kpi-group>

  <div class="fr-tabs"><!-- Pratiquants · Équipements · Clubs · Emploi · Financement -->
  </div>
</div>
```

**D2** remplace les onglets par un **sommaire ancré** à gauche (`position: sticky`) et
empile les sections : le sommaire occupe la place de l'ancienne colonne de filtres, même
gabarit de grille, autre contenu.

Règle de choix : **D1 quand les thèmes sont indépendants** (on en consulte un), **D2 quand
le lecteur veut tout voir d'un coup** ou que la fiche doit s'imprimer — un onglet cache son
contenu à l'impression et à la recherche dans la page.

À l'intérieur d'un onglet ou d'une section, la règle de la famille B s'applique :
2 colonnes par défaut, carte et longue série en pleine largeur.

### Ce que la bibliothèque ne fait pas

À ne pas promettre dans une page produite à partir de ces gabarits :

- **filtrer en cliquant sur un graphique** — aucun événement de clic n'est émis par
  `dsfr-data-chart` ; les seuls événements publics sont `dsfr-data-context-change`,
  `dsfr-data-search-change` et les événements de carte. Le filtrage passe par
  `dsfr-data-facets`, `dsfr-data-search` ou `dsfr-data-context-filter` ;
- **une hauteur de graphique** — `dsfr-data-chart` n'expose pas d'attribut de hauteur ;
  passer par la largeur de la colonne, ou une règle CSS sur `.dsfr-data-chart__wrapper` ;
- **un panneau de filtres repliable natif** — l'écrire avec `fr-accordion` autour de
  `dsfr-data-facets`.

### Règles

1. Choisir la famille à partir de la **question de la page**, pas à partir des composants
   disponibles.
2. Le bandeau dit « combien » avant de montrer : recherche, compteur, indicateurs.
3. Barre si 1 à 4 filtres, colonne si 5 et plus ou si les facettes ont des compteurs,
   bandeau si le levier est unique.
4. **En cas de doute, demander à l'usager** — deux options nommées et une recommandation,
   jamais un choix imposé en silence.
5. Les filtres actifs restent visibles en chips, quel que soit l'emplacement.
6. 2 colonnes par défaut ; pleine largeur pour une carte, une longue série temporelle ou un
   tableau.
7. Une carte est toujours doublée de sa liste.
8. Lire `datavizMetier` avant (quelle forme, quelle honnêteté), `dsfrLayout` après (quelle
   grille) : `get_skill("datavizMetier")` et `get_skill("dsfrLayout")` côté MCP.
