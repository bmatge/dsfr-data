---
'dsfr-data': minor
---

`dsfr-data-context` : sérialisation URL des filtres (#231, ADR-031) — partage d'un lien vers un dashboard déjà filtré. **Opt-in** (`url-sync`, défaut OFF pour ne pas collisionner avec le routing du site hôte), encodage lisible (un paramètre par filtre nommé d'après le champ : `?categorie=alimentaire,jouets`, `?prix=10,20` pour between), renommage possible via `url-param-map="c:categorie"`. Écriture en `history.replaceState` (pas d'entrée d'historique par frappe) en **préservant les paramètres voisins** (leçon #312). Sécurité conforme ADR-031 : les valeurs lues dans l'URL ne sont jamais injectées dans un `where` — elles pré-remplissent les contrôles d'UI, qui repassent par exactement le même chemin qu'un clic utilisateur. L'opérateur `in` accepte désormais la virgule comme séparateur de valeurs (en plus du pipe).
