---
'dsfr-data': minor
---

Lecture stricte des nombres (#1200) — **changement de comportement** :

- `toNumber(v, true)`, utilisé par les agrégats, `normalize numeric`, le graphique et le KPI, refuse désormais une chaîne qui n'est pas ENTIÈREMENT un nombre : « 2026-09-25 », « 2024-09 » ou « 75A » deviennent absents (`null`) au lieu de 2026, 2024 ou 75. Un symbole d'unité final reste accepté (« 45,2 % », « 12 € »).
- `dsfr-data-query` : `min` et `max` passent par le même calcul que le KPI. Une colonne de dates ISO ou de mois `AAAA-MM` rend la date ou le mois extrême (ordre chronologique), jamais l'année.
- `dsfr-data-normalize` : nouvel attribut `numeric-prefix` pour lire EXPRÈS le nombre de tête d'une valeur (« 1922-1930 » → 1922) ; nouvelle fonction `toLeadingNumber` dans `@dsfr-data/shared`.

Résout les constats BUG-023 et BUG-032 du banc d'essai.
