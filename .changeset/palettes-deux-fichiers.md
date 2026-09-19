---
'dsfr-data': patch
---

Les deux jeux de palettes vivent désormais dans deux fichiers, et l'un d'eux gagne
un garde-fou. `packages/shared/src/constants/dsfr-palettes.ts` exportait
`PALETTE_COLORS` (5 tons, les graphiques) et `CHOROPLETH_SCALES` (9 pas, les cartes
et le podium) avec **les mêmes noms de clés** — `sequentialDescending` y désignait
deux rampes Bleu France différentes, toutes deux plausibles. Un
`grep sequentialDescending` répondait, la réponse était cohérente, et elle était
fausse : trois tableaux de contraste erronés en une journée sur la pastille de rang
du podium. Le fichier est scindé en `constants/palette-colors.ts` et
`constants/choropleth-scales.ts` : le chemin d'import dit maintenant laquelle on
lit. **Aucun ré-export depuis l'ancien chemin** — il recréerait exactement
l'ambiguïté qu'on supprime.

Rien ne bouge pour qui écrit du HTML : les noms de clés sont les valeurs de
l'attribut public `selected-palette` et ils sont inchangés, la surface d'export de
`@dsfr-data/shared` est identique (140 exports sur `lib`, 265 sur `index`), et les
bundles construits sont octet pour octet les mêmes à deux lignes de commentaire de
découpage près. `dsfr-data-map-layer`, qui lisait déjà la bonne constante mais
n'avait aucun test pour le dire, en a un : `tests/map-layer-rampe-choroplethe.test.ts`
fige en clair les couleurs posées sur les polygones pour les cinq palettes et
vérifie qu'aucune ne vient de la rampe homonyme à 5 tons.
