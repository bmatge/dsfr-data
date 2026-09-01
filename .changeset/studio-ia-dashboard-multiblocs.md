---
'dsfr-data': minor
---

Studio IA (#515, étape 2) : nouvelle app `apps/studio` — assistant de composition de dashboards multi-blocs (chat + aperçu vivant). Le LLM édite le document par actions incrémentales batchables (add_blocks/update_block/remove_block/move_block/set_page/reset_document) validées par diagnostic ; l'aperçu est la page exportée elle-même (iframe srcdoc) ; le document s'enregistre dans les dashboards partagés. Promotions dans `@dsfr-data/shared` : data-tools (introspection), skill-matching (#514, source unique), vocabulaire/schéma JSON de la ChartConfig — le builder-IA les re-exporte sans changement d'API.
