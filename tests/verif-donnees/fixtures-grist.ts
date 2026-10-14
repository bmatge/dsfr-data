/**
 * Le FAUX GRIST de la vérification des données (#1279).
 *
 * Il se comporte comme le vrai, mesuré le 2026-10-13 sur
 * grist.numerique.gouv.fr (document public `pU5HXX7VJC6jdgU6oBJRxn`, table
 * `Scrutin_c1`, 101 lignes) et relu dans le source de grist-core
 * (`app/server/lib/DocApiUtils.ts`) — défauts compris, car c'est sur eux que
 * la bibliothèque se trompait :
 *
 * - `GET …/tables/T/records` ne lit que `filter`, `sort` et `limit`.
 *   **`offset` est IGNORÉ, sans erreur** : `limit=5&offset=5` rend les ids 1 à
 *   5, comme `limit=5`. Le tri se fait sur toute la table, en mémoire, par un
 *   tri stable : les ex-æquo gardent l'ordre des `id`. `sort` accepte `id`
 *   (`sort=-id&limit=3` → 101, 100, 99) ; une colonne inconnue rend
 *   `{"error":"unknown key zzz"}`.
 * - `GET …/sql?q=…` et `POST …/sql` rendent
 *   `{ statement, records: [{ fields: {…} }] }` — la même enveloppe que
 *   `/records`, sans `id` de premier niveau, SANS tableau `columns`.
 *   `SELECT *` rend `id` et `manualSort` avant les colonnes de la table.
 * - `/sql` honore `LIMIT` / `OFFSET`. SQLite ne promet rien de l'ordre des
 *   lignes que l'`ORDER BY` ne départage pas, et rien du tout sans
 *   `ORDER BY`. Le faux serveur rend cette absence de garantie VISIBLE, comme
 *   les faux Opendatasoft et Tabular de #1274 : sur une page de rang impair
 *   (la deuxième, la quatrième…), les lignes que le tri ne départage pas
 *   sortent dans l'ordre inverse. Avec un ordre total, toutes les pages sont
 *   justes ; sans lui, la page deux est fausse. L'adoucir rendrait verts des
 *   contrôles qui ne gardent plus rien.
 *
 * Le SQL lu est celui que l'adaptateur écrit, et rien de plus : une requête
 * qui sort de cette grammaire n'est pas servie (`null`), et le spec la compte
 * comme une requête sortie du faux réseau.
 *
 * CE MODULE NE SAIT RIEN DE LA BIBLIOTHÈQUE ni de Playwright (test-garde
 * `tests/oracle/guard.test.ts`) : une URL ou un corps, une réponse.
 */
import type { Row } from '../../tools/oracle/manifest.js';
import { likeSql } from '../builder-e2e/sql-like.js';

/** Une ligne de table Grist : son identifiant, et ses colonnes. */
export interface LigneGrist {
  id: number;
  fields: Row;
}

/** Une table Grist depuis des lignes plates : `id` = rang de la ligne, à partir de 1. */
export function tableGrist(lignes: Row[]): LigneGrist[] {
  return lignes.map((fields, i) => ({ id: i + 1, fields }));
}

type Valeur = string | number | boolean | null | undefined;
type Cle = { champ: string; sens: 1 | -1 };

