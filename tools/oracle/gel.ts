/**
 * LE GEL D'UN ÉCHEC (#884) : un échec vivant devient un échec figé en un commit.
 *
 * Sur un verdict « bibliothèque » (empreinte stable, écart), le spec écrit
 * `tools/oracle/out/gel/<id>.json` : les lignes brutes téléchargées, le
 * balisage, les attentes — c'est-à-dire un `Check` DÉTERMINISTE prêt à être
 * copié sous `tests/verif-donnees/gel/`. Le matin, la question n'est plus
 * « est-ce la lib ? » mais « ce contrôle figé est-il rouge sur `main` ? » —
 * et il l'est, hermétiquement, sur chaque PR, jusqu'au correctif. C'est la
 * seule réponse durable à « le portail a changé ou la lib a un bug » : on ne
 * le devine pas, on fige et on rejoue.
 *
 * Pour que le contrôle figé tourne SANS réseau, ses sources doivent parler au
 * faux serveur : chaque `base-url="https://<portail>"` du balisage est
 * réécrite vers `https://gel.verif.invalid/<id>`, le `dataset-id` restant
 * celui du portail ; `repondreGel` sert alors l'export, `/records` et
 * `/facets` depuis les lignes gelées, avec le faux serveur ODS du harnais
 * (`filtrerOdsql`, agrégation, tri, pagination). Les attributs porteurs d'un
 * secret (`api-key-ref`, `headers`) sont retirés : un fichier gelé n'emporte
 * jamais une clé.
 *
 * Ce module ne connaît pas les manifestes (garde d'indépendance) : ce qu'il
 * faut savoir d'un contrôle lui est passé.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Check, Expect, Row } from './manifest.js';
import { JEU_PRINCIPAL } from './manifest.js';
import { estUrlBrute } from './raw.js';

/** Hôte fictif des contrôles gelés — TLD réservé, rien ne peut joindre le réseau. */
export const HOTE_GEL = 'https://gel.verif.invalid';

/** Un contrôle figé tel qu'il est écrit sur le disque : un `Check` déterministe, plus sa provenance. */
export interface Gel {
  /** Le contrôle, prêt à entrer dans un manifeste : `mode: 'deterministic'`, feed `fixture`. */
  check: Check;
  /** D'où il vient : contrôle vivant, domaine, date du gel, écart constaté. */
  provenance: {
    controle: string;
    domaine: string;
    gele: string;
    ecarts: string[];
    /** `dataset-id` du portail → nom du jeu dans `feed.datasets`. */
    datasets: Record<string, string>;
    /** Ce que le faux serveur ne saura peut-être pas rejouer (clause ODSQL exotique). */
    reserves: string[];
  };
}

/** Le `dataset-id` Opendatasoft d'une source brute, ou `null` (Tabular, Melodi…). */
export function datasetDe(source: { url?: string; dataset?: string }): string | null {
  if (!estUrlBrute(source as never)) return source.dataset ?? null;
  const m = /\/api\/explore\/v2\.1\/catalog\/datasets\/([^/]+)\/exports\/json$/.exec(
    new URL(source.url as string).pathname
  );
  return m === null ? null : decodeURIComponent(m[1]);
}

/**
 * Réécrit le balisage pour le faux serveur : `base-url` vers l'hôte du gel,
 * secrets retirés. Le `dataset-id` est conservé — c'est lui que
 * `repondreGel` retrouve dans le chemin.
 */
export function reecrireBalisage(markup: string, id: string): string {
  return markup
    .replace(/base-url="https?:\/\/[^"]+"/g, `base-url="${HOTE_GEL}/${id}"`)
    .replace(/\s+api-key-ref="[^"]*"/g, '')
    .replace(/\s+headers='[^']*'/g, '')
    .replace(/\s+headers="[^"]*"/g, '');
}

