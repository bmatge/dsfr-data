---
'dsfr-data': patch
---

Studio IA : la clé serveur d'un déploiement peut être désactivée temporairement sans la retirer du `.env` (`IA_DEFAULT_ENABLED=false`), par exemple pour préserver le quota journalier de la clé partagée avant une démonstration. Le jeton n'est alors pas lu, `/ia-proxy-default` répond 503 et `/ia-server-config` l'annonce (`disabled: true`) : le badge IA affiche « Clé serveur désactivée » avec une aide « ? » (infobulle DSFR) invitant chaque usager à saisir sa clé Albert personnelle dans le champ de configuration, au lieu d'un « IA non configurée » ambigu. Sans le flag, rien ne change.
