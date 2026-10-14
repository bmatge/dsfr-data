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
import { repondreGristDocument, tableGrist } from './fixtures-grist.js';
import territoires from './jeux/territoires.json' with { type: 'json' };
import exAequo from './jeux/delegation-tabular-ex-aequo.json' with { type: 'json' };
import gristExAequo from './jeux/delegation-grist-ex-aequo.json' with { type: 'json' };
import jokers from './jeux/delegation-jokers.json' with { type: 'json' };
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

/**
 * Ressource Tabular du jeu `delegation-tabular-ex-aequo` (#1202) : trois pages
 * de 200, des ex-aequo de tri et des libelles a parenthese — ce que l'API
 * reelle perd en silence (PG-033, PG-034).
 */
export const RESSOURCE_TABULAR_EX_AEQUO = 'ea1b5c3d-0000-4000-8000-verifexaequo02';
export const EX_AEQUO: Row[] = exAequo;

/**
 * Le même jeu servi par le faux portail Opendatasoft (#1274) : 450 lignes,
 * cinq pages de 100. `/records` y pagine par offset sans garantir l'ordre,
 * comme le vrai : tant que l'`order_by` ne départage pas toutes les lignes,
 * les ex-aequo changent d'ordre d'une page à l'autre.
 */
export const DATASET_EX_AEQUO = 'jeu-ex-aequo';

/**
 * Le document Grist du jeu `delegation-grist-ex-aequo` (#1279) : 450 lignes,
 * les mêmes ex-æquo que le jeu Tabular, mais la colonne unique s'appelle `rang`
 * — `id` est réservé par Grist à l'identifiant de ligne, qui vaut ici le rang.
 * Le faux serveur (`fixtures-grist.ts`) ignore `offset` sur `/records` et sert
 * `/sql` dans la forme du vrai : ce document a un endpoint SQL, celui du lot
 * `adaptateurs` (`docDeVerif`) n'en a pas.
 */
export const GRIST_DOC_EX_AEQUO = 'https://grist.verif.invalid/api/docs/docExAequo';
export const GRIST_TABLE_EX_AEQUO = 'ExAequo';
export const URL_GRIST_EX_AEQUO = `${GRIST_DOC_EX_AEQUO}/tables/${GRIST_TABLE_EX_AEQUO}/records`;
export const GRIST_EX_AEQUO: Row[] = gristExAequo;

/**
 * Le jeu des JOKERS (#1285, ADR-159 lot 2) : des libellés qui portent `%`,
 * `_`, `*` et `\` pour de vrai, leurs voisins qu'un joker laissé dans la
 * valeur retiendrait en plus (« Taux 50 atteint », « codexa », « étoile »,
 * « chemindossier »), et des valeurs ABSENTES qu'un `NOT LIKE` écarte. Servi
 * par une ressource Tabular à part et par une table du document Grist à SQL.
 */
export const RESSOURCE_TABULAR_JOKERS = 'ea1b5c3d-0000-4000-8000-verifjokers3';
export const JOKERS: Row[] = jokers;
export const GRIST_TABLE_JOKERS = 'Jokers';
export const URL_GRIST_JOKERS = `${GRIST_DOC_EX_AEQUO}/tables/${GRIST_TABLE_JOKERS}/records`;

const TABLES_GRIST = {
  [GRIST_TABLE_EX_AEQUO]: tableGrist(GRIST_EX_AEQUO),
  [GRIST_TABLE_JOKERS]: tableGrist(JOKERS),
};

/**
 * Préfixe du relais cachable du site hôte (ADR-155, #1232), tel qu'une page le
 * pose dans `relay-url`. Relatif : la requête reste sur l'origine de la page.
 */
export const RELAIS = '/donnees-relais';

