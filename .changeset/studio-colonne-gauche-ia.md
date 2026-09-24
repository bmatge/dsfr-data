---
'dsfr-data': patch
---

Studio IA (#1142) : la sonde des capacités ne prend plus un HTTP 200 pour un échec de connexion. Un modèle à raisonnement (openweight-large = gpt-oss-120b) épuisait les 30 jetons de la sonde en raisonnant et renvoyait un texte vide : la connexion est désormais établie par une réponse bien formée, le budget passe à 512 jetons par étape, et le rapport dit précisément ce qui s'est passé (« réponse vide : le modèle a épuisé son budget de jetons (finish_reason=length) », refus HTTP avec le message du gateway, gateway injoignable). La colonne gauche du Studio se replie sur une ligne de résumé par bloc, et le badge IA signale la clé serveur disponible derrière une clé personnelle, avec l'action « Utiliser la clé serveur ».
