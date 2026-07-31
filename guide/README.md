# guide/

Pages HTML interactives de démonstration des composants dsfr-data. La documentation Markdown correspondante (guide utilisateur, architecture, contribution…) est dans [`../docs/`](../docs/).

## Contenu

| Fichier | Description |
|---------|-------------|
| `guide*.html` | Pages HTML interactives de démonstration des composants |
| `guide-menu.js` | Structure du menu latéral (`<app-sidemenu section="guide">`) — c'est ici qu'on ajoute/renomme une page |
| `guide-tours.js` | UI de la section « Visites guidées » |
| `images/` | Captures d'écran et diagrammes |
| `examples/` | Exemples HTML vivants, chargés dynamiquement dans le menu via `examples/_list.json` |

Toute nouvelle page racine doit être ajoutée à `guide-menu.js`. Le fichier `examples/_list.json` est **généré** (gitignoré) : il est produit depuis les balises `<title>` des pages par `npx tsx scripts/generate-examples-list.ts` (exécuté automatiquement par `npm run build:all`) — après ajout d'un exemple, relancer la génération, sinon la page reste invisible dans le menu jusqu'au prochain build.

## Politique de chargement de la bibliothèque (pins CDN)

Trois régimes coexistent, chacun voulu :

| Pages | Script lib | Politique |
|---|---|---|
| Pages racine `guide/*.html` | `/dist/dsfr-data.esm.js` + `/dist/app-ui.esm.js` | **Builds locaux** du monorepo : les pages démontrent la version en cours de développement. Elles cassent si `/dist` n'est pas construit → lancer `npm run build` (ou `npm run dev`) d'abord. |
| `examples/*` génériques | `https://cdn.jsdelivr.net/npm/dsfr-data@0/dist/dsfr-data.core.umd.js` (ou `dsfr-data.umd.js`) | **Flottant sur le major 0** : les exemples copiables suivent la dernière release publiée. Bundle `core.umd` si la page n'utilise pas la cartographie, bundle `umd` complet sinon. |
| Pages « de production » (cartes ELF : `carte-territoires-electrification*.html`) | `dsfr-data@X.Y.Z` (pin exact) + attribut `integrity` (SRI) | **Pin exact + SRI** : ces pages servent de référence reproductible pour un déploiement institutionnel — ne pas passer en flottant, mettre à jour le pin ET le hash SRI ensemble lors d'une montée de version délibérée. |

Dépendances tierces communes : DSFR `1.14.4`, `@gouvfr/dsfr-chart` `2.1.1` (pages avec graphiques), `chart.js` `4.4.1` (chargé explicitement dans les `examples/` à graphiques). Leaflet n'a pas besoin d'être chargé à part : le bundle carto l'embarque et le charge à la demande (seul `exemple-france-num.html` le charge encore explicitement, pour raison historique).

## Documentation associée

- [Guide utilisateur](../docs/USER-GUIDE.md) — parcours pas-à-pas
- [Architecture](../docs/ARCHITECTURE.md) — architecture technique détaillée
- [Contribuer](../docs/CONTRIBUTING.md) — guide de contribution
