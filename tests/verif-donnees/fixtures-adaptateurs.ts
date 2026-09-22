/**
 * Alimentation DÉTERMINISTE du lot « adaptateurs et sources ».
 *
 * Chaque adaptateur parle une enveloppe différente — `{ total_count, results }`
 * pour Opendatasoft, `{ data, links, meta }` pour Tabular, `{ records:
 * [{ id, fields }] }` pour Grist, `{ observations, paging }` plus une SECONDE
 * ressource `/range` pour INSEE Melodi. Les fixtures sont donc écrites à
 * l'envers : on pose d'abord les LIGNES PLATES que la page doit finir par
 * montrer, puis le faux serveur les ré-emballe dans la forme de l'API. C'est
 * ce qui permet à l'oracle de repartir de ces lignes sans jamais aplatir quoi
 * que ce soit — l'aplatissement et la résolution des libellés restent le
 * travail de la bibliothèque, et c'est précisément ce qui est vérifié.
 *
 * CE MODULE NE SAIT RIEN DE PLAYWRIGHT : il prend une URL, il rend une
 * réponse — ou `null`, et l'appelant REFUSE la requête plutôt que de la
 * laisser sortir. C'est aussi ce qui fait de la fuite d'une clé
 * d'authentification un échec : une URL qui porte la clé n'est pas servie.
 */
import {
  HOTES,
  RESSOURCES,
  repondreOdsExport,
  repondreOdsFacets,
  repondreOdsRecords,
  repondreTabular,
} from '../builder-e2e/api-fixtures.js';
import type { Row } from '../../tools/oracle/manifest.js';
import territoires from './jeux/territoires.json' with { type: 'json' };
import tabularLong from './jeux/adaptateurs-tabular-long.json' with { type: 'json' };
import melodi from './jeux/adaptateurs-melodi.json' with { type: 'json' };
import grist from './jeux/adaptateurs-grist.json' with { type: 'json' };
import jsonLignes from './jeux/adaptateurs-json.json' with { type: 'json' };

/** Hôtes fictifs — TLD réservé (RFC 2606) : rien ne peut joindre le réseau. */
export const HOTE_ODS_ADAPT = 'https://portail.adaptateurs.invalid';
export const HOTE_GRIST = 'https://grist.adaptateurs.invalid';
export const HOTE_INSEE = 'https://melodi.adaptateurs.invalid/melodi';
export const HOTE_JSON = 'https://json.adaptateurs.invalid';

/**
 * Tabular garde le VRAI hôte : l'adaptateur retombe sur
 * `TABULAR_CONFIG.defaultBaseUrl` quand `base-url` est absent, et c'est cette
 * URL par défaut que le contrôle doit éprouver. Aucune requête ne sort : le
 * faux réseau du spec intercepte tout.
 */
export const HOTE_TABULAR = HOTES.tabular;
export const RESSOURCE_TABULAR = RESSOURCES.resourceId;

/** Jeu Opendatasoft du lot. */
export const DATASET_ADAPT = 'jeu-adaptateurs';

/** Clé d'authentification de la fixture — elle ne doit JAMAIS paraître dans une URL. */
export const CLE_ODS = 'cle-de-verif-a-ne-pas-journaliser';

/** Les 137 territoires du harnais de recette, partagés par ODS et Tabular. */
export const TERRITOIRES_ADAPT: Row[] = territoires;

/**
 * Ressource Tabular LONGUE (#1019) : l'API sert 200 lignes par page, les 137
 * territoires tiennent donc en une seule — et `links.next` ne serait plus
 * suivi. Ce jeu (`jeux/adaptateurs-tabular-long.json`) les pose trois fois
 * (411 lignes, trois pages : 200, 200, 11), chaque copie marquée par
 * `copie`, pour que la pagination reste éprouvée :
 * une page oubliée, ou la première relue au lieu de la suivante, change le
 * compte.
 */
export const RESSOURCE_TABULAR_LONGUE = 'ea1b5c3d-0000-4000-8000-tabularlongue01';
export const TERRITOIRES_TABULAR_LONG: Row[] = tabularLong;

// ---------------------------------------------------------------------------
// INSEE Melodi — deux ressources, un seul aplatissement (#586)
// ---------------------------------------------------------------------------

export const DATASET_INSEE = 'DS_VERIF_DECES';

/**
 * Les lignes PLATES attendues après aplatissement et résolution des libellés.
 *
 * Trois choses s'y jouent en même temps :
 *   - la mesure `OBS_VALUE_NIVEAU` perd son suffixe et devient `OBS_VALUE` ;
 *   - une dimension traduite garde son nom et voit sa VALEUR remplacée par le
 *     libellé, le code partant dans `<DIM>_CODE` ;
 *   - la dernière ligne porte un code géographique ABSENT de `/range` : il
 *     reste tel quel et n'ouvre pas de colonne `GEO_CODE`. Une fixture qui
 *     lui en donnerait une masquerait la règle.
 *
 * Les observations portent l'`id` géographique (`2025-DEP-01`), pas le code
 * court (`01`) : c'est la clé de jointure qui a coûté #586.
 */
