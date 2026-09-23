---
'dsfr-data': minor
---

Le Studio IA remplace l'Assistant IA comme entrée usager (#1081). La navigation principale et l'accueil
mènent au « Studio IA » ; `apps/builder-ia/` redirige vers lui en conservant requête et ancre, sauf avec
`?ancien=1`, qui garde l'ancien Assistant joignable pour comparer. Le Studio reprend ce que l'Assistant
offrait : configuration IA (URL, modèle, jeton, sonde des capacités) partagée avec les autres apps, jeux
d'exemple et source ouverte depuis l'app Sources, « Voir les données », réponses en Markdown avec
suggestions et raisonnement, ajout aux favoris, ouverture dans le Playground, export PNG/JPG, reclassement
des skills par `/v1/rerank`. La sonde des capacités, le rerank et le rendu Markdown du chat passent dans
`@dsfr-data/shared`. Le volet Diagnostic n'a plus qu'un libellé, « Demander à l'assistant » : dans le
Studio, il pose le diagnostic dans la conversation sans l'envoyer.
