import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { controlesDuMode } from '../verif-donnees/index.js';
import { cleAttendu, computeExpectedFor, type Attendu } from '../../tools/oracle/expected.js';
import { roundTo, toNum } from '../../tools/oracle/compute.js';
import type { Check, Expect } from '../../tools/oracle/manifest.js';

/**
 * LA RENCONTRE DES DEUX ORACLES (#880) — sans navigateur.
 *
 * `tests/verif-donnees/attendus.json` est produit par la troisième voix
 * (`python3 tools/oracle-py/oracle.py`, stdlib, `Fraction` exacte, arrondi
 * HALF_UP) et versionné. Ici, l'oracle TypeScript recalcule les mêmes
 * attentes depuis les mêmes jeux, et chaque valeur couverte doit tomber au
 * même endroit à six décimales — et, pour un KPI, au MÊME arrondi.
 *
 * Un écart n'est jamais à adoucir : c'est un constat à arbitrer (doc
 * muette ? convention ? défaut de l'un des deux ?). Deux hypothèses de
 * l'issue sont éprouvées ici en passant : l'arrondi des négatifs sur la
 * demi-unité (`Math.round` contre `ROUND_HALF_UP`) par la comparaison des
 * valeurs ARRONDIES, et les sommes de flottants à la limite de tolérance par
 * l'écart maximal mesuré, écrit sur la sortie du test.
 */

const CHEMIN = resolve(__dirname, '../verif-donnees/attendus.json');
const DECIMALES = 6;

interface EntreePython {
  domaine: string;
  controle: string;
  cle: string;
  kind: string;
  couvert: boolean;
  raison?: string;
  valeur?: unknown;
  brut?: number | null;
  decimals?: number;
}

interface Entete {
  source: string;
  conventions: Record<string, unknown>;
  couverture: { total: number; couverts: number; nonCouverts: Record<string, number> };
}

/**
 * Les seules clés de l'en-tête. Le fichier est GARDÉ par
 * `git diff --exit-code` dans `verif-donnees.yml` : y laisser une métadonnée
 * d'environnement (la version de l'interpréteur, un horodatage, un chemin
 * absolu) rend le garde-fou rouge dès que le runner diffère de la machine de
 * l'auteur — ce qui était le cas de `python` (3.11.5 contre 3.12.3), alors que
 * toutes les valeurs étaient égales. La provenance vit à côté, dans
 * `tools/oracle/out/attendus-provenance.json`, hors zone gardée.
 */
const CLES_ENTETE = ['conventions', 'couverture', 'source'];

function lireAttendus(): { entete: Entete; entrees: EntreePython[] } {
  const brut = JSON.parse(readFileSync(CHEMIN, 'utf-8')) as [Entete, ...EntreePython[]];
  const [entete, ...entrees] = brut;
  return { entete, entrees };
}

type Calcul = ReturnType<typeof computeExpectedFor>;

let calculsMemo: Array<{ domaine: string; check: Check; calcule: Calcul }> | null = null;

/**
 * Le recalcul TypeScript de chaque contrôle déterministe, fait UNE fois pour
 * le fichier : les contrôles et leurs jeux sont figés, le résultat aussi.
 *
 * Il était refait à chaque appel, et le test de couverture l'appelait dans un
 * `filter`, une fois par entrée Python : ~500 recalculs complets, 1,6 s seul
 * sur une machine au repos, au-delà des 10 s de `testTimeout` sous la charge
 * de la suite complète (#1119). Un seul recalcul prend quelques ms.
 */
function calculs(): Array<{ domaine: string; check: Check; calcule: Calcul }> {
  if (calculsMemo) return calculsMemo;
  calculsMemo = [];
  for (const { domaine, check } of controlesDuMode('deterministic')) {
    if (check.feed.kind !== 'fixture') continue;
    calculsMemo.push({ domaine, check, calcule: computeExpectedFor(check, check.feed.datasets) });
  }
  return calculsMemo;
}

let attendusMemo: Map<string, { attendu: Attendu; expect: Expect }> | null = null;

/** Les attendus TypeScript, par `domaine/controle/cle`, avec l'attente qui les a produits. */
function attendusTypeScript(): Map<string, { attendu: Attendu; expect: Expect }> {
  if (attendusMemo) return attendusMemo;
  attendusMemo = new Map<string, { attendu: Attendu; expect: Expect }>();
  for (const { domaine, check, calcule } of calculs()) {
    for (const e of check.expects) {
      const cle = cleAttendu(e);
      attendusMemo.set(`${domaine}/${check.id}/${cle}`, {
        attendu: calcule.values[cle],
        expect: e,
      });
    }
  }
  return attendusMemo;
}

