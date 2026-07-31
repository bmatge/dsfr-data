/**
 * Assistance de saisie : echantillonne la source d'une couche via le pipeline
 * dsfr-data reel (un <dsfr-data-source> cache, limit 50) pour decouvrir les
 * champs disponibles, leur taux de remplissage et proposer les champs
 * geographiques / temporels probables.
 */
import type { FieldInfo, LayerConfig } from './state.js';
import { buildSourceTag } from './ui/code-generator.js';

export interface FieldSuggestions {
  geo: string;
  lat: string;
  lon: string;
  time: string;
}

export interface FieldScanResult {
  fields: FieldInfo[];
  suggestions: FieldSuggestions;
  sampleSize: number;
}

const GEO_NAME_HINTS = ['geo_point_2d', 'geopoint', 'geo_point', 'geo_shape', 'geometry', 'geom'];
const LAT_NAME_HINTS = ['lat', 'latitude', 'y'];
const LON_NAME_HINTS = ['lon', 'lng', 'longitude', 'x'];
const TIME_NAME_HINTS = ['date', 'annee', 'year', 'mois', 'time', 'periode', 'jour'];

function valueType(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'object') return 'object';
  return 'string';
}

/** Une valeur qui « ressemble » a une geometrie exploitable par geo-field. */
function looksGeo(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') {
    const t = v.trim();
    return t.startsWith('{') || t.startsWith('[');
  }
  if (Array.isArray(v)) {
    return v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number';
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return (
      ('type' in o && ('coordinates' in o || 'geometry' in o)) ||
      ('lat' in o && ('lon' in o || 'lng' in o))
    );
  }
  return false;
}

function looksIsoDate(v: unknown): boolean {
  return typeof v === 'string' && /^\d{4}(-\d{2})?(-\d{2})?([T ].*)?$/.test(v.trim());
}

function nameMatches(name: string, hints: string[]): boolean {
  const n = name.toLowerCase();
  return hints.some(
    (h) => n === h || n.endsWith(`_${h}`) || n.startsWith(`${h}_`) || n.includes(h)
  );
}

function inRange(v: unknown, min: number, max: number): boolean {
  return typeof v === 'number' && v >= min && v <= max;
}

export function computeFields(records: Record<string, unknown>[]): FieldScanResult {
  const n = records.length;
  const names = new Set<string>();
  for (const r of records) for (const k of Object.keys(r)) names.add(k);

  const fields: FieldInfo[] = [];
  const geoScores = new Map<string, number>();
  const latScores = new Map<string, number>();
  const lonScores = new Map<string, number>();
  const timeScores = new Map<string, number>();

  for (const name of names) {
    const values = records.map((r) => r[name]);
    const filled = values.filter((v) => v !== null && v !== undefined && v !== '');
    const types = new Set(filled.map(valueType));
    const type = types.size === 0 ? 'null' : types.size === 1 ? [...types][0] : 'mixed';
    const fillRate = n ? filled.length / n : 0;
    fields.push({ name, type, fillRate });

    if (fillRate === 0) continue; // une colonne vide n'est jamais un bon candidat

    const geoLike = filled.filter(looksGeo).length / filled.length;
    if (geoLike > 0.8) {
      geoScores.set(name, geoLike + (nameMatches(name, GEO_NAME_HINTS) ? 1 : 0) + fillRate);
    }
    if (filled.every((v) => inRange(v, -90, 90)) && nameMatches(name, LAT_NAME_HINTS)) {
      latScores.set(name, 1 + fillRate);
    }
    if (filled.every((v) => inRange(v, -180, 180)) && nameMatches(name, LON_NAME_HINTS)) {
      lonScores.set(name, 1 + fillRate);
    }
    const dateLike = filled.filter(looksIsoDate).length / filled.length;
    if (dateLike > 0.8 && nameMatches(name, TIME_NAME_HINTS)) {
      timeScores.set(name, dateLike + fillRate);
    }
  }

  fields.sort((a, b) => b.fillRate - a.fillRate || a.name.localeCompare(b.name, 'fr'));

  const best = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

  return {
    fields,
    suggestions: {
      geo: best(geoScores),
      lat: best(latScores),
      lon: best(lonScores),
      time: best(timeScores),
    },
    sampleSize: n,
  };
}

/**
 * Charge un echantillon de la source de la couche via un <dsfr-data-source>
 * cache et calcule les champs. Rejette apres `timeoutMs` (defaut 20 s).
 */
export function scanLayerFields(layer: LayerConfig, timeoutMs = 20000): Promise<FieldScanResult> {
  const s = layer.source;
  if (!s) return Promise.reject(new Error('Aucune source configurée'));

  // Source manuelle : les donnees sont deja la, pas de fetch.
  if (s.type === 'manual' && Array.isArray(s.data) && s.data.length) {
    return Promise.resolve(computeFields(s.data.slice(0, 50)));
  }

  const sampleId = `carto-scan-${layer.id}-${Date.now()}`;
  const tag = buildSourceTag(layer, { id: sampleId, limit: 50 });
  if (!tag) return Promise.reject(new Error('Source non exploitable'));

  return new Promise<FieldScanResult>((resolve, reject) => {
    const host = document.createElement('div');
    host.style.display = 'none';
    host.innerHTML = tag;
    document.body.appendChild(host);

    const cleanup = () => {
      document.removeEventListener('dsfr-data-loaded', onLoaded as EventListener);
      document.removeEventListener('dsfr-data-error', onError as EventListener);
      clearTimeout(timer);
      host.remove();
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Délai dépassé lors du chargement des champs'));
    }, timeoutMs);

    const onLoaded = (e: CustomEvent<{ sourceId: string; data: Record<string, unknown>[] }>) => {
      if (e.detail?.sourceId !== sampleId) return;
      const records = Array.isArray(e.detail.data) ? e.detail.data.slice(0, 50) : [];
      cleanup();
      resolve(computeFields(records));
    };

    const onError = (e: CustomEvent<{ sourceId: string; error?: { message?: string } }>) => {
      if (e.detail?.sourceId !== sampleId) return;
      cleanup();
      reject(new Error(e.detail.error?.message || 'Erreur de chargement de la source'));
    };

    document.addEventListener('dsfr-data-loaded', onLoaded as EventListener);
    document.addEventListener('dsfr-data-error', onError as EventListener);
  });
}
