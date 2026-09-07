---
'dsfr-data': minor
---

Le bus publie de quoi diagnostiquer une chaine sans ouvrir les DevTools (#603).

Trois ajouts optionnels, non cassants — le message des `Error` et le contrat
des abonnes existants sont strictement inchanges :

- `attemptedUrl` sur l'evenement `dsfr-data-error` : l'URL reellement appelee,
  proxy applique. Le diagnostic de #598 existait deja mais uniquement en
  console ; il devient exploitable par une interface.
- `origin` sur `dsfr-data-source-command` : le bus etant plat, une trace ne
  pouvait pas dire quel composant demandait une delegation a la source.
- `dsfr-data-query.getDelegation()` : quelles operations tournent cote serveur
  et lesquelles sont retombees cote client — un `group-by` non delegue
  s'execute sur les seules lignes rapatriees.
