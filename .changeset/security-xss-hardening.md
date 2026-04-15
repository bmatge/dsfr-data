---
"dsfr-data": patch
---

Durcissement XSS et sanitization dans les composants et adapters (triage baseline sécurité, code-scanning CodeQL + Semgrep) :

- **ODS adapter** : échappement ODSQL désormais safe sur les backslashes (`\\` → `\\\\`) avant les doubles quotes, pour éviter qu'un `\"` utilisateur soit traité comme un quote déjà échappé.
- **dsfr-data-search** : même fix sur l'échappement du terme de recherche envoyé via server-search.
- **dsfr-data-normalize** : `stripHtml` boucle désormais jusqu'à stabilisation pour couvrir les patterns imbriqués type `<a<b>c>`.
- **Preview template (`cdn-versions`)** : le strip des balises `<script ... dsfr-data ...>` utilise un regex linéaire (non-polynomial) et boucle jusqu'à stabilisation.
- **Modal (`confirmDialog`)** : le message est désormais inséré via `textContent`, plus d'interpolation `innerHTML`.
- **Product tour** : titre/description des steps insérés via `textContent`.
