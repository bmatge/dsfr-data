# dsfr-data

[![npm version](https://img.shields.io/npm/v/dsfr-data)](https://www.npmjs.com/package/dsfr-data)
[![CI](https://github.com/bmatge/dsfr-data/actions/workflows/ci.yml/badge.svg)](https://github.com/bmatge/dsfr-data/actions/workflows/ci.yml)
[![CodeQL](https://github.com/bmatge/dsfr-data/actions/workflows/codeql.yml/badge.svg)](https://github.com/bmatge/dsfr-data/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Security Policy](https://img.shields.io/badge/security-policy-red.svg)](./docs/SECURITY.md)

> **Web Components de dataviz** (Lit) pour sites gouvernementaux francais, conformes au [Systeme de design de l'Etat (DSFR)](https://www.systeme-de-design.gouv.fr/). Connectez vos sources (Huwise/ODS, Tabular, Grist, INSEE Melodi…), composez votre pipeline en balises `<dsfr-data-*>`, et exportez du HTML pret a integrer.

```html
<dsfr-data-source id="src" api-type="opendatasoft"
  base-url="https://data.economie.gouv.fr" dataset-id="industrie-du-futur" limit="100">
</dsfr-data-source>

<dsfr-data-query id="q" source="src"
  group-by="nom_region" aggregate="nombre_beneficiaires:sum:total" order-by="total:desc">
</dsfr-data-query>

<dsfr-data-chart source="q" type="bar"
  label-field="nom_region" value-field="total" titre="Beneficiaires par region">
</dsfr-data-chart>
```

**Demo interactive et reference complete des composants** : [bmatge.github.io/dsfr-data/specs](https://bmatge.github.io/dsfr-data/specs/)

---

## Selon votre profil

| Vous etes… | Vous voulez… | Allez ici |
|---|---|---|
| **Integrateur / developpeur web** | Coller un widget DSFR sur votre page | [Installation](#installation) ci-dessous + [specifications interactives](https://bmatge.github.io/dsfr-data/specs/) |
| **Utilisateur metier / non-tech** | Generer un graphique sans coder via le Builder | [Guide utilisateur](docs/USER-GUIDE.md) |
| **Operateur / ops** | Heberger votre instance dsfr-data | [Guide de deploiement](docs/DEPLOYMENT.md) |
| **Contributeur** | Contribuer au code, comprendre l'architecture | [Guide de contribution](docs/CONTRIBUTING.md) + [Architecture](docs/ARCHITECTURE.md) |
| **Decideur / acheteur** | Positionnement produit, comparatifs, cibles | [Fiche produit](docs/DATASHEET.md) |
| **RSSI / equipe securite** | Politique de signalement, baseline SCA/DAST | [Politique de securite](docs/SECURITY.md) |

## Installation

### CDN (sans build)

**Prerequis** : le projet doit utiliser le [DSFR](https://www.systeme-de-design.gouv.fr/comment-utiliser-le-dsfr/developpeurs/prise-en-main-du-dsfr/) et [DSFR Chart](https://github.com/GouvernementFR/dsfr-chart).

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.14.4/dist/dsfr.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr-chart@2.0.4/dist/DSFRChart/DSFRChart.css">
<script type="module" src="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr-chart@2.0.4/dist/DSFRChart/DSFRChart.js"></script>
<script src="https://unpkg.com/dsfr-data/dist/dsfr-data.core.umd.js"></script>
```

### npm

```bash
npm install dsfr-data
```

```js
import 'dsfr-data';
```

### Bundles disponibles

| Bundle | Contenu | gzip |
|---|---|---|
| `dsfr-data.core.{esm,umd}.js` | Tous les composants sauf cartes (inclut `dsfr-data-join`) | ~61 Ko |
| `dsfr-data.world-map.{esm,umd}.js` | `dsfr-data-world-map` (d3-geo, topojson) | ~31 Ko |
| `dsfr-data.map.{esm,umd}.js` | `dsfr-data-map` + `dsfr-data-map-layer` (Leaflet lazy) | ~33 Ko |
| `dsfr-data.{esm,umd}.js` | Tout-en-un | ~97 Ko |

La specification exhaustive de chaque composant (attributs, valeurs, exemples interactifs) est sur [bmatge.github.io/dsfr-data/specs](https://bmatge.github.io/dsfr-data/specs/) — c'est la source de verite.

## Heberger votre instance

Le repo embarque une webapp d'edition (Builder, Builder IA, Sources, Playground, Dashboard, Monitoring…) deployable via Docker en deux modes :

- **Statique** (nginx + localStorage) — usage individuel.
- **Serveur** (nginx + Express + MariaDB) — multi-utilisateurs, auth JWT, partages, audit.

La procedure complete (Traefik, DNS, secrets, migrations, sauvegarde, diagnostic, [validation post-deploiement](docs/DEPLOYMENT.md#validation-post-deploiement), [checklist securite](docs/DEPLOYMENT.md#checklist-securite)) est dans [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). La section [Configuration self-hosted](docs/DEPLOYMENT.md#configuration-self-hosted) detaille les 4 scenarios supportes (reference, proxy d'entreprise, reverse externe pour les `/*-proxy/`, app interne + widgets publics) avec le contrat exhaustif des chemins de proxying.

## Developpement rapide

```bash
git clone https://github.com/bmatge/dsfr-data.git
cd dsfr-data
npm install
npm run dev           # Vite dev server (port 5173)
npm run test:run      # Tests Vitest
npm run build:all     # Build lib + apps
```

Pour le detail du monorepo, des conventions, du workflow de release Changesets et de la baseline securite : voir [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md).

## Documentation

- [Specifications interactives des composants](https://bmatge.github.io/dsfr-data/specs/)
- [Guide utilisateur](docs/USER-GUIDE.md) — parcours dans le Builder, exemples concrets
- [Architecture](docs/ARCHITECTURE.md) — pipeline, adapters, bundles, build
- [Guide de deploiement](docs/DEPLOYMENT.md) — Docker, 4 scenarios self-hosted, validation
- [Contribuer](docs/CONTRIBUTING.md) — monorepo, conventions, release Changesets
- [Fiche produit](docs/DATASHEET.md) — positionnement, comparatif, cibles
- [Politique de securite](docs/SECURITY.md) + [baseline](docs/security-baseline.md) — signalement, pipeline CI/CD, defenses

## Licence

MIT.