export const MELODI_LIGNES: Row[] = melodi;

/** Modalités de `/range` : le géo porte `code` ET `id`, les autres le seul `code`. */
const MELODI_GEO: Array<{ code: string; id: string; label: string }> = [
  { code: '01', id: '2025-DEP-01', label: 'Ain' },
  { code: '02', id: '2025-DEP-02', label: 'Aisne' },
  { code: '21', id: '2025-DEP-21', label: "Côte-d'Or" },
];

const MELODI_SEXE: Array<{ code: string; label: string }> = [
  { code: 'M', label: 'Hommes' },
  { code: 'F', label: 'Femmes' },
];

/** `GET {base}/range/{id}` — les libellés, seconde ressource. */
export function repondreMelodiRange(): Record<string, unknown> {
  return {
    code: DATASET_INSEE,
    label: { fr: 'Décès de vérification' },
    range: [
      {
        concept: { code: 'GEO', label: { fr: 'Géographie' } },
        type: 'geo',
        values: MELODI_GEO.map((g) => ({ code: g.code, id: g.id, label: { fr: g.label } })),
      },
      {
        concept: { code: 'SEX', label: { fr: 'Sexe' } },
        type: 'modalites',
        values: MELODI_SEXE.map((s) => ({ code: s.code, label: { fr: s.label } })),
      },
      // Dimension sans modalités : elle ne doit rien traduire du tout.
      { concept: { code: 'TIME_PERIOD', label: { fr: 'Période' } }, type: 'date', values: [] },
    ],
  };
}

/** L'inverse de l'aplatissement : une ligne plate redevient une observation SDMX. */
function enObservation(ligne: Row): Record<string, unknown> {
  return {
    dimensions: {
      GEO: ligne.GEO_CODE ?? ligne.GEO,
      SEX: ligne.SEX_CODE,
      TIME_PERIOD: ligne.TIME_PERIOD,
    },
    measures: { OBS_VALUE_NIVEAU: { value: ligne.OBS_VALUE } },
    attributes: { OBS_STATUS: ligne.OBS_STATUS },
  };
}

/** `GET {base}/data/{id}` — les observations, première ressource. */
export function repondreMelodiData(url: URL): Record<string, unknown> {
  const taille = Number(url.searchParams.get('maxResult') ?? '1000');
  const page = Number(url.searchParams.get('page') ?? '1');
  const observations = MELODI_LIGNES.slice((page - 1) * taille, page * taille).map(enObservation);
  return {
    paging: { count: MELODI_LIGNES.length, page, isLast: page * taille >= MELODI_LIGNES.length },
    observations,
  };
}

// ---------------------------------------------------------------------------
// Grist — des champs IMBRIQUÉS sous `fields`
// ---------------------------------------------------------------------------

export const GRIST_DOC = 'docDeVerif';
export const GRIST_TABLE = 'Territoires';

/** Chemin complet attendu par l'adaptateur Grist : `base-url` EST l'URL /records. */
export const URL_GRIST = `${HOTE_GRIST}/api/docs/${GRIST_DOC}/tables/${GRIST_TABLE}/records`;

/**
 * Les lignes plates attendues. Les noms de colonnes sont volontairement
 * piégeux (espaces, apostrophe, accents) : ce sont eux qui cassent quand
 * l'aplatissement passe par une clé construite plutôt que recopiée.
 */
export const GRIST_LIGNES: Row[] = grist;

/**
 * `GET {docUrl}/records` — l'enveloppe Grist.
 *
 * L'`id` de premier niveau est servi comme le fait le vrai Grist ; le chemin
 * adaptateur le perd à l'aplatissement, et les lignes de l'oracle ne le
 * portent donc pas non plus.
 */
export function repondreGrist(): Record<string, unknown> {
  return {
    records: GRIST_LIGNES.map((fields, i) => ({ id: i + 1, fields })),
  };
}

// ---------------------------------------------------------------------------
// JSON générique — une enveloppe, et des nombres écrits en français
// ---------------------------------------------------------------------------

/**
 * Des colonnes numériques servies EN CHAÎNES, à la française : espace de
 * milliers, virgule décimale. C'est la forme qu'ont les exports de beaucoup de
 * portails, et la lire comme un point donne un agrégat faux sans rien dire.
 * `effectif` mélange nombres et chaînes dans la même colonne, ce qui arrive
 * dès qu'un export a été repris à la main.
 */
export const JSON_LIGNES: Row[] = jsonLignes;

