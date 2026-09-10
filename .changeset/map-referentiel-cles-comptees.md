---
"dsfr-data": patch
---

Cartes `map-reg` et `map-aca` : les clés hors du référentiel de DSFR Chart sont désormais comptées par `getSkippedCount()` et remontées dans la console et le volet Diagnostic, au lieu de disparaître en silence. Les noms d'académies accentués ou préfixés (« Académie de Besançon ») et les codes INSEE de région (`11`, `84`) sont traduits vers les clés attendues (`BESANCON`, `IDF`, `ARA`) (#729).
