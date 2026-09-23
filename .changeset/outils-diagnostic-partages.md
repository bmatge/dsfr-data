---
'dsfr-data': minor
---

Outils de diagnostic partagés par les assistants (#1010, ADR-143) : `run_and_trace`, `trace_pipeline` et `inspect_stage` quittent le studio pour `@dsfr-data/shared` (app-side), et un quatrième outil, `lister_constats`, rend au modèle les constats du diagnostic en texte français (id, gravité, cause, geste, preuve, repères). Sous « masquer les valeurs », la preuve de chaque constat est masquée. Le studio IA propose ce nouvel outil à son assistant.
