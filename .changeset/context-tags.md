---
'dsfr-data': minor
---

Nouveau composant `dsfr-data-context-tags` (#232) : tags DSFR récapitulant les filtres actifs d'un `dsfr-data-context` (`for="ctx"`), chacun supprimable d'un clic — la croix réinitialise le filtre en **vidant son contrôle d'UI**, exactement le chemin d'un utilisateur qui efface le champ : sources, URL (#231) et tags se mettent à jour ensemble. Libellé naturel via le nouvel attribut `label` de `dsfr-data-context-filter` (défaut : le champ) ; valeurs affichées humanisées (« année en cours », « 30 derniers jours », plages between en « min – max »).
