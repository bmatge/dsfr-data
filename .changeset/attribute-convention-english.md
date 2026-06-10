---
'dsfr-data': minor
---

Convention d'attributs unique — anglais (#300). Trois conventions coexistaient : `dsfr-data-kpi` en français (`valeur`, `icone`, `couleur`, `seuil-vert`, `seuil-orange`, `tendance`), `dsfr-data-list` en franglais (`colonnes`, `recherche`, `filtres`, `tri`, `server-tri`), le reste en anglais. Nouveaux attributs cibles : **kpi** `value`, `icon`, `color`, `threshold-green`, `threshold-orange`, `trend` ; **list** `columns`, `search`, `filters`, `sort`, `server-sort`. Les anciennes écritures restent lues en **alias dépréciés** (warn console à la connexion, l'anglais prime si les deux sont posés) — retrait prévu à la 1.0. Les builders, le playground et le guide n'émettent plus que la convention cible ; skills alignés.
