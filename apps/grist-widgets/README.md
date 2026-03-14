# Widgets Grist DSFR

Custom widgets conformes DSFR pour [Grist](https://www.getgrist.com/), permettant de visualiser vos données avec des graphiques, KPI, cartes et tableaux conformes au Design System de l'État français.

## Utilisation dans Grist

Les widgets sont déployés automatiquement sur GitHub Pages à chaque push sur `main`.

### URLs de production

Utilisez ces URLs dans Grist (Menu widget → Custom → URL) :

| Widget | URL | Description |
|--------|-----|-------------|
| **Graphique / Carte / KPI** | `https://bmatge.github.io/dsfr-data/chart/` | Widget polyvalent : graphiques, cartes France, KPI. Choisissez le type dans les options. |
| **Tableau** | `https://bmatge.github.io/dsfr-data/datalist/` | Tableau avec recherche, tri, pagination, export CSV |

### Widget Graphique / Carte / KPI

Ce widget unique supporte **10 types de visualisations** :

**Graphiques** :
- bar : Barres verticales
- line : Lignes
- pie : Camembert
- radar : Radar
- scatter : Nuage de points
- gauge : Jauge
- bar-line : Barres + Lignes

**Cartes France** :
- map : Départements
- map-reg : Régions

**KPI** :
- kpi : Indicateur clé de performance

### Configuration des colonnes

Dans les options du widget Grist, mappez les colonnes dont vous avez besoin selon votre type de visualisation :

| Colonne | Type | Utilisation | Obligatoire ? |
|---------|------|-------------|--------------|
| **Label** | Texte | Étiquettes (graphiques) ou Nom (cartes) | Optionnel |
| **Value** | Numérique | Valeur principale | **Requis** |
| **Value2** | Numérique | Série secondaire (graphiques multi-séries) | Optionnel |
| **Code** | Texte | Code géo INSEE (cartes uniquement) | Pour maps uniquement |

**Exemples** :
- **Graphique à barres** : Mapper Label + Value
- **Carte départements** : Mapper Code + Value (+ Label optionnel)
- **KPI** : Mapper uniquement Value

### Options du widget

Cliquez sur l'icône ⚙️ dans Grist pour configurer :

**Options communes** :
- **Type de visualisation** : choisir parmi les 10 types disponibles
- **Palette de couleurs** : Bleu France, catégorique, séquentielle, divergente, neutre
- **Unité (tooltip)** : ex: EUR, %, habitants

**Options pour graphiques** (bar, line uniquement) :
- Barres horizontales
- Barres empilées

**Options pour KPI** :
- Agrégation : moyenne, somme, comptage, min, max
- Format : nombre, pourcentage, euro, décimal
- Libellé KPI : texte affiché sous la valeur
- Icône KPI : classe Remix Icon (ex: ri-line-chart-line)
- Couleur KPI : bleu, vert, orange, rouge, ou automatique (seuils)

### Widget Tableau

- Aucun mapping requis - affiche automatiquement toutes les colonnes
- Options : pagination (10/20/50/tout), barre de recherche, export CSV

## Développement local

### Prérequis

```bash
npm run build              # Build la lib principale (génère le UMD)
npm run build:shared       # Build le package shared
```

### Lancer le serveur de dev

```bash
npm run dev --workspace=@dsfr-data/app-grist-widgets
```

Le serveur démarre sur `http://localhost:5173/` (ou 5174 si le port est occupé).

### URLs de dev

- **Test local sans Grist** : http://localhost:5173/test-local.html
- **Widget Chart** : http://localhost:5173/chart/index.html
- **Widget Datalist** : http://localhost:5173/datalist/index.html

### Tester dans Grist en local

1. Créez une table avec des données dans Grist
2. Ajoutez un widget Custom
3. Dans "Custom URL", utilisez : `http://localhost:5173/chart/index.html`
4. Mappez les colonnes nécessaires selon votre type de visualisation
5. Testez le panneau d'options (⚙️) pour changer le type de visualisation

## Build et déploiement

### Build local

```bash
npm run build --workspace=@dsfr-data/app-grist-widgets
```

Génère le dossier `dist/` avec :
- `chart/` : Widget multi-types (graphiques + cartes + KPI)
- `datalist/` : Widget tableau
- `assets/` : JavaScript et CSS bundlés
- `lib/dsfr-data.umd.js` : build UMD de la bibliothèque
- `manifest.json` : manifeste Grist

### Déploiement automatique

Le workflow `.github/workflows/deploy-grist-widgets.yml` déploie automatiquement sur GitHub Pages lors :
- De push sur `main` modifiant `apps/grist-widgets/**`, `src/**` ou `packages/shared/**`
- De déclenchement manuel (workflow_dispatch)

Le déploiement :
1. Build le package `@dsfr-data/shared`
2. Build la lib principale (génère `dist/dsfr-data.umd.js`)
3. Build les grist-widgets
4. Déploie `apps/grist-widgets/dist/` sur GitHub Pages

## Architecture

```
apps/grist-widgets/
├── chart/index.html          # Widget multi-types (graphiques + cartes + KPI)
├── datalist/index.html       # Widget tableau
├── src/
│   ├── chart.ts              # Entry point widget multi-types
│   ├── datalist.ts           # Entry point widget tableau
│   ├── shared/
│   │   ├── grist-bridge.ts           # Pont avec l'API Grist
│   │   └── grist-options-panel.ts    # Panneau d'options partagé
│   ├── styles/
│   │   └── grist-widgets.css         # Styles communs (zoom 80%)
│   └── types/
│       └── grist-plugin-api.d.ts     # Types TypeScript
├── test-local.html           # Page de test sans Grist
├── manifest.json             # Manifeste Grist (déployé sur Pages)
└── vite.config.ts            # Config Vite
```

## API Grist

Les widgets utilisent l'API Plugin Grist :

```js
import grist from 'grist-plugin-api';

// Écouter les changements de données
grist.ready();
grist.onRecords((records) => {
  // Dispatcher les données vers les composants dsfr-data-*
  DsfrData.dispatchDataLoaded('grist', records);
});

// Afficher le panneau d'options
grist.onEditOptions(() => {
  // Afficher le panneau de configuration
});
```

## Dépendances

- **@gouvfr/dsfr** : Design System de l'État Français
- **@gouvfr/dsfr-chart** : Composants Vue de graphiques DSFR
- **dsfr-data** : Web Components Lit (build UMD)
- **grist-plugin-api** : API Plugin Grist

## Licence

Voir LICENSE à la racine du projet.
