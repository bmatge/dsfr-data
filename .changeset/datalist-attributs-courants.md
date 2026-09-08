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

Au passage : l'attribut `search` n'est plus émis sur les variantes à pagination
serveur. La recherche locale n'y opère que sur la page chargée ; le composant la
désactivait en journalisant un avertissement dans la page de l'utilisateur (#304).
Le code généré indique maintenant l'alternative — `dsfr-data-search server-search`
en amont de la liste.
