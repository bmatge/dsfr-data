---
'dsfr-data': patch
---

`dsfr-data-facets` url-sync corrigé (#312) : `_syncUrl` part des paramètres **existants** et ne gère que les siens — repartir de zéro effaçait le paramètre du `dsfr-data-search` voisin et tout autre param de la page à chaque clic. Sans `url-param-map`, seuls les paramètres correspondant aux **champs connus** (attribut `fields`, groupes, colonnes des données) deviennent des sélections — `?utm_source=newsletter` filtrait sur un champ inexistant et affichait 0 résultat. Doc alignée sur le comportement réel (`replaceState`). Au passage côté `dsfr-data-search` : `sr-label` applique `fr-sr-only` (la classe `sr-only` n'existe pas en DSFR — l'attribut était sans effet).
