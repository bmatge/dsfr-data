---
"dsfr-data": minor
---

feat(proxy): route les API tierces à clé en en-tête via le proxy CORS générique

Une connexion API manuelle vers un hôte inconnu (ex. une instance OpenDataSoft
comme `data.economie.gouv.fr`) avec une clé en en-tête (`Apikey`, `Authorization`…)
échouait à l'enregistrement avec « CORS Missing Allow Header ». L'en-tête custom
rend la requête « non-simple » et déclenche un preflight `OPTIONS` que l'API
distante ne sait pas honorer, car la requête partait en direct du navigateur
(`getProxiedUrl` ne réécrivait que les hôtes connus).

Nouveau helper `buildProxiedRequest(url, headers)` qui renvoie `{ url, headers }`
et route les hôtes inconnus cross-origin via le proxy CORS générique
(`/cors-proxy` + en-tête `X-Target-URL`), où c'est nginx (côté serveur) qui
transmet l'en-tête custom à la cible. Les hôtes connus (Tabular, Grist, Albert,
INSEE) gardent leurs proxies dédiés ; le same-origin reste en fetch direct.
Le gestionnaire de connexions API (test à l'enregistrement + chargement paginé)
utilise désormais ce helper. Le preflight `/cors-proxy` (nginx + dev Vite)
autorise les en-têtes custom arbitraires.
