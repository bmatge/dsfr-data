---
'dsfr-data': patch
---

Le code généré par les Builders n'émet plus d'attributs dépréciés.

`dsfr-data-list` accepte encore les alias français `colonnes`, `recherche`, `tri`,
`filtres` et `server-tri`, `@deprecated` depuis #300. Ils existent pour ne pas casser
le code déjà publié par les utilisateurs — pas pour être émis par un générateur.

Deux des quatre variantes datalist de l'Assistant IA les émettaient encore, si bien
qu'une même configuration produisait deux dialectes selon la source. Les Builders
émettent désormais `columns` / `search` / `sort` partout.

Au passage : `search` et `filters` ne sont plus émis sur les variantes à pagination
serveur, **dans les deux Builders**. Ces deux contrôles sont locaux : ils n'opèrent
que sur la page chargée, si bien que le composant les désactivait en journalisant un
avertissement dans la page de l'utilisateur (#304). Les émettre revenait à promettre
deux contrôles qui n'apparaissaient pas. Le code généré indique désormais
l'alternative — `dsfr-data-search server-search` et `dsfr-data-facets server-facets`
en amont de la liste.

L'exemple JSDoc de `dsfr-data-list` passe lui aussi aux attributs courants : il
alimente la référence générée que consomme l'assistant IA, et l'y laisser déprécié
revenait à enseigner au modèle de produire du code déprécié.
