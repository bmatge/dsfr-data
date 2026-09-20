---
'dsfr-data': patch
---

Nouvelle fiche de connaissance « Gabarits de page » (`pagePatterns`) : quatre familles de
pages de donnees publiques — localisateur, tableau de bord, corpus, portrait — et huit
gabarits, releves sur les pages reellement en ligne du banc d'essai open-data-viz.

La fiche s'ouvre sur un arbre de decision (la question que pose la page determine la
famille ; le nombre de leviers determine la variante) et tranche une regle jusque-la
implicite : les filtres vont **en barre** jusqu'a quatre sans compteurs, **en colonne**
au-dela ou des que les facettes affichent des compteurs, **en bandeau** quand le levier est
unique. Quand le critere n'est pas decidable a l'ecriture, la fiche demande de **poser la
question a l'usager** plutot que d'imposer un choix en silence.

La fiche `dsfrLayout` est alignee sur cette regle (elle affirmait « les filtres se posent en
haut », sans condition) et les trois fiches se renvoient desormais l'une a l'autre :
`datavizMetier` (quelle forme) → `pagePatterns` (quelle page) → `dsfrLayout` (quelle
grille).

La fiche dit aussi ce que la bibliotheque ne fait pas, pour qu'aucune page generee ne le
promette : `dsfr-data-chart` n'emet aucun evenement de clic, on ne filtre donc pas en
cliquant une barre — le filtrage passe par les facettes, la recherche ou le contexte.