/**
 * Une panne PROGRAMMÉE dans l'adresse (#1288) : `…?verif-panne=503&verif-panne-apres=1`
 * répond normalement UNE fois, puis 503 à chaque appel suivant de cette même
 * adresse. Le dernier relevé d'une source ne se montre que si l'appel en échec
 * est CELUI qui a produit les lignes : changer d'adresse pour provoquer la
 * panne (comme le font les contrôles de #1272, qui visent un jeu retiré)
 * serait justement « une autre requête ». Les deux paramètres sont ignorés par
 * les fixtures, qui ne lisent que le chemin : la réponse d'avant la panne est
 * celle du jeu, sans rien de changé.
 */
export const PARAM_PANNE = 'verif-panne';
export const PARAM_PANNE_APRES = 'verif-panne-apres';

/** L'adresse d'un jeu, avec sa panne programmée après `apres` réponses. */
export function avecPanne(url: string, status: number, apres: number): string {
  const separateur = url.includes('?') ? '&' : '?';
  return `${url}${separateur}${PARAM_PANNE}=${status}&${PARAM_PANNE_APRES}=${apres}`;
}

/** La panne programmée dans une adresse, ou `null`. */
export function panneProgrammee(url: URL): { status: number; apres: number } | null {
  const status = Number(url.searchParams.get(PARAM_PANNE));
  if (!Number.isInteger(status) || status < 400) return null;
  const apres = Number(url.searchParams.get(PARAM_PANNE_APRES) ?? '0');
  return { status, apres: Number.isInteger(apres) && apres >= 0 ? apres : 0 };
}

/**
 * La réécriture INVERSE du relais : `<origine>/donnees-relais/<hôte>/<chemin>?<requête>`
 * → `https://<hôte>/<chemin>?<requête>`, ou `null` si l'URL n'est pas une URL de relais.
 *
 * Écrite à la main, sur la chaîne brute, sans rien emprunter à la bibliothèque
 * (`resolveTransportUrl`) : c'est ce que fait un relais conforme au contrat
 * `docs/RELAY.md` — chemin et requête repris octet pour octet. Le faux réseau
 * sert alors la cible depuis les MÊMES fixtures qu'en direct : si la réécriture
 * de la bibliothèque perd ou abîme un paramètre, la réponse change, et le
 * chiffre avec elle.
 */
export function cibleDuRelais(brut: string): string | null {
  const marque = `${RELAIS}/`;
  const schema = brut.indexOf('://');
  if (schema < 0) return null;
  const chemin = brut.indexOf('/', schema + 3);
  if (chemin < 0 || !brut.startsWith(marque, chemin)) return null;
  const reste = brut.slice(chemin + marque.length).split('#', 1)[0];
  return reste ? `https://${reste}` : null;
}

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

/** Taille de page par défaut de l'API paginée ci-dessous, quand rien n'est demandé. */
export const PAGE_PAR_DEFAUT = 20;

/**
 * URL d'un jeu servi PAGINÉ, à la convention de l'attribut `paginate` du mode
 * URL (#1242) : `?page=N&page_size=M` en requête, `{ data, meta: { page,
 * page_size, total } }` en réponse.
 *
 * Comme une API réelle de cette forme (l'API tabulaire de data.gouv rend 20
 * lignes sans `page_size`, mesuré le 2026-10-04), elle pagine TOUJOURS : sans
 * paramètre, c'est sa première page par défaut qui revient, jamais le jeu
 * entier. C'est ce qui fait qu'aucun attribut ne corrige un regroupement posé
 * derrière une telle source — retirer `paginate` ne charge pas plus de lignes.
 */
export function urlJeuPagine(nom: keyof typeof JEUX): string {
  return `${HOTE_API}/pagine/${nom}`;
}

/**
 * Le même jeu paginé, dont l'API ne sert que les `pages` premières pages
 * (#1288) : au-delà, la ressource n'existe pas. C'est la panne d'un changement
 * de page — une API qui borne son décalage (Opendatasoft refuse au-delà de
 * 10 000 lignes), un service qui tombe entre deux pages. Appelée à travers le
 * relais du site, la page refusée revient en 404 sans sortir du faux réseau.
 */
