---
'dsfr-data': patch
---

Retrait de la cible desktop Tauri (ADR-070, #403) : suppression de `src-tauri/`, du workflow « Release Tauri » et de l'export interne `isTauriMode()` de `@dsfr-data/shared` (le proxy ne distingue plus que dev/production). Aucun composant `dsfr-data-*` n'est affecté ; les binaires desktop historiques restent sur les releases GitHub jusqu'à v0.16.0.
