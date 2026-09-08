---
'dsfr-data': patch
---

Un proxy mal configuré se signale, au lieu de se déguiser en problème de CSP.

Quand `VITE_PROXY_URL` ne pointe pas sur l'origine qui sert la page, chaque appel
sort de `connect-src 'self'` et se fait bloquer. La console n'affiche alors que des
erreurs *Content-Security-Policy*, si bien qu'on soupçonne la CSP — qui fait pourtant
exactement son travail.

Cas réel : une instance servie depuis `x.lab.exemple.fr` avec
`VITE_PROXY_URL=https://x.exemple.fr`, un sous-domaine oublié. Toutes les connexions
de sources échouaient en `NetworkError`, et la piste suivie a été celle des en-têtes
de sécurité.

`getProxyConfig` avertit désormais une fois par page, en nommant les deux origines et
la variable à corriger. Uniquement sur la branche build-time : les widgets embarqués
sur un site tiers configurent leur proxy par attribut `proxy-url` ou
`window.DSFR_DATA_PROXY`, et le cross-origin y est la configuration voulue.

Il avertit, il ne corrige pas — basculer d'autorité sur l'origine de la page
masquerait une configuration fausse et casserait les déploiements où les domaines sont
séparés à dessein (`VITE_PROXY_URL_EMBED`).
