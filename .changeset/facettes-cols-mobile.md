---
'dsfr-data': patch
---

fix(facets) : le colonnage `cols` se replie enfin sur téléphone

`cols` émettait une classe de colonne DSFR sans variante de point de rupture (`fr-col-3`). Or le
DSFR définit `.fr-col-N` hors de toute media query : `cols="3"` valait 25 % de la ligne à 320 px
comme à 1440 px, soit 76 px par facette sur téléphone, 60 px utiles pour un menu déroulant. Les
facettes émettent désormais `fr-col-12 fr-col-md-N` : pleine largeur sous 768 px, largeur demandée
au-dessus, comme `dsfr-data-display` et `dsfr-data-kpi-group`.

Rien ne change au-dessus de 768 px, ni sans l'attribut `cols` (grille automatique, déjà repliable).
Effet assumé : une page qui posait `cols="6"` pour obtenir deux facettes par ligne sur téléphone
aussi en affiche désormais une par ligne sous 768 px, comme le prévoit la grille DSFR. Le palier
intermédiaire relèvera de l'échelle responsive (#789).
