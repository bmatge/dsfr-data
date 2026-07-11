---
'dsfr-data': patch
---

SSO silencieux OIDC (`prompt=none`, #365) : si un provider OIDC est configuré
et que la session IdP est active, l'utilisateur est loggué sans clic au
chargement de l'app (une tentative max par session navigateur, aucun message
en l'absence de session IdP). Le callback revient sur la page d'origine via
un `return_to` strictement validé (chemin relatif uniquement). Désactivable
côté app via `initAuth({ silentSso: false })`.
