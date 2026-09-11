---
'dsfr-data': patch
---

fix(query, export) : un regroupement délégué ne réécrit plus les données des autres widgets de la même source

Une source ne porte qu'**un** regroupement serveur, et elle sert ses lignes à tous ses abonnés.
Quand une `dsfr-data-query` lui déléguait son `group-by`, tous les composants branchés sur la même
source recevaient les lignes agrégées. Mesuré en conditions réelles sur un tableau de bord exporté
par le Studio (jeu plan-de-relance, bibliothèque 0.28.1) : une seule requête
`group_by=type_entreprise`, un KPI « projets » à **11** (le nombre de groupes) au lieu de 3 080, et
le graphique « par région » affichant les groupes du graphique « par type ». Depuis la 0.28.1, les
sources Opendatasoft et Tabular de l'export sont déclaratives : tout tableau de bord qui combinait
un graphique agrégé et un autre widget sur la même source était touché.

- **Bibliothèque** : une query ne délègue son regroupement, son agrégat et son tri que si elle est
  la **seule** lectrice de sa source, y compris à travers un transformateur qui relaie. Sinon le
  calcul se fait côté client sur les lignes chargées, et un avertissement nomme la source, ses
  autres lecteurs et la voie à suivre : une source dédiée. Un lecteur ajouté après coup fait
  renégocier la query qui déléguait.
- **Export du tableau de bord et du Studio** : un graphique agrégé sur une source Opendatasoft ou
  Tabular partagée reçoit sa **propre** `dsfr-data-source` (même jeu, id distinct), que les blocs
  de filtres visent aussi. Chaque graphique garde ainsi un agrégat calculé par le serveur, juste et
  complet, et les KPI gardent les lignes brutes.

Les pages dont les queries passent par des facettes n'étaient pas touchées (vérifié sur les
reproductions du banc d'essai) : les facettes n'exposent pas d'adaptateur, la délégation n'y a
jamais lieu.

Résout le constat BUG-009 du banc d'essai (#765).
