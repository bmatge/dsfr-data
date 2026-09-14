/**
 * Alimentation DÉTERMINISTE des contrôles : les lignes servies à la page et
 * celles dont l'oracle repart sont les MÊMES.
 *
 * Le jeu `territoires` est celui du harnais de recette (#625,
 * `tests/builder-e2e/api-fixtures.ts`) : 137 lignes, libellés piégeux
 * (apostrophes, esperluette), colonne au nom à espaces. On le réemploie tel
 * quel plutôt que d'en inventer un autre — c'est déjà le jeu que la recette
 * du Builder éprouve, et ses faux serveurs ODS/Tabular/générique sont écrits
 * et testés hors ligne.
 *
 * Deux jeux s'y ajoutent, taillés pour des défauts précis :
 *   - `mesures` : valeurs vides face à des zéros (piège `'' == 0`), clés de
 *     jointure vides, coordonnées, série mensuelle cumulable ;
 *   - `regions` : table d'appariement, avec une ligne à clé vide.
 *
 * CE MODULE NE SAIT RIEN DE PLAYWRIGHT : il prend une URL, il rend une
 * réponse. Le spec e2e branche `page.route` dessus ; le test-garde
 * d'indépendance (`tests/oracle/guard.test.ts`) parcourt son graphe d'imports
 * et refuserait toute entrée par `packages/`.
 */
import {
  JEU,
  RESSOURCES,
  filtrerOdsql,
  repondreOdsExport,
  repondreOdsFacets,
  repondreOdsMetadonnees,
  repondreOdsRecords,
  repondreTabular,
} from '../builder-e2e/api-fixtures.js';
import type { Row } from '../../tools/oracle/manifest.js';

/** Hôtes fictifs — TLD réservé (RFC 2606) : rien ne peut joindre le réseau. */
export const HOTE_ODS = 'https://donnees.verif.invalid';
export const HOTE_API = 'https://api.verif.invalid';

/**
 * Hôte Tabular : le VRAI, comme dans le harnais de recette. L'adaptateur
 * n'accepte pas de `base-url` pour cette variante et retombe sur
 * `TABULAR_CONFIG.defaultBaseUrl` — la fixture doit donc intercepter ce nom-là.
 * Rien n'en sort pour autant : `page.route` refuse tout ce qui n'est pas servi.
 */
export const HOTE_TABULAR = 'https://tabular-api.data.gouv.fr';

/** Ressource Tabular de la vérification (celle du harnais de recette). */
export const RESSOURCE_TABULAR = RESSOURCES.resourceId;

/** Jeu ODS de la vérification. */
export const DATASET = 'jeu-de-verif';

/** Les 137 territoires du harnais de recette, en lignes brutes. */
export const TERRITOIRES: Row[] = JEU as unknown as Row[];

/**
 * Douze mesures écrites à la main.
 *
 * `quota` porte des zéros NUMÉRIQUES et des chaînes VIDES : c'est la
 * distinction que `'' == 0` efface. `code` porte deux clés vides (une chaîne
 * vide, un `null`) : c'est la distinction qu'une clé de jointure trop
 * accueillante efface. `indice` et `poids` donnent une moyenne pondérée qui
 * diffère franchement de la moyenne simple.
 */
// Une ligne par mesure : un jeu de fixtures se lit comme un tableau.
// prettier-ignore
export const MESURES: Row[] = [
  { code: '01', zone: 'nord',  quota: 0,  indice: 100, poids: 1000, lat: 50.63, lon: 3.06,  mois: '2026-01', flux: 10 },
  { code: '02', zone: 'nord',  quota: '', indice: 120, poids: 200,  lat: 50.29, lon: 2.78,  mois: '2026-02', flux: 20 },
  { code: '03', zone: 'nord',  quota: 5,  indice: 90,  poids: 400,  lat: 49.89, lon: 2.30,  mois: '2026-03', flux: 5 },
  { code: '04', zone: 'sud',   quota: 0,  indice: 140, poids: 3000, lat: 43.30, lon: 5.37,  mois: '2026-01', flux: 40 },
  { code: '05', zone: 'sud',   quota: '', indice: 60,  poids: 100,  lat: 43.61, lon: 3.88,  mois: '2026-02', flux: 15 },
  { code: '06', zone: 'sud',   quota: 12, indice: 110, poids: 900,  lat: 43.70, lon: 7.27,  mois: '2026-03', flux: 25 },
  { code: '07', zone: 'ouest', quota: 3,  indice: 80,  poids: 600,  lat: 47.22, lon: -1.55, mois: '2026-01', flux: 30 },
  { code: '08', zone: 'ouest', quota: '', indice: 95,  poids: 250,  lat: 48.11, lon: -1.68, mois: '2026-02', flux: 12 },
  { code: '',   zone: 'ouest', quota: 7,  indice: 105, poids: 350,  lat: 47.75, lon: -3.37, mois: '2026-03', flux: 8 },
  { code: null, zone: 'est',   quota: 9,  indice: 130, poids: 800,  lat: 48.58, lon: 7.75,  mois: '2026-01', flux: 22 },
  { code: '11', zone: 'est',   quota: 0,  indice: 70,  poids: 150,  lat: 47.32, lon: 5.04,  mois: '2026-02', flux: 18 },
  { code: '12', zone: 'est',   quota: 4,  indice: 115, poids: 500,  lat: 48.69, lon: 6.18,  mois: '2026-03', flux: 33 },
];

/**
 * Table d'appariement des mesures. Deux lignes n'ont pas de correspondance à
 * gauche (`20`, `21`) et une porte une clé VIDE : elle ne doit apparier
 * aucune des deux mesures à clé vide.
 */
