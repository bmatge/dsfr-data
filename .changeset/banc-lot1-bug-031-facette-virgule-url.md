---
'dsfr-data': patch
---

`dsfr-data-facets` : une valeur de facette qui contient une virgule survit au rechargement de l'URL — résout le constat BUG-031 du banc d'essai (#1227).

`url-sync` joignait les valeurs d'un champ par des virgules et `url-params` les redécoupait sur les virgules, sans échappement : « 1,5 à 2 parcours » revenait en « 1 » et « 5 à 2 parcours », deux cases fantômes et zéro résultat — ou, quand les deux morceaux existent (« 1,5 » à côté de « 1 » et de « 5 »), un nombre de lignes faux et plausible.

- **Écriture.** La virgule d'une valeur est écrite `%2C`, le pourcent `%25`, les blancs de tête et de queue en percent — la convention de `where`, `replace` et `color-map`. Dans la barre d'adresse : `?intensite=1%252C5+à+2+parcours`. L'aller-retour est exact pour toute valeur, en facette autonome comme en mode `context`.
- **Liens déjà partagés.** La forme `?region=IDF,PACA` est inchangée, à l'écriture comme à la lecture : un lien sans virgule dans ses valeurs se relit à l'identique. Le paramètre répété (`?r=a&r=b`) reste lu, jamais écrit.
- **Liens à virgule nue, écrits par une version antérieure.** Ils étaient déjà cassés ; une facette qui filtre côté client les recolle contre les valeurs présentes dans les données (un morceau inconnu est prolongé jusqu'à former une valeur connue). En mode `server-facets`, `static-values` ou `context`, ils restent lus morceau par morceau, comme avant.
- Seule régression possible : un ancien lien dont une valeur porte littéralement une séquence percent valide (`%2C`, `%25`, `%20`) est désormais décodé.
