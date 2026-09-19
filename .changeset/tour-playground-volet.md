---
'dsfr-data': patch
---

La visite guidee du playground visait `#example-select`, qui vient de passer
dans le volet lateral des exemples — un panneau ferme, `inert` et hors ecran
au chargement. La premiere etape montrait donc un element invisible.

Elle vise desormais la bascule du volet et decrit ce qu'il apporte : les trois
axes croises (source des donnees, pipeline de transformation, sortie affichee).
Le decompte en dur (« plus de 30 exemples ») disparait au profit du compteur
que le bouton affiche en direct : il ne peut plus se perimer.

Une seconde etape ne montrait rien non plus, depuis plus longtemps : « Editeur
de code » visait `#code-editor`, le textarea que CodeMirror masque pour rendre
le sien a cote — donc un element de taille nulle. Elle vise `.CodeMirror`.

`version` du tour passe a 2, ce que ce champ prevoit exactement — une visite
deja vue est reproposee quand son contenu a change.
