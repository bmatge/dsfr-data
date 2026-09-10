---
"dsfr-data": minor
---

`dsfr-data-kpi` gagne les attributs `decimals` (nombre de décimales affichées : `format="euro" decimals="3"` → « 1,749 € ») et `unit` (suffixe après une espace insécable : `format="compact" unit="€"` → « 44,9 Md € »), aussi disponibles sur chaque ligne de `lines` ; `formatValue(value, format, { decimals, unit })` accepte ces options (défauts inchangés) et `formatNumberFr()` formate un nombre fr-FR avec un plafond de décimales. La grammaire `format="euro:3"` est refusée avec une erreur de configuration orientant vers `decimals` (#665).
