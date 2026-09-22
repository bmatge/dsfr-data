# Banc « zone visible » simulée (#1023) — résultats du 2026-09-22

Généré par `npx playwright test --config tools/banc-bbox/playwright.config.ts` (voir README.md).

- Poste : Apple M4 (10 cœurs), 16 Gio, Darwin 27.0.0, Node v24.21.0
- Début du passage : 2026-09-22T21:42:33.955Z
- Temps API = requête envoyée → corps JSON reçu (Node `fetch`), sans rendu. Octets = corps JSON décompressé.
- Filtre : `lat__greater=S&lat__less=N&lon__greater=O&lon__less=E` (bornes incluses), ce que produirait `lat:gte:S, lat:lte:N, lon:gte:O, lon:lte:E` via l’adaptateur. Colonne texte « lat, lon » : latitude seule, comparaison textuelle.

Rectangles :

- **ville** — Paris centre (1er-4e) : lat 48.85 → 48.87, lon 2.33 → 2.37
- **departement** — Paris (75) : lat 48.815 → 48.902, lon 2.224 → 2.47
- **france** — France métropolitaine : lat 41.3 → 51.1, lon -5.2 → 9.6

Jeux :

- **irve** — IRVE consolidée (223 k) — lat/lon float (`eb76d20a-8501-400e-b336-d85724de5435`)
- **accidents** — Accidents 2024, caractéristiques (54 k) — lat float, long « longitude_l93 » (`83f0fb0e-e0ef-47fe-93dd-9aaee851674a`)
- **arbres** — Arbres de Paris (220 k) — geo_point_2d texte « lat, lon » (`2b07e802-8dd7-4744-a0b2-8810f95efdfc`)

## Rectangles (une page de 200)

| Jeu | Rectangle | `columns=` | Temps (médiane) | Essais (ms) | `meta.total` | Octets | Statuts |
|---|---|---|---:|---|---:|---:|---|
| irve | ville | oui | 0.15 s | 212 · 152 · 20 | 1 114 | 27.0 Ko | 200 |
| irve | ville | non | 0.20 s | 209 · 205 · 27 | 1 114 | 371.9 Ko | 200 |
| irve | departement | oui | 0.12 s | 120 · 24 · 144 | 13 272 | 27.5 Ko | 200 |
| irve | departement | non | 0.15 s | 165 · 151 · 36 | 13 272 | 375.1 Ko | 200 |
| irve | france | oui | 0.02 s | 160 · 17 · 17 | 222 318 | 22.4 Ko | 200 |
| irve | france | non | 0.17 s | 173 · 198 · 30 | 222 318 | 366.4 Ko | 200 |
| accidents | ville | oui | 0.09 s | 106 · 93 · 18 | 451 | 13.1 Ko | 200 |
| accidents | ville | non | 0.09 s | 107 · 94 · 23 | 451 | 49.0 Ko | 200 |
| accidents | departement | oui | 0.07 s | 69 · 20 · 76 | 5 546 | 13.2 Ko | 200 |
| accidents | departement | non | 0.09 s | 93 · 88 · 22 | 5 546 | 49.2 Ko | 200 |
| accidents | france | oui | 0.07 s | 73 · 84 · 18 | 51 055 | 13.1 Ko | 200 |
| accidents | france | non | 0.10 s | 230 · 60 · 99 | 51 055 | 48.2 Ko | 200 |
| arbres | ville | oui | 0.10 s | 193 · 100 · 20 | 52 028 | 15.9 Ko | 200 |
| arbres | ville | non | 0.12 s | 124 · 123 · 34 | 52 028 | 102.2 Ko | 200 |
| arbres | departement | oui | 0.02 s | 117 · 19 · 21 | 195 350 | 15.9 Ko | 200 |
| arbres | departement | non | 0.12 s | 123 · 36 · 137 | 195 350 | 101.9 Ko | 200 |
| arbres | france | oui | 0.02 s | 100 · 21 · 21 | 220 022 | 15.9 Ko | 200 |
| arbres | france | non | 0.11 s | 110 · 35 · 124 | 220 022 | 102.3 Ko | 200 |

## Exactitude du filtre serveur

`serveur` = `meta.total` de la requête filtrée. Les autres colonnes sont comptées sur le jeu ENTIER relu depuis son export Parquet : `exact` (numérique, les 4 bornes) ; `client 25 k` = ce que le filtre client d’aujourd’hui peut montrer (25 000 premières lignes, ordre du fichier) ; `bande lat` = latitude seule ; `texte` = comparaison textuelle de la chaîne « lat, lon » (ce que fait l’API sur une colonne string).

| Jeu | Rectangle | serveur | exact | client 25 k | bande lat | texte | lignes | sans coordonnées |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| irve | ville | 1 114 | 1 114 | 229 | 3 763 | — | 223 174 | 0 |
| irve | departement | 13 272 | 13 272 | 953 | 18 735 | — | 223 174 | 0 |
| irve | france | 222 318 | 222 318 | 24 982 | 222 406 | — | 223 174 | 0 |
| accidents | ville | 451 | 451 | 202 | 1 829 | — | 54 402 | 0 |
| accidents | departement | 5 546 | 5 546 | 2 481 | 7 433 | — | 54 402 | 0 |
| accidents | france | 51 055 | 51 055 | 23 404 | 51 063 | — | 54 402 | 0 |
| arbres | ville | 52 028 | 8 043 | 912 | 52 028 | 52 028 | 220 022 | 0 |
| arbres | departement | 195 350 | 195 350 | 22 200 | 195 350 | 195 350 | 220 022 | 0 |
| arbres | france | 220 022 | 220 022 | 25 000 | 220 022 | 220 022 | 220 022 | 0 |

## Séquence pan (IRVE, 10 rectangles « ville » glissant vers l’est, un geste toutes les 100 ms)

« Dernière donnée » = du dernier geste à la réponse du dernier rectangle.

| Stratégie | Requêtes envoyées | Annulées (client) | Dernière donnée (médiane) | Essais (ms) |
|---|---:|---:|---:|---|
| sans anti-rebond, sans annulation | 10 · 10 · 10 | — | 0.02 s | 152 · 20 · 19 |
| sans anti-rebond, annulation client | 10 · 10 · 10 | 6 · 1 · 0 | 0.05 s | 210 · 52 · 20 |
| anti-rebond 300 ms (défaut) | 1 · 1 · 1 | — | 0.36 s | 356 · 353 · 357 |

Temps de chacune des 10 requêtes superposées (stratégie a, toutes répétitions) : médiane 0.02 s, max 0.21 s ; octets pour 10 requêtes : 264.2 Ko.

## Premier affichage (IRVE, pages séquentielles de 200 comme `fetchAll`)

| Cas | Jusqu’à la dernière page (médiane) | Essais (ms) | Lignes | Requêtes | Octets |
|---|---:|---|---:|---:|---:|
| sans filtre, limit 1 000 (#1020, référence « avant ») | 0.46 s | 464 · 457 · 131 | 1 000 | 5 | 116.5 Ko |
| require-where + bbox Paris (75), limit 1 000 | 0.14 s | 732 · 131 · 139 | 1 000 | 5 | 132.2 Ko |
| require-where + bbox Paris (75), plafond 25 000 | 10.67 s | 10668 | 13 272 | 67 | 1.74 Mo |

Le cas « sans filtre, plafond 25 000 » (125 pages) est mesuré par le banc Parquet (#1022, scénario B, IRVE, profil poste) : même requête, même projection.