export function urlJeuPagineBorne(nom: keyof typeof JEUX, pages: number): string {
  return `${HOTE_API}/pagine-borne/${pages}/${nom}`;
}

function repondreJeuPagine(url: URL, jeu: Row[]): Record<string, unknown> {
  const page = Number(url.searchParams.get('page') ?? '1');
  const taille = Number(url.searchParams.get('page_size') ?? String(PAGE_PAR_DEFAUT));
  return {
    data: jeu.slice((page - 1) * taille, page * taille),
    meta: { page, page_size: taille, total: jeu.length },
  };
}

const PREFIXE_ODS = `/api/explore/v2.1/catalog/datasets/${DATASET}`;
const PREFIXE_ODS_EX_AEQUO = `/api/explore/v2.1/catalog/datasets/${DATASET_EX_AEQUO}`;

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
export function repondre(url: URL, corps?: string | null): unknown | null {
  // Les jeux d'un lot vivent dans SON fichier de fixtures : ce point de
  // branchement évite que chaque domaine vienne éditer celui des autres.
  const desAdaptateurs = repondreAdaptateurs(url);
  if (desAdaptateurs !== null) return desAdaptateurs;
  // Le faux Grist (#1279) : le seul à lire un CORPS — l'endpoint SQL se
  // demande en POST, la requête est dans le corps.
  const duGrist = repondreGristDocument(url, corps, GRIST_DOC_EX_AEQUO, TABLES_GRIST);
  if (duGrist !== null) return duGrist;
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
    if (reste === '') return repondreOdsMetadonnees(TERRITOIRES);
    return null;
  }
  if (url.origin === HOTE_ODS && url.pathname.startsWith(PREFIXE_ODS_EX_AEQUO)) {
    const reste = url.pathname.slice(PREFIXE_ODS_EX_AEQUO.length);
    if (reste === '/records') return repondreOdsRecords(url, EX_AEQUO);
    if (reste === '/exports/json') return repondreOdsExport(url, EX_AEQUO);
    if (reste === '') return repondreOdsMetadonnees(EX_AEQUO);
    return null;
  }
  if (url.origin === HOTE_TABULAR) {
    if (url.pathname === `/api/resources/${RESSOURCE_TABULAR}/data/`) {
      return repondreTabular(url, TERRITOIRES);
    }
    if (url.pathname === `/api/resources/${RESSOURCE_TABULAR_EX_AEQUO}/data/`) {
      return repondreTabular(url, EX_AEQUO);
    }
    if (url.pathname === `/api/resources/${RESSOURCE_TABULAR_JOKERS}/data/`) {
      return repondreTabular(url, JOKERS);
    }
    // La ressource Tabular du lot AFFICHAGES (#1020) : meme hote, autre chemin.
    return repondreAffichagesTabular(url);
  }
  if (url.origin === HOTE_API) {
    const pagine = /^\/pagine\/(.+)$/.exec(url.pathname);
    if (pagine) {
      const jeu = JEUX[pagine[1] as keyof typeof JEUX];
      return jeu ? repondreJeuPagine(url, jeu) : null;
    }
    const borne = /^\/pagine-borne\/(\d+)\/(.+)$/.exec(url.pathname);
    if (borne) {
      const jeu = JEUX[borne[2] as keyof typeof JEUX];
      const page = Number(url.searchParams.get('page') ?? '1');
      return jeu && page <= Number(borne[1]) ? repondreJeuPagine(url, jeu) : null;
    }
    const nom = url.pathname.replace(/^\//, '') as keyof typeof JEUX;
    return JEUX[nom] ?? null;
  }
  // Les jeux du lot AFFICHAGES vivent dans leur propre fichier, sur leur
  // propre hôte fictif : un domaine, ses lignes.
  return repondreAffichages(url);
}
