---
'dsfr-data': minor
---

dsfr-data-kpi : carte enrichie « baromètre ».

- Nouvel attribut `heading` : titre affiché AU-DESSUS de la valeur (surtitre).
- Nouvel attribut `lines` (JSON) : lignes secondaires déclaratives rendues entre
  la valeur et le `label`. Chaque ligne est data-driven (`value="champ:fn"`) ou
  texte statique (`text`), avec `sign`, `prefix`/`suffix`, `color` (`"auto"` =
  vert si ≥0 / rouge si <0, token DSFR, ou couleur CSS) et repli `na` si la
  valeur n'est pas finie. Permet la ligne d'évolution type « +92,5 % vs mai 2025 ».
- Fix : `computeAggregation` gère désormais une source mono-objet (un seul
  enregistrement) — l'agrégation renvoyait `null`, donc la valeur s'affichait
  mais pas la tendance/les lignes agrégées (cas typique d'un baromètre).
- Le raccourci hérité `trend`/`tendance` (flèche `↑ 5,2 %`) reste fonctionnel ;
  `lines` est désormais la voie recommandée.
- Une expression `trend` ou un JSON `lines` invalide est signalé via
  `data-dsfr-config-error` au lieu de disparaître en silence.
