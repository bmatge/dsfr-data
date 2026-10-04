---
'dsfr-data': patch
---

Export du Studio IA et du Tableau de bord : un tableau sur une source Tabular ne demande plus que les colonnes qu'il lit (#1225, reprise de #985).

L'ancien Assistant IA limitait les colonnes demandées à l'API Tabular pour un tableau ; l'optimisation était partie avec lui. L'export partagé pose de nouveau `select` sur la source — que l'adaptateur traduit en `columns=` — avec les colonnes affichées, le champ de tri et les champs du filtre du tableau. Le tableau affiche les mêmes lignes : seule la requête change.

Une source étant émise une seule fois pour tout le document, le `select` n'est posé que si **tous** ses consommateurs savent énumérer leurs colonnes : le tableau seul lecteur de sa source, ou plusieurs tableaux sans recherche (l'union de leurs colonnes, champs d'un bloc de filtres compris). Dès qu'un graphique, un KPI, une carte ou un composant libre lit la même source, ou qu'un tableau porte une recherche locale (elle cherche dans toutes les valeurs de la ligne), la source garde toutes ses colonnes. Pas de `select` non plus quand le tableau affiche tout, quand un nom n'est pas un champ connu de la source (l'API répondrait 400) ou quand la source n'a aucune ligne chargée.