const chaine = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/** Un écart numérique, ou null si les deux valeurs sont absentes ensemble ; lève si l'une manque. */
function ecart(python: unknown, ts: unknown, ou: string): number | null {
  const p = toNum(python);
  const t = toNum(ts);
  if (p === null && t === null) return null;
  if (p === null || t === null) {
    throw new Error(
      `${ou} : Python ${p === null ? 'sans valeur' : p}, TypeScript ${t === null ? 'sans valeur' : t}`
    );
  }
  return Math.abs(p - t);
}

describe('vérification des données — la rencontre TS ↔ Python', () => {
  it('le fichier d’attendus existe, vient de la stdlib Python, et couvre au moins 70 % des attentes numériques', () => {
    expect(existsSync(CHEMIN), `${CHEMIN} absent : lancer npm run verif:attendus`).toBe(true);
    const { entete, entrees } = lireAttendus();
    expect(entete.source).toBe('python-stdlib');
    // La zone gardée ne compare que des chiffres : aucune métadonnée d'environnement.
    expect(
      Object.keys(entete).sort(),
      'en-tête d’attendus.json : une clé d’environnement rendrait le garde-fou instable'
    ).toEqual(CLES_ENTETE);
    // Les genres non numériques ne comptent pas dans la base : urls, diagnostic,
    // class, dots, csv ne sont pas des chiffres recalculés.
    const numeriques = entrees.filter(
      (e) => !['urls', 'diagnostic', 'class', 'dots', 'csv'].includes(e.kind)
    );
    const couverts = numeriques.filter((e) => e.couvert).length;
    expect(couverts / numeriques.length).toBeGreaterThanOrEqual(0.7);
    // Et chaque attente non couverte dit pourquoi.
    for (const e of entrees.filter((x) => !x.couvert)) expect(e.raison, e.cle).toBeTruthy();
  });

  it('chaque attente TypeScript d’un genre couvert a son entrée Python — sinon relancer verif:attendus', () => {
    const { entrees } = lireAttendus();
    const python = new Set(entrees.map((e) => `${e.domaine}/${e.controle}/${e.cle}`));
    const manquantes = [...attendusTypeScript().keys()].filter((k) => !python.has(k));
    expect(manquantes, 'attendus.json périmé : npm run verif:attendus').toEqual([]);
    const enTrop = [...python].filter((k) => !attendusTypeScript().has(k));
    expect(enTrop, 'attendus.json porte des contrôles disparus : npm run verif:attendus').toEqual(
      []
    );
  });

  it('chaque valeur couverte tombe au même endroit, à six décimales et au même arrondi', () => {
    const { entrees } = lireAttendus();
    const ts = attendusTypeScript();
    const ecarts: string[] = [];
    let comparaisons = 0;
    let ecartMax = 0;
    let ouMax = '';

    const noter = (ou: string, d: number | null, tolerance = 0.5 / 10 ** DECIMALES + 1e-9) => {
      comparaisons++;
      if (d === null) return;
      if (d > ecartMax) {
        ecartMax = d;
        ouMax = ou;
      }
      if (d > tolerance) ecarts.push(`${ou} : écart ${d}`);
    };

    for (const e of entrees) {
      if (!e.couvert) continue;
      const ou = `${e.domaine}/${e.controle}/${e.cle}`;
      const { attendu, expect: ex } = ts.get(ou)!;
      try {
        switch (attendu.kind) {
          case 'kpi': {
            if (attendu.texte !== undefined) {
              comparaisons++;
              if (chaine(attendu.texte) !== chaine(e.valeur)) {
                ecarts.push(`${ou} : texte TS « ${attendu.texte} », Python « ${e.valeur} »`);
              }
              break;
            }
            noter(ou, ecart(e.brut, attendu.value, ou));
            // L'arrondi : même valeur AFFICHÉE, ou la convention diverge (Math.round
            // contre ROUND_HALF_UP sur une demi-unité négative).
            if (attendu.value !== null) {
              comparaisons++;
              const arrondiTs = roundTo(attendu.value, attendu.decimals);
              if (arrondiTs !== e.valeur) {
                ecarts.push(
                  `${ou} : arrondi TS ${arrondiTs}, Python ${e.valeur} (brut ${attendu.value}) — convention d'arrondi`
                );
              }
            }
            break;
          }
          case 'text': {
            if (attendu.text !== null) {
              comparaisons++;
              if (attendu.text !== e.valeur) {
                ecarts.push(`${ou} : texte TS « ${attendu.text} », Python « ${e.valeur} »`);
              }
              break;
            }
            noter(ou, ecart(e.brut, attendu.value, ou));
            if (attendu.value !== null) {
              comparaisons++;
              const arrondiTs = roundTo(attendu.value, attendu.decimals);
              if (arrondiTs !== e.valeur) {
                ecarts.push(
                  `${ou} : arrondi TS ${arrondiTs}, Python ${e.valeur} — convention d'arrondi`
                );
              }
            }
            break;
          }
          case 'rows': {
            const ex_ = ex as Extract<Expect, { kind: 'rows' }>;
            const cles = Array.isArray(ex_.key) ? ex_.key : [ex_.key];
            const py = e.valeur as Array<Record<string, unknown>>;
            if (py.length !== attendu.rows.length) {
              ecarts.push(`${ou} : ${py.length} lignes Python, ${attendu.rows.length} TS`);
              break;
            }
            attendu.rows.forEach((row, i) => {
              comparaisons++;
              const clePy = cles.map((k) => chaine(py[i][k])).join(' | ');
              const cleTs = cles.map((k) => chaine(row[k])).join(' | ');
              if (clePy !== cleTs) {
                ecarts.push(`${ou} ligne ${i} : clé Python « ${clePy} », TS « ${cleTs} »`);
                return;
              }
              for (const c of ex_.columns)
                noter(`${ou} ligne ${i}/${c}`, ecart(py[i][c], row[c], `${ou} ligne ${i}/${c}`));
            });
            break;
          }
          case 'chart': {
            const py = e.valeur as { labels: string[]; series: Array<Array<number | null>> };
            comparaisons++;
            if (py.labels.join('') !== attendu.labels.join('')) {
              ecarts.push(`${ou} : libellés Python [${py.labels}], TS [${attendu.labels}]`);
              break;
            }
            attendu.series.forEach((serie, s) =>
              serie.forEach((v, i) =>
                noter(
                  `${ou} série ${s} point ${i}`,
                  ecart(py.series[s]?.[i], v, `${ou} série ${s} point ${i}`)
                )
              )
            );
            break;
          }
          case 'list': {
            const ex_ = ex as Extract<Expect, { kind: 'list' }>;
            const py = e.valeur as Array<Record<string, unknown>>;
            if (py.length !== attendu.rows.length) {
              ecarts.push(`${ou} : ${py.length} lignes Python, ${attendu.rows.length} TS`);
              break;
            }
            const decimals = ex_.decimals ?? DECIMALES;
            attendu.rows.forEach((row, i) => {
              for (const col of ex_.columns) {
                const ou2 = `${ou} ligne ${i}/${col.column}`;
                if (col.numeric) {
                  noter(
                    ou2,
                    ecart(py[i][col.column], row[col.column], ou2),
                    0.5 / 10 ** decimals + 1e-9
                  );
                  continue;
                }
                comparaisons++;
                if (chaine(py[i][col.column]) !== chaine(row[col.column])) {
                  ecarts.push(
                    `${ou2} : Python « ${chaine(py[i][col.column])} », TS « ${chaine(row[col.column])} »`
                  );
                }
              }
            });
            break;
          }
          case 'facets': {
            const py = e.valeur as Array<{ value: string; count: number | null }>;
            if (py.length !== attendu.values.length) {
              ecarts.push(`${ou} : ${py.length} valeurs Python, ${attendu.values.length} TS`);
              break;
            }
            attendu.values.forEach((v, i) => {
              comparaisons++;
              if (py[i].value !== v.value) {
                ecarts.push(
                  `${ou} rang ${i} : Python « ${py[i].value} », TS « ${v.value} » (l'ordre compte)`
                );
                return;
              }
              noter(`${ou} rang ${i}`, ecart(py[i].count, v.count, `${ou} rang ${i}`));
            });
            break;
          }
          case 'texts': {
            const py = e.valeur as unknown[];
            if (py.length !== attendu.valeurs.length) {
              ecarts.push(`${ou} : ${py.length} textes Python, ${attendu.valeurs.length} TS`);
              break;
            }
            attendu.valeurs.forEach((v, i) => {
              if (attendu.numeric) {
                noter(`${ou} élément ${i}`, ecart(py[i], v, `${ou} élément ${i}`));
                return;
              }
              comparaisons++;
              if (chaine(py[i]) !== chaine(v)) {
                ecarts.push(`${ou} élément ${i} : Python « ${py[i]} », TS « ${v} »`);
              }
            });
            break;
          }
          case 'count': {
            comparaisons++;
            if (e.valeur !== attendu.value) {
              ecarts.push(`${ou} : ${String(e.valeur)} tracés Python, ${attendu.value} TS`);
            }
            break;
          }
          default:
            ecarts.push(`${ou} : genre ${attendu.kind} couvert par Python mais pas comparé ici`);
        }
      } catch (erreur) {
        ecarts.push(String(erreur instanceof Error ? erreur.message : erreur));
      }
    }

    process.stdout.write(
      `rencontre TS ↔ Python : ${comparaisons} comparaisons, écart maximal ${ecartMax}` +
        (ouMax ? ` (${ouMax})` : '') +
        '\n'
    );
    expect(comparaisons).toBeGreaterThan(1000);
    expect(ecarts).toEqual([]);
  });

  it('les références des invariants (#881) sont les mêmes des deux côtés, et Python les tient sur son propre recalcul', () => {
    const { entrees } = lireAttendus();
    const ecarts: string[] = [];
    let references = 0;
    let tenus = 0;
    let attente = 0;
    const parCle = new Map(entrees.map((x) => [`${x.domaine}/${x.controle}/${x.cle}`, x]));
    for (const { domaine, check, calcule } of calculs()) {
      for (const e of check.expects) {
        const ts = calcule.invariants[cleAttendu(e)];
        if (!ts) continue;
        const ou = `${domaine}/${check.id}/${cleAttendu(e)}`;
        const py = parCle.get(ou) as
          | (EntreePython & {
              invariants?: Array<{
                kind: string;
                field?: string;
                reference?: Record<string, unknown>;
                tenu?: boolean | null;
                attente?: boolean;
              }>;
            })
          | undefined;
        if (!py?.invariants || py.invariants.length !== ts.length) {
          ecarts.push(
            `${ou} : ${ts.length} invariant(s) TS, ${py?.invariants?.length ?? 0} Python — relancer verif:attendus`
          );
          continue;
        }
        ts.forEach((t, i) => {
          const p = py.invariants![i];
          references++;
          if (p.kind !== t.invariant.kind) {
            ecarts.push(`${ou} #${i} : ${t.invariant.kind} TS, ${p.kind} Python`);
            return;
          }
          for (const champ of ['sum', 'count', 'nullCount', 'nonNullCount'] as const) {
            const a = t.reference[champ];
            const b = p.reference?.[champ];
            if (a === undefined && b === undefined) continue;
            const d = ecart(b, a, `${ou}#${t.invariant.kind}/${champ}`);
            if (d !== null && d > 0.5 / 10 ** DECIMALES)
              ecarts.push(`${ou}#${t.invariant.kind}/${champ} : TS ${a}, Python ${b}`);
          }
          if (
            t.reference.nullKeys &&
            JSON.stringify(t.reference.nullKeys) !== JSON.stringify(p.reference?.nullKeys)
          ) {
            ecarts.push(
              `${ou}#${t.invariant.kind}/nullKeys : TS ${t.reference.nullKeys}, Python ${p.reference?.nullKeys}`
            );
          }
          // Python évalue l'invariant sur SON recalcul : un invariant que l'oracle
          // viole lui-même est mal posé — sauf s'il est en attente, où c'est la
          // bibliothèque qui est visée, pas le recalcul.
          if (p.tenu === true) tenus++;
          if (p.attente) attente++;
          else if (p.tenu === false)
            ecarts.push(
              `${ou}#${t.invariant.kind} : l'oracle Python viole l'invariant sur son propre recalcul`
            );
        });
      }
    }
    process.stdout.write(
      `invariants : ${references} références comparées, ${tenus} tenus par Python, ${attente} en attente\n`
    );
    expect(references).toBeGreaterThan(10);
    expect(ecarts).toEqual([]);
  });
});
