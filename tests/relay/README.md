# Tests du relais cachable (ADR-155)

Contrat : [`docs/RELAY.md`](../../docs/RELAY.md). Relais de référence : [`proxy/relay/node/`](../../proxy/relay/node/).

| Fichier | Rôle |
|---|---|
| `conformance.test.mjs` | **La suite de conformance.** `node:test`, sans dépendance, exécutable contre n'importe quel relais (`RELAY_URL=…`). Chaque test cite la règle du contrat qu'il vérifie. |
| `conformance-profile.json` | Le profil de conformance : hôtes, clé fictive et plafonds que le relais à l'épreuve doit avoir. |
| `reference/*.test.mjs` | Ce qui ne s'observe pas de l'extérieur, éprouvé sur le relais de référence : adresse privée après résolution DNS, rebond DNS, connecteur TLS, cache borné, réponse périmée, purge, journaux, saturation et parts par client, lecteurs lents, mandataire et `X-Forwarded-For`, amont hostile (fragments d'un octet, réponse sans longueur), refus de démarrer. |
| `support/fake-upstream.mjs` | Le faux amont : joue tous les hôtes du profil, note ce qu'il reçoit, répond de façon hostile. |
| `support/raw-upstream.mjs` | Un amont `net` brut, qui écrit lui-même ses octets : ce qu'un serveur HTTP ne sait pas mal faire. |
| `support/reference.mjs` | Lance le relais de référence en substituant la résolution DNS et la connexion, et en lui déclarant l'adresse du faux DNS (par injection, jamais par configuration). |
| `support/client.mjs` | Client HTTP qui n'altère pas la cible de requête, et socket nu pour CR et LF. |
| `relay-conformance.test.ts` | Le pont Vitest : fait tourner tout ce qui précède dans `npm run test:run`. |

```bash
node --test tests/relay/conformance.test.mjs
RELAY_URL=http://127.0.0.1:8155/donnees-relais node --test tests/relay/conformance.test.mjs
node --test "tests/relay/reference/*.test.mjs"
```

Tout se joue en local : les hôtes sont en `.conformance.test` (domaine réservé), la clé est
fictive. L'adresse du faux DNS est une adresse de documentation (RFC 5737), que le relais de
production **refuse** : le banc la lui déclare par `createRelay(config, { benchAddresses })`.

`openssl` sert à fabriquer le certificat des tests du connecteur TLS. En CI, son absence est un
échec ; ailleurs, quatre tests sont sautés, et le pont Vitest exige ce décompte exact.

Deux tests mesurent la mémoire (tas pour des fragments d'un octet, tampons retenus pour des
lecteurs à l'arrêt) : ils affichent leur mesure, et laissent de la marge au ramasse-miettes.
