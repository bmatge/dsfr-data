/**
 * Resolution d'une valeur de geometrie potentiellement serialisee en chaine
 * (#426 — colonnes Text Grist, CSV/Tabular, tout backend qui stocke le
 * GeoJSON en texte).
 *
 * Le parse est memoïse par chaine : les contours (Multi)Polygon peuvent etre
 * volumineux et sont relus a chaque pan/zoom (filtrage bounds client-side).
 */

const cache = new Map<string, unknown>();

/** Borne de securite : au-dela, le cache est vide (jeux de donnees successifs) */
const CACHE_MAX_ENTRIES = 1000;

/**
 * Si `raw` est une chaine ressemblant a du JSON (`{...}` ou `[...]`), tente un
 * JSON.parse et retourne l'objet. Dans tous les autres cas (deja objet, chaine
 * non-JSON, parse invalide), retourne `raw` inchange — les appelants gardent
 * leurs garde-fous `typeof !== 'object'` existants.
 */
export function parseGeoValue(raw: unknown): unknown {
  if (typeof raw !== 'string' || !/^\s*[{[]/.test(raw)) return raw;

  if (cache.has(raw)) return cache.get(raw);

  let resolved: unknown = raw;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object') resolved = parsed;
  } catch {
    // chaine invalide : passthrough, la ligne sera ignoree en aval
  }

  if (cache.size >= CACHE_MAX_ENTRIES) cache.clear();
  cache.set(raw, resolved);
  return resolved;
}