export const REGIONS: Row[] = [
  { code: '01', region_nom: 'Hauts-de-France' },
  { code: '02', region_nom: 'Hauts-de-France' },
  { code: '03', region_nom: 'Hauts-de-France' },
  { code: '04', region_nom: "Provence-Alpes-Côte d'Azur" },
  { code: '05', region_nom: 'Occitanie' },
  { code: '06', region_nom: "Provence-Alpes-Côte d'Azur" },
  { code: '07', region_nom: 'Pays de la Loire' },
  { code: '', region_nom: 'Territoire sans code' },
  { code: '20', region_nom: 'Corse' },
  { code: '21', region_nom: 'Nouvelle-Aquitaine' },
];

/** Les trois jeux, sous le nom que les manifestes leur donnent. */
export const JEUX = {
  territoires: TERRITOIRES,
  mesures: MESURES,
  regions: REGIONS,
} as const;

/** URL générique d'un jeu servi en tableau nu. */
export function urlJeu(nom: keyof typeof JEUX): string {
  return `${HOTE_API}/${nom}`;
}

const PREFIXE_ODS = `/api/explore/v2.1/catalog/datasets/${DATASET}`;

/** Un agrégat ODSQL aliasé d'un `select` : `sum(population) as population__sum`. */
const AGREGAT_ALIAS = /^(sum|avg|min|max|count)\s*\(\s*(.*?)\s*\)\s+as\s+(.+)$/i;

/**
 * `select` PUREMENT agrégé, sans `group_by` (#810) : la réponse d'Opendatasoft
 * à `select=sum(montant) as total` n'est pas une ligne de plus dans un jeu,
 * c'est LA valeur calculée par le serveur sur le jeu entier — répétée sur
 * chaque ligne, avec `total_count` = nombre de lignes.
 *
 * Le faux serveur reproduit ce comportement contre-intuitif plutôt que
 * d'ignorer le `select` : sans lui, une source à agrégat serveur rendrait des
 * lignes brutes et le KPI qui lit l'alias afficherait du vide — l'échec
 * désignerait la lib pour un défaut de la fixture.
 *
 * Rend `null` si le `select` n'est pas purement agrégé : la requête retombe
 * alors sur `/records` ordinaire.
 */
export function repondreOdsSelectAgrege(
  url: URL,
  jeu: Row[]
): { total_count: number; results: Row[] } | null {
  const select = url.searchParams.get('select') ?? '';
  if (!select.trim() || url.searchParams.get('group_by')) return null;
  const elements = select.split(/,(?![^()]*\))/).map((e) => e.trim());
  const analyses = elements.map((e) => AGREGAT_ALIAS.exec(e));
  if (analyses.some((a) => a === null)) return null;

  const lignes = filtrerOdsql(jeu, url.searchParams.get('where') ?? '') as Row[];
  const denuder = (s: string) => (s.startsWith('`') && s.endsWith('`') ? s.slice(1, -1) : s);
  const ligne: Row = {};
  for (const trouve of analyses) {
    const [, fonction, argumentBrut, aliasBrut] = trouve!;
    const champ = denuder(argumentBrut.trim());
    const alias = denuder(aliasBrut.trim());
    const nombres = lignes.map((l) => Number(l[champ])).filter((n) => Number.isFinite(n));
    switch (fonction.toLowerCase()) {
      case 'count':
        ligne[alias] = lignes.length;
        break;
      case 'sum':
        ligne[alias] = nombres.reduce((a, b) => a + b, 0);
        break;
      case 'avg':
        ligne[alias] =
          nombres.length === 0 ? null : nombres.reduce((a, b) => a + b, 0) / nombres.length;
        break;
      case 'min':
        ligne[alias] = nombres.length === 0 ? null : Math.min(...nombres);
        break;
      default:
        ligne[alias] = nombres.length === 0 ? null : Math.max(...nombres);
    }
  }
  // Un filtre qui ne garde rien : `results` VIDE, pas une ligne a zero — c'est
  // ce que rend le vrai portail, et ce que l'adaptateur synthetise ensuite.
  const limite = Number(url.searchParams.get('limit') ?? '1');
  const copies = Math.min(Math.max(limite, 0), lignes.length);
  return {
    total_count: lignes.length,
    results: Array.from({ length: copies }, () => ({ ...ligne })),
  };
}

/**
 * Le faux serveur : une URL, une réponse — ou `null` si l'URL n'est pas
 * prévue, auquel cas l'appelant la REFUSE plutôt que de la laisser sortir.
 */
export function repondre(url: URL): unknown | null {
  if (url.origin === HOTE_ODS && url.pathname.startsWith(PREFIXE_ODS)) {
    const reste = url.pathname.slice(PREFIXE_ODS.length);
    if (reste === '/records') {
      return repondreOdsSelectAgrege(url, TERRITOIRES) ?? repondreOdsRecords(url, TERRITOIRES);
    }
    if (reste === '/exports/json') return repondreOdsExport(url, TERRITOIRES);
    if (reste === '/facets') return repondreOdsFacets(url, TERRITOIRES);
    if (reste === '') return repondreOdsMetadonnees();
    return null;
  }
  if (url.origin === HOTE_TABULAR) {
    if (url.pathname === `/api/resources/${RESSOURCE_TABULAR}/data/`) {
      return repondreTabular(url, TERRITOIRES);
    }
    return null;
  }
  if (url.origin === HOTE_API) {
    const nom = url.pathname.replace(/^\//, '') as keyof typeof JEUX;
    return JEUX[nom] ?? null;
  }
  return null;
}
