---
"dsfr-data": patch
---

Facettes : le tri des valeurs adopte la grammaire `critere:sens` de `order-by` (`sort="count:desc"` par défaut, `count:asc`, `alpha:asc`, `alpha:desc`) ; `count` et `alpha` restent des raccourcis, `-count` / `-alpha` sont dépréciés (comportement inchangé, avertissement console) (#645).
