# Structure narrative — l'ordre des blocs est l'ordre de l'argument

> Une page de données se lit de haut en bas une seule fois : la synthèse avant le détail (pyramide inversée du datajournalisme), ou un récit guidé qui s'ouvre sur l'exploration libre (martini glass). Le plan type accroche → preuve → nuance → exploration → conclusion, les transitions, la place des filtres, la conclusion « ce qu'il faut retenir », et le squelette DSFR qui le porte.
>
> Déclencheurs : structure narrative, plan narratif, ordre des blocs, synthèse puis détail, pyramide inversée, martini glass, récit guidé, accroche, preuve, nuance, conclusion de la page, ce qu'il faut retenir, transitions, chapitres, sommaire, page qui raconte, rapport
>
> Niveaux : intermédiaire (§ plan type, quand les blocs s'enchaînent), avancé (tout)

## Deux gabarits narratifs, et quand choisir

| Gabarit | Principe | Quand | Famille `pagePatterns` |
|---|---|---|---|
| **Pyramide inversée** | le message principal en premier, puis les preuves, puis le détail ; le lecteur peut s'arrêter à chaque étage sans rien perdre d'essentiel | un rapport, une note, une page lue par des décideurs ou la presse | B2 (sections numérotées ouvertes par leur phrase de lecture), D2 (portrait avec sommaire) |
| **Martini glass** | un récit guidé et fermé (le pied du verre), puis l'ouverture sur l'exploration libre (la coupe) : filtres, tableau, carte | une page qui doit à la fois convaincre et servir ceux qui cherchent *leur* valeur | B2 puis A/C en bas de page ; le portrait D avec son explorateur en dernier |

La refonte du Baromètre France Num est un martini glass : quatre repères et une phrase, le
parcours par chapitre, l'explorateur comparatif en dernier. Ses trois « directions » de maquette
n'étaient pas un choix à faire mais trois étages d'un même dispositif.

## Le plan type

| Étage | Rôle | Forme | Geste |
|---|---|---|---|
| **Chapô** | la question et la réponse en deux phrases | texte | `<p class="fr-text--lead">` |
| **Accroche** | trois ou quatre chiffres qui portent le message, de poids **différents** | KPI | `dsfr-data-kpi-group per-row="4"` ; le principal en `span="6"`, avec `lines` (tendance ou référence) |
| **Preuve** | le graphique qui montre le message principal, une série mise en évidence | un seul graphique, pleine largeur | `databox-title` = le message ; `selected-palette="neutral"` + `highlight-index` ou `color-map` |
| **Nuance** | ce qui contredit ou limite : « mais pas partout », « sauf chez… », la dispersion derrière la moyenne | petits multiples, barres groupées, carte | motif un graphique par ligne (`dsfr-data-display`), `type="bar" series-field` |
| **Exploration** | ce qui est vrai et ne sert pas l'argument | tableau triable, filtres, carte cliquable | `dsfr-data-list sort search count-label`, `dsfr-data-facets`, `refine-on-click` |
| **Conclusion** | ce qu'il faut retenir, en trois phrases, et ce qui manque | texte encadré | `fr-callout` |
| **Notes** | les hypothèses éditoriales, les angles écartés, la source de chaque chiffre | liste numérotée | `<section id="hypotheses">` |

Chaque étage peut manquer, sauf trois : l'accroche, la preuve, la conclusion. Une page qui n'a
que des preuves est un tableau de bord ; une page qui n'a que des accroches est une affiche.

## Le test des titres seuls

Lire les titres des blocs sans les graphiques. S'ils forment un résumé cohérent, la structure
tient :

> Un licencié sur trois est une femme · Depuis 2016, les licences féminines progressent deux fois
> plus vite · Le rattrapage se joue chez les moins de 15 ans · Dans dix départements, la parité
> est atteinte · Ce qu'il faut retenir

S'ils forment une liste de champs (« Par sexe · Par âge · Par département »), on a l'ordre des
colonnes du jeu, pas un argument. Revenir à [trouver-l-histoire](trouver-l-histoire.md).

## Transitions : la phrase avant le graphique

Le gabarit B2 ouvre chaque section par sa **phrase de lecture** — la thèse, avant le graphique :

```html
<h2>2. Le rattrapage se joue chez les moins de 15 ans</h2>
<p class="fr-text--lead">Chez les adultes, la part des femmes n'a pas bougé depuis 2016 ;
  chez les jeunes, elle a gagné neuf points.</p>
<dsfr-data-chart …></dsfr-data-chart>
```

Les mots de transition sont ceux de l'argument : « mais », « en revanche », « sauf », « à une
exception près », « ce que la moyenne cache ». Un bloc qui commence par « Répartition par… » n'a
pas de transition parce qu'il n'a pas d'argument.

## Où vont les filtres dans un récit

- **Martini glass** : les filtres arrivent **après** la partie guidée, quand le lecteur sait quoi
  chercher. Un filtre en haut d'un récit demande de choisir avant d'avoir compris.
- **Portrait (D)** : un seul sélecteur en bandeau pilote toute la page, dès le haut — c'est
  l'entité choisie qui *est* le récit, et le titre la reprend (`dsfr-data-context-value
  template="{{federation}}" fallback="Choisissez une fédération"`).
- **Tableau de bord (B2)** : la barre collante est légitime ; elle ne remplace pas le chapô ni
  la conclusion.

Règle unique de placement (barre ou colonne, combien de filtres) : `pagePatterns`.

## La conclusion : ce qu'il faut retenir

Trois phrases, pas dix, dans un `fr-callout` : le message principal, la nuance, ce que la donnée
ne permet pas de dire. Puis la porte de sortie : l'export, le lien vers le jeu, le tableau
complet. Une page sans conclusion laisse le lecteur décider seul ce qu'il a vu — et il retient le
dernier graphique, qui est en général le moins important.

## Exemple : squelette d'une page narrative (famille D2, portrait)

```html
<div class="fr-container">
  <!-- Bandeau : le sélecteur d'entité, le titre qui le reprend -->
  <dsfr-data-context id="ctx"></dsfr-data-context>
  <h1><dsfr-data-context-value for="ctx" template="{{fede}} : le portrait 2024"
    fallback="Portrait d'une fédération sportive" live></dsfr-data-context-value></h1>
  <p class="fr-text--lead">Chapô : la question, la réponse.</p>

  <!-- Accroche : quatre repères, le principal plus large -->
  <dsfr-data-kpi-group per-row="4" gap="md">
    <!-- source « serie » : la fédération, ordonnée 2016-2024 ; `last` = 2024, `evolution` = depuis 2016 -->
    <dsfr-data-kpi source="serie" value="lics:last" format="compact" span="6"
      heading="Licences 2024" lines='[{"value":"lics:evolution","sign":true,"suffix":"depuis 2016"}]'></dsfr-data-kpi>
    <dsfr-data-kpi source="fede-2024" value="lics:sum{sexe:eq:F} / lics:sum" format="pourcentage"
      heading="Part des femmes" lines='[{"text":"Groupe : voir la ligne de référence"}]'></dsfr-data-kpi>
  </dsfr-data-kpi-group>

  <h2>1. La preuve</h2><p class="fr-text--lead">Phrase de lecture.</p>
  <dsfr-data-chart id="g1" … databox databox-title="Titre-message" heading-level="3"></dsfr-data-chart>
  <dsfr-data-a11y for="g1" source="…" description="Le message, et ce qui manque."></dsfr-data-a11y>

  <h2>2. La nuance</h2> <!-- petits multiples ou barres groupées -->
  <h2>3. Explorer</h2>  <!-- tableau triable, export -->

  <div class="fr-callout"><h2 class="fr-callout__title">Ce qu'il faut retenir</h2>
    <p class="fr-callout__text">Trois phrases.</p></div>
  <section id="hypotheses"><h2>Notes — les hypothèses éditoriales</h2><ol>…</ol></section>
</div>
```

Le `lines` du second KPI reçoit un `text` statique : la valeur du groupe, quand elle vient d'un
autre jeu, se calcule dans la donnée (jointure) et se rend dans un gabarit `dsfr-data-display`,
pas dans un littéral qui vieillit. `dsfr-data-kpi description` est lu par les lecteurs d'écran
seulement : une référence visible passe par `lines` ou par un `<p>` sous le KPI.

## Pièges

- **L'exploration avant la synthèse** : le lecteur arrive sur douze filtres et repart.
- **Douze KPI de même poids** : voir [anti-patterns](anti-patterns.md).
- **Le dernier graphique posé là parce qu'il restait une colonne** : il devient la conclusion
  par défaut.
- **Une section par colonne du jeu** : c'est l'ordre du CSV, pas un plan.
- **Le titre de section descriptif** (« Évolution ») : le test des titres seuls échoue.
