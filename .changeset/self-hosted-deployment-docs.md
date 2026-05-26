---
'dsfr-data': patch
---

docs(self-hosted): section dédiée + annotations DÉSACTIVABLE sur les routes nginx (closes #168 P4+P6, PR-5 du plan de découpage).

Clôt l'épic [#168 (self-hostable)](https://github.com/bmatge/dsfr-data/issues/168) avec deux livrables :

**`docs/DEPLOYMENT.md` — section "Configuration self-hosted"** couvrant les 3 scénarios :
- A. Déploiement de référence (Traefik intégré, rien à configurer au-delà de `APP_DOMAIN`).
- B. Derrière un proxy d'entreprise (`HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` build + runtime — résumé des PR-2 et PR-4).
- C. Reverse externe gérant les routes `/*-proxy/` (commenter les blocs concernés + déclarer le chemin équivalent dans le reverse externe).

Le **contrat exhaustif des chemins de proxying** (`/grist-gouv-proxy/`, `/grist-proxy/`, `/albert-proxy/`, `/ia-proxy`, `/ia-server-config`, `/ia-proxy-default`, `/insee-proxy/`, `/tabular-proxy/`, `/cors-proxy`) est fourni sous forme de tableau : cible upstream, méthodes acceptées, politique de cache, headers CORS attendus, particularités (strip Origin/Referer, paires obligatoires…).

**Annotations dans `docker/nginx.conf` + `docker/nginx-db.conf`** : chaque bloc `location /*-proxy/` reçoit un commentaire `DÉSACTIVABLE` (3-4 lignes) avec la cible upstream et un renvoi vers la section du contrat dans `docs/DEPLOYMENT.md`.

**Références ajoutées** depuis `README.md` (paragraphe "Déployer la webapp") et `CLAUDE.md` (section "Déploiement serveur") vers la nouvelle section.
