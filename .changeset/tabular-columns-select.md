---
'dsfr-data': minor
---

Tabular : moins d'octets, sans changer un chiffre (#985).

- **`select` devient `columns=`** : sur une source `api-type="tabular"`, `select="nom, Code sexe"` ne charge que ces colonnes, en chargement complet comme en pagination serveur. Mesuré le 22 septembre 2026 : 366 892 → 22 383 octets pour 200 bornes IRVE à trois colonnes, 34 721 → 3 098 octets pour 50 élus à deux colonnes. Rien n'est ajouté d'office : une colonne lue en aval doit figurer dans la liste. Sans effet avec un `group-by` ou un `aggregate` (l'API refuse `columns` à côté d'un agrégateur) ; un `select` à expression (grammaire Opendatasoft) est ignoré avec un avertissement.
- **Les noms de colonnes à espaces, accents et ponctuation se délèguent** (regroupement, agrégat, filtre, tri), percent-encodés : l'API les accepte. Le garde-fou qui les refusait (#244, #289) faisait télécharger jusqu'à 25 000 lignes pour agréger dans le navigateur. Seuls `,` `:` `|`, séparateurs de la grammaire colon, restent non délégables.
- **`fetchProfile()`** sur l'adaptateur Tabular : lit `/profile/` (format et type de chaque colonne, modalités fréquentes), mémorisé par ressource, annulable, jamais appelé pendant un chargement de données.
- Le Builder Carto, le Builder (tableau) et l'Assistant IA (tableau) émettent `select` depuis les champs configurés d'une source Tabular, seulement quand chaque nom est une colonne détectée.
