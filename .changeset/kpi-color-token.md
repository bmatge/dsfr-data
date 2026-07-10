---
'dsfr-data': patch
---

`dsfr-data-kpi` : nouvel attribut canonique `color-token` (token sémantique DSFR
`vert|orange|rouge|bleu`), remplaçant `color` dont le nom évoquait l'attribut de
présentation HTML déprécié (faux positif d'audit RGAA 10.1.2). `color` reste
supporté comme alias déprécié (warning console, retrait prévu à la prochaine
version majeure) ; `color-token` prime quand les deux sont présents. Doc,
exemples et skill builder-IA migrés (#367).
