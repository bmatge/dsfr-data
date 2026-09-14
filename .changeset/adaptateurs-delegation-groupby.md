---
'dsfr-data': patch
---

Délégation du regroupement : la pagination serveur Tabular émet enfin ses agrégats, et le `select` ODS est composé depuis l'agrégat.

Deux chemins rendaient un chiffre faux et plausible, sans erreur, parce que la query — voyant l'adaptateur se déclarer capable de regrouper côté serveur — marquait la délégation et sautait son calcul client.

- **Tabular en `server-side` (#852)** : `buildServerSideUrl` n'émettait ni `champ__groupby` ni `champ__sum`, contrairement au chargement complet. La page rendait 40 lignes brutes comme s'il s'agissait des 8 groupes attendus, et la colonne d'agrégat, absente de la réponse, s'affichait « — » là où la somme valait 1 909 000. Les deux constructeurs d'URL partagent désormais le même émetteur : filtres, `champ__groupby`, `champ__fonction` et `champ__sort` partent dans les deux modes. Quand la délégation n'est pas possible (champ à espaces, `distinct`), la page revient en lignes brutes et le signale, au lieu de les faire passer pour des groupes.
- **Opendatasoft, source à `select` explicite (#859)** : quand une `dsfr-data-query group-by` est seule lectrice d'une source qui déclare un `select`, ce `select` écrasait les colonnes d'agrégat — l'URL partait sans `count(nom_du_professionnel) as nb` et le KPI affichait 0 pour 3 458 et 224. Le `select` est maintenant composé depuis l'agrégat (colonnes d'agrégat + colonnes du `group-by`), dans `/records`, `/exports/json` et la pagination serveur. Si le `select` de la source définit par une expression aliasée (`year(date) as annee`) une colonne que le regroupement vise, la délégation est explicitement refusée : avertissement nommé en console, regroupement calculé côté client. Résout les constats BUG-009 et PG-015 du banc d'essai.

Les deux défauts étaient trouvés par la vérification des données (ADR-122) ; leurs contrôles, jusqu'ici en `skip`, sont désormais mesurés.
