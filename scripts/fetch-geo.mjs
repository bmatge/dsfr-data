#!/usr/bin/env node
/**
 * Produit les fonds administratifs simplifies livres dans le paquet npm
 * (`packages/core/geo/*.json`, hors bundle — #688).
 *
 * Source : « Contours administratifs » d'Etalab (Licence Ouverte 2.0), dans
 * la resolution 1000 m deja simplifiee par mapshaper cote Etalab (topologie
 * conservee : pas de trou entre deux departements voisins). On ne fait ici
 * que filtrer, alleger et figer :
 *   - regions.json       : les 18 regions (13 metropolitaines + 5 DROM) ;
 *   - departements.json  : les 101 departements (96 + 5 DROM) ;
 *   - proprietes conservees : `code`, `nom` (+ `region` pour un departement).
 * Les collectivites d'outre-mer (975, 977, 978, 984, 986-989) sont ecartees :
 * ni region ni departement au sens INSEE.
 *
 * Aucune dependance : fetch natif de Node 18+. Reproductible : relancer le
 * script regenere les deux fichiers a l'identique pour un millesime donne.
 *
 *   node scripts/fetch-geo.mjs            # ecrit packages/core/geo/*.json
 *   node scripts/fetch-geo.mjs --check    # verifie que les fichiers sont a jour
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'packages/core/geo');
const BASE = 'https://etalab-datasets.geo.data.gouv.fr/contours-administratifs/latest/geojson';

/** Codes INSEE des 18 regions : 5 DROM (01-06) + 13 regions metropolitaines. */
const REGION_CODES = new Set([
  '01',
  '02',
  '03',
  '04',
  '06',
  '11',
  '24',
  '27',
  '28',
  '32',
  '44',
  '52',
  '53',
  '75',
  '76',
  '84',
  '93',
  '94',
]);

/** Un departement : 2 caracteres (01-95, 2A, 2B) ou 971-974, 976. */
const DEPARTEMENT_RE = /^(\d{2}|2A|2B|97[1-46])$/;

const TARGETS = [
  {
    file: 'regions.json',
    source: `${BASE}/regions-1000m.geojson`,
    keep: (f) => REGION_CODES.has(f.properties.code),
    props: ['code', 'nom'],
    expected: 18,
  },
  {
    file: 'departements.json',
    source: `${BASE}/departements-1000m.geojson`,
    keep: (f) => DEPARTEMENT_RE.test(f.properties.code) && f.properties.code.length <= 3,
    props: ['code', 'nom', 'region'],
    expected: 101,
  },
];

async function build(target) {
  const res = await fetch(target.source);
  if (!res.ok) throw new Error(`${target.source} -> HTTP ${res.status}`);
  const raw = await res.json();
  const features = raw.features
    .filter(target.keep)
    .map((f) => ({
      type: 'Feature',
      properties: Object.fromEntries(target.props.map((k) => [k, f.properties[k]])),
      geometry: f.geometry,
    }))
    .sort((a, b) => a.properties.code.localeCompare(b.properties.code));
  if (features.length !== target.expected) {
    throw new Error(`${target.file}: ${features.length} entites, ${target.expected} attendues`);
  }
  return JSON.stringify({ type: 'FeatureCollection', features });
}

const check = process.argv.includes('--check');
mkdirSync(OUT_DIR, { recursive: true });
let dirty = false;
for (const target of TARGETS) {
  const json = await build(target);
  const path = resolve(OUT_DIR, target.file);
  if (check) {
    let current = '';
    try {
      current = readFileSync(path, 'utf8');
    } catch {
      /* absent */
    }
    const same = current === json;
    console.log(`${same ? 'OK ' : 'DIFF'} ${target.file}`);
    if (!same) dirty = true;
  } else {
    writeFileSync(path, json);
    console.log(`ecrit ${target.file} (${(json.length / 1024).toFixed(0)} Ko)`);
  }
}
if (dirty) process.exit(1);
