# dsfr-data-context-tags

> Tags DSFR recapitulant les filtres actifs d'un contexte (supprimables)
>
> Déclencheurs : context-tags, tags filtres, filtres actifs, recap filtres, retirer filtre

## <dsfr-data-context-tags> - Recap des filtres actifs

Affiche des tags DSFR supprimables : un tag par filtre actif du contexte observe
(libelle naturel + valeur). La croix reinitialise le filtre en VIDANT son UI —
meme chemin qu'un utilisateur qui efface le champ : sources, URL et tags se
mettent a jour ensemble.

### Attributs

| Attribut | Type | Défaut | Requis | Description |
|----------|------|--------|--------|-------------|
| for | String | `""` | oui | Id du dsfr-data-context observe |

### Pattern

```html
<dsfr-data-context id="ctx" sources="src-a src-b" url-sync>
  <dsfr-data-context-filter field="categorie" label="Catégorie" operator="in" ui="ui-cat">
  </dsfr-data-context-filter>
</dsfr-data-context>
<dsfr-data-context-tags for="ctx"></dsfr-data-context-tags>
```


### Référence `<dsfr-data-context-tags>` (générée depuis le code)

**Rôle pipeline** : autonome — n’utilise pas les mixins d’abonnement du pipeline (voir les événements ci-dessous).

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `for` | `string` | `""` (vide) | Id du dsfr-data-context observé |



**Événements** — aucun.


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
