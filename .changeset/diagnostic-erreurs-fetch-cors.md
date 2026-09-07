---
'dsfr-data': patch
---

Diagnostic des erreurs de chargement masquées par CORS.

Quand une API répond une erreur HTTP sans en-tête `Access-Control-Allow-Origin`, le navigateur
interdit la lecture de la réponse et `fetch` rejette avec un `TypeError` générique : le statut et le
corps, qui portent le vrai diagnostic, sont perdus. `dsfr-data-source` ne remontait qu'un
« NetworkError » inexploitable.

Le log console nomme désormais l'URL réellement appelée, distingue les deux causes possibles (erreur
HTTP masquée ou requête non aboutie), propose la commande `curl` correspondante et rappelle que
`use-proxy` / `proxy-url` rendent la réponse d'erreur lisible. L'objet `Error` remonté aux
consommateurs (événement `data-error`, template de statut) est inchangé.
