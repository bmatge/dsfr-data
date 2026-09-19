---
'dsfr-data': patch
---

Un filtre de contexte qui compare « 01 » à un champ entier ne le fait plus en silence (#924)

Un `dsfr-data-context-filter` lit une valeur de formulaire — toujours du texte —
et l'émet telle quelle : `reg = "01"`. Sur un champ que le jeu publie en
**entier**, le portail compare en texte et ne rencontre jamais l'entier 1 :
aucune ligne, aucun message, un KPI à « — ». Le `refine` du portail, lui,
trouvait la ligne. Les codes métropolitains (« 75 ») passent, ce qui cache le
défaut : seuls la Guadeloupe, la Martinique, la Guyane, La Réunion, Mayotte et
les neuf premiers départements restent muets.

La console le dit désormais, **une fois par champ et par source** : elle nomme
le champ, la valeur émise, la source qui publie ce champ en nombre — avec un
exemple pris dans ses lignes — et le geste qui sort du piège. Elle se tait
quand la valeur survit à l'aller-retour texte ↔ nombre (« 75 »), quand le champ
est publié en texte, quand la source n'a encore rien rendu et quand le champ y
est hétérogène : un avertissement qui crie à tort serait pire que pas
d'avertissement.

**Aucun comportement ne change** : la clause émise est exactement celle
d'avant. Émettre un littéral numérique ou basculer l'égalité sur `refine`
corrigerait le fond, mais changerait la requête de pages qui fonctionnent
aujourd'hui — les deux autres critères de #924 restent ouverts.
