---
'dsfr-data': minor
---

Erreurs de données lisibles par l'usager, et dites une fois (#1203).

Quand une source échoue, les blocs branchés dessus n'affichent plus `Erreur de chargement: HTTP 503: Service Unavailable` en rouge. Chacun garde sa place et montre un encart neutre, avec une phrase choisie selon la cause : service indisponible, hors connexion, service très sollicité, données introuvables, accès restreint, page mal réglée. Le code HTTP, l'adresse appelée et l'heure sont repliés dans « Détails techniques ».

- Nouveau composant `dsfr-data-source-status` : posé en haut du contenu, il dit la panne une fois par source, avec le seul bouton « Réessayer ». Les blocs de cette source gardent leur message, sans bouton ; ceux d'une autre source ne sont pas touchés. `source="id"` suit une source, sans attribut il suit toutes celles de la page.
- Sans bandeau, chaque bloc en erreur porte son propre « Réessayer », quand un nouvel essai a un sens (pas sur un 404, un 401/403 ni une page mal réglée).
- Nouvel attribut `error-message` sur `dsfr-data-source` : votre phrase à la place de celle de la bibliothèque.
- « Réessayer » relance la source à l'identique (commande `{ reload: true }`, servie dans tous les modes). Après un échec hors connexion, la source se relance d'elle-même, une fois, au retour du réseau. Jamais de nouvel essai automatique sur un 429.
- Accessibilité : les blocs en erreur passent de `role="alert"` (assertif, une interruption par bloc) à `role="status"` ; avec un bandeau, seul le bandeau annonce.

Ce qui ne change pas : l'événement `dsfr-data-error` (même détail, code HTTP dans `error.message`), la trace console, et l'erreur de configuration d'un composant, qui reste une alerte écrite pour l'intégrateur.

Changement de rendu par défaut à connaître : une page qui ciblait `[role="alert"]` ou le texte « Erreur de chargement » dans un bloc doit cibler `.dsfr-data-status--source-error`.
