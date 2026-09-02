# dsfr-data-beacon

> Cible telemetrie declarative (opt-in visible et retirable dans le HTML)
>
> Déclencheurs : beacon, telemetrie, télémétrie, tracking, statistiques usage, collecte, suivi usage

## <dsfr-data-beacon> - Cible telemetrie declarative (#345)

Pendant declaratif de `proxy-url` cote telemetrie. Par defaut le beacon d'usage
est **desactive**. Cet element rend la collecte VISIBLE et RETIRABLE dans le HTML
(au lieu d'un `window.*` opaque) : un integrateur voit qu'une telemetrie part,
et vers ou, et peut la retirer.

La presence d'un `<dsfr-data-beacon url="...">` avec un `url` non vide :
- fournit l'URL de collecte (prioritaire sur `window.DSFR_DATA_BEACON_URL` puis
  sur l'URL bakee au build) ;
- vaut **opt-in** (equivaut a `window.DSFR_DATA_BEACON = true`).

`window.DSFR_DATA_BEACON = false` reste un kill switch qui neutralise meme un
element present. L'element est invisible et n'emet aucun beacon lui-meme : il est
consulte en lookup paresseux au moment de l'envoi, donc son ordre dans le DOM ne
compte pas (peut etre place apres les composants).

### Attributs

| Attribut | Type | Défaut | Requis | Description |
|----------|------|--------|--------|-------------|
| url | String | `""` | non | Domaine de collecte du beacon. Présence avec valeur non vide = opt-in + cible. Vide = no-op. |

### Pattern

```html
<!-- Telemetrie vers un collecteur souverain, visible et retirable -->
<dsfr-data-beacon url="https://collecte.ministere.fr"></dsfr-data-beacon>

<dsfr-data-chart ...></dsfr-data-chart>
<dsfr-data-kpi ...></dsfr-data-kpi>
```


### Référence `<dsfr-data-beacon>` (générée depuis le code)

**Rôle pipeline** : autonome — n’utilise pas les mixins d’abonnement du pipeline (voir les événements ci-dessous).

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `url` | `string` | `""` (vide) | Domaine de collecte du beacon. Vide = pas de cible declarative (no-op). |



**Événements** — aucun.


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
