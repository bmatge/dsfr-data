# Échanges avec les producteurs d'API

Dossiers préparés pour être **envoyés à une équipe extérieure** (producteur d'une API que
`dsfr-data` consomme) : ce qu'on a mesuré de leur service, ce qu'on croit avoir raté, et les
questions qu'on leur pose.

Ce ne sont pas des notes internes. Ils sont écrits pour être lus par l'équipe destinataire,
liés depuis un courriel ou une issue, et cités plus tard — donc datés et versionnés.

## Convention

Chaque dossier porte en tête :

- la **date**, la **version de `dsfr-data`** au moment de l'écriture, et la **version de l'API
  observée** (une instance déployée peut avoir plusieurs versions de retard sur son dépôt) ;
- la **méthode** : ce qui a été mesuré, avec quelle commande et quand ; ce qui a été lu dans le
  source ou le suivi d'issues, avec le lien ; ce qui reste supposé.

Chaque affirmation porte son régime de vérité — `[M]` mesuré, `[L]` lu, `[H]` hypothèse.
Un lecteur doit pouvoir corriger une ligne sans relire le reste. C'est la règle qui a le plus
servi : sur le banc d'essai open-data-viz, **11 constats contestés sur 16 visaient une capacité
qui existait déjà** (voir `docs/EVALUER-UNE-REPRODUCTION.md`).

Les questions sont **numérotées et fermées**, chacune suivie de ce qu'on fera de la réponse :
un mainteneur doit pouvoir répondre en une ligne par question.

## Dossiers

| Dossier | API | État |
|---|---|---|
| `api-tabular-capacites-serveur.md` | API tabulaire data.gouv.fr (`tabular-api.data.gouv.fr`) | rédigé le 2026-09-20, à envoyer |
| `api-tabular-messages.md` | idem — textes prêts à publier et plan de publication (interne) | idem |
