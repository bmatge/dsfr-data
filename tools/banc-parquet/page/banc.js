// Banc Parquet (#1022) — page pilotee par banc.spec.ts.
//
// Aucune dependance du depot : hyparquet et le decompresseur zstd (fzstd) sont
// importes depuis cdn.jsdelivr.net, a la demande (`importer()`), comme le ferait
// un `await import()` paresseux dans la bibliotheque. Les exports Parquet de
// data.gouv sont compresses en ZSTD : hyparquet seul ne sait pas les lire.
//
// Trois scenarios, meme contrat de retour :
//   A — Parquet (hydra.s3) lu par plages, colonnes projetees, groupe de lignes
//       par groupe de lignes ;
//   B — API tabulaire `data/?page_size=200&columns=…`, pages sequentielles
//       (l'adaptateur apres #1019) ;
//   C — idem B, 4 requetes en vol (borne theorique, non implementee).
// Chaque scenario garde ses lignes (objets) en vie jusqu'a la mesure memoire.

const HYPARQUET = 'https://cdn.jsdelivr.net/npm/hyparquet@1.31.1/+esm';
const FZSTD = 'https://cdn.jsdelivr.net/npm/fzstd@0.1.1/+esm';
const TABULAR = 'https://tabular-api.data.gouv.fr/api/resources/';
const DATAGOUV = 'https://www.data.gouv.fr/api/2/datasets/resources/';

let H = null;
let compressors = null;
let retenu = null; // lignes du dernier scenario, gardees en vie pour la memoire

// --- Memoire -----------------------------------------------------------------
// performance.memory (Chromium, precis avec --enable-precise-memory-info).
// Le pic est echantillonne (minuterie + a chaque bloc recu) : un decodage
// synchrone long peut le sous-estimer. La memoire RETENUE (apres gc, lignes en
// vie) est la mesure robuste.
const mem = { base: 0, pic: 0, minuterie: null };
const tas = () => (performance.memory ? performance.memory.usedJSHeapSize : NaN);
function echantillon() {
  const m = tas();
  if (m > mem.pic) mem.pic = m;
}
function memDebut() {
  retenu = null;
  if (window.gc) window.gc();
  mem.base = tas();
  mem.pic = mem.base;
  mem.minuterie = setInterval(echantillon, 20);
}
function memFin() {
  clearInterval(mem.minuterie);
  echantillon();
  const pic = mem.pic - mem.base;
  if (window.gc) window.gc();
  return { picOctets: pic, retenuOctets: tas() - mem.base };
}

// --- Import paresseux --------------------------------------------------------
async function importer() {
  const t0 = performance.now();
  const [h, z] = await Promise.all([import(HYPARQUET), import(FZSTD)]);
  H = h;
  compressors = {
    ZSTD: (input, outputLength) => z.decompress(input, new Uint8Array(outputLength)),
  };
  return { ms: performance.now() - t0 };
}

async function resoudreParquet(rid) {
  const j = await (await fetch(DATAGOUV + rid + '/')).json();
  const r = j.resource || j;
  return {
    url: r.extras['analysis:parsing:parquet_url'],
    taille: r.extras['analysis:parsing:parquet_size'],
    lastModified: r.last_modified,
    finishedAt: r.extras['analysis:parsing:finished_at'],
  };
}

// --- A : Parquet -------------------------------------------------------------
async function scenarioA({ rid, colonnes }) {
  if (!H) throw new Error('importer() d abord');
  memDebut();
  const t0 = performance.now();
  const p = await resoudreParquet(rid);
  const tResolution = performance.now() - t0;
  const file = await H.asyncBufferFromUrl({ url: p.url, byteLength: p.taille });
  // 64 Kio au lieu des 512 Kio par defaut : le pied des trois fichiers fait
  // 4 a 37 Kio ; 512 Kio rapatrieraient 62 % du fichier des elus pour rien.
  const metadata = await H.parquetMetadataAsync(file, { initialFetchSize: 64 * 1024 });
  const tMeta = performance.now() - t0;
  const lignes = [];
  const enAttente = new Map();
  let ttfr = null;
  await H.parquetRead({
    file,
    metadata,
    columns: colonnes,
    compressors,
    onChunk(chunk) {
      const cle = chunk.rowStart + ':' + chunk.rowEnd;
      let bloc = enAttente.get(cle);
      if (!bloc) enAttente.set(cle, (bloc = {}));
      bloc[chunk.columnName] = chunk.columnData;
      if (Object.keys(bloc).length === colonnes.length) {
        enAttente.delete(cle);
        const n = chunk.rowEnd - chunk.rowStart;
        for (let i = 0; i < n; i++) {
          const o = {};
          for (const c of colonnes) o[c] = bloc[c][i];
          lignes.push(o);
        }
        if (ttfr === null) ttfr = performance.now() - t0;
      }
      echantillon();
    },
  });
  const total = performance.now() - t0;
  retenu = lignes;
  return {
    ttfr,
    total,
    resolutionMs: tResolution,
    metaMs: tMeta,
    lignes: lignes.length,
    totalServeur: Number(metadata.num_rows),
    groupes: metadata.row_groups.length,
    ...memFin(),
  };
}

