/**
 * LE RECOUPEMENT SERVEUR (#883) — la troisième voix du mode VIVANT.
 *
 * Pour tout agrégat qu'une page calcule côté client sur une source
 * Opendatasoft, le portail sait produire le même chiffre :
 * `/exports/json?select=sum(x) as v&group_by=k&where=…`. C'est une
 * implémentation TIERCE — un autre éditeur, un autre langage, les mêmes
 * lignes — et elle ne coûte qu'une requête. Le domaine `delegation` vérifie
 * déjà « mêmes chiffres, serveur ou client », mais contre un FAUX serveur
 * de notre main ; ici, contre le vrai.
 *
 * Trois règles, tenues par ce module et par `tests/oracle/crosscheck.test.ts` :
 *
 * 1. Les clauses s'écrivent À LA MAIN dans le manifeste (`Crosscheck`),
 *    jamais traduites par l'adaptateur — l'oracle n'emprunte rien à la lib,
 *    et les alias sont exactement ce que le banc a payé (PG-014, PG-027).
 * 2. Ce que le serveur ne sait pas dire est REFUSÉ par `validerCrosscheck` :
 *    `count(distinct)` (approximatif dès quelques centaines de valeurs,
 *    PG-026), `total_count` d'une requête agrégée (LIM-002), les fonctions
 *    de date et le fuseau (FP-003, AM-064). Un recoupement posé sur une
 *    jointure, un pivot ou un `compute` n'a pas de sens : le serveur ne
 *    connaît qu'un jeu — d'où la règle sur le `pipeline`.
 * 3. Le quota est lu à chaque réponse (`x-ratelimit-remaining`) ; sous
 *    `SEUIL_QUOTA` requêtes restantes sur un portail, le recoupement s'arrête
 *    pour ce portail et le rapport le dit. `data.sports.gouv.fr` plafonne à
 *    5 000 requêtes par jour et par IP en anonyme.
 *
 * Le verdict à trois chiffres est énoncé ici (`verdictRecoupement`), en
 * toutes lettres : c'est lui que le rapport et `out/banc.md` rendent.
 */
import type { Crosscheck, Expect, RawSource, RawUrlSource, Row } from './manifest.js';
import { closeEnough, roundTo, toNum } from './compute.js';
import { estUrlBrute } from './raw.js';

/** Sous ce nombre de requêtes restantes, un portail n'est plus recoupé dans ce run. */
export const SEUIL_QUOTA = 500;

