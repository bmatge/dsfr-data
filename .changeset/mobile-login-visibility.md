---
'dsfr-data': patch
---

Fix : le bouton Connexion apparait desormais dans le menu mobile. La duplication des tools-links vers menu-links etait faite par DSFR avant la resolution de `isDbMode()` (fetch async sur `/api/auth/me`), donc le bouton ajoute apres n'etait jamais clone. On rend maintenant la liste dans les deux conteneurs via Lit, ce qui reste reactif aux changements d'etat auth.
