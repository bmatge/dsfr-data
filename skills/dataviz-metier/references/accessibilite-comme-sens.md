# L'accessibilité comme sens, pas comme conformité

> Le tableau équivalent est une lecture : ses colonnes ont des noms, ses lignes un ordre, ses nombres un format ; la description dit le message ; les titres structurent ; une seule région live parle. RGAA par `dsfr-data-a11y`, mais lu comme un lecteur.
>
> Déclencheurs : tableau équivalent, lecture accessible, lecteur d'écran, RGAA, a11y, description du graphique, alternative textuelle, format long, une colonne par série, région live, niveau de titre, décimales du tableau, csv complet
>
> Niveaux : avancé

## Ce que l'original n'a pas

Les graphiques des portails Opendatasoft sont des `<canvas>` sans alternative textuelle. Une
balise `dsfr-data-a11y for="g" source="q" table download` pose sous chaque graphique le tableau
équivalent, l'export CSV, un lien d'évitement et `aria-describedby` / `aria-details` (AV-001,
présent sur toutes les pages du banc). C'est l'un des trois avantages nets de la bibliothèque.
Il ne vaut que si le tableau **se lit**.

## Le tableau doit raconter la même chose que le graphique

| Ce qui fait une lecture | Geste | Ce que le banc a vu |
|---|---|---|
| **Les colonnes ont un nom** | l'en-tête reprend le **nom du champ** (vérifié 2026-09-19 : « an », pas l'alias) → nommer dans la donnée (`select="year(annee) as annee"`, `dsfr-data-normalize rename`) | un en-tête `n__sum` |
| **Les lignes ont un ordre** | `order-by="valeur:desc"` sur la query lue par le graphique **et** le tableau (même `source`) | un tableau dans l'ordre d'arrivée sous un graphique trié |
| **Les nombres sont lisibles** | fr-FR au plus deux décimales, `decimals="1"` (0.22.0, AM-033) | « 2.2665920000000006 » |
| **Une année n'est pas un nombre** | garder les millésimes en **texte** : un `an` numérique est rendu « 2 022 » avec séparateur de milliers (vérifié 2026-09-19) | « 2 024 » |
| **Une série = une colonne** | `series-field="serie"` posé aussi sur `dsfr-data-a11y` (0.33.0, AM-082) : le tableau pivote, une colonne par série « Fédération / Groupe / Toutes ». Avant : `dsfr-data-pivot row="an" column="serie" value="v"` (vérifié 2026-09-19, 0.30.0) | une ligne par (année × série) sans colonne de série |
| **Le groupe vide est nommé** | `empty-label="Non renseigné"` sur `dsfr-data-a11y` (0.33.0, AM-085) : le tableau dit ce que l'axe montre. Avant 0.33 : cellule vide (vérifié 0.30.0) → `compute="cat_txt = when is_null(cat) then 'Non renseigné' else cat"` | une première ligne « \| \| 2.36 » |
| **Le tableau est complet ou dit qu'il ne l'est pas** | plafond de **100 lignes**, signalé à l'écran ; le CSV reste complet (LIM-012) | 100 `tr` pour 119 lignes annoncées |

## Avec DataBox : un seul tableau

Si le graphique porte `databox`, la DataBox fournit déjà le basculement graphique / tableau et
l'export. Ne pas poser `table` ni `download` sur `dsfr-data-a11y` : garder `for` + `source` +
`description`. Deux tableaux du même graphique, c'est deux lectures qui peuvent diverger.

## La description dit le message

`description="…"` est lue par les lecteurs d'écran via `aria-describedby`. Écrire ce qu'un
lecteur voyant retient en trois secondes — l'ordre de grandeur, le premier, l'écart, ce qui
manque — et non « graphique en barres de la répartition par région ». Voir
[annotation](annotation.md).

## La structure vient des titres, pas des composants

- `heading-level="2"` sur un `dsfr-data-chart databox` quand le graphique est une section
  (#670) : le titre de la DataBox est un `<h3>` par défaut.
- Un `dsfr-data-display` enveloppe toujours son rendu d'un `role="region"` « Liste de
  résultats », d'un `<p role="status">N resultats</p>` et d'une pagination : juste pour une liste
  de résultats, **un contresens pour un rapport** de graphiques répétés (ADR-135). Sur un
  rapport, la structure vient des `<h2>` / `<h3>` de l'auteur ; le compteur « 10 resultats »
  sans accent ni séparateur n'a pas d'attribut pour être nommé ou masqué (AM-044) — le dire en
  page plutôt que le cacher en CSS sans le dire.
- **Une seule région live par chaîne** : le compte de résultats est annoncé par le seul
  composant terminal (`dsfr-data-list`, `dsfr-data-display`) ; `dsfr-data-search` se tait quand
  l'un d'eux est en aval (#654). `dsfr-data-context-value live` sur **un** élément. Plusieurs
  libellés qui parlent en même temps sont un bruit, pas une conformité.

## La couleur n'est jamais seule

Une part saumon annoncée « bleu ciel » par sa pastille (BUG-016) n'était pas qu'un défaut
visuel : la légende est la seule identité de série pour qui ne distingue pas les couleurs. La
règle du skill `dataviz` (légende toujours présente dès deux séries, labels directs, jamais
rouge/vert seuls) vaut ici ; le geste est de **comparer** pastilles et barres à la relecture.
