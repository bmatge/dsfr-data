---
'dsfr-data': minor
---

Studio IA : la source se crée à partir de l'URL d'un jeu donnée dans la conversation (#1140).
« Fais un graphique de … avec https://data.economie.gouv.fr/explore/dataset/… » : le nouvel outil
`charger_source_url` reconnaît l'adresse (Opendatasoft/Huwise, y compris sur domaine propre,
data.gouv.fr — page d'un jeu, ressource ou API tabulaire —, Grist public, INSEE Melodi), charge le
jeu par le proxy et en fait la source du document, comme le sélecteur de source. Refus explicites
pour une URL non reconnue, un jeu introuvable, une ressource non tabulaire ou un jeu privé : ils
renvoient vers l'app Sources, sans jamais demander de jeton dans la conversation.

La reconnaissance d'URL de la création d'une connexion (app Sources) passe dans `@dsfr-data/shared`
(`reconnaitreUrlSource`, `parseGristDocRef`, `FORMATS_URL_RECONNUS`, entrée app) : une seule voie,
partagée par Sources et le Studio.
