# Relais cachable — relais Node de référence

Implémentation de référence du **contrat du relais** ([`docs/RELAY.md`](../../../docs/RELAY.md),
ADR-155). Le navigateur demande `<relais>/<hôte>/<chemin>?<requête>` à votre site ; le relais va
chercher `https://<hôte>/<chemin>?<requête>` et rend la réponse avec des en-têtes de cache.

- Modules `node:` seuls : **aucune dépendance**, rien à installer. Node 22 ou plus récent.
- Lecture seule (GET, HEAD, OPTIONS), hôtes d'une **liste blanche exacte**, clé détenue par le relais.
- **Ce n'est pas un proxy ouvert**, et il ne remplace pas `/cors-proxy` (voir le contrat, §1).

> ⚠️ **Une clé confiée au relais rend public tout ce qu'elle sait lire sur l'hôte autorisé.**
> Le relais répond à n'importe qui, sans authentification. Une clé injectée exige une clé en
> lecture seule et une liste de préfixes de chemin autorisés (`pathPrefixes`) : le relais refuse
> de démarrer sans. Détail : [`docs/RELAY.md` §3](../../../docs/RELAY.md).

## Lancer

Sans fichier, pour des portails ouverts :

```bash
RELAY_HOSTS=donnees.portail.example,autre.portail.example node proxy/relay/node/server.mjs
```

Avec un fichier ([`relay.config.example.json`](relay.config.example.json)) et une clé :

```bash
RELAY_CONFIG=./relay.config.json \
RELAY_KEY_PORTAIL_PRIVE="$(cat /chemin/vers/le/secret)" \
node proxy/relay/node/server.mjs
```

La clé se lit dans la variable d'environnement que nomme le fichier (`key.env`). Elle ne s'écrit
jamais dans le fichier, et le relais ne l'affiche nulle part.

Le relais écoute sur `127.0.0.1:8155` et répond sous `/donnees-relais/`. Il **refuse de démarrer**
si la liste blanche est vide, si un hôte est un joker ou une adresse IP, si une clé n'a pas de
préfixe de chemin, ou si le fichier contient un champ qu'il ne connaît pas.

```bash
curl -i http://127.0.0.1:8155/donnees-relais/donnees.portail.example/api/explore/v2.1/catalog/datasets
curl http://127.0.0.1:8155/health
```

## Devant le relais

Le relais se place **derrière** le serveur web du site, qui lui transmet `/donnees-relais/`, porte
le cache partagé, la compression et le TLS. Déclarer l'adresse de ce serveur dans
`trustedProxies` : sinon toutes les requêtes viennent de la même adresse et la limite de débit
devient globale. L'extrait nginx arrive au lot 3 de l'ADR-155.

## Régler

Tous les champs, leurs défauts et les variables d'environnement : [`docs/RELAY.md` §6](../../../docs/RELAY.md).
Les défauts : 300 s de cache, 10 s de délai, 10 Mo par réponse, 600 requêtes par minute et par
adresse, 64 Mo de cache en mémoire.

## Fichiers

| Fichier | Rôle |
|---|---|
| `server.mjs` | Point d'entrée. Charge la configuration, écoute, s'arrête sur `SIGTERM`. |
| `relay.mjs` | Le serveur HTTP : méthodes, limite de débit, cache, en-têtes, erreurs, journal. |
| `target.mjs` | Lecture de la cible dans l'URL ; refus des chemins et requêtes piégés. |
| `upstream.mjs` | La requête vers l'amont : résolution DNS vérifiée, TLS vers l'adresse vérifiée, redirections, délai, taille. |
| `addresses.mjs` | Adresses privées, de boucle locale, de lien local ; forme d'un nom d'hôte. |
| `config.mjs` | Lecture et validation de la configuration. |
| `cache.mjs`, `rate-limit.mjs` | Cache en mémoire borné, limite de débit par adresse. |

## Tester

```bash
node --test tests/relay/conformance.test.mjs          # la suite de conformance du contrat
node --test "tests/relay/reference/*.test.mjs"        # ce qui ne s'observe pas de l'extérieur
npx vitest run tests/relay                            # les deux, comme dans la CI
```

Pour éprouver **votre** relais avec la même suite : [`docs/RELAY.md` §7](../../../docs/RELAY.md).
