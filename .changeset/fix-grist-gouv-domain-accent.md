---
"dsfr-data": patch
---

fix(grist): restaure le domaine ASCII `grist.numerique.gouv.fr` dans le routage proxy

La passe d'accentuation automatique (#214) avait accentué par erreur le nom de domaine en `grist.numérique.gouv.fr` dans les comparaisons de hostname (`getProxiedUrl`, `getProxyUrl`, provider Grist, test de connexion). Comme le vrai domaine est ASCII, la comparaison échouait silencieusement : les requêtes vers grist.numerique.gouv.fr ne passaient plus par le proxy `/grist-gouv-proxy/` mais partaient en direct depuis le navigateur → erreur CORS (`authorization` non autorisé en préflight). Le domaine est désormais ajouté en exception du check d'accents pour éviter toute régression.
