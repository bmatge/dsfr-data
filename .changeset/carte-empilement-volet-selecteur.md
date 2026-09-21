---
'dsfr-data': patch
---

Carte : le volet lateral d'un popup passe desormais AU-DESSUS du selecteur de fond de
carte. Sur une carte portant a la fois `tiles-switcher` et un
`<dsfr-data-map-popup mode="panel-right">` (ou `panel-left`), l'encart « Fond de carte »
se dessinait par-dessus le volet ouvert, dont il masquait le titre et les premieres
lignes.

Les valeurs de `z-index` etaient pourtant deja dans le bon ordre — volet a 1001,
selecteur a 1000. Elles ne se comparaient simplement pas : le selecteur est pose en
FRERE du conteneur Leaflet (pour etre atteint au clavier avant la carte) quand le volet
est pose DEDANS (pour ne pas recouvrir les encarts territoriaux), et un `z-index: 0` sur
ce conteneur — auquel Leaflet ajoute `position: relative` — en faisait un contexte
d'empilement qui scellait tout son sous-arbre sous le selecteur. Aucune valeur de
descendant ne pouvait rattraper cela.

La frontiere d'empilement remonte donc d'un cran, de ce conteneur vers l'hote
`dsfr-data-map` (`isolation: isolate`). Effet de bord favorable : le mobilier flottant de
la carte (selecteur de fond, bouton de plein ecran, bandeau max-items, tous a 1000) ne
peut plus sortir de la carte pour recouvrir l'en-tete de la page qui l'accueille.

Deux garde-fous, l'un structurel et l'autre mesure : `tests/map-empilement.test.ts`
verifie qu'aucun `z-index` n'est declare sur le conteneur et que l'hote porte bien
`isolation` — l'ordre des nombres seul etait deja juste et n'aurait rien vu ; et
`e2e/layout-map.spec.ts` lit l'empilement reel dans un navigateur, par
`elementFromPoint` au centre du selecteur.
