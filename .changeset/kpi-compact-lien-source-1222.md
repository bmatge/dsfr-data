---
'dsfr-data': minor
---

Erreurs de données lisibles, suite de la 0.44.0 (#1222) : la tuile de KPI prend une forme compacte, et un 404 peut renvoyer à la page des données.

**Tuile de KPI en panne.** Un `dsfr-data-kpi` dont la source échoue ne reçoit plus l'encart commun, qui doublait sa hauteur. Il garde sa place et ses 140 px : « — » à la place du chiffre, son libellé, et une phrase courte selon la cause — « Chiffre momentanément indisponible », « Vous semblez hors connexion », « Le service est très sollicité », « Ce chiffre n'est plus publié à cette adresse », « Ce chiffre n'est pas accessible publiquement », « Ce chiffre n'a pas pu être affiché » — ou celle de `error-message`. Avec un bandeau `dsfr-data-source-status`, la tuile n'a ni bouton, ni lien, ni détail : le bandeau les porte. Sans bandeau, elle garde « Réessayer » (quand un nouvel essai a un sens) et « Détails », replié. Les autres afficheurs (graphique, liste, podium, display) gardent l'encart complet.

**Nouvel attribut `source-page` sur `dsfr-data-source`** : l'adresse de la page publique des données (la page du jeu sur le portail du producteur, pas l'adresse d'API). Sur des données introuvables (404, 410) seulement, les blocs et le bandeau proposent le lien « Consulter la page de ces données ». Sans l'attribut, aucun lien : rien n'est déduit de `base-url`, `dataset-id` ou `resource`. Seule une adresse `http(s)` ou relative est admise.

**Corrigé au passage** : un afficheur monté après la panne de sa source (onglet ouvert, bloc ajouté par script) affichait les lignes restées en cache, donc l'ancien chiffre, à côté de voisins qui disaient la panne. Il lit désormais l'état d'erreur de la source à son montage.

**À connaître pour une page existante** : dans un KPI, le bloc d'erreur de source n'a plus la classe `dsfr-data-kpi__error` (elle reste celle de l'erreur de configuration) ; cibler `.dsfr-data-status--source-error`, commune à tous les blocs depuis la 0.44.0, ou `.dsfr-data-status--compact` pour la seule tuile. « Détails techniques » s'y nomme « Détails », et le bouton « Réessayer » y est en variante tertiaire petite. L'`aria-label` de la figure dit la panne (« Libellé: Chiffre momentanément indisponible ») au lieu du dernier chiffre reçu.
