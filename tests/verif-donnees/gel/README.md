# Contrôles gelés

Ce dossier reçoit les **échecs vivants gelés** (#884) : quand une nuit rouge a le
verdict « bibliothèque » (la date de traitement du jeu n'a pas bougé entre l'attendu et
l'observation), le spec écrit `tools/oracle/out/gel/<id>-gel.json` — un contrôle
déterministe complet, lignes brutes comprises, balisage tourné vers le faux serveur
`gel.verif.invalid`, sans clé d'API. Le copier ici, le committer, ouvrir l'issue :
le contrôle tourne alors sur chaque PR, sans réseau, rouge jusqu'au correctif, vert
ensuite.

Un dossier sans `.json` est un dépôt sans nuit rouge gelée : c'est l'état normal.
`tests/verif-donnees/gel.ts` charge ce qui s'y trouve ; le README de l'oracle
(« Le verdict d'une nuit rouge, et le gel ») dit la règle de vie.
