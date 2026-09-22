---
'dsfr-data': patch
---

Transport IA commun au Studio et à l'Assistant IA (#998) : `@dsfr-data/shared` porte désormais la seule implémentation des appels au modèle (`/ia-proxy-default` et `/ia-proxy`, nouvelle tentative sur 429 selon `Retry-After` plafonné à 10 s, sinon après 1 s, 2 s et 4 s, trois nouvelles tentatives au plus), la lecture des capacités Albert et un seul cache de `/ia-server-config`. `resolveTransport()` rend `{ mode, post, model, capacites }`. La clé de configuration `dsfr-data-ia-config` ne change pas. Dans l'Assistant IA, le délai maximal d'une requête passe de 30 s à 45 s sur tous les chemins. Les erreurs du Studio reprennent les messages HTTP en français de l'Assistant IA.
