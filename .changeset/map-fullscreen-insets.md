---
"dsfr-data": patch
---

Corrige `dsfr-data-map fullscreen` sur une carte qui porte des encarts : la carte
principale tombait a 0 px et les encarts s'empilaient en colonne sur toute la hauteur
de l'ecran. La regle de plein ecran mettait l'hote en `display: flex`, or les encarts
sont des flottants (#643) : dans un conteneur flex le float est ignore, chaque encart
devenait un item empile, et la somme de leurs hauteurs ecrasait le volet principal.

L'hote reste desormais en flux normal en plein ecran, et le volet principal recoit la
hauteur de l'ecran moins celle de la rangee d'encarts, qui s'affiche en dessous comme
au repos. Sans encart, rien ne change. Resout le constat AM-061 du banc d'essai. (#825)
