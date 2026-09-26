---
'dsfr-data': patch
---

L'assistant contextuel (`mountAssistant`) signale chaque question posée, avec sa réponse, sa source, les repères cités, sa durée et son éventuelle erreur, au kit de retours d'usage (`window.fc.assistant.turn`) **s'il est chargé sur la page**. Ce n'est le cas que sur les instances de test déclarées de chartsbuilder. Sans kit, rien ne change : aucun import, aucune requête, aucun effet sur l'usage de la bibliothèque.
