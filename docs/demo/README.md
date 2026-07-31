# Scripts de démo vidéo — chartsBuilder

Scripts de démonstration vidéo de **3 minutes maximum** chacun, couvrant les parcours clés de chartsBuilder (dsfr-data). Chaque script détaille, étape par étape : l'écran affiché, les clics et actions à réaliser, et le discours de la voix off.

## Série 1 — Prise en main des outils

| # | Vidéo | Fichier | Durée cible |
|---|-------|---------|-------------|
| 1 | Créer des sources de données | [demo-01-sources.md](demo-01-sources.md) | ≤ 3 min |
| 2 | Utiliser le Builder | [demo-02-builder.md](demo-02-builder.md) | ≤ 3 min |
| 3 | Utiliser le Builder IA | [demo-03-builder-ia.md](demo-03-builder-ia.md) | ≤ 3 min |
| 4 | Utiliser le Playground | [demo-04-playground.md](demo-04-playground.md) | ≤ 3 min |
| 5 | Créer un compte et utiliser les favoris | [demo-05-compte-favoris.md](demo-05-compte-favoris.md) | ≤ 3 min |

## Série 2 — Scénarios métier (cas d'usage bout en bout)

| # | Vidéo | Fichier | Durée cible |
|---|-------|---------|-------------|
| 6 | Illustrer un article sur les soldes : recherche de données (INSEE Melodi) → graphique | [demo-06-metier-soldes.md](demo-06-metier-soldes.md) | ≤ 3 min |
| 7 | Article d'actu RappelConso (DGCCRF) : dataviz intégrées dans Drupal 11 | [demo-07-metier-rappelconso.md](demo-07-metier-rappelconso.md) | ≤ 3 min |
| 8 | Tableau de bord prix des contrôles techniques : Claude in Chrome + MCP ChartsBuilder | [demo-08-metier-dashboard-mcp.md](demo-08-metier-dashboard-mcp.md) | ≤ 3 min |

Les scénarios métier s'appuient sur des données publiques **vérifiées au moment de la rédaction** (juillet 2026) : indice de volume des ventes INSEE (`DS_ICA`, activité 47.71), `rappelconso-v2-gtin-trie` (~17 500 fiches) et `prix-controle-technique` (~143 000 tarifs) sur data.economie.gouv.fr. Chaque script métier comporte des chiffres de secours pour la voix off et exige une répétition générale avant tournage.

## Conventions des scripts

- **Format** : chaque script est découpé en séquences horodatées (`0:00 – 0:20`, etc.).
- **Trois colonnes d'information par séquence** :
  - 🖥️ **Écran** : ce qui est visible à l'image (page, panneau, zoom éventuel).
  - 🖱️ **Actions** : les clics, saisies et navigations à exécuter, avec les libellés exacts des boutons.
  - 🎙️ **Voix off** : le texte à lire, calibré pour la durée de la séquence (~140 mots/min).
- **Préparation** : chaque script commence par une section « Prérequis » (état de départ, données à préparer, compte à créer en amont, etc.).
- **Environnement de tournage** : instance locale (`npm run dev`, http://localhost:5173) ou instance de démo déployée. Navigateur en fenêtre 1920×1080, thème clair DSFR, zoom 100 %.

## Fil rouge des données

Pour la cohérence entre les vidéos, les démos s'appuient sur des jeux de données publics déjà référencés dans le [guide utilisateur](../USER-GUIDE.md) :

- **Industrie du futur** — bénéficiaires et investissements par région (data.economie.gouv.fr, OpenDataSoft).
- **Fiscalité locale** — taux de taxes foncières par commune (data.economie.gouv.fr).
- **Répertoire national des élus** — maires de France (tabular-api.data.gouv.fr).
