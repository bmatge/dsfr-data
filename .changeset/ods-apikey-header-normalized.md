---
"dsfr-data": patch
---

OpenDataSoft : un en-tête `apikey` (ou `x-api-key`, `api-key`) passé via `headers` est réécrit à l'exécution en `Authorization: Apikey <clé>`, seule forme acceptée par ODS en préflight CORS — en mode `api-type="opendatasoft"` comme en mode URL sur un hôte ODS ; la documentation prescrit désormais `api-key-ref` + `window.DSFR_DATA_KEYS` ou `Authorization: Apikey` (#655).
