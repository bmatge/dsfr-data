---
'dsfr-data': patch
---

fix(studio, dashboard) : le code généré déclare la source API au lieu de figer ses lignes

`generateSourceHTML` testait les données chargées **avant** la connexion. Or une source venue de
l'app Sources porte toujours les deux : sa connexion (`apiUrl`, `provider`, `resourceIds`) *et* les
lignes rapatriées dans le navigateur. Le test des données venant en premier, la branche
OpenDataSoft n'était jamais atteinte pour ces sources-là : le Studio et le tableau de bord
émettaient un `<dsfr-data-source data='[…]'>` de plusieurs milliers de lignes là où l'utilisateur
attendait `api-type="opendatasoft" base-url="…" dataset-id="…"`.

Ce n'était pas qu'une question de poids de page. `state.tableData` est ce que l'explorateur a
effectivement paginé, quand `recordCount` porte le total annoncé par l'API — l'écart est un cas
**normal**, l'explorateur l'affiche lui-même (« … sur N »). Un jeu partiellement chargé puis
embarqué tel quel donne un tableau de bord dont chaque agrégat est faux, et faux en silence :
exactement le défaut que `ConsumerNeed` cherche à éviter quelques lignes plus bas dans le même
fichier. La page était par ailleurs morte — plus aucun rafraîchissement, quoi qu'il arrive au jeu
source.

La connexion déclarative passe donc en premier, et les données embarquées deviennent le **repli**,
pour les sources qu'un document public ne peut pas atteindre seul : Grist (clé d'API, réponse
imbriquée `records[].fields`), toute source à en-têtes d'authentification, et les sources manuelles
JSON/CSV qui n'ont aucune URL. Aucun secret n'est jamais émis. Corollaire : une source ODS ou
Tabular chargée sait de nouveau paginer côté serveur, `supportsServerPagination` n'étant plus
disqualifié par la présence de `data`.

Les deux tests existants n'exerçaient qu'une moitié du cas chacun — une source avec *seulement* des
données, une avec *seulement* une connexion. Aucun ne couvrait celle qui porte les deux, qui est
pourtant la seule que produise l'app Sources. Six cas s'ajoutent, dont le repli Grist et le repli
en-têtes.

Au passage, l'état vide du panneau d'aperçu (« Discutez avec l'assistant pour composer votre
tableau de bord ») restait affiché **au-dessus** du tableau de bord une fois celui-ci rendu. Son
`display: flex` est une règle d'auteur : il bat le `[hidden] { display: none }` du navigateur quelle
que soit la spécificité. Le Studio et l'Assistant IA masquent tous deux par l'attribut
(`el.hidden = true`) et étaient donc touchés ; seul le Builder y échappait, parce qu'il pose un
`style.display` en ligne. La garde posée en #629 ne couvrait que l'iframe — le même piège valait
pour l'état vide lui-même.
