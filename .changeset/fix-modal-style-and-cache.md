---
'dsfr-data': patch
---

**fix(modals)** : ajout de `opacity:1;visibility:visible` en style inline sur les `<dialog>` des modales `auth-modal`, `password-change-modal` et `share-dialog`. Le correctif précédent (`data-fr-opened="true"`) ne suffisait plus : le CSS DSFR 1.14 continue de forcer `opacity:0;visibility:hidden` malgré l'attribut. Le style inline gagne sur la cascade et restaure l'affichage.

**fix(nginx)** : refonte de la politique de cache. Les bundles `/dist/*.js` de la lib dsfr-data ont des noms stables (non-hashés) ; un cache `public, immutable, 1y` servait donc du code périmé aux visiteurs déjà venus tant que leur navigateur ne ré-interrogeait pas le serveur — c'est exactement ce qui masquait le correctif modale en prod. Nouvelle politique :

- `/dist/*` : `no-cache, must-revalidate` (revalidation systématique via ETag, pas de re-téléchargement si inchangé).
- Pages HTML : `no-cache, must-revalidate`.
- Autres assets (JS/CSS hashés des apps Vite, images, polices) : `max-age=86400` (1 jour).

Applicable aux deux variantes d'image : `nginx.conf` (lib seule) et `nginx-db.conf` (app complète).