// --- B / C : API tabulaire ---------------------------------------------------
// Une reponse d'erreur de l'API (429, 400, 5xx) n'a pas d'en-tete CORS : le
// navigateur la presente comme « Failed to fetch » (#598). L'adaptateur ne
// reessaie pas ; le banc reessaie (3 fois, 1 s d'attente) pour pouvoir finir
// la mesure, et COMPTE ces echecs, qui sont un resultat en soi.
let echecs = 0;
async function lireJson(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) {
    echecs++;
    throw e;
  }
}

function urlPage(rid, colonnes, page) {
  const cols = colonnes.map(encodeURIComponent).join(',');
  return `${TABULAR}${rid}/data/?page_size=200&columns=${cols}&page=${page}`;
}

async function scenarioTabular({ rid, colonnes, plafond, parallele }) {
  echecs = 0;
  memDebut();
  const t0 = performance.now();
  let lignes = [];
  let ttfr = null;
  const premiere = await lireJson(urlPage(rid, colonnes, 1));
  lignes = lignes.concat(premiere.data);
  ttfr = performance.now() - t0;
  const totalServeur = premiere.meta.total;
  const cible = plafond > 0 ? Math.min(plafond, totalServeur) : totalServeur;
  const nbPages = Math.ceil(cible / 200);
  let requetes = 1;
  if (parallele <= 1) {
    let suivante = premiere.links && premiere.links.next;
    let page = 2;
    while (suivante && lignes.length < cible) {
      const j = await lireJson(urlPage(rid, colonnes, page));
      requetes++;
      lignes = lignes.concat(j.data);
      echantillon();
      suivante = j.links && j.links.next;
      page++;
      if (j.data.length < 200) break;
    }
  } else {
    const pages = [];
    for (let p = 2; p <= nbPages; p++) pages.push(p);
    const recus = new Map();
    async function ouvrier() {
      while (pages.length) {
        const p = pages.shift();
        const j = await lireJson(urlPage(rid, colonnes, p));
        requetes++;
        recus.set(p, j.data);
        echantillon();
      }
    }
    await Promise.all(Array.from({ length: parallele }, ouvrier));
    for (let p = 2; p <= nbPages; p++) lignes = lignes.concat(recus.get(p) || []);
  }
  if (lignes.length > cible) lignes = lignes.slice(0, cible);
  const total = performance.now() - t0;
  retenu = lignes;
  return {
    ttfr,
    total,
    lignes: lignes.length,
    totalServeur,
    requetesPage: requetes,
    echecs,
    ...memFin(),
  };
}

// --- Typage et integrite (hors chronometre) ----------------------------------
async function schema({ rid }) {
  const p = await resoudreParquet(rid);
  const file = await H.asyncBufferFromUrl({ url: p.url, byteLength: p.taille });
  const md = await H.parquetMetadataAsync(file, { initialFetchSize: 64 * 1024 });
  const colonnes = md.schema.slice(1).map((e) => ({
    nom: e.name,
    physique: e.type,
    logique: e.logical_type ? e.logical_type.type : e.converted_type || null,
  }));
  return {
    colonnes,
    lignes: Number(md.num_rows),
    groupes: md.row_groups.map((g) => Number(g.num_rows)),
    codec: md.row_groups[0].columns[0].meta_data.codec,
    creePar: md.created_by,
    ...p,
  };
}

async function sommeParquet({ rid, colonne }) {
  const p = await resoudreParquet(rid);
  const file = await H.asyncBufferFromUrl({ url: p.url, byteLength: p.taille });
  const metadata = await H.parquetMetadataAsync(file, { initialFetchSize: 64 * 1024 });
  let somme = 0;
  let nonNuls = 0;
  let lignes = 0;
  await H.parquetRead({
    file,
    metadata,
    columns: [colonne],
    compressors,
    onChunk(chunk) {
      lignes += chunk.rowEnd - chunk.rowStart;
      for (const v of chunk.columnData) {
        if (v !== null && v !== undefined) {
          somme += Number(v);
          nonNuls++;
        }
      }
    },
  });
  return { somme, nonNuls, lignes, numRows: Number(metadata.num_rows) };
}

window.banc = { importer, scenarioA, scenarioTabular, schema, sommeParquet, pret: true };
