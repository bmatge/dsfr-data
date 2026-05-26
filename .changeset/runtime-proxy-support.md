---
'dsfr-data': patch
---

build: honore `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` au runtime côté Node (closes #168 P3, PR-4 du plan de découpage).

Les services Node embarqués dans le conteneur (`scripts/ia-default-server.js` qui proxifie l'API Albert, et `mcp-server` qui télécharge `skills.json` au démarrage) acheminent désormais leurs appels HTTP sortants via le proxy d'entreprise quand `HTTP_PROXY` ou `HTTPS_PROXY` est défini au niveau du service docker-compose. `NO_PROXY` est honoré (hostnames Docker internes comme `mariadb` ou `mailserver` peuvent y être listés).

**Implémentation** : `undici.EnvHttpProxyAgent` installé comme dispatcher global au démarrage, **uniquement** si une variable proxy est présente. Sans variable, aucun dispatcher n'est touché — comportement strictement inchangé. Le module `undici` (zéro dépendance runtime) est ajouté aux Dockerfiles via `COPY --from=builder /app/node_modules/undici`.

**Refactor `ia-default-server.js`** : passage de `http.request`/`https.request` à `undici.request` pour bénéficier du dispatcher global. Le streaming de la réponse vers le client reste identique (`upstream.body.pipe(res)`).

**docker-compose** : les variables `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` étaient déjà propagées au `build.args` depuis PR-2 ; elles sont maintenant également exposées dans `environment:` pour le runtime du conteneur.

`.env.example` et `docs/DEPLOYMENT.md` mis à jour pour refléter la portée build + runtime.
