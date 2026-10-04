---
'dsfr-data': minor
---

`dsfr-data-source` gagne l'attribut `relay-url` : les données d'une dataviz peuvent passer par le domaine du site hôte, sous une URL que son cache sait servir. Résout le constat AM-114 du banc d'essai (#1232, ADR-155).

Un site qui a du cache (Varnish, CDN, cache de son CMS) ne pouvait pas servir les données d'une dataviz : `proxy-url` ne relaie pas un portail Opendatasoft, et le relais générique (`use-proxy`) passe sa cible dans un en-tête — deux jeux, une seule URL. Avec un relais, toute requête GET vers une autre origine part sous la forme `<relais>/<hôte>/<chemin>?<requête>` :

```html
<dsfr-data-source id="rappels" api-type="opendatasoft" relay-url="/donnees-relais"
  base-url="https://data.economie.gouv.fr" dataset-id="rappelconso">
</dsfr-data-source>
<!-- → /donnees-relais/data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/rappelconso/records?… -->
```

ou une fois pour la page, avant le chargement des composants : `window.DSFR_DATA_RELAY = '/donnees-relais'`. L'attribut prime sur la variable.

**Le relais est fourni par le site hôte.** La bibliothèque n'en embarque aucun et **aucune route de relais n'existe sur l'instance publique** : le contrat est `docs/RELAY.md`, le relais de référence `proxy/relay/node/` (Node sans dépendance, liste blanche d'hôtes, lecture seule), avec une suite de conformance à lancer contre son propre relais. Ne pas poser `relay-url` sans avoir monté cette route.

**Ce que la source fait avec un relais.**

- Elle reste en mode adaptateur : `where`, `group-by`, `order-by`, pagination, `server-side` et `fetch-mode="export"` (Opendatasoft) vivent dans l'URL, reprise telle quelle — ni réencodage, ni tri des paramètres. Deux cibles donnent deux URL ; une même requête donne la même URL au caractère près.
- Tous les hôtes y passent, en mode adaptateur comme en mode URL : Opendatasoft, Tabular, Grist en lecture, INSEE Melodi, URL quelconque.
- Aucun en-tête n'est envoyé au relais : `headers` et `api-key-ref` sont ignorés sur une requête relayée (la source l'écrit une fois en console), et les cookies ne partent pas. Si le portail exige une clé, c'est le relais qui l'ajoute : la clé quitte le navigateur.
- Si le relais répond 503 parce qu'un visiteur charge d'un coup plus de dataviz qu'il n'a de places, la requête est réessayée — trois fois au plus, après le délai annoncé par `Retry-After` (3 s au plus). Jamais sur un 429.
- En cas d'erreur, « Détails techniques » montre l'URL du relais réellement appelée, et le volet Diagnostic signale qu'une source passe par le relais.

**Hors relais en première version**, sur le chemin habituel (direct, ou `proxy-url`) :

- les requêtes **POST** : le mode SQL de Grist (regroupements, agrégats, facettes) et `method="POST"` en mode URL ;
- l'**export Parquet de l'API Tabular** : avec un relais, `fetch-mode="export"` sur Tabular retombe sur la pagination, qui est relayée, et le dit en console ;
- une URL relative ou de même origine, jamais réécrite ;
- une cible hors `https`, sur un port explicite ou avec identifiants, et un chemin que le relais refuserait (`%2f`, `%2e`, `//`…) : la requête n'est pas réécrite, avec un avertissement.

Une URL de relais de plus de 8 000 caractères part quand même au relais, qui répond 414 : la bibliothèque ne contourne jamais le relais en silence.

**Sans relais, rien ne change** : `proxy-url`, `use-proxy`, l'en-tête `X-Target-URL` et la liste des hôtes relayés par le proxy sont inchangés. L'avertissement « proxy-url est sans effet » (0.45.0) nomme désormais `relay-url` comme la voie pour un portail Opendatasoft. `cache-ttl` n'a aucun rapport avec le relais : c'est un repli hors ligne du navigateur ; la durée de cache d'une donnée relayée se règle sur le relais.

Un adaptateur tiers enregistré par `registerAdapter` n'est relayé que s'il passe ses requêtes par `resolveTransportUrl` et `transportFetch` (`@dsfr-data/shared/lib`).
