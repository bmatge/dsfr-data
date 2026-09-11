---
'dsfr-data': minor
---

feat(chart) : résumé des cartes pondéré (`map-summary-weight`) ou fourni par la page (`map-summary-value`)

Une carte (`type="map"` et ses variantes) affiche sous son titre une valeur de synthèse. C'était la
**moyenne non pondérée** des valeurs territoriales, calculée par `dsfr-data-chart` et non par DSFR
Chart, qui se contente d'afficher ce qu'on lui passe. Pour un taux, ce n'est pas le taux national
dès que les territoires ont des tailles différentes. Le banc d'essai l'a mesuré sur trois pages en
production : 4,27 % affiché pour 5,6 % réel sur les collèges (−24 %), 14,96 % pour 19,3 % sur les
lycées (−22 %), et −1,6 % seulement sur les écoles, là où le taux est homogène et le défaut
invisible.

- `map-summary-weight="nb_eleves"` rend la moyenne **pondérée** Σ(valeur × effectif) / Σ(effectif).
  Pondérer un taux par son dénominateur rend exactement le rapport des deux sommes.
- `map-summary-value="5,6"` reprend une valeur nationale publiée par ailleurs, qui fait autorité.
  Elle prime sur la pondération.
- Une valeur non numérique, ou un champ d'effectif absent de toutes les lignes, est une erreur de
  configuration, et aucun résumé n'est affiché plutôt qu'un chiffre faux.

Le calcul par défaut reste la moyenne non pondérée, désormais documentée avec son piège. Il ne porte
plus que sur les lignes **dessinées** : une ligne au code géographique invalide, ignorée par la
carte, pesait encore dans son résumé.

Résout le constat LIM-014 du banc d'essai (#763).
