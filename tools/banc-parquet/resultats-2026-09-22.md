# Banc Parquet (#1022) — résultats du 2026-09-22

Généré par `npx playwright test --config tools/banc-parquet/playwright.config.ts` (voir README.md). Médiane de 3 répétition(s), contexte de navigateur neuf à chaque fois.

## Environnement

- Poste : Apple M4 (10 cœurs), 16 Gio, Darwin 27.0.0
- Navigateur : Chromium 151.0.7922.34 (headless, Playwright)
- Réseau (estimation Chromium `navigator.connection`) : {"type":"4g","downlinkMbps":10,"rttMs":0}
- Aller-retour `data/?page_size=1` depuis Node : 568 ms, 97 ms, 18 ms
- Début du passage : 2026-09-22T21:14:17.555Z
- Profil **mobile** : preset DevTools « Fast 3G » (562,5 ms de latence, 1,44 Mbit/s descendant) via `Network.emulateNetworkConditions` + CPU ×4 (`Emulation.setCPUThrottlingRate`).

## Mesures

- **TTFR** : du début du scénario à la première ligne exploitable (A : premier groupe de lignes décodé pour les 3 colonnes, résolution de l’URL Parquet par l’API data.gouv comprise ; B/C : première page reçue et parsée).
- **Lignes** : A lit le jeu entier ; B et C s’arrêtent à 1 000 lignes (plafond #1020, 5 requêtes) ; B25k au plafond de l’adaptateur (25 000 lignes, 125 requêtes, #286), mesuré une seule fois par jeu et profil (blocage IP, voir README). C à 25 000 lignes n’est pas mesuré.
- **Octets / requêtes** : reçus, en-têtes compris (`Network.loadingFinished.encodedDataLength`), hors page et hors module.
- **Mémoire** : `performance.memory.usedJSHeapSize` ; *pic* échantillonné (20 ms + à chaque bloc), *retenue* = après `gc()`, lignes (objets) encore référencées.
- **Module** (A seulement) : import de hyparquet + fzstd depuis jsDelivr, mesuré à part, non compté dans TTFR/total.

### Profil poste

| Jeu | Scénario | TTFR | Total | Lignes | Octets | Requêtes | Pic mémoire | Mémoire retenue | Module |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Élus maires (35 k) | A · Parquet, jeu entier (plages, 3 col.) | 0.34 s | 0.34 s | 34 826 / 34 826 | 351 Ko | 5 | 11.11 Mo | 3.81 Mo | 0.04 s / 26 Ko |
| Élus maires (35 k) | B · API 200/page, séquentiel, 1 000 l. | 0.05 s | 0.22 s | 1 000 / 34 826 | 12 Ko | 5 | 274 Ko | 78 Ko |  |
| Élus maires (35 k) | C · API 200/page, 4 en vol, 1 000 l. | 0.06 s | 0.11 s | 1 000 / 34 826 | 12 Ko | 5 | 277 Ko | 84 Ko |  |
| Élus maires (35 k) | B · API 200/page, séquentiel, 25 000 l. (1 mesure) | 0.05 s | 8.26 s | 25 000 / 34 826 | 310 Ko | 125 | 5.88 Mo | 1.58 Mo |  |
| IRVE consolidée (223 k) | A · Parquet, jeu entier (plages, 3 col.) | 0.42 s | 0.66 s | 223 174 / 223 174 | 2.17 Mo | 17 | 39.21 Mo | 18.33 Mo | 0.04 s / 26 Ko |
| IRVE consolidée (223 k) | B · API 200/page, séquentiel, 1 000 l. | 0.11 s | 0.42 s | 1 000 / 223 174 | 11 Ko | 5 | 249 Ko | 94 Ko |  |
| IRVE consolidée (223 k) | C · API 200/page, 4 en vol, 1 000 l. | 0.05 s | 0.07 s | 1 000 / 223 174 | 11 Ko | 5 | 250 Ko | 101 Ko |  |
| IRVE consolidée (223 k) | B · API 200/page, séquentiel, 25 000 l. (1 mesure) | 0.07 s | 10.75 s | 25 000 / 223 174 | 280 Ko | 125 | 8.53 Mo | 2.33 Mo |  |
| Véhicules par commune (703 k) | A · Parquet, jeu entier (plages, 3 col.) | 0.28 s | 0.63 s | 703 545 / 703 545 | 1.95 Mo | 47 | 71.35 Mo | 39.09 Mo | 0.04 s / 26 Ko |
| Véhicules par commune (703 k) | B · API 200/page, séquentiel, 1 000 l. | 0.12 s | 0.31 s | 1 000 / 703 545 | 7 Ko | 5 | 156 Ko | 54 Ko |  |
| Véhicules par commune (703 k) | C · API 200/page, 4 en vol, 1 000 l. | 0.05 s | 0.13 s | 1 000 / 703 545 | 7 Ko | 5 | 158 Ko | 60 Ko |  |
| Véhicules par commune (703 k) | B · API 200/page, séquentiel, 25 000 l. (1 mesure) | 0.06 s | 10.87 s | 25 000 / 703 545 | 179 Ko | 125 | 4.63 Mo | 1.17 Mo |  |

<details><summary>Valeurs brutes (ms) par répétition</summary>

| Jeu | Scénario | TTFR | Total | dont résolution data.gouv (A) | Préflights | Anomalies HTTP / réessais |
|---|---|---|---|---|---:|---|
| elus | A | 1395 · 338 · 294 | 1395 · 338 · 294 | 81 · 77 · 85 | 0 · 0 · 0 | {} · {} · {} |
| elus | B1k | 95 · 52 · 48 | 350 · 215 · 175 |  | 0 · 0 · 0 | {} · {} · {} |
| elus | C1k | 51 · 91 · 61 | 115 · 114 · 82 |  | 0 · 0 · 0 | {} · {} · {} |
| elus | B25k | 48 | 8264 |  | 0 | {} |
| irve | A | 1029 · 416 · 371 | 1274 · 663 · 487 | 65 · 74 · 58 | 0 · 0 · 0 | {} · {} · {} |
| irve | B1k | 119 · 50 · 115 | 450 · 423 · 183 |  | 0 · 0 · 0 | {} · {} · {} |
| irve | C1k | 54 · 54 · 50 | 75 · 75 · 70 |  | 0 · 0 · 0 | {} · {} · {} |
| irve | B25k | 71 | 10747 |  | 0 | {} |
| vehicules | A | 2837 · 237 · 276 | 3190 · 633 · 555 | 100 · 52 · 100 | 0 · 0 · 0 | {} · {} · {} |
| vehicules | B1k | 122 · 116 · 55 | 431 · 315 · 137 |  | 0 · 0 · 0 | {} · {} · {} |
| vehicules | C1k | 49 · 110 · 51 | 153 · 132 · 70 |  | 0 · 0 · 0 | {} · {} · {} |
| vehicules | B25k | 58 | 10867 |  | 0 | {} |

</details>

### Profil mobile

| Jeu | Scénario | TTFR | Total | Lignes | Octets | Requêtes | Pic mémoire | Mémoire retenue | Module |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Élus maires (35 k) | A · Parquet, jeu entier (plages, 3 col.) | 3.79 s | 3.79 s | 34 826 / 34 826 | 351 Ko | 5 | 8.13 Mo | 3.57 Mo | 0.73 s / 25 Ko |
| Élus maires (35 k) | B · API 200/page, séquentiel, 1 000 l. | 0.61 s | 2.94 s | 1 000 / 34 826 | 12 Ko | 5 | 278 Ko | 78 Ko |  |
| Élus maires (35 k) | C · API 200/page, 4 en vol, 1 000 l. | 0.62 s | 1.25 s | 1 000 / 34 826 | 12 Ko | 5 | 279 Ko | 84 Ko |  |
| Élus maires (35 k) | B · API 200/page, séquentiel, 25 000 l. (1 mesure) | 0.61 s | 72.74 s | 25 000 / 34 826 | 310 Ko | 125 | 4.10 Mo | 1.58 Mo |  |
| IRVE consolidée (223 k) | A · Parquet, jeu entier (plages, 3 col.) | 7.85 s | 13.91 s | 223 174 / 223 174 | 2.17 Mo | 17 | 41.91 Mo | 17.75 Mo | 0.73 s / 25 Ko |
| IRVE consolidée (223 k) | B · API 200/page, séquentiel, 1 000 l. | 0.61 s | 2.93 s | 1 000 / 223 174 | 11 Ko | 5 | 253 Ko | 94 Ko |  |
| IRVE consolidée (223 k) | C · API 200/page, 4 en vol, 1 000 l. | 0.61 s | 1.23 s | 1 000 / 223 174 | 11 Ko | 5 | 253 Ko | 101 Ko |  |
| IRVE consolidée (223 k) | B · API 200/page, séquentiel, 25 000 l. (1 mesure) | 0.63 s | 72.78 s | 25 000 / 223 174 | 280 Ko | 125 | 5.02 Mo | 2.33 Mo |  |
| Véhicules par commune (703 k) | A · Parquet, jeu entier (plages, 3 col.) | 4.19 s | 12.83 s | 703 545 / 703 545 | 1.95 Mo | 47 | 63.91 Mo | 39.24 Mo | 0.74 s / 26 Ko |
| Véhicules par commune (703 k) | B · API 200/page, séquentiel, 1 000 l. | 0.61 s | 2.91 s | 1 000 / 703 545 | 7 Ko | 5 | 160 Ko | 54 Ko |  |
| Véhicules par commune (703 k) | C · API 200/page, 4 en vol, 1 000 l. | 0.61 s | 1.22 s | 1 000 / 703 545 | 7 Ko | 5 | 160 Ko | 60 Ko |  |
| Véhicules par commune (703 k) | B · API 200/page, séquentiel, 25 000 l. (1 mesure) | 0.60 s | 71.62 s | 25 000 / 703 545 | 179 Ko | 125 | 3.06 Mo | 1.17 Mo |  |

<details><summary>Valeurs brutes (ms) par répétition</summary>

| Jeu | Scénario | TTFR | Total | dont résolution data.gouv (A) | Préflights | Anomalies HTTP / réessais |
|---|---|---|---|---|---:|---|
| elus | A | 3786 · 3792 · 3790 | 3787 · 3792 · 3790 | 600 · 601 · 602 | 0 · 0 · 0 | {} · {} · {} |
| elus | B1k | 612 · 611 · 610 | 2936 · 2945 · 2944 |  | 0 · 0 · 0 | {} · {} · {} |
| elus | C1k | 611 · 620 · 644 | 1245 · 1253 · 1277 |  | 0 · 0 · 0 | {} · {} · {} |
| elus | B25k | 611 | 72742 |  | 0 | {} |
| irve | A | 7911 · 7852 · 7841 | 13947 · 13909 · 13906 | 616 · 611 · 610 | 0 · 0 · 0 | {} · {} · {} |
| irve | B1k | 620 · 610 · 612 | 2943 · 2927 · 2927 |  | 0 · 0 · 0 | {} · {} · {} |
| irve | C1k | 612 · 618 · 610 | 1235 · 1244 · 1226 |  | 0 · 0 · 0 | {} · {} · {} |
| irve | B25k | 627 | 72776 |  | 0 | {} |
| vehicules | A | 4200 · 4175 · 4185 | 12857 · 12832 · 12832 | 625 · 603 · 603 | 0 · 0 · 0 | {} · {} · {} |
| vehicules | B1k | 613 · 611 · 604 | 2920 · 2910 · 2910 |  | 0 · 0 · 0 | {} · {} · {} |
| vehicules | C1k | 613 · 604 · 612 | 1219 · 1211 · 1220 |  | 0 · 0 · 0 | {} · {} · {} |
| vehicules | B25k | 603 | 71617 |  | 0 | {} |

</details>

## Typage Parquet vs `profile/`

Colonnes non textuelles selon `profile/` (ou dont le type Parquet n’est pas une chaîne).

| Jeu | Colonne | profile/ (format / python_type) | Parquet (physique / logique) |
|---|---|---|---|
| elus | `Code de la collectivité à statut particulier` | float / float | DOUBLE / — |
| elus | `Date de naissance` | date / date | INT32 / DATE |
| elus | `Code de la catégorie socio-professionnelle` | int / int | INT64 / — |
| elus | `Date de début du mandat` | date / date | INT32 / DATE |
| elus | `Date de début de la fonction` | date / date | INT32 / DATE |
| irve | `coordonneesXY` | json / json | BYTE_ARRAY / STRING |
| irve | `nbre_pdc` | int / int | INT64 / — |
| irve | `puissance_nominale` | float / float | DOUBLE / — |
| irve | `prise_type_ef` | bool / bool | BOOLEAN / — |
| irve | `prise_type_2` | bool / bool | BOOLEAN / — |
| irve | `prise_type_combo_ccs` | bool / bool | BOOLEAN / — |
| irve | `prise_type_chademo` | bool / bool | BOOLEAN / — |
| irve | `prise_type_autre` | bool / bool | BOOLEAN / — |
| irve | `gratuit` | bool / bool | BOOLEAN / — |
| irve | `paiement_acte` | bool / bool | BOOLEAN / — |
| irve | `paiement_cb` | bool / bool | BOOLEAN / — |
| irve | `paiement_autre` | bool / bool | BOOLEAN / — |
| irve | `reservation` | bool / bool | BOOLEAN / — |
| irve | `station_deux_roues` | bool / bool | BOOLEAN / — |
| irve | `date_mise_en_service` | date / date | INT32 / DATE |
| irve | `date_maj` | date / date | INT32 / DATE |
| irve | `cable_t2_attache` | bool / bool | BOOLEAN / — |
| irve | `last_modified` | datetime_aware / datetime | INT32 / DATE |
| irve | `created_at` | datetime_aware / datetime | INT32 / DATE |
| irve | `consolidated_longitude` | longitude_wgs / float | DOUBLE / — |
| irve | `consolidated_latitude` | latitude_wgs / float | DOUBLE / — |
| irve | `consolidated_is_lon_lat_correct` | bool / bool | BOOLEAN / — |
| irve | `consolidated_is_code_insee_verified` | bool / bool | BOOLEAN / — |
| irve | `consolidated_is_code_insee_modified` | bool / bool | BOOLEAN / — |
| vehicules | `DATE_ARRETE` | date / date | INT32 / DATE |
| vehicules | `NB_VP_RECHARGEABLES_EL` | int / int | INT64 / — |
| vehicules | `NB_VP_RECHARGEABLES_GAZ` | int / int | INT64 / — |
| vehicules | `NB_VP` | int / int | INT64 / — |

- elus : codec ZSTD, 1 groupe(s) de lignes (34 826), écrit par « parquet-cpp-arrow version 24.0.0 ».
- irve : codec ZSTD, 5 groupe(s) de lignes (50 000, 50 000, 50 000, 50 000, 23 174), écrit par « parquet-cpp-arrow version 24.0.0 ».
- vehicules : codec ZSTD, 15 groupe(s) de lignes (50 000, 50 000, 50 000, 50 000, 50 000, 50 000, 50 000, 50 000, 50 000, 50 000, 50 000, 50 000, 50 000, 50 000, 3 545), écrit par « parquet-cpp-arrow version 24.0.0 ».

## Intégrité : Parquet vs API tabulaire

| Jeu | Colonne | Lignes Parquet | `meta.total` | Somme Parquet | `__sum` API | Écart |
|---|---|---:|---:|---:|---:|---:|
| elus | `Code de la catégorie socio-professionnelle` | 34 826 | 34 826 | 1 749 476 | 1 749 476 | 0.00 |
| irve | `puissance_nominale` | 223 174 | 223 174 | 16 893 071,179 | 16 893 071,179 | 7.71e-7 |
| vehicules | `NB_VP` | 703 545 | 703 545 | 1 377 794 508 | 1 377 794 508 | 0.00 |

## Fraîcheur de l’export Parquet

`last_modified` est la date de la ressource (une moisson peut la bouger sans changer le contenu) ; `analysis:last-modified-at` est la date de contenu détectée par l’analyse. Délai = `analysis:parsing:finished_at` − date de contenu (à défaut `last_modified`). Un délai négatif signifierait un Parquet plus ancien que le contenu.

| Ressource | Titre | last_modified | contenu modifié | parsing fini | Délai | Taille fichier → Parquet |
|---|---|---|---|---|---:|---:|
| `2876a346` | elus-maires-mai.csv | 2026-08-11T15:51 | 2026-08-11T15:51 | 2026-08-11T15:51 | 11 s | 4.26 Mo → 821 Ko |
| `eb76d20a` | Consolidation de la dernière version à date d | 2026-09-22T03:40 | 2026-09-22T03:40 | 2026-09-22T03:41 | 85 s | 157.61 Mo → 8.92 Mo |
| `90e0d717` | Fichier csv | 2026-01-29T21:18 | 2026-01-29T21:18 | 2026-07-22T02:42 | 173.2 j | 51.67 Mo → 2.70 Mo |
| `5102dfdc` | Bornes de recharge de véhicule électrique iss | 2025-10-05T12:40 | 2025-10-05T12:40 | 2025-10-07T05:34 | 1.7 j | — → 1.30 Mo |
| `2b07e802` | les-arbres.csv | 2026-09-18T08:35 | 2026-09-11T08:34 | 2026-09-17T22:20 | 6.6 j | — → 7.58 Mo |
| `83f0fb0e` | Caract_2024.csv | 2025-10-21T11:59 | 2025-10-21T11:59 | 2025-10-21T12:56 | 3449 s | 6.54 Mo → 1.98 Mo |
| `104dbb32` | caract-2023.csv | 2024-10-28T10:31 | 2024-10-28T10:31 | 2025-06-23T10:03 | 238.0 j | 6.59 Mo → 2.40 Mo |
| `07a88205` | caracteristiques-2020.csv | 2021-11-10T11:12 | 2021-11-10T10:12 | 2023-08-29 09:54 | 656.9 j | 5.66 Mo → pas d’export |
| `0582ad65` | coordonnees-des-structures-dgfip.csv | 2026-04-01T13:53 | 2026-04-01T13:53 | 2026-05-03T19:40 | 32.2 j | — → 1.70 Mo |
| `5ec141e4` | stations_meteo_france.csv | 2025-01-04T12:41 | 2025-01-04T12:41 | 2025-07-15T17:11 | 192.2 j | 2.01 Mo → 982 Ko |

Délai maximal (ressources avec export) : 238.0 j ; minimal : 11 s.
