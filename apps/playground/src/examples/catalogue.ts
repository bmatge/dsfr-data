/**
 * Catalogue des exemples du playground — etiquetage sur trois axes.
 *
 * Les trois `<select>` du playground ne GENERENT rien : ils FILTRENT ce
 * catalogue. Un exemple porte ses etiquettes (source, pipeline, sortie), et
 * l'interface n'a plus qu'a intersecter. Le produit cartesien des trois axes
 * (des centaines de cellules) n'a donc pas a etre ecrit : seule compte la
 * COUVERTURE — que chaque valeur d'axe apparaisse dans quelques exemples.
 *
 * Le code des exemples reste dans `examples-data.ts`, indexe par le meme `id`.
 * `tests/apps/playground/examples.test.ts` verifie que les deux jeux de cles
 * coincident exactement : un exemple ne peut plus etre ajoute d'un cote sans
 * l'autre, et les `<option>` ne sont plus saisies a la main dans index.html.
 */

/** D'ou viennent les donnees (l'origine, pas l'attribut employe). */
export type AxeSource = 'opendatasoft' | 'tabular' | 'grist' | 'insee' | 'generic' | 'inline';

/** Ce qui se passe entre la source et l'affichage. */
export type AxePipeline =
  | 'direct'
  | 'query'
  | 'normalize'
  | 'search'
  | 'facets'
  | 'join'
  | 'concat'
  | 'repeat'
  | 'pivot'
  | 'context'
  | 'paginate'
  | 'server-side';

/** Ce que voit le lecteur. */
export type AxeSortie = 'chart' | 'kpi' | 'podium' | 'list' | 'display' | 'map';

export interface ExempleMeta {
  /** Cle partagee avec `examples` (examples-data.ts). */
  id: string;
  /** Libelle affiche dans le select des exemples. */
  title: string;
  source: AxeSource[];
  pipeline: AxePipeline[];
  output: AxeSortie[];
}

/** Libelles des axes, dans l'ordre d'affichage des `<select>`. */
export const LIBELLES_SOURCE: ReadonlyArray<[AxeSource, string]> = [
  ['opendatasoft', 'Opendatasoft'],
  ['tabular', 'data.gouv (Tabular)'],
  ['grist', 'Grist'],
  ['insee', 'INSEE Melodi'],
  ['generic', 'API JSON (generic)'],
  ['inline', 'Donnees en dur'],
];

export const LIBELLES_PIPELINE: ReadonlyArray<[AxePipeline, string]> = [
  ['direct', 'Direct (sans transformation)'],
  ['query', 'Requete (query)'],
  ['normalize', 'Normalisation (normalize)'],
  ['search', 'Recherche (search)'],
  ['facets', 'Facettes (facets)'],
  ['join', 'Jointure (join)'],
  ['concat', 'Concatenation (concat)'],
  ['repeat', 'Repetition (repeat)'],
  ['pivot', 'Pivot / depivot'],
  ['context', 'Contexte partage (context)'],
  ['paginate', 'Pagination serveur'],
  ['server-side', 'Traitement server-side'],
];

export const LIBELLES_SORTIE: ReadonlyArray<[AxeSortie, string]> = [
  ['chart', 'Graphique (chart)'],
  ['kpi', 'Indicateur (kpi)'],
  ['podium', 'Podium'],
  ['list', 'Tableau (list)'],
  ['display', 'Gabarit libre (display)'],
  ['map', 'Carte'],
];