/** Comparaison à la SQLite : absents d'abord, nombres avant textes, textes par code. */
function comparer(a: Valeur, b: Valeur): number {
  const rang = (v: Valeur) => (v === null || v === undefined ? 0 : typeof v === 'number' ? 1 : 2);
  if (rang(a) !== rang(b)) return rang(a) - rang(b);
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const x = String(a ?? '');
  const y = String(b ?? '');
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Tri STABLE sur les clés données. `retourne` : les ex-æquo sortent à l'envers. */
function trier(lignes: Row[], cles: Cle[], retourne = false): Row[] {
  const base = retourne ? [...lignes].reverse() : [...lignes];
  return base.sort((x, y) => {
    for (const { champ, sens } of cles) {
      const c = comparer(x[champ] as Valeur, y[champ] as Valeur);
      if (c !== 0) return c * sens;
    }
    return 0;
  });
}

/** Une ligne à plat, `id` compris — ce sur quoi trient `/records` et `/sql`. */
function aPlat(table: LigneGrist[]): Row[] {
  return table.map(({ id, fields }) => ({ id, manualSort: id, ...fields }));
}

// ---------------------------------------------------------------------------
// GET /records
// ---------------------------------------------------------------------------

/** `GET {doc}/tables/{table}/records` : `filter`, `sort`, `limit` — `offset` ignoré. */
export function repondreGristRecords(url: URL, table: LigneGrist[]): Record<string, unknown> {
  let lignes = aPlat(table);

  const filtre = url.searchParams.get('filter');
  if (filtre) {
    const clauses = JSON.parse(filtre) as Record<string, unknown[]>;
    for (const [champ, valeurs] of Object.entries(clauses)) {
      const textes = valeurs.map(String);
      lignes = lignes.filter((l) => textes.includes(String(l[champ])));
    }
  }

  const sort = url.searchParams.get('sort');
  if (sort) {
    const cles: Cle[] = sort.split(',').map((cle) => ({
      champ: cle.replace(/^-/, ''),
      sens: cle.startsWith('-') ? -1 : 1,
    }));
    for (const { champ } of cles) {
      if (lignes.length > 0 && !(champ in lignes[0])) return { error: `unknown key ${champ}` };
    }
    lignes = trier(lignes, cles);
  }

  const limit = Number(url.searchParams.get('limit') || 0);
  if (limit > 0) lignes = lignes.slice(0, limit);

  return {
    records: lignes.map(({ id, manualSort: _manualSort, ...fields }) => ({ id, fields })),
  };
}

// ---------------------------------------------------------------------------
// /sql
// ---------------------------------------------------------------------------

const IDENT = '"((?:[^"]|"")+)"';
const nu = (ident: string): string => ident.replace(/""/g, '"');

/** Une colonne du `SELECT` : colonne nue, ou agrégat avec son alias. */
type Colonne =
  | { sorte: 'colonne'; champ: string }
  | { sorte: 'agregat'; fn: string; champ: string | null; distinct: boolean; alias: string };

function lireSelect(select: string): Colonne[] | null {
  const colonnes: Colonne[] = [];
  for (const part of select.split(/,\s*(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
    const col = new RegExp(`^${IDENT}$`).exec(part);
    if (col) {
      colonnes.push({ sorte: 'colonne', champ: nu(col[1]) });
      continue;
    }
    const compte = /^COUNT\(\*\) as (\w+)$/.exec(part);
    if (compte) {
      colonnes.push({
        sorte: 'agregat',
        fn: 'COUNT',
        champ: null,
        distinct: false,
        alias: compte[1],
      });
      continue;
    }
    const agg = new RegExp(`^(SUM|AVG|COUNT|MIN|MAX)\\((DISTINCT )?${IDENT}\\) as ${IDENT}$`).exec(
      part
    );
    if (!agg) return null;
    colonnes.push({
      sorte: 'agregat',
      fn: agg[1],
      champ: nu(agg[3]),
      distinct: !!agg[2],
      alias: nu(agg[4]),
    });
  }
  return colonnes;
}

function agreger(col: Extract<Colonne, { sorte: 'agregat' }>, lignes: Row[]): Valeur {
  if (col.champ === null) return lignes.length;
  const valeurs = lignes
    .map((l) => l[col.champ as string] as Valeur)
    .filter((v) => v !== null && v !== undefined);
  if (col.fn === 'COUNT') return col.distinct ? new Set(valeurs).size : valeurs.length;
  const nombres = valeurs.filter((v): v is number => typeof v === 'number');
  if (nombres.length === 0) return null;
  const somme = nombres.reduce((s, v) => s + v, 0);
  if (col.fn === 'SUM') return somme;
  if (col.fn === 'AVG') return somme / nombres.length;
  return nombres.reduce((m, v) => (col.fn === 'MIN' ? (v < m ? v : m) : v > m ? v : m));
}

/**
 * Le `LIKE` de SQLite, tel que Grist le sert (mesuré les 2026-10-13 et 14 sur
 * grist.numerique.gouv.fr, ADR-159) : `%` vaut toute suite de caractères, `_`
 * un caractère ; la casse n'est ignorée que pour les lettres ASCII (`É` n'est
 * pas `é`) et les accents sont respectés. `\` n'échappe un joker qu'avec une
 * clause `ESCAPE '\'` — sans elle, c'est un caractère comme un autre
 * (`'%Co\_se%'` -> 0, `'%Co_se%'` -> 2). La bibliothèque l'écrit depuis le
 * lot 2 de l'ADR-159.
 */
function likeSqlite(valeur: unknown, motif: string, echappement: string | null): boolean | null {
  return likeSql(valeur, motif, { casse: 'ascii', echappement });
}

type Predicat = (l: Row) => boolean;

/** Découpe `texte` sur `separateur` HORS parenthèses. */
function decouperHorsParentheses(texte: string, separateur: string): string[] {
  const morceaux: string[] = [];
  let profondeur = 0;
  let debut = 0;
  for (let i = 0; i < texte.length; i++) {
    if (texte[i] === '(') profondeur++;
    else if (texte[i] === ')') profondeur--;
    else if (profondeur === 0 && texte.startsWith(separateur, i)) {
      morceaux.push(texte.slice(debut, i));
      debut = i + separateur.length;
      i += separateur.length - 1;
    }
  }
  morceaux.push(texte.slice(debut));
  return morceaux;
}

/** `(…)` qui entoure TOUT le texte (et non `(a) OR (b)`). */
function entreParentheses(texte: string): boolean {
  if (!texte.startsWith('(') || !texte.endsWith(')')) return false;
  let profondeur = 0;
  for (let i = 0; i < texte.length; i++) {
    if (texte[i] === '(') profondeur++;
    else if (texte[i] === ')' && --profondeur === 0 && i < texte.length - 1) return false;
  }
  return true;
}

/**
 * Une clause SQL lue en prédicat, les `?` consommés DANS L'ORDRE du texte
 * (`curseur`), comme SQLite les lie. `null` hors de la grammaire.
 *
 * VALEURS ABSENTES (#1312) : logique SQL à TROIS valeurs, comme SQLite — une
 * valeur absente ne vérifie ni `=` ni `!=`, ni `IN` ni `NOT IN`, ni `LIKE` ni
 * `NOT LIKE`, ni une comparaison d'ordre ; seuls `IS NULL` / `IS NOT NULL` la
 * nomment. Mesuré le 2026-10-14 sur grist.numerique.gouv.fr (101 lignes, une
 * colonne dérivée nulle sur 12 et vide sur 13) : `c != 'zzz'` → 89,
 * `c NOT IN ('zzz')` → 89, `c NOT LIKE '%zzz%'` → 89, `n > 0` → 89 ;
 * `(c IS NULL OR c NOT IN ('zzz'))` → 101. Le faux Grist gardait les absents
 * sous `!=` et `NOT IN`, et les rangeait avant tout nombre sous `<` : il aurait
 * fait passer pour juste une négation qui ne l'était pas.
 */
function predicat(clause: string, args: unknown[], curseur: { rang: number }): Predicat | null {
  const texte = clause.trim();
  if (entreParentheses(texte)) return predicat(texte.slice(1, -1), args, curseur);
  const ou = decouperHorsParentheses(texte, ' OR ');
  if (ou.length > 1) {
    const membres = ou.map((m) => predicat(m, args, curseur));
    if (membres.some((m) => m === null)) return null;
    return (l) => membres.some((m) => (m as Predicat)(l));
  }
  const absent = (v: unknown) => v === null || v === undefined;
  const nul = new RegExp(`^${IDENT} IS (NOT )?NULL$`).exec(texte);
  if (nul) {
    const champ = nu(nul[1]);
    return (l) => absent(l[champ]) === !nul[2];
  }
  const liste = new RegExp(`^${IDENT} (NOT )?IN \\(([?,]+)\\)$`).exec(texte);
  if (liste) {
    const champ = nu(liste[1]);
    const n = liste[3].split(',').length;
    const valeurs = args.slice(curseur.rang, curseur.rang + n).map(String);
    curseur.rang += n;
    return (l) => !absent(l[champ]) && valeurs.includes(String(l[champ])) === !liste[2];
  }
  const semblable = new RegExp(`^${IDENT} (NOT )?LIKE \\?(?: ESCAPE '(.)')?$`).exec(texte);
  if (semblable) {
    const champ = nu(semblable[1]);
    const motif = String(args[curseur.rang++]);
    const echappement = semblable[3] ?? null;
    return (l) => {
      const lu = likeSqlite(l[champ], motif, echappement);
      return lu !== null && lu === !semblable[2];
    };
  }
  const m = new RegExp(`^${IDENT} (=|!=|>=|<=|>|<) \\?$`).exec(texte);
  if (!m) return null;
  const champ = nu(m[1]);
  const valeur = args[curseur.rang++] as Valeur;
  return (l) => {
    if (absent(l[champ])) return false;
    const c = comparer(l[champ] as Valeur, valeur);
    // Égalité à la SQLite d'une colonne sans type : `'3'` vaut `3`
    const egal = String(l[champ]) === String(valeur);
    switch (m[2]) {
      case '=':
        return egal;
      case '!=':
        return !egal;
      case '>':
        return c > 0;
      case '>=':
        return c >= 0;
      case '<':
        return c < 0;
      default:
        return c <= 0;
    }
  };
}

/** `WHERE` : des clauses reliées par `AND`, chacune éventuellement un `(… OR …)`. */
function filtrer(where: string, args: unknown[], lignes: Row[]): Row[] | null {
  const curseur = { rang: 0 };
  const predicats: Predicat[] = [];
  for (const clause of decouperHorsParentheses(where, ' AND ')) {
    const p = predicat(clause, args, curseur);
    if (!p) return null;
    predicats.push(p);
  }
  return lignes.filter((l) => predicats.every((p) => p(l)));
}

/**
 * `/sql` : `{ sql, args }` (corps du POST, ou `q` du GET) contre les tables du
 * document. `null` quand la requête sort de la grammaire que l'adaptateur écrit.
 */
export function repondreGristSql(
  requete: { sql: string; args?: unknown[] },
  tables: Record<string, LigneGrist[]>
): Record<string, unknown> | null {
  const sql = requete.sql.trim();
  // La sonde de disponibilité de l'adaptateur
  if (/^SELECT 1$/i.test(sql)) return { statement: sql, records: [{ fields: { '1': 1 } }] };

  const m = new RegExp(
    `^SELECT (.+?) FROM ${IDENT}(?: WHERE (.+?))?(?: GROUP BY (.+?))?(?: ORDER BY (.+?))?` +
      `(?: LIMIT (\\d+))?(?: OFFSET (\\d+))?$`
  ).exec(sql);
  if (!m) return null;
  const [, select, nomTable, where, groupBy, orderBy, limit, offset] = m;
  const table = tables[nu(nomTable)];
  if (!table) return null;

  let lignes: Row[] | null = aPlat(table);
  if (where) lignes = filtrer(where, requete.args ?? [], lignes);
  if (lignes === null) return null;

  if (select !== '*') {
    const colonnes = lireSelect(select);
    if (!colonnes) return null;
    if (groupBy || colonnes.some((c) => c.sorte === 'agregat')) {
      const cles = groupBy
        ? groupBy.split(', ').map((c) => nu(new RegExp(`^${IDENT}$`).exec(c)?.[1] ?? ''))
        : [];
      if (cles.includes('')) return null;
      const groupes = new Map<string, Row[]>();
      for (const l of lignes) {
        const k = JSON.stringify(cles.map((c) => l[c]));
        groupes.set(k, [...(groupes.get(k) ?? []), l]);
      }
      if (cles.length === 0 && groupes.size === 0) groupes.set('[]', []);
      lignes = [...groupes.values()].map((membres) => {
        const ligne: Row = {};
        for (const col of colonnes) {
          if (col.sorte === 'colonne') ligne[col.champ] = membres[0]?.[col.champ] ?? null;
          else ligne[col.alias] = agreger(col, membres);
        }
        return ligne;
      });
    } else {
      lignes = lignes.map((l) =>
        Object.fromEntries(
          colonnes.map((c) => [(c as { champ: string }).champ, l[(c as { champ: string }).champ]])
        )
      );
    }
  }

  const n = Number(limit || 0);
  const debut = Number(offset || 0);
  // L'absence de garantie rendue visible : sur une page de rang impair, ce
  // que l'ORDER BY ne départage pas sort à l'envers (voir l'en-tête)
  const retourne = n > 0 && Math.floor(debut / n) % 2 === 1;
  if (orderBy) {
    const cles: Cle[] = [];
    for (const part of orderBy.split(', ')) {
      const o = new RegExp(`^(?:${IDENT}|(\\w+)) (ASC|DESC)$`).exec(part);
      if (!o) return null;
      cles.push({ champ: o[1] ? nu(o[1]) : o[2], sens: o[3] === 'DESC' ? -1 : 1 });
    }
    lignes = trier(lignes, cles, retourne);
  } else if (retourne) {
    lignes = [...lignes].reverse();
  }
  if (n > 0) lignes = lignes.slice(debut, debut + n);
  else if (debut > 0) lignes = lignes.slice(debut);

  return { statement: sql, records: lignes.map((fields) => ({ fields })) };
}

/**
 * Le document entier : `…/api/docs/{doc}/tables/{table}/records` et
 * `…/api/docs/{doc}/sql`. `corps` : le corps d'un POST, quand il y en a un.
 * `null` : cette URL n'est pas de ce document, ou la requête n'est pas prévue.
 */
export function repondreGristDocument(
  url: URL,
  corps: string | null | undefined,
  racine: string,
  tables: Record<string, LigneGrist[]>
): Record<string, unknown> | null {
  if (!url.href.startsWith(`${racine}/`)) return null;
  const chemin = url.href.slice(racine.length).split('?', 1)[0];
  if (chemin === '/sql') {
    if (corps) {
      try {
        return repondreGristSql(JSON.parse(corps) as { sql: string; args?: unknown[] }, tables);
      } catch {
        return null;
      }
    }
    const q = url.searchParams.get('q');
    return q ? repondreGristSql({ sql: q }, tables) : null;
  }
  const records = /^\/tables\/([^/]+)\/records$/.exec(chemin);
  if (!records) return null;
  const table = tables[decodeURIComponent(records[1])];
  return table ? repondreGristRecords(url, table) : null;
}
