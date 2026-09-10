# dsfr-data-context-value

> Valeur courante d'un filtre du contexte, dans un titre ou une phrase
>
> Déclencheurs : context-value, valeur du filtre, titre dynamique, resultats pour, interpoler filtre, libelle du filtre

## <dsfr-data-context-value> - La valeur d'un filtre dans une phrase

context-tags LISTE les filtres actifs ; il ne s'insere pas dans un titre.
Ce composant rend la valeur courante d'un ou plusieurs filtres du contexte
comme du TEXTE, interpolee dans un gabarit : « Résultats pour {{departement}} ».
Il lit le meme contrat que les tags (#678) : context-filter, champs d'une
facets context="…", terme d'une search context="…", refine-on-click d'une couche.

### Attributs

| Attribut | Type | Défaut | Requis | Description |
|----------|------|--------|--------|-------------|
| for | String | `""` | oui | Id du dsfr-data-context observe. Le contexte peut etre declare APRES dans la page |
| field | String | `""` | non | Champ dont la valeur est rendue — raccourci de `template="{{champ}}"`. Ignore si `template` est pose |
| template | String | `""` | non | Gabarit texte : chaque `{{champ}}` est remplace par la valeur courante du filtre de ce champ. Plusieurs champs acceptes |
| fallback | String | `""` | non | Texte de repli rendu tant qu'un champ cite n'a AUCUNE valeur (« Résultats pour toute la France »). Vide = le composant ne rend rien |
| live | Boolean | `false` | non | Region live polie (`aria-live="polite"`, `role="status"`) : le titre annonce le changement de contenu aux lecteurs d'écran. A poser sur UN seul element de la page — plusieurs libelles qui parlent en meme temps sont un bruit |

### Pattern

```html
<dsfr-data-context id="ctx" sources="src" url-sync>
  <dsfr-data-context-filter field="departement" operator="eq" ui="ui-dep">
  </dsfr-data-context-filter>
</dsfr-data-context>

<h2>
  <dsfr-data-context-value for="ctx" template="Résultats pour {{departement}}"
    fallback="Résultats pour toute la France" live></dsfr-data-context-value>
</h2>
```

Regles :
- Un seul champ cite sans valeur suffit a basculer sur `fallback` — « Résultats pour  »
  serait pire qu'une phrase de repli.
- Le rendu est du texte : la valeur d'un filtre ne traverse jamais l'analyseur HTML.
- Pour LISTER les filtres et les retirer un a un, c'est context-tags ; ce composant
  ne sert qu'a l'ecrire dans une phrase.


### Référence `<dsfr-data-context-value>` (générée depuis le code)

**Rôle pipeline** : autonome — n’utilise pas les mixins d’abonnement du pipeline (voir les événements ci-dessous).

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `fallback` | `string` | `""` (vide) | Texte rendu tant qu'un champ cite n'a aucune valeur — le repli declare de #742. Vide : le composant ne rend rien du tout. |
| `field` | `string` | `""` (vide) | Champ dont la valeur est rendue — raccourci de `template="{{champ}}"`. Ignore quand `template` est pose. |
| `for` | `string` | `""` (vide) | Id du dsfr-data-context observe |
| `live` | `boolean` | `false` | Région live polie : le titre annonce le changement de contenu aux lecteurs d'écran. À poser sur UN seul élément de la page. |
| `template` | `string` | `""` (vide) | Gabarit texte : chaque `{{champ}}` est remplace par la valeur courante du filtre de ce champ (« Résultats pour {{departement}} »). |



**Événements** — aucun.


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
