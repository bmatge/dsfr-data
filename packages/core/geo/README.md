# Fonds administratifs simplifiés (`dsfr-data/geo/`)

Deux GeoJSON prêts à l'emploi pour habiller une `<dsfr-data-map>` sans dépendre d'une API
géographique, livrés dans le paquet npm **hors bundle** (à servir par la page, jamais inlinés
dans `dsfr-data.map.*.js`) — issue #688.

| Fichier | Contenu | Propriétés | Taille |
|---------|---------|------------|--------|
| `regions.json` | Les 18 régions (13 métropolitaines + 5 DROM) | `code`, `nom` | ~116 Ko |
| `departements.json` | Les 101 départements (96 + 5 DROM) | `code`, `nom`, `region` | ~302 Ko |

Géométries simplifiées à 1 000 m (topologie conservée : pas de trou entre deux voisins),
coordonnées WGS 84 arrondies à 3 décimales. Les collectivités d'outre-mer (975, 977, 978,
984, 986 à 989) ne sont pas incluses.

## Utilisation

```html
<!-- Depuis un CDN npm (remplacer @0 par une version figée en production) -->
<dsfr-data-source id="contours" url="https://cdn.jsdelivr.net/npm/dsfr-data@0/geo/regions.json"
  transform="features"></dsfr-data-source>

<dsfr-data-map center="46.6,2.9" zoom="6" insets="drom">
  <dsfr-data-map-layer source="contours" type="geoshape" geo-field="geometry"
    no-interactive color="#666" fill-opacity="0"></dsfr-data-map-layer>
</dsfr-data-map>
```

Avec un bundler : `import.meta.resolve('dsfr-data/geo/regions.json')` (export `./geo/*` du
`package.json`) ; en self-hosting, copier `node_modules/dsfr-data/geo/` à côté de `dist/`.

Pour une choroplèthe, joindre vos données aux contours sur `code` (`<dsfr-data-join>`), puis
`fill-field` + `<dsfr-data-map-legend>`.

## Source et licence

Données : **Contours administratifs** publiés par Etalab (jeu `contours-administratifs`,
fichiers `regions-1000m.geojson` et `departements-1000m.geojson`, simplifiés par Etalab),
dérivés d'ADMIN EXPRESS (IGN) et d'OpenStreetMap.

Licence : [**Licence Ouverte / Open Licence 2.0**](https://www.etalab.gouv.fr/licence-ouverte-open-licence/)
(Etalab). Mention à porter sur la page : « Contours administratifs — Etalab, Licence Ouverte 2.0 ».

## Régénération

```bash
npm run geo:fetch    # retélécharge et réécrit les deux fichiers
npm run geo:check    # vérifie que les fichiers commités sont à jour (sortie 1 sinon)
```

Script : `scripts/fetch-geo.mjs` (Node 18+, aucune dépendance). Les fichiers sont exclus de
prettier (`.prettierignore`) : une ligne, comparés octet à octet.
