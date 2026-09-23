---
'dsfr-data': patch
---

L'avertissement « comparée en TEXTE » d'un filtre de contexte (#924) sort aussi quand le filtre est délégué à une source dont les lignes ne portent pas le champ (#980) — résout le constat PG-030 du banc d'essai.

Un KPI agrégé côté serveur (`select="sum(nb_missions) as m"`) filtré par région envoyait `reg = "01"` au portail, affichait « — » et ne disait rien : sa réponse ne ramène que `m`, le type de `reg` ne s'observait dans aucune ligne. Dans ce cas, et dans ce cas seulement, le type DÉCLARÉ par le jeu Opendatasoft (`/datasets/<id>`, lu une fois par jeu, après l'émission de la clause) décide. Le message et son vocabulaire sont inchangés, la preuve du type y devient `type « int » déclaré par le jeu`. La clause émise ne change pas ; une valeur sans zéro de tête (« 75 ») ne déclenche aucune requête ; le chemin client (lignes qui portent le champ) reste seul juge et ne lit jamais les métadonnées. Nouvelle méthode optionnelle d'adaptateur `describeFieldTypes`, implémentée par Opendatasoft.
