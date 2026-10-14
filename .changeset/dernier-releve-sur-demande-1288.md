---
'dsfr-data': minor
---

Nouvel attribut `stale-if-error` sur `dsfr-data-source` : pendant une panne passagère, les blocs gardent leurs derniers chiffres, marqués « Non actualisé » et datés de leur relevé (#1288, proposition B). Sans l'attribut, rien ne change : une source en panne ne laisse toujours aucun ancien chiffre à l'écran.

```html
<dsfr-data-source id="aides" api-type="opendatasoft" … stale-if-error="3600"></dsfr-data-source>
```

La valeur est une durée en secondes, et c'est aussi la borne : l'âge maximal, compté depuis le relevé, d'un chiffre encore affichable. Pas de valeur par défaut, pas de relevé sans durée. C'est à l'intégrateur de le décider, jeu par jeu — un chiffre d'il y a une heure a un sens pour un recensement, pas pour un stock ou des places libres.

**Ce que montre chaque bloc, avec l'attribut, pendant une panne passagère.**

- `dsfr-data-kpi` : le chiffre reste, en gris de texte, filet pointillé, « Relevé à 14 h 32 · non actualisé » sous le libellé. Ni couleur de seuil, ni tendance, ni lignes complémentaires. La tuile garde sa hauteur (140 px mesurés, bureau et 375 px). Son nom accessible devient « Bénéficiaires: 15 909, chiffre relevé aujourd'hui à 14 h 32, non actualisé ».
- `dsfr-data-chart`, cadre officiel compris : le tracé reste, désaturé, sous la mention « Non actualisé — Chiffres relevés aujourd'hui à 14 h 32. » Le nom accessible du graphique se termine par « Chiffres relevés aujourd'hui à 14 h 32, non actualisés. » `databox-date` n'est pas touché : c'est la date de la donnée, pas celle du relevé.
- `dsfr-data-list`, `dsfr-data-display`, `dsfr-data-podium`, `dsfr-data-repeat` : les lignes restent, sous la même mention. Recherche, filtres de colonne, tri et pagination locaux répondent. En pagination ou en tri serveur, la page affichée reste et les autres sont neutralisées (`aria-disabled`) : « Les autres pages reviendront avec les données. »
- `dsfr-data-a11y` : le tableau reste, sa légende devient visible et porte l'étiquette et la date. Le téléchargement reste possible : le bouton dit « Télécharger en CSV (chiffres relevés à 14 h 32) » et le fichier s'appelle `données_relevé-2026-10-13-14h32.csv`. Son contenu est inchangé. L'export de `dsfr-data-list` suit la même règle (`export_relevé-2026-10-13-14h32.csv`).
- `dsfr-data-map` : les formes restent tracées. Toute la carte est atténuée dès qu'une couche est périmée — formes grises, contours en pointillé, légende et encarts compris — et une ligne en bas de carte la date : « Points relevés aujourd'hui à 14 h 32. », ou, avec plusieurs couches, « Couche « Bornes de recharge » : points relevés aujourd'hui à 14 h 32. » Une bulle ouverte sur un point porte la note « Non actualisé · Relevé aujourd'hui à 14 h 32. »
- `dsfr-data-source-status` : le bandeau dit « Une partie des chiffres de cette page n'a pas pu être actualisée » et renvoie à l'heure écrite sur chaque bloc. Il ne dit pas l'heure lui-même : deux sources peuvent ne pas dater du même instant.

L'heure est celle où la page a reçu les chiffres, jamais celle de l'échec ni celle du rendu. Un autre jour que celui du relevé, la date est écrite en entier (« le 12 octobre à 18 h 05 »), jamais « hier ». Pendant un nouvel essai, les chiffres relevés restent en place — une source en `refresh` ne fait pas clignoter la page — et le bouton dit « Nouvel essai en cours… ». Au chargement réussi, l'étiquette disparaît.

**Le relevé n'est jamais affiché**, quelle que soit la durée, et le bloc rend le message de panne, quand : la cause n'est pas passagère (données introuvables 404 / 410, accès restreint 401 / 403, page mal réglée) ; l'appel en échec n'est pas celui qui a produit les chiffres (filtre, page, tri ou emprise `bbox` changés, ou attribut d'une requête modifié pendant la panne) ; le relevé est plus vieux que la durée — le bloc bascule alors de lui-même, sans geste ; rien n'a encore été reçu (page ouverte pendant la panne). Les filtres (`dsfr-data-facets`, `dsfr-data-search`) restent désactivés pendant la panne, avec ou sans l'attribut.

**Ce qui ne change pas.** Sans `stale-if-error`, le rendu d'une panne est celui de la 0.49.1, bloc par bloc. `getData()` et `getDataCache(id)` rendent toujours vide pendant la panne, avec ou sans l'attribut : seuls les composants d'affichage lisent le relevé. `getLastKnownData()` rend les mêmes lignes et la même date qu'avant ; son champ `stale` gagne deux champs optionnels, `staleIfError` et `sameRequest`, présents seulement quand la source porte l'attribut.

**Quatre corrections qui touchent une page existante, sans l'attribut.**

- **`dsfr-data-repeat` ne garde plus ses lignes pendant une panne.** C'était le dernier afficheur à montrer des chiffres du dernier chargement, sans date, sous le message « Données momentanément indisponibles ». Désormais, quand sa source échoue, ses lignes sont retirées — le texte du gabarit, les blocs qu'il contient et les sources scopées (`scopes`) qu'elles servaient — et le message de panne les remplace ; elles sont recréées au chargement réussi, sans rechargement de la page. Un script qui lisait ces lignes pendant une panne n'y trouve plus rien. Avec `stale-if-error`, elles restent pendant une panne passagère, sous la mention datée, puis sont retirées passé la durée.

- La date d'un jeu ré-émis sans rechargement (commande sans effet adressée à la source) restait celle de la ré-émission : `loadedAt` de `dsfr-data-loaded` et de `getLastKnownData()` est maintenant celle du chargement qui a produit les lignes.
- Les sources scopées d'un `dsfr-data-repeat` (`scopes`) dataient leurs lignes de l'instant du découpage ; elles portent la date de leur source. Une ligne née pendant la panne ne perd plus la source d'origine de l'erreur : « Réessayer » y relance la bonne source.
- Sur une carte dont la légende est posée sous le fond, la ligne d'état d'une couche en panne se posait sur la légende ; elle reste en bas de la carte.
