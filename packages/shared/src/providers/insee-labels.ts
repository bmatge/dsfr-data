/**
 * Resolution des libelles INSEE Melodi (#592, volet B).
 *
 * Les observations de `/melodi/data/{id}` ne portent que des codes SDMX :
 * `{ GEO: "2025-DEP-01", SEX: "M", AGE: "Y65T74", FREQ: "D" }`. Un axe de
 * graphique etiquete `Y_GE85` est inexploitable pour une publication
 * gouvernementale — c'est pourquoi l'explorateur de l'INSEE propose un
 * selecteur « Codes / Libelles / Codes-Libelles ».
 *
 * Les libelles vivent sur une seconde ressource, `/melodi/range/{idDataset}`,
 * qui renvoie « l'ensemble des modalites qui sont utilisees au sein du jeu de
 * donnees ». On lui prefere `/datastructure/{id}` pour deux raisons verifiees
 * sur DS_EC_DECES : `/datastructure` renvoie `GEO` **vide** (le referentiel
 * geographique est ailleurs), et il liste les listes de codes completes —
 * 281 modalites d'age contre les 7 reellement presentes dans le jeu.
 *
 * Les noms de colonnes restent les codes de dimension (`AGE`, `GEO`) : ce sont
 * des identifiants stables, references par les configurations de graphiques
 * enregistrees. Seules les **valeurs** sont traduites, et le code d'origine est
 * conserve dans une colonne `<DIM>_CODE` — un graphique veut « De 65 a 74 ans »,
 * mais un filtre, une jointure ou une URL partagee veulent `Y65T74`.
 */

import type { FlatRecord } from './flatten.js';

/** Une modalite telle que la renvoie `/range` : `code` toujours, `id` pour le geo. */
export interface InseeRangeValue {
  code?: string;
  id?: string;
  label?: Record<string, string>;
}

/** Une dimension et ses modalites. `type` vaut `modalites`, `geo`, `date` ou `mesures`. */
export interface InseeRangeEntry {
  concept?: { code?: string; label?: Record<string, string> };
  type?: string;
  values?: InseeRangeValue[];
}

/** La reponse de `GET /melodi/range/{idDataset}`. */
export interface InseeRange {
  code?: string;
  label?: Record<string, string>;
  range?: InseeRangeEntry[];
}

/** Dimension -> (code ou id de modalite) -> libelle. */
export type InseeLabelIndex = Map<string, Map<string, string>>;

/** Suffixe de la colonne qui conserve le code d'origine. */
export const INSEE_CODE_SUFFIX = '_CODE';

function pickLabel(label: Record<string, string> | undefined, lang: string): string | null {
  if (!label) return null;
  return label[lang] ?? label.fr ?? label.en ?? null;
}

/**
 * Construit l'index de traduction depuis une reponse `/range`.
 *
 * Les modalites geographiques portent a la fois un `code` court (« 01 ») et un
 * `id` complet (« 2025-DEP-01 ») ; c'est l'`id` que l'on retrouve dans les
 * observations. On indexe donc l'`id` en priorite, et le `code` en second
 * seulement s'il ne recouvre pas une entree deja posee — de sorte qu'un code
 * court ne puisse jamais ecraser l'identifiant d'une autre modalite.
 *
 * Les dimensions sans modalites (`TIME_PERIOD`, deja lisible) sont ignorees.
 */
export function buildInseeLabelIndex(range: InseeRange, lang = 'fr'): InseeLabelIndex {
  const index: InseeLabelIndex = new Map();

  for (const entry of range?.range ?? []) {
    const dimension = entry?.concept?.code;
    if (!dimension || !entry.values?.length) continue;

    const labels = new Map<string, string>();

    for (const value of entry.values) {
      const label = pickLabel(value?.label, lang);
      if (!label) continue;
      const primary = value.id ?? value.code;
      if (primary) labels.set(primary, label);
    }
    for (const value of entry.values) {
      const label = pickLabel(value?.label, lang);
      if (!label || !value.code || labels.has(value.code)) continue;
      labels.set(value.code, label);
    }

    if (labels.size > 0) index.set(dimension, labels);
  }

  return index;
}