/** Fragments qu'un `select` de recoupement ne doit jamais porter, et pourquoi. */
export const SELECT_INTERDITS: Array<{ motif: RegExp; raison: string }> = [
  { motif: /count\s*\(\s*distinct/i, raison: 'count(distinct) est approximatif côté ODS (PG-026)' },
  {
    motif: /\btotal_count\b/i,
    raison: 'total_count d’une requête agrégée ne compte pas les groupes (LIM-002)',
  },
  { motif: /\bmeta\b/i, raison: 'meta:total est une métadonnée de la lib, pas un agrégat serveur' },
  {
    motif: /\b(year|month|day|hour|minute|date_format|date_trunc|now|timezone)\s*\(/i,
    raison: 'les fonctions de date et le fuseau divergent entre client et serveur (FP-003, AM-064)',
  },
];

/** Étapes d'un pipeline qu'un serveur sait reproduire : rien qui mette deux jeux en regard. */
const ETAPES_RECOUPABLES = new Set(['filter', 'group-by', 'global', 'order-by', 'limit']);

/**
 * Un recoupement est-il bien posé ? Rend la liste des raisons de le refuser
 * (vide : il est valide). Éprouvé sur tous les manifestes par le test.
 */
export function validerCrosscheck(cc: Crosscheck, expect: Expect): string[] {
  const raisons: string[] = [];
  // Les interdits portent sur ce que le serveur CALCULE (select, group_by).
  // Un `where` à fonction de date filtre l'export brut et l'agrégat de la même
  // façon, côté serveur des deux fois : il ne fait diverger personne.
  for (const { motif, raison } of SELECT_INTERDITS) {
    if (motif.test(cc.select)) raisons.push(raison);
    if (cc.groupBy !== undefined && motif.test(cc.groupBy)) raisons.push(`group_by : ${raison}`);
  }
  // Un KPI qui filtre lui-même (`where` du KPI, filtre entre accolades) doit
  // écrire sa clause : sans elle, le serveur agrégerait tout le jeu.
  if (
    expect.kind === 'kpi' &&
    expect.filter &&
    expect.filter.length > 0 &&
    cc.where === undefined
  ) {
    raisons.push(
      'le KPI filtre ses lignes : le recoupement doit écrire la clause `where` correspondante'
    );
  }
  if (expect.kind !== 'kpi' && expect.kind !== 'rows') {
    raisons.push(`genre ${expect.kind} : seuls kpi et rows se recoupent en v1`);
    return raisons;
  }
  const etapes = (expect.pipeline ?? []).map((s) => s.op);
  const hors = etapes.filter((op) => !ETAPES_RECOUPABLES.has(op));
  if (hors.length > 0) {
    raisons.push(
      `pipeline ${hors.join(', ')} : le serveur ne connaît qu’un jeu — pas de jointure, pivot, compute`
    );
  }
  if (expect.kind === 'kpi') {
    if (expect.agg === 'distinct')
      raisons.push('agrégat distinct : approximatif côté ODS (PG-026)');
    if (!/\bas\s+v\s*$/i.test(cc.select.trim())) {
      raisons.push('un KPI se recoupe par UN agrégat aliasé `v` (`sum(x) as v`)');
    }
    if (cc.groupBy !== undefined)
      raisons.push('un KPI se recoupe sans group_by : un chiffre, une ligne');
  } else {
    if (!cc.groupBy) raisons.push('des lignes se recoupent avec un group_by : il devient la clé');
    for (const col of expect.columns) {
      // eslint-disable-next-line security/detect-non-literal-regexp -- nom de colonne du manifeste versionné
      if (!new RegExp(`\\bas\\s+\`?${col}\`?\\b`, 'i').test(cc.select)) {
        raisons.push(`la colonne « ${col} » n’a pas d’alias dans le select`);
      }
    }
  }
  return raisons;
}

/** L'URL d'export agrégé, clauses écrites à la main. */
export function urlRecoupement(source: RawSource | RawUrlSource, cc: Crosscheck): string {
  let base: string;
  let whereSource: string | undefined;
  if (estUrlBrute(source)) {
    const u = new URL(source.url);
    const m = /^(.*\/api\/explore\/v2\.1\/catalog\/datasets\/[^/]+)\/exports\/json$/.exec(
      u.pathname
    );
    if (m === null) {
      throw new Error(`recoupement : « ${source.url} » n’est pas un export JSON Opendatasoft`);
    }
    base = `${u.origin}${m[1]}/exports/json`;
    whereSource = u.searchParams.get('where') ?? undefined;
  } else {
    base = `${source.baseUrl}/api/explore/v2.1/catalog/datasets/${encodeURIComponent(source.dataset)}/exports/json`;
    whereSource = source.where;
  }
  const url = new URL(base);
  url.searchParams.set('select', cc.select);
  if (cc.groupBy) url.searchParams.set('group_by', cc.groupBy);
  const where = cc.where ?? whereSource;
  if (where) url.searchParams.set('where', where);
  return url.toString();
}

/** Ce qu'un portail a dit de son quota, et ce que ce run lui a demandé. */
export interface EtatPortail {
  /** Dernière valeur lue de `x-ratelimit-remaining`, ou `null` si le portail ne la donne pas. */
  restantes: number | null;
  /** Requêtes de recoupement envoyées à ce portail dans ce run. */
  requetes: number;
  /** Raison de l'arrêt du recoupement sur ce portail, s'il a été coupé. */
  coupe?: string;
}

const PORTAILS = new Map<string, EtatPortail>();
const DEJA_RECOUPE = new Map<string, Promise<Row[]>>();

/** L'état des portails de ce run — pour le rapport. */
export function etatQuota(): Record<string, EtatPortail> {
  return Object.fromEntries([...PORTAILS.entries()].map(([h, e]) => [h, { ...e }]));
}

/** Oublie quota et téléchargements — la fin du processus le fait ; un test en a besoin. */
export function viderRecoupement(): void {
  PORTAILS.clear();
  DEJA_RECOUPE.clear();
}

/** Levée quand le portail est sous le seuil : le recoupement s'arrête, le rapport le dit. */
export class QuotaError extends Error {}

/**
 * Les lignes agrégées PAR LE SERVEUR. Une requête par URL et par run, comme
 * les exports bruts ; le quota est lu sur chaque réponse.
 */
export async function fetchAggregate(
  source: RawSource | RawUrlSource,
  cc: Crosscheck
): Promise<Row[]> {
  const url = urlRecoupement(source, cc);
  const hote = new URL(url).host;
  const etat = PORTAILS.get(hote) ?? { restantes: null, requetes: 0 };
  PORTAILS.set(hote, etat);
  if (etat.coupe) throw new QuotaError(etat.coupe);
  const connu = DEJA_RECOUPE.get(url);
  if (connu !== undefined) return connu;
  const promesse = (async () => {
    etat.requetes++;
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    const brut = res.headers.get('x-ratelimit-remaining');
    if (brut !== null && brut.trim() !== '' && Number.isFinite(Number(brut))) {
      etat.restantes = Number(brut);
      if (etat.restantes < SEUIL_QUOTA) {
        etat.coupe = `quota : ${etat.restantes} requêtes restantes sur ${hote}, sous le seuil de ${SEUIL_QUOTA} — recoupement arrêté pour ce portail`;
      }
    }
    if (!res.ok) throw new Error(`recoupement : HTTP ${res.status} sur ${url}`);
    const body = (await res.json()) as unknown;
    if (!Array.isArray(body)) throw new Error(`recoupement : réponse non tabulaire sur ${url}`);
    return body as Row[];
  })();
  DEJA_RECOUPE.set(url, promesse);
  return promesse;
}

/** Ce que le serveur a dit, sous la forme que la comparaison attend. */
export type AttenduServeur =
  | { kind: 'kpi'; value: number | null; decimals: number }
  | { kind: 'rows'; rows: Row[]; key: string }
  | { kind: 'absent'; raison: string };

/** Traduit les lignes du serveur en attendu, selon le genre de l'attente. */
export function attenduServeur(expect: Expect, lignes: Row[]): AttenduServeur {
  if (expect.kind === 'kpi') {
    const cc = expect.crosscheck!;
    const value = lignes.length === 0 ? null : toNum(lignes[0].v);
    const brute = expect.scale !== undefined && value !== null ? value * expect.scale : value;
    return { kind: 'kpi', value: brute, decimals: cc.decimals ?? expect.decimals ?? 0 };
  }
  if (expect.kind === 'rows') {
    return { kind: 'rows', rows: lignes, key: expect.crosscheck!.groupBy! };
  }
  return { kind: 'absent', raison: `genre ${expect.kind} non recoupé` };
}

/** Une comparaison à deux : sont-ils d'accord, et quel est l'écart le plus parlant ? */
export interface Accord {
  ok: boolean;
  ecart: number | null;
  /** Le chiffre serveur, rendu court. */
  serveur: string;
}

const n6 = (v: number | null | undefined): string =>
  v === null || v === undefined ? '—' : String(Math.round(v * 1e6) / 1e6);

/**
 * Compare une valeur (celle de la page, ou celle de l'oracle) à celle du
 * serveur. Pour un KPI, à la précision affichée ; pour des lignes, PAR CLÉ —
 * le serveur ne rend pas ses groupes dans l'ordre de la page — à six
 * décimales sur chaque colonne comparée.
 */
export function accordAvecServeur(
  expect: Expect,
  serveur: AttenduServeur,
  valeur: { kind: 'kpi'; value: number | null } | { kind: 'rows'; rows: Row[] } | null
): Accord {
  if (serveur.kind === 'absent' || valeur === null) return { ok: false, ecart: null, serveur: '—' };
  if (serveur.kind === 'kpi' && valeur.kind === 'kpi') {
    if (serveur.value === null || valeur.value === null) {
      return { ok: serveur.value === valeur.value, ecart: null, serveur: n6(serveur.value) };
    }
    const arrondi = roundTo(serveur.value, serveur.decimals);
    return {
      ok: closeEnough(valeur.value, arrondi, serveur.decimals),
      ecart: valeur.value - arrondi,
      serveur: n6(arrondi),
    };
  }
  if (serveur.kind === 'rows' && valeur.kind === 'rows' && expect.kind === 'rows') {
    const cles = Array.isArray(expect.key) ? expect.key : [expect.key];
    const cleDe = (r: Row, champs: string[]) => champs.map((k) => String(r[k] ?? '')).join(' | ');
    const parCle = new Map(serveur.rows.map((r) => [cleDe(r, [serveur.key]), r]));
    let ecartMax: number | null = null;
    let ok = valeur.rows.length === serveur.rows.length;
    for (const row of valeur.rows) {
      const s = parCle.get(cleDe(row, cles.slice(0, 1)));
      if (!s) {
        ok = false;
        continue;
      }
      for (const col of expect.columns) {
        const a = toNum(row[col]);
        const b = toNum(s[col]);
        if (a === null && b === null) continue;
        if (a === null || b === null) {
          ok = false;
          continue;
        }
        const d = Math.abs(a - b);
        if (ecartMax === null || d > ecartMax) ecartMax = d;
        if (!closeEnough(a, b, 6)) ok = false;
      }
    }
    return { ok, ecart: ecartMax, serveur: `${serveur.rows.length} lignes serveur` };
  }
  return { ok: false, ecart: null, serveur: '—' };
}

/** Les cinq verdicts à trois chiffres, en toutes lettres. */
export type CodeVerdict =
  'trois-voix' | 'bibliotheque' | 'oracle' | 'recoupement-a-qualifier' | 'rejouer';

export interface Verdict {
  code: CodeVerdict;
  /** La phrase du rapport : qui est d'accord avec qui. */
  texte: string;
  /** Le verdict fait-il tomber le contrôle ? Jamais pour un recoupement à qualifier. */
  echec: boolean;
}

/**
 * | oracle = serveur | lib = oracle | lib = serveur | Verdict |
 * |---|---|---|---|
 * | oui | oui | (oui) | juste, trois voix |
 * | oui | non | non | **bibliothèque** |
 * | non | oui | non | recoupement à qualifier — sémantique ODS, jamais un échec de la lib |
 * | non | non | oui | **oracle** — c'est le recalcul qui se trompe seul |
 * | non | non | non | donnée en mouvement ou clause fausse : rejouer |
 */
export function verdictRecoupement(
  oracleServeur: boolean,
  libOracle: boolean,
  libServeur: boolean
): Verdict {
  if (oracleServeur && libOracle) {
    return {
      code: 'trois-voix',
      texte: 'oracle = serveur, lib = oracle : trois voix',
      echec: false,
    };
  }
  if (oracleServeur) {
    return {
      code: 'bibliotheque',
      texte: 'oracle = serveur, lib ≠ oracle : bibliothèque',
      echec: true,
    };
  }
  if (libOracle) {
    return {
      code: 'recoupement-a-qualifier',
      texte:
        'oracle ≠ serveur, lib = oracle : recoupement à qualifier (sémantique ODS : null, fuseau, arrondi)',
      echec: false,
    };
  }
  if (libServeur) {
    return {
      code: 'oracle',
      texte: 'oracle ≠ serveur, lib = serveur : le recalcul se trompe seul',
      echec: true,
    };
  }
  return {
    code: 'rejouer',
    texte:
      'oracle ≠ serveur, lib ≠ oracle, lib ≠ serveur : donnée en mouvement ou clause fausse — rejouer',
    echec: true,
  };
}
