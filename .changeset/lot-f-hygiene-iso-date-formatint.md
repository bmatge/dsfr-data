---
'dsfr-data': patch
---

Hygiène interne (revue du 2026-09-13, lot F) : une seule définition de la forme « date ISO » dans `@dsfr-data/shared` (`isIsoDateString`, jusqu'ici recopiée dans les agrégations et le pivot), formatage des entiers du volet Diagnostic sans expression régulière à anticipation, et regex linéaires justifiées dans la carte et ses encarts. Aucun changement de comportement.