/**
 * Traduit les valeurs d'enregistrements deja aplatis.
 *
 * Une valeur sans libelle connu est laissee telle quelle (et n'ouvre pas de
 * colonne `_CODE` : il n'y aurait rien a y conserver). Le tableau d'origine est
 * renvoye tel quel si l'index est vide, pour ne pas recopier un gros jeu sans
 * raison.
 */
export function applyInseeLabels(records: FlatRecord[], index: InseeLabelIndex): FlatRecord[] {
  if (index.size === 0) return records;

  return records.map((record) => {
    let touched = false;
    const out: FlatRecord = {};

    for (const [key, value] of Object.entries(record)) {
      const labels = index.get(key);
      const label = labels && typeof value === 'string' ? labels.get(value) : undefined;

      if (label === undefined) {
        out[key] = value;
        continue;
      }

      out[key] = label;
      out[`${key}${INSEE_CODE_SUFFIX}`] = value;
      touched = true;
    }

    return touched ? out : record;
  });
}

/**
 * Cache des index, par jeu de donnees et par langue.
 *
 * On memorise la **promesse**, pas seulement le resultat : deux composants qui
 * chargent le meme jeu en parallele partagent alors un seul appel reseau au
 * lieu d'en declencher deux (coalescence). Une resolution qui echoue est
 * retiree du cache, pour qu'une panne passagere ne condamne pas la session.
 *
 * Volontairement en memoire seule. `/range` annonce `cache-control:
 * max-age=600, public` : le cache HTTP du navigateur prend le relais d'un
 * chargement de page a l'autre, sans qu'on ait a gerer d'invalidation. Et
 * surtout, pas de `localStorage` : son quota est precisement ce que le volet A
 * de #592 vient de desaturer.
 */
const labelIndexCache = new Map<string, Promise<InseeLabelIndex>>();

/** Vide le cache des index (tests, ou changement d'instance de proxy). */
export function clearInseeLabelCache(): void {
  labelIndexCache.clear();
}

export interface FetchInseeLabelsOptions {
  /** Base de l'API, sans slash final. Defaut : l'API publique de l'INSEE. */
  baseUrl?: string;
  /** Applique le proxy CORS a l'URL construite. */
  toProxiedUrl?: (url: string) => string;
  /** Injection pour les tests. */
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  lang?: string;
}

const DEFAULT_INSEE_BASE_URL = 'https://api.insee.fr/melodi';

/**
 * Charge et indexe les libelles d'un jeu Melodi.
 *
 * Ne rejette jamais : un index vide laisse les codes en place, ce qui est
 * exactement le comportement d'avant #592. Une source de donnees ne doit pas
 * devenir inutilisable parce que ses libelles sont indisponibles.
 */
export function fetchInseeLabelIndex(
  datasetId: string,
  options: FetchInseeLabelsOptions = {}
): Promise<InseeLabelIndex> {
  const {
    baseUrl = DEFAULT_INSEE_BASE_URL,
    toProxiedUrl,
    fetchImpl,
    signal,
    lang = 'fr',
  } = options;

  if (!datasetId) return Promise.resolve(new Map());

  const cacheKey = `${baseUrl}|${datasetId}|${lang}`;
  const cached = labelIndexCache.get(cacheKey);
  if (cached) return cached;

  const doFetch = fetchImpl ?? globalThis.fetch;
  const rawUrl = `${baseUrl.replace(/\/$/, '')}/range/${encodeURIComponent(datasetId)}`;
  const url = toProxiedUrl ? toProxiedUrl(rawUrl) : rawUrl;

  const pending = doFetch(url, signal ? { signal } : {})
    .then((response) => {
      if (!response.ok) throw new Error(`range ${datasetId}: HTTP ${response.status}`);
      return response.json() as Promise<InseeRange>;
    })
    .then((range) => buildInseeLabelIndex(range, lang))
    .catch((error) => {
      labelIndexCache.delete(cacheKey);
      console.warn(`[insee] libelles indisponibles pour ${datasetId}, codes conserves :`, error);
      return new Map<string, Map<string, string>>();
    });

  labelIndexCache.set(cacheKey, pending);
  return pending;
}