/** Les clauses que le faux serveur ODS du harnais ne sait pas lire. */
function reservesSur(markup: string): string[] {
  const reserves: string[] = [];
  for (const m of markup.matchAll(/where="([^"]*)"/g)) {
    const clause = m[1];
    if (
      /\b(year|month|day|date_format|search|like)\s*\(/i.test(clause) ||
      /\bin\s*\(/i.test(clause)
    ) {
      reserves.push(
        `clause « ${clause.slice(0, 80)} » : fonction ou \`in\` que le faux serveur ne lit pas — le contrôle gelé peut ne rien afficher`
      );
    }
  }
  return reserves;
}

/**
 * Gèle un contrôle vivant : ses lignes brutes deviennent des fixtures, son
 * balisage parle au faux serveur, ses attentes restent celles du manifeste.
 * `recoupement` et `crosscheck` n'ont pas de sens hors ligne et sont retirés.
 */
export function geler(
  domaine: string,
  check: Check,
  datasets: Record<string, Row[]>,
  ecarts: string[],
  date: string = new Date().toISOString()
): Gel {
  if (check.feed.kind !== 'raw') throw new Error(`gel : ${check.id} n'est pas un contrôle vivant`);
  const id = `${check.id}-gel`;
  const noms: Record<string, string> = {};
  const principal = datasetDe(check.feed.source);
  if (principal !== null) noms[principal] = JEU_PRINCIPAL;
  for (const [nom, source] of Object.entries(check.feed.sources ?? {})) {
    const d = datasetDe(source);
    if (d !== null) noms[d] = nom;
  }
  const expects = check.expects.map((e) => {
    const { crosscheck: _c, ...reste } = e as Expect & { crosscheck?: unknown };
    return reste as Expect;
  });
  const gele: Check = {
    id,
    mode: 'deterministic',
    origin: `GEL du ${date.slice(0, 10)} de ${domaine}/${check.id} — verdict bibliothèque : ${ecarts.join(' ; ')}. Origine : ${check.origin}`,
    ...(check.page ? { page: check.page } : {}),
    ...(check.constats ? { constats: check.constats } : {}),
    feed: { kind: 'fixture', datasets },
    ...(check.head ? { head: check.head } : {}),
    markup: reecrireBalisage(check.markup, id),
    ...(check.query ? { query: check.query } : {}),
    ...(check.clock ? { clock: check.clock } : {}),
    ...(check.actions ? { actions: check.actions } : {}),
    expects,
  };
  return {
    check: gele,
    provenance: {
      controle: check.id,
      domaine,
      gele: date,
      ecarts,
      datasets: noms,
      reserves: reservesSur(check.markup),
    },
  };
}

/** Un gel tel qu'on le relit : `check` et `provenance`. */
export function chargerGels(dossier: string): Gel[] {
  let fichiers: string[];
  try {
    fichiers = readdirSync(dossier)
      .filter((f) => f.endsWith('.json'))
      .sort();
  } catch {
    return [];
  }
  return fichiers.map((f) => JSON.parse(readFileSync(resolve(dossier, f), 'utf-8')) as Gel);
}

const PREFIXE_ODS = '/api/explore/v2.1/catalog/datasets/';

/**
 * Le faux serveur des contrôles gelés : `https://gel.verif.invalid/<id>/api/
 * explore/v2.1/catalog/datasets/<dataset>/(exports/json|records|facets)`,
 * servi depuis les lignes gelées par les répondeurs ODS du harnais, passés
 * en paramètre (le moteur ne les importe pas : ils vivent dans `tests/`).
 */
export function repondreGel(
  url: URL,
  gels: readonly Gel[],
  repondeurs: {
    exportJson: (url: URL, jeu: Row[]) => unknown;
    records: (url: URL, jeu: Row[]) => unknown;
    facets: (url: URL, jeu: Row[]) => unknown;
    metadonnees: () => unknown;
  }
): unknown | null {
  if (url.origin !== HOTE_GEL) return null;
  const m = /^\/([^/]+)(\/api\/explore\/v2\.1\/catalog\/datasets\/[^/]+)(.*)$/.exec(url.pathname);
  if (m === null) return null;
  const [, id, chemin, reste] = m;
  const gel = gels.find((g) => g.check.id === id);
  if (!gel || gel.check.feed.kind !== 'fixture') return null;
  const dataset = decodeURIComponent(chemin.slice(PREFIXE_ODS.length));
  const nom = gel.provenance.datasets[dataset];
  const jeu = nom === undefined ? undefined : gel.check.feed.datasets[nom];
  if (!jeu) return null;
  if (reste === '/exports/json') return repondeurs.exportJson(url, jeu);
  if (reste === '/records') return repondeurs.records(url, jeu);
  if (reste === '/facets') return repondeurs.facets(url, jeu);
  if (reste === '' || reste === '/') return repondeurs.metadonnees();
  return null;
}
