---
'dsfr-data': patch
---

build(docker): permet `docker compose build` derrière un proxy d'entreprise (`HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` passés au builder) et élargit la CSP nginx aux domaines réellement utilisés en self-hosted.

**Proxy build-time** (P2) : `ARG`/`ENV` `HTTP_PROXY` + `HTTPS_PROXY` + `NO_PROXY` ajoutés au stage builder des deux Dockerfiles, propagés via `build.args` dans les deux docker-compose. Build-time strict (pas d'ENV runtime — pas de pollution de l'image finale). Le runtime côté Node sera traité dans PR-4 de l'epic.

**CSP self-hostable** (P5) : `docker/security-headers.conf` autorisait `cdn.jsdelivr.net` + `*.opendatasoft.com` + 5 APIs IA, mais bloquait toutes les tuiles cartes (IGN, OSM-FR) et tous les portails open data gouvernementaux non-ODS (`data.economie.gouv.fr`, `tabular-api.data.gouv.fr`, `api.insee.fr`, etc.). Ajout ciblé : `data.geopf.fr` + `*.tile.openstreetmap.fr` dans `img-src`, wildcard `*.gouv.fr` dans `connect-src`, `unpkg.com` (alt CDN pour `VITE_LIB_URL`) dans script/style/font-src. Renforcement durcissement : `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`.

PR-2 de l'epic #168 (rendre dsfr-data self-hostable).
