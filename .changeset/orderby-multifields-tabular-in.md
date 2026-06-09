---
'dsfr-data': patch
---

`order-by` multi-champs réparé sur ODS et Tabular (#273) : `parseOrderBy()` partagé applique la même grammaire `"field:dir, field2:dir2"` sur les 3 adapters serveur — ODS ne transformait que le dernier segment (ODSQL invalide), Tabular produisait un tri malformé. L'opérateur `in` des facettes multi-sélection est désormais traduit côté Tabular (liste à virgules de l'API au lieu du `|` interne).
