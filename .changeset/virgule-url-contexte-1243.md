---
'dsfr-data': patch
---

`dsfr-data-context` : une valeur qui contient une virgule survit au rechargement de l'URL sur **toutes** les surfaces du contexte — suite du constat BUG-031 du banc d'essai, déjà résolu pour `dsfr-data-facets` en 0.45.0 ([#1243](https://github.com/bmatge/dsfr-data/issues/1243)).

Le contexte découpait tout paramètre d'URL sur les virgules, quel que soit le filtre qui le lisait. La grammaire posée pour les facettes (virgule en `%2C`, pourcent en `%25`, blancs de tête et de queue en percent) est désormais la seule, partagée par les quatre surfaces ; c'est le filtre, et non plus le contexte, qui décode son paramètre.

- **`dsfr-data-context-filter`, `in` sur une liste à choix multiple.** Une option cochée est une valeur, virgule comprise. « 1,5 » filtrait sur « 1 » et « 5 » dès la clause, avant même le rechargement — six lignes au lieu de trois. L'URL s'écrit `?note=1%252C5` ; un lien ancien à virgule nue est recollé contre les options de la liste (un morceau inconnu est prolongé jusqu'à former une option), et `?note=1,5` reste deux valeurs quand « 1 » et « 5 » sont des options. Changement de comportement : une option dont la `value` porte une virgule n'est plus lue comme plusieurs valeurs.
- **`dsfr-data-context-filter`, valeur unique** (`eq`, `contains`, comparaisons, dates). Le paramètre entier est la valeur. « Paris, France » revenait en « Paris,France », ne retrouvait plus son option, et le filtre disparaissait sans un mot. Le tag ne lit plus la virgule comme un séparateur (« 1, 5 à 2 parcours »).
- **`dsfr-data-context-filter`, `between`.** Chaque borne est échappée ; une borne vide reste vide (`?prix=,20`).
- **`dsfr-data-context-filter`, `in` sur un champ texte ou une liste simple.** Inchangé : `|` et `,` séparent. Une virgule dans une valeur s'y écrit `%2C`, comme dans l'URL — et dans `default`.
- **Sélection au clic** (`refine-on-click` avec `context`, sur `dsfr-data-list`, `dsfr-data-display` et `dsfr-data-map-layer`). Seul le premier morceau était gardé : « 1,5 à 2 parcours » revenait en « 1 », zéro ligne.
- **`dsfr-data-search` en mode `context`.** Le terme relu perdait le blanc qui suit une virgule : « Paris, France » revenait en « Paris,France ».

**Liens déjà partagés.** Un lien sans virgule dans ses valeurs se relit à l'identique, et s'écrit sous la même forme. Un lien à virgule nue écrit par une version antérieure : pour une valeur unique (filtre, sélection, recherche), il se relit désormais tel qu'il a été écrit — il était cassé ; pour une liste, il reste lu morceau par morceau, sauf recollage contre les options d'une liste à choix multiple. Seule régression possible, la même que pour les facettes : un ancien lien dont une valeur porte littéralement une séquence percent valide (`%2C`, `%25`, `%20`) est désormais décodé.

`dsfr-data-facets` ne change pas : sa grammaire a seulement été déplacée dans un module commun.
