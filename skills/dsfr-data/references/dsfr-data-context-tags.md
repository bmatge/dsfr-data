# dsfr-data-context-tags

> Tags DSFR recapitulant les filtres actifs d'un contexte (supprimables)
>
> Déclencheurs : context-tags, tags filtres, filtres actifs, recap filtres, retirer filtre

## <dsfr-data-context-tags> - Recap des filtres actifs

Affiche des tags DSFR supprimables : un tag par filtre actif du contexte observe
(libelle naturel + valeur). La croix reinitialise le filtre en VIDANT son UI —
meme chemin qu'un utilisateur qui efface le champ : sources, URL et tags se
mettent a jour ensemble. Tout type de filtre confondu (#678) : context-filter,
champs d'une facets context="…", terme d'une search context="…" (tag « Recherche : terme »).
Une facette multi-valeurs (in) donne UN tag par valeur, chacune retirable seule (#679).

### Attributs

| Attribut | Type | Défaut | Requis | Description |
|----------|------|--------|--------|-------------|
| for | String | `""` | oui | Id du dsfr-data-context observe |
| clear-all | Boolean | `false` | non | Bouton unique « Tout effacer » (#679) apres les tags : vide tous les filtres actifs en une fois (une seule URL, une seule notification), annonce en region live, absent sans filtre actif. Poser `no-reset` sur les facets de la page pour ne pas doubler leur bouton local |

### Pattern

```html
<dsfr-data-context id="ctx" sources="src-a src-b" url-sync>
  <dsfr-data-context-filter field="categorie" label="Catégorie" operator="in" ui="ui-cat">
  </dsfr-data-context-filter>
</dsfr-data-context>
<dsfr-data-facets context="ctx" source="src-a" server-facets fields="region" no-reset></dsfr-data-facets>
<dsfr-data-context-tags for="ctx" clear-all></dsfr-data-context-tags>
```


### Référence `<dsfr-data-context-tags>` (générée depuis le code)

**Rôle pipeline** : autonome — n’utilise pas les mixins d’abonnement du pipeline (voir les événements ci-dessous).

**Attributs**

| Attribut | Type | Défaut | Description |
|---|---|---|---|
| `clear-all` | `boolean` | `false` | Bouton « Tout effacer » (#679) — un seul geste pour vider tous les filtres du contexte |
| `for` | `string` | `""` (vide) | Id du dsfr-data-context observé |



**Événements** — aucun.


**Slots** — aucun (le composant rend son propre contenu).

**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).