export const catalogue: ExempleMeta[] = [
  {
    id: 'direct-bar',
    title: `Barres — Fiscalite locale`,
    source: ['opendatasoft'],
    pipeline: ['direct'],
    output: ['chart'],
  },
  {
    id: 'direct-bar-databox',
    title: `Barres + DataBox complete — Fiscalite locale`,
    source: ['opendatasoft'],
    pipeline: ['direct'],
    output: ['chart'],
  },
  {
    id: 'direct-line-databox',
    title: `Ligne + DataBox — Fiscalite locale`,
    source: ['opendatasoft'],
    pipeline: ['direct'],
    output: ['chart'],
  },
  {
    id: 'direct-kpi',
    title: `KPI — Industrie du futur`,
    source: ['opendatasoft'],
    pipeline: ['direct'],
    output: ['kpi'],
  },
  {
    id: 'kpi-barometre',
    title: `KPI baromètre — titre + évolution (Plan Électrification)`,
    source: ['inline'],
    pipeline: ['direct'],
    output: ['kpi'],
  },
  {
    id: 'chart-reference-lines',
    title: `Ligne + repères — Immatriculations VE`,
    source: ['inline'],
    pipeline: ['direct'],
    output: ['chart'],
  },
  {
    id: 'chart-targets',
    title: `Ligne + cibles 2030 — Énergies fossiles`,
    source: ['inline'],
    pipeline: ['direct'],
    output: ['chart'],
  },
  {
    id: 'unpivot-series-line',
    title: `Unpivot + séries — Production par filière`,
    source: ['inline'],
    pipeline: ['pivot'],
    output: ['chart'],
  },
  {
    id: 'direct-datalist',
    title: `Tableau — Maires de France (server-side)`,
    source: ['tabular'],
    pipeline: ['server-side'],
    output: ['list'],
  },
  {
    id: 'server-paginate-datalist',
    title: `Tableau — Maires pagination serveur`,
    source: ['tabular'],
    pipeline: ['paginate'],
    output: ['list'],
  },
  {
    id: 'server-paginate-display',
    title: `Cartes — Maires pagination serveur`,
    source: ['tabular'],
    pipeline: ['paginate'],
    output: ['display'],
  },
  {
    id: 'paginate-kpi-global',
    title: `Pagination + KPI — Industrie du futur`,
    source: ['opendatasoft'],
    pipeline: ['server-side'],
    output: ['kpi', 'list'],
  },
  {
    id: 'query-bar',
    title: `Barres — Beneficiaires par region`,
    source: ['opendatasoft'],
    pipeline: ['query'],
    output: ['chart'],
  },
  {
    id: 'query-pie',
    title: `Camembert — Investissement par region`,
    source: ['opendatasoft'],
    pipeline: ['query'],
    output: ['chart'],
  },
  {
    id: 'query-map',
    title: `Carte — Taux TFB par departement`,
    source: ['opendatasoft'],
    pipeline: ['query'],
    output: ['chart', 'map'],
  },
  {
    id: 'normalize-bar',
    title: `Barres — LOVAC vacants par dept`,
    source: ['tabular'],
    pipeline: ['query', 'normalize'],
    output: ['chart'],
  },
  {
    id: 'normalize-pie',
    title: `Camembert — LOVAC vacants >2 ans`,
    source: ['tabular'],
    pipeline: ['query', 'normalize'],
    output: ['chart'],
  },
  {
    id: 'normalize-datalist',
    title: `Tableau — LOVAC données nettoyees`,
    source: ['tabular'],
    pipeline: ['normalize'],
    output: ['list'],
  },
  {
    id: 'facets-datalist',
    title: `Tableau — Industrie avec facettes`,
    source: ['opendatasoft'],
    pipeline: ['normalize', 'facets'],
    output: ['list'],
  },
  {
    id: 'facets-bar',
    title: `Barres — Industrie filtree par region`,
    source: ['opendatasoft'],
    pipeline: ['query', 'normalize', 'facets'],
    output: ['chart'],
  },
  {
    id: 'direct-display',
    title: `Cartes — Industrie du futur (server-side)`,
    source: ['opendatasoft'],
    pipeline: ['server-side'],
    output: ['display'],
  },
  {
    id: 'query-display',
    title: `Cartes — Communes de l'Ain (server-side)`,
    source: ['tabular'],
    pipeline: ['server-side'],
    output: ['display'],
  },
  {
    id: 'normalize-display',
    title: `Tuiles — LOVAC logements vacants`,
    source: ['tabular'],
    pipeline: ['query', 'normalize'],
    output: ['display'],
  },
  {
    id: 'search-datalist',
    title: `Tableau — Rappels produits (recherche serveur)`,
    source: ['opendatasoft'],
    pipeline: ['search', 'server-side'],
    output: ['list'],
  },
  {
    id: 'search-display',
    title: `Cartes — Industrie (recherche serveur)`,
    source: ['opendatasoft'],
    pipeline: ['search', 'server-side'],
    output: ['display'],
  },
  {
    id: 'search-kpi-chart',
    title: `KPI + Barres — Recherche dynamique`,
    source: ['opendatasoft'],
    pipeline: ['query', 'normalize', 'search'],
    output: ['chart', 'kpi'],
  },
  {
    id: 'facets-map',
    title: `Carte + KPI — Fiscalite par region`,
    source: ['opendatasoft'],
    pipeline: ['query', 'normalize', 'facets'],
    output: ['chart', 'kpi', 'map'],
  },
  {
    id: 'server-side-ods',
    title: `Recherche serveur — Rappels (ODS)`,
    source: ['opendatasoft'],
    pipeline: ['search', 'server-side'],
    output: ['display'],
  },
  {
    id: 'server-side-tabular-tri',
    title: `Tri serveur — Communes (Tabular)`,
    source: ['tabular'],
    pipeline: ['server-side'],
    output: ['list'],
  },
  {
    id: 'server-facets-display',
    title: `Facettes serveur + normalize — Industrie (ODS)`,
    source: ['opendatasoft'],
    pipeline: ['normalize', 'search', 'facets', 'server-side'],
    output: ['display'],
  },
  {
    id: 'direct-map-reg',
    title: `Carte régions — Population`,
    source: ['inline'],
    pipeline: ['direct'],
    output: ['chart', 'map'],
  },
  {
    id: 'direct-map-aca',
    title: `Carte académies — Effectifs élèves`,
    source: ['inline'],
    pipeline: ['direct'],
    output: ['chart', 'map'],
  },
  {
    id: 'direct-map-monde',
    title: `Carte monde — PIB par pays`,
    source: ['inline'],
    pipeline: ['direct'],
    output: ['chart', 'map'],
  },
  {
    id: 'join-basic',
    title: `Population vs Budget — 2 séries (left join)`,
    source: ['inline'],
    pipeline: ['join'],
    output: ['chart'],
  },
  {
    id: 'join-query',
    title: `Recettes vs Depenses — inner join + tri`,
    source: ['inline'],
    pipeline: ['query', 'join'],
    output: ['chart'],
  },
  {
    id: 'map-markers-cluster',
    title: `Carte — 5000 CT avec clustering + panneau`,
    source: ['opendatasoft'],
    pipeline: ['direct'],
    output: ['map'],
  },
  {
    id: 'map-circles-proportional',
    title: `Carte — Cercles proportionnels + modale`,
    source: ['inline'],
    pipeline: ['direct'],
    output: ['map'],
  },
  {
    id: 'map-multi-layer',
    title: `Carte — Multi-couches heatmap + marqueurs`,
    source: ['opendatasoft'],
    pipeline: ['direct'],
    output: ['map'],
  },
];

/** Exemple charge au demarrage quand l'URL n'en designe aucun. */
export const EXEMPLE_PAR_DEFAUT = 'direct-bar';

/** Intersection des trois filtres ; `null` sur un axe = « toutes ». */
export function filtrer(
  source: AxeSource | null,
  pipeline: AxePipeline | null,
  output: AxeSortie | null
): ExempleMeta[] {
  return catalogue.filter(
    (e) =>
      (source === null || e.source.includes(source)) &&
      (pipeline === null || e.pipeline.includes(pipeline)) &&
      (output === null || e.output.includes(output))
  );
}