/** L'enveloppe que `transform="resultats.lignes"` doit savoir traverser. */
export function repondreJsonEnveloppe(): Record<string, unknown> {
  return {
    meta: { source: 'fixture' },
    resultats: { total: JSON_LIGNES.length, lignes: JSON_LIGNES },
  };
}

// ---------------------------------------------------------------------------
// Le faux serveur du lot
// ---------------------------------------------------------------------------

/** Noms de paramètres par lesquels une clé pourrait fuir dans une URL. */
const PARAMS_DE_CLE = ['apikey', 'api_key', 'api-key', 'x-api-key', 'authorization', 'token'];

/**
 * Les origines servies par CE lot. La garde de fuite ne s'applique qu'à
 * elles : `repondre` appelle `repondreAdaptateurs` pour toute URL, et une
 * garde sans borne compterait comme une fuite un `?token=` qu'un autre lot
 * poserait légitimement sur son propre faux hôte.
 */
const ORIGINES_DU_LOT: ReadonlySet<string> = new Set([
  HOTE_ODS_ADAPT,
  HOTE_TABULAR,
  HOTE_GRIST,
  HOTE_JSON,
  new URL(HOTE_INSEE).origin,
]);

/**
 * Une clé d'authentification voyage en EN-TÊTE, jamais en query string : une
 * URL journalisée (proxy, `access.log`, rapport d'erreur) ne doit pas la
 * porter. Une URL fautive n'est pas servie — elle est comptée comme une fuite
 * par le spec, et le contrôle tombe.
 *
 * La règle ne vaut QUE pour les hôtes de ce lot : elle exprime ce que ses
 * propres contrôles attendent, pas une convention imposée aux autres.
 */
export function urlFaitFuirUneCle(url: URL): boolean {
  if (!ORIGINES_DU_LOT.has(url.origin)) return false;
  if (url.href.includes(CLE_ODS)) return true;
  for (const nom of PARAMS_DE_CLE) {
    if (url.searchParams.has(nom)) return true;
  }
  return false;
}

const PREFIXE_ODS = `/api/explore/v2.1/catalog/datasets/${DATASET_ADAPT}`;

/** Métadonnées du jeu ODS du lot — source de la découverte de facettes (#680). */
function repondreMetadonnees(): Record<string, unknown> {
  return {
    dataset_id: DATASET_ADAPT,
    fields: [
      { name: 'pays_iso2', label: 'Pays', type: 'text', annotations: { facet: true } },
      { name: 'academie', label: 'Académie', type: 'text', annotations: { facet: true } },
      { name: 'population', label: 'Population', type: 'int' },
    ],
  };
}

/**
 * Le faux serveur du lot : une URL, une réponse — ou `null` si l'URL n'est pas
 * prévue. Les fixtures ODS et Tabular sont celles de la recette (#625), déjà
 * éprouvées hors ligne ; seules les enveloppes Grist, Melodi et JSON sont
 * propres à ce lot.
 */
export function repondreAdaptateurs(url: URL): unknown | null {
  if (urlFaitFuirUneCle(url)) return null;

  if (url.origin === HOTE_ODS_ADAPT && url.pathname.startsWith(PREFIXE_ODS)) {
    const reste = url.pathname.slice(PREFIXE_ODS.length);
    // Les trois réponses viennent de `api-fixtures.ts` : elles mentent comme
    // le vrai portail (`total_count` = taille de page sur un group_by, #641)
    // et sont éprouvées par `api-fixtures.test.ts`.
    if (reste === '/records') return repondreOdsRecords(url, TERRITOIRES_ADAPT);
    if (reste === '/exports/json') return repondreOdsExport(url, TERRITOIRES_ADAPT);
    if (reste === '/facets') return repondreOdsFacets(url, TERRITOIRES_ADAPT);
    if (reste === '') return repondreMetadonnees();
    return null;
  }

  if (url.origin === HOTE_TABULAR) {
    if (url.pathname === `/api/resources/${RESSOURCE_TABULAR}/data/`) {
      return repondreTabular(url, TERRITOIRES_ADAPT);
    }
    if (url.pathname === `/api/resources/${RESSOURCE_TABULAR_LONGUE}/data/`) {
      return repondreTabular(url, TERRITOIRES_TABULAR_LONG);
    }
    return null;
  }

  if (url.href.startsWith(`${HOTE_INSEE}/data/${DATASET_INSEE}`)) return repondreMelodiData(url);
  if (url.href.startsWith(`${HOTE_INSEE}/range/${DATASET_INSEE}`)) return repondreMelodiRange();

  if (url.origin === HOTE_GRIST) {
    if (url.pathname === `/api/docs/${GRIST_DOC}/tables/${GRIST_TABLE}/records`) {
      return repondreGrist();
    }
    return null;
  }

  if (url.origin === HOTE_JSON) {
    if (url.pathname === '/enveloppe') return repondreJsonEnveloppe();
    return null;
  }

  return null;
}
