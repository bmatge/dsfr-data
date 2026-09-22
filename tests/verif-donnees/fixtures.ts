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
  filtrerOdsql,
  repondreOdsExport,
  repondreOdsFacets,
  repondreOdsMetadonnees,
  repondreOdsRecords,
  repondreTabular,
} from '../builder-e2e/api-fixtures.js';
import { repondreAdaptateurs } from './fixtures-adaptateurs.js';
import { repondreCanari } from './fixtures-canari.js';
import { repondreContexte } from './fixtures-contexte.js';
import { repondreGel } from '../../tools/oracle/gel.js';
import { GELS } from './gel.js';
import type { Row } from '../../tools/oracle/manifest.js';
import { repondreAffichages, repondreAffichagesTabular } from './fixtures-affichages.js';
import territoires from './jeux/territoires.json' with { type: 'json' };
import mesures from './jeux/mesures.json' with { type: 'json' };
import regions from './jeux/regions.json' with { type: 'json' };

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

/**
 * Ressource Tabular de CE domaine.
 *
 * Volontairement distincte de celle du domaine `adaptateurs`, qui intercepte le
 * MÊME hôte (l'adaptateur Tabular n'accepte pas de `base-url` et retombe sur son
 * hôte par défaut) et dont le routeur passe en premier dans `repondre()`. Deux
 * domaines qui partageraient le chemin partageraient les LIGNES : l'un des deux
 * recevrait le jeu de l'autre, et son oracle — qui repart des siennes — le
 * signalerait comme un écart de la bibliothèque. Une ressource par domaine, et
 * le faux serveur reste lisible.
 */
export const RESSOURCE_TABULAR = 'ea1b5c3d-0000-4000-8000-verifdonnees01';

/** Jeu ODS de la vérification. */
export const DATASET = 'jeu-de-verif';

/**
 * Les 137 territoires du harnais de recette, en lignes brutes.
 *
 * Le fichier `jeux/territoires.json` est la MATÉRIALISATION du jeu que
 * `tests/builder-e2e/api-fixtures.ts` engendre (`JEU`) : c'est lui que les
 * autres lecteurs (le banc, un oracle dans un autre langage) lisent, et
 * `tests/oracle/jeux.test.ts` vérifie que les deux ne divergent pas.
 */
export const TERRITOIRES: Row[] = territoires;

/**
 * Douze mesures écrites à la main : zéros NUMÉRIQUES face à chaînes VIDES,
 * deux clés de jointure vides, une moyenne pondérée qui diffère franchement
 * de la moyenne simple (`jeux/README.md`).
 */
export const MESURES: Row[] = mesures;

/** Table d'appariement des mesures : deux clés sans correspondance, une clé VIDE. */
export const REGIONS: Row[] = regions;

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
  // Les jeux d'un lot vivent dans SON fichier de fixtures : ce point de
  // branchement évite que chaque domaine vienne éditer celui des autres.
  const desAdaptateurs = repondreAdaptateurs(url);
  if (desAdaptateurs !== null) return desAdaptateurs;
  const duContexte = repondreContexte(url);
  if (duContexte !== null) return duContexte;
  const duCanari = repondreCanari(url);
  if (duCanari !== null) return duCanari;
  // Les contrôles GELÉS (#884) : leurs lignes brutes, servies comme un portail.
  const duGel = repondreGel(url, GELS, {
    exportJson: repondreOdsExport,
    records: repondreOdsRecords,
    facets: repondreOdsFacets,
    metadonnees: repondreOdsMetadonnees,
  });
  if (duGel !== null) return duGel;
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
    // La ressource Tabular du lot AFFICHAGES (#1020) : meme hote, autre chemin.
    return repondreAffichagesTabular(url);
  }
  if (url.origin === HOTE_API) {
    const nom = url.pathname.replace(/^\//, '') as keyof typeof JEUX;
    return JEUX[nom] ?? null;
  }
  // Les jeux du lot AFFICHAGES vivent dans leur propre fichier, sur leur
  // propre hôte fictif : un domaine, ses lignes.
  return repondreAffichages(url);
}
