# Feature Request: Renommer les composants `gouv-*` en `dsfr-data-*`

## Contexte

Le projet vise a devenir une brique interministerielle de dataviz dans l'ecosysteme DSFR.
Le prefixe actuel `gouv-*` / `dsfr-data` ne reflete pas ce positionnement. Pour s'inscrire
dans la strategie de nommage du DSFR et se positionner comme couche complementaire a
[dsfr-chart](https://github.com/GouvernementFR/dsfr-chart), un renommage est necessaire.

## Objectif

Renommer tous les composants, packages et bundles du projet :
- Prefixe composants : `gouv-*` → `dsfr-data-*`
- Package npm : `dsfr-data` → `dsfr-data`
- Scope workspace : `@dsfr-data/*` → `@dsfr-data/*`

### Positionnement dans l'ecosysteme DSFR

```
@gouvfr/dsfr           →  Design system (boutons, modales, navigation...)
@gouvfr/dsfr-chart     →  Graphiques (bar-chart, line-chart, pie-chart...)
@gouvfr/dsfr-data      →  Pipeline donnees + composants dataviz enrichis
```

`dsfr-data` est la **couche donnees** : elle connecte les APIs ouvertes de l'Etat aux
composants de restitution. Complementaire a `dsfr-chart` (rendu), sans le remplacer.

## Mapping des composants

| Actuel | Nouveau | Role |
|--------|---------|------|
| `dsfr-data-source` | `dsfr-data-source` | Fetch de donnees (adapters API) |
| `dsfr-data-query` | `dsfr-data-query` | Transformation (filter, group-by, aggregate, sort) |
| `dsfr-data-normalize` | `dsfr-data-normalize` | Normalisation de donnees |
| `dsfr-data-facets` | `dsfr-data-facets` | Filtres a facettes interactifs |
| `dsfr-data-search` | `dsfr-data-search` | Recherche textuelle |
| `dsfr-data-chart` | `dsfr-data-chart` | Wrapper enrichi autour des composants dsfr-chart |
| `dsfr-data-kpi` | `dsfr-data-kpi` | Indicateur cle de performance |
| `dsfr-data-kpi-group` | `dsfr-data-kpi-group` | Groupe d'indicateurs |
| `dsfr-data-list` | `dsfr-data-list` | Tableau / liste de donnees |
| `dsfr-data-display` | `dsfr-data-display` | Affichage HTML libre |
| `dsfr-data-world-map` | `dsfr-data-world-map` | Carte choropleth mondiale |
| `dsfr-data-a11y` | `dsfr-data-a11y` | Companion accessibilite (tableau, CSV, description) |

## Perimetre du renommage

### Estimation chiffree

| Zone | Fichiers | Occurrences | Difficulte |
|------|----------|-------------|------------|
| Definitions composants (`src/components/`) | 12 | ~50 | Faible |
| Exports (`src/index*.ts`) | 3 | ~25 | Faible |
| Package names (`package.json` x11) | 11 | ~80 | Elevee |
| Build/bundles (`scripts/build-lib.ts`) | 1 | ~15 | Moyenne |
| Generateurs de code (builder, builder-ia, dashboard) | ~8 | ~200 | Elevee |
| Tests (`tests/`) | 31 | ~300 | Moyenne |
| HTML exemples (guide/, specs/, e2e/) | 53 | ~600 | Faible |
| Documentation (README, CLAUDE.md, roadmap) | 26 | ~730 | Moyenne |
| Skills builder-IA (`skills.ts`) | 1 | ~50 | Moyenne |
| Beacon tracking (`beacon.ts`) | 1 | ~5 | Faible |
| **Total** | **~234** | **~4 200** | |

### Fichiers critiques (a traiter en priorite)

1. **Definitions** : `src/components/gouv-*.ts` — decorateurs `@customElement()`
2. **Exports** : `src/index.ts`, `src/index-core.ts`, `src/index-world-map.ts`
3. **Build** : `scripts/build-lib.ts` — noms des 3 bundles
4. **Package root** : `package.json` — name, main, module, exports
5. **Workspaces** : `apps/*/package.json`, `packages/shared/package.json`
6. **Generateurs de code** : `apps/builder/src/ui/code-generator.ts`, `apps/builder-ia/src/ui/code-generator.ts`, `apps/dashboard/src/code-generator.ts`
7. **Skills IA** : `apps/builder-ia/src/skills.ts`
8. **CLAUDE.md** : instructions projet (48 occurrences)

## Plan d'execution

### Phase 1 : Renommage du code source
- [ ] Renommer les fichiers `src/components/gouv-*.ts` → `src/components/dsfr-data-*.ts`
- [ ] Mettre a jour les decorateurs `@customElement('gouv-*')` → `@customElement('dsfr-data-*')`
- [ ] Mettre a jour les noms de classes (`DsfrDataSource` → `DsfrDataSource`, etc.)
- [ ] Mettre a jour `src/index.ts`, `src/index-core.ts`, `src/index-world-map.ts`
- [ ] Mettre a jour les imports internes dans `src/`

### Phase 2 : Packaging et build
- [ ] Renommer `package.json` name : `dsfr-data` → `dsfr-data`
- [ ] Renommer tous les `@dsfr-data/*` → `@dsfr-data/*` dans les workspaces
- [ ] Mettre a jour `scripts/build-lib.ts` (noms des bundles)
- [ ] Mettre a jour les exports dans `package.json` root
- [ ] Verifier `vite.config.ts` de chaque app (aliases, proxy)

### Phase 3 : Applications
- [ ] Mettre a jour les generateurs de code (builder, builder-ia, dashboard)
- [ ] Mettre a jour les skills builder-IA (`skills.ts`)
- [ ] Mettre a jour les templates HTML de chaque app
- [ ] Mettre a jour les references dans `packages/shared/`
- [ ] Mettre a jour `apps/grist-widgets/manifest.json`

### Phase 4 : Tests et documentation
- [ ] Mettre a jour tous les tests (`tests/`) — selecteurs, assertions
- [ ] Mettre a jour les tests E2E (`e2e/`, `tests/builder-e2e/`)
- [ ] Mettre a jour CLAUDE.md, README.md, roadmap/*.md
- [ ] Mettre a jour guide/*.html, specs/*.html
- [ ] Mettre a jour le beacon tracking (`src/utils/beacon.ts`)

### Phase 5 : Validation
- [ ] `npm run build:all` passe sans erreur
- [ ] `npm run test:run` — tous les tests passent
- [ ] Tests d'alignement skills (`skills.test.ts`) passent
- [ ] Verification manuelle du builder et du playground
- [ ] Tests E2E builder (si serveur de dev disponible)

## Points de vigilance

1. **Breaking change npm** : les utilisateurs existants de `dsfr-data` devront migrer. Publier une version finale de `dsfr-data` avec un message de deprecation pointant vers `dsfr-data`.
2. **URLs CDN** : `unpkg.com/dsfr-data/...` et `jsdelivr.net/npm/dsfr-data/...` ne fonctionneront plus. Documenter la migration.
3. **Beacon tracking** : les stats historiques utilisent les anciens noms. Le parser de logs (`scripts/parse-beacon-logs.sh`) devra gerer les deux formats pendant la transition.
4. **Grist widgets** : `apps/grist-widgets/manifest.json` contient les noms de composants — a mettre a jour.
5. **Generateurs de code** : risque de regression si un template est oublie. Les tests d'alignement skills aideront a detecter les oublis.

## Labels

`enhancement`, `breaking-change`, `refactoring`
