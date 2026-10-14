---
'dsfr-data': minor
---

**Une recherche n'est plus un filtre `contains` : en mode `context`, `dsfr-data-search` confie une recherche au contexte, et chaque source la traduit (#1285, ADR-159, lot 3).**

Filtrer et chercher sont deux besoins. Le filtre `contains` est une règle exacte (sous-chaîne, accents respectés), que la bibliothèque définit. La recherche est ce qu'un visiteur tape : on en attend de la tolérance, et quand l'API d'une source sait chercher, c'est elle qui cherche. Jusqu'ici `dsfr-data-search context="…"` émettait un filtre `champ:contains:terme` ; elle porte désormais le terme, le champ unique de `fields` et `operator`, que **chaque source cible traduit** :

| Source cible | Qui cherche | Comparaison |
|---|---|---|
| Opendatasoft | le moteur du portail, borné au champ : `search(champ, "terme")` | par début de mot, casse et accents ignorés — « aliment » trouve « alimentation », « mentation » non |
| Tabular, Grist | l'API : `champ:contains:terme`, la clause d'avant | sous-chaîne, casse ignorée, accents respectés |
| INSEE Melodi, adaptateur tiers | la source, dans le navigateur | sur les lignes chargées, avec `operator`, casse et accents ignorés |

Mesuré le 2026-10-13 sur `rappelconso-v2-gtin-trie` (data.economie.gouv.fr, 18 563 lignes) : `search(categorie_produit, "aliment")` rend 15 636 lignes, `search("aliment")` 15 866, `search(sous_categorie_produit, "iand")` (milieu de mot) 0, `search(categorie_produit, "hygiene")` et `"hygiène"` 367 l'un et l'autre.

Ce qui change pour une page existante :

- **Opendatasoft** — la recherche est confiée au portail au lieu d'être calculée dans le navigateur comme un `contains`. Elle entre dans le `where` de la source : **une cible en `server-side` et des `dsfr-data-facets server-facets` voisines fonctionnent** (elles passaient en erreur de configuration depuis le lot 1), et pagination, compteurs de facettes et lignes comptent le même ensemble. La recherche trouve par début de mot et ignore les accents ; elle ne trouve plus une sous-chaîne prise au milieu d'un mot. Le champ cherché doit être du texte : sur un champ numérique (le portail répondrait HTTP 400), la recherche est calculée dans le navigateur et un avertissement le dit.
- **Tabular, Grist** — la même clause part à l'API, les mêmes lignes reviennent.
- **INSEE Melodi** — le terme n'était appliqué nulle part (l'API n'a pas de filtre de texte) ; la source le calcule maintenant dans le navigateur. En `server-side`, c'est une erreur de configuration qui dit quoi écrire.
- **Source en mode URL** — inchangé : la commande est refusée et signalée en console.
- Quand l'API de sa source sert la recherche, `dsfr-data-search` ne refiltre plus les lignes qu'elle reçoit (un portail cherche par mots : la sous-chaîne locale retirerait des lignes qu'il a retenues) ; elle les laisse passer avec leur meta, et son compteur `count` annonce le total du serveur. Conséquence sur Tabular et Grist : `operator="starts"` n'affine plus, dans la chaîne de la recherche, des lignes que l'API a déjà retenues par sous-chaîne.

Ce qui ne change pas : l'URL (`url-sync` du contexte, un paramètre au nom du champ), le tag « Recherche : terme » de `dsfr-data-context-tags`, `{{champ}}` de `dsfr-data-context-value`, le retrait par le tag ou par « Tout effacer » ; l'attribut `server-search` et son gabarit (`search("{q}")` sur Opendatasoft, tous les champs) ; la recherche autonome, sans `context`. Aucun attribut ni opérateur nouveau.

Pour qui écrit un adaptateur ou lit le contexte : `ProviderConfig.query.contextSearchTemplate` déclare ce que l'API fait d'une recherche dans des champs nommés ; `ContextFilterLike` gagne la méthode optionnelle `buildSearch()` (le filtre d'une recherche a une clause colon vide), et `dsfr-data-source-command` le champ `clientSearch`.

L'issue #1285 ne cite aucun identifiant du registre du banc d'essai.
