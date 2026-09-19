/**
 * Ce que l'oracle ATTEND, calculé depuis les lignes brutes d'un contrôle.
 *
 * Un seul chemin pour les deux alimentations : en mode déterministe les lignes
 * viennent des fixtures (les mêmes que celles servies à la page), en mode
 * vivant elles viennent d'être retéléchargées. L'attendu a donc exactement la
 * même forme des deux côtés, et le spec Playwright n'a qu'une comparaison à
 * écrire.
 */
import type { CouleurKpi, Check, Expect, Row } from './manifest.js';
import { JEU_PRINCIPAL } from './manifest.js';
import {
  aggregate,
  aggregateText,
  applyFilter,
  isoToFrDate,
  legendClasses,
  runPipeline,
  toNum,
} from './compute.js';
import { referenceInvariant, type AttenduInvariant } from './invariants.js';
import type { AttenduServeur, EtatPortail } from './crosscheck.js';
import type { Empreinte } from './fraicheur.js';

export interface AttenduKpi {
  kind: 'kpi';
  value: number | null;
  decimals: number;
  /** Texte attendu quand la valeur n'est pas un nombre (date, #667). */
  texte?: string | null;
  /** Motif de forme que le texte affiché doit vérifier. */
  pattern?: string;
}

export interface AttenduLignes {
  kind: 'rows';
  rows: Row[];
}

export interface AttenduGraphique {
  kind: 'chart';
  labels: string[];
  series: Array<Array<number | null>>;
}

export interface AttenduListe {
  kind: 'list';
  rows: Row[];
}

export interface AttenduLegende {
  kind: 'legend';
  classes: Array<{ from: number | null; to: number | null }>;
}

export interface AttenduTextes {
  kind: 'texts';
  /** Une valeur attendue par élément, dans l'ordre du DOM. */
  valeurs: Array<string | number | null>;
  numeric: boolean;
  decimals: number;
  pattern?: string;
}

export interface AttenduClasse {
  kind: 'class';
  /** Classe que la valeur recalculée impose. */
  classe: string;
  /** Classes concurrentes : aucune ne doit être présente. */
  concurrentes: string[];
  /** La valeur qui a décidé, pour le rapport. */
  valeur: number | null;
}

export interface AttenduFacettes {
  kind: 'facets';
  /** Valeurs et compteurs attendus, dans l'ordre d'affichage. */
  values: Array<{ value: string; count: number | null }>;
}

export interface AttenduAttr {
  kind: 'attr';
  literal: string | null;
  value: number | null;
  decimals: number;
}

/**
 * Le seul attendu qui ne se CALCULE pas depuis les lignes : la présence d'un
 * fragment dans les URL appelées est énoncée par le contrôle lui-même. Il est
 * recopié ici pour que le mode vivant, qui relit `expected.json`, dispose de la
 * même information que le mode déterministe.
 */
export interface AttenduUrls {
  kind: 'urls';
  among?: string;
  contains: string;
  verdict: 'none' | 'some' | 'all' | 'last' | 'notLast';
}

/**
 * Ce que la bibliothèque doit avoir DIT (ou tu) — énoncé par le contrôle,
 * comme les URL, jamais recalculé (#878).
 */
export interface AttenduDiagnostic {
  kind: 'diagnostic';
  expect: 'config-error' | 'warning' | 'silence';
  contains?: string;
}

export interface AttenduTexte {
  kind: 'text';
  /** Texte attendu (comparaison textuelle), ou `null` si la comparaison est numérique. */
  text: string | null;
  /** Nombre attendu (comparaison numérique), ou `null` si elle est textuelle. */
  value: number | null;
  decimals: number;
}

export interface AttenduCsv {
  kind: 'csv';
  /** En-tête puis lignes, cellules en chaînes. */
  lignes: string[][];
}

export interface AttenduPastilles {
  kind: 'dots';
  /** Couleur attendue par pastille (`null` : la palette garde la main). */
  couleurs: Array<string | null>;
}

export type Attendu =
  | AttenduKpi
  | AttenduLignes
  | AttenduGraphique
  | AttenduListe
  | AttenduLegende
  | AttenduTextes
  | AttenduClasse
  | AttenduAttr
  | AttenduCsv
  | AttenduPastilles
  | AttenduFacettes
  | AttenduTexte
  | AttenduUrls
  | AttenduDiagnostic;

/**
 * Couleur d'un KPI d'après ses seuils, énoncée en toutes lettres plutôt
 * qu'empruntée à la lib : au-dessus du seuil vert c'est vert, au-dessus du
 * seuil orange c'est orange, en dessous d'un seuil posé c'est rouge, et sans
 * aucun seuil c'est le bleu neutre.
 */
function couleurParSeuils(
  valeur: number | null,
  seuils: { green?: number; orange?: number } | undefined
): CouleurKpi {
  if (valeur === null) return 'bleu';
  if (seuils?.green !== undefined && valeur >= seuils.green) return 'vert';
  if (seuils?.orange !== undefined && valeur >= seuils.orange) return 'orange';
  if (seuils?.green !== undefined || seuils?.orange !== undefined) return 'rouge';
  return 'bleu';
}

/** Valeur scalaire d'un recalcul mené à une seule ligne (`global`). */
function scalaire(
  rows: Row[],
  column: string | undefined,
  scale: number | undefined
): number | null {
  if (!column || rows.length === 0) return null;
  const v = toNum(rows[0][column]);
  return v === null ? null : v * (scale ?? 1);
}

/**
 * Clé d'un attendu dans le rapport : le genre et l'id observé — plus ce qui
 * distingue DEUX observations du même genre sur le MÊME composant. Une page à
 * deux facettes n'a qu'un `dsfr-data-facets` ; un graphique porte quatre
 * bornes d'axes ; un podium montre des libellés ET des valeurs. Sans ce
 * suffixe, la seconde attente écrase la première et le contrôle compare une
 * observation à l'attendu d'une autre.
 */
export function cleAttendu(e: Expect): string {
  const base = `${e.kind}:${e.id}`;
  if (e.kind === 'facets') return `${base}:${e.group}`;
  if (e.kind === 'attr') return `${base}:${e.attr}`;
  if (e.kind === 'text' && e.selector) return `${base}:${e.selector}`;
  if (e.kind === 'texts' || e.kind === 'class') return `${base}:${e.selector}`;
  // Un même élément peut être interrogé sur deux verdicts (un marqueur ET un
  // silence sur un autre fragment) : le verdict fait partie de la clé.
  if (e.kind === 'diagnostic') return `${base}:${e.expect}`;
  return base;
}

export interface ExpectedCheck {
  id: string;
  mode: Check['mode'];
  /** Nombre de lignes brutes du jeu principal, pour le rapport. */
  rawRows: number;
  /** Instant du calcul — en mode vivant, il doit coller au rendu. */
  fetchedAt: string;
  values: Record<string, Attendu>;
  /**
   * Les RÉFÉRENCES des invariants (#881), par clé d'attente : ce que les
   * lignes brutes disent (somme, compte, absents) — quelques nombres, jamais
   * les lignes elles-mêmes, pour que le mode vivant les emporte dans
   * `expected.json` sans le faire enfler.
   */
  invariants: Record<string, AttenduInvariant[]>;
  /**
   * Le RECOUPEMENT SERVEUR (#883), mode vivant seulement : ce que le portail
   * a répondu à la clause écrite à la main, par clé d'attente — la troisième
   * valeur à côté de `values` (oracle). Absent en déterministe.
   */
  serveur?: Record<string, AttenduServeur>;
  /** L'état des portails recoupés dans ce run : quota lu, requêtes, coupure. */
  recoupement?: Record<string, EtatPortail>;
  /**
   * L'EMPREINTE du jeu principal au calcul de l'attendu (#884), mode vivant :
   * nombre de lignes, SHA-256 de leur forme JSON, et `data_processed` du
   * portail. C'est ce que le spec relit après l'observation pour trancher
   * « bibliothèque » ou « donnée ».
   */
  fingerprint?: Empreinte;
}

/** Calcule l'attendu d'un contrôle à partir de ses jeux de lignes brutes. */
export function computeExpectedFor(check: Check, datasets: Record<string, Row[]>): ExpectedCheck {
  const values: Record<string, Attendu> = {};
  const invariants: Record<string, AttenduInvariant[]> = {};
  for (const e of check.expects) {
    if ('invariants' in e && e.invariants && e.invariants.length > 0) {
      invariants[cleAttendu(e)] = e.invariants.map((inv) => referenceInvariant(inv, datasets));
    }
    // Les URL appelées ne se recalculent pas depuis les lignes : le contrôle
    // énonce lui-même ce que la page doit avoir demandé.
    if (e.kind === 'urls') {
      values[cleAttendu(e)] = {
        kind: 'urls',
        contains: e.contains,
        verdict: e.verdict,
        ...(e.among ? { among: e.among } : {}),
      };
      continue;
    }
    // Un silence ou un message ne se recalcule pas non plus : le contrôle
    // énonce ce que la bibliothèque doit avoir dit (#878).
    if (e.kind === 'diagnostic') {
      values[cleAttendu(e)] = {
        kind: 'diagnostic',
        expect: e.expect,
        ...(e.contains ? { contains: e.contains } : {}),
      };
      continue;
    }
    const from = e.from ?? JEU_PRINCIPAL;
    const rows = e.pipeline ? runPipeline(datasets, e.pipeline, from) : (datasets[from] ?? []);
    switch (e.kind) {
      case 'kpi': {
        const filtrees = applyFilter(rows, e.filter);
        if (e.as === 'date') {
          const brute = aggregateText(filtrees, e.agg, e.field ?? '');
          values[cleAttendu(e)] = {
            kind: 'kpi',
            value: null,
            decimals: 0,
            texte: brute === null ? null : isoToFrDate(brute),
            pattern: e.pattern,
          };
          break;
        }
        const brute = aggregate(filtrees, e.agg, e.field, e.weight);
        values[cleAttendu(e)] = {
          kind: 'kpi',
          value: brute === null ? null : brute * (e.scale ?? 1),
          decimals: e.decimals ?? 0,
          pattern: e.pattern,
        };
        break;
      }
      case 'rows':
        values[cleAttendu(e)] = { kind: 'rows', rows };
        break;
      case 'chart':
        values[cleAttendu(e)] = {
          kind: 'chart',
          labels: rows.map((r) => String(r[e.labelColumn] ?? '')),
          series: e.valueColumns.map((col) => rows.map((r) => toNum(r[col]))),
        };
        break;
      case 'list':
        values[cleAttendu(e)] = { kind: 'list', rows };
        break;
      case 'legend': {
        const valeurs = rows.map((r) => toNum(r[e.field])).filter((n): n is number => n !== null);
        values[cleAttendu(e)] = {
          kind: 'legend',
          classes: legendClasses(valeurs, e.classes, e.method, e.breaks),
        };
        break;
      }
      case 'texts': {
        const facteur = e.scale ?? 1;
        values[cleAttendu(e)] = {
          kind: 'texts',
          valeurs: rows.map((r) => {
            const brute = r[e.column];
            if (!e.numeric) return brute === null || brute === undefined ? '' : String(brute);
            const n = toNum(brute);
            return n === null ? null : n * facteur;
          }),
          numeric: e.numeric === true,
          decimals: e.decimals ?? 0,
          pattern: e.pattern,
        };
        break;
      }
      case 'class': {
        const valeur = e.forced ? null : scalaire(rows, e.column, e.scale);
        const couleur: CouleurKpi = e.forced ?? couleurParSeuils(valeur, e.thresholds);
        values[cleAttendu(e)] = {
          kind: 'class',
          classe: e.classes[couleur],
          concurrentes: (Object.keys(e.classes) as CouleurKpi[])
            .filter((c) => c !== couleur)
            .map((c) => e.classes[c]),
          valeur,
        };
        break;
      }
      case 'attr':
        values[cleAttendu(e)] = {
          kind: 'attr',
          literal: e.literal ?? null,
          value: e.literal !== undefined ? null : scalaire(rows, e.column, e.scale),
          decimals: e.decimals ?? 0,
        };
        break;
      case 'csv':
        values[cleAttendu(e)] = {
          kind: 'csv',
          lignes: [
            e.columns.map((c) => c.label),
            ...rows.map((r) =>
              e.columns.map((c) => {
                const v = r[c.column];
                return v === null || v === undefined ? '' : String(v);
              })
            ),
          ],
        };
        break;
      case 'dots':
        values[cleAttendu(e)] = {
          kind: 'dots',
          couleurs: rows.map((r) => e.colorMap[String(r[e.labelColumn] ?? '')] ?? null),
        };
        break;
      case 'facets':
        values[cleAttendu(e)] = {
          kind: 'facets',
          values: rows.map((r) => ({
            value: String(r[e.valueColumn] ?? ''),
            count: toNum(r[e.countColumn]),
          })),
        };
        break;
      case 'text': {
        // Le manifeste ne fournit que l'habillage fixe : le chiffre ou le
        // libellé viennent du recalcul, jamais d'un littéral.
        if (e.numeric) {
          const valeur = e.agg
            ? aggregate(rows, e.agg, e.field)
            : toNum(rows[e.row ?? 0]?.[e.column ?? '']);
          values[cleAttendu(e)] = {
            kind: 'text',
            text: null,
            value: valeur,
            decimals: e.decimals ?? 0,
          };
          break;
        }
        const brut = e.column === undefined ? undefined : rows[e.row ?? 0]?.[e.column];
        const milieu = brut === undefined || brut === null ? '' : String(brut);
        values[cleAttendu(e)] = {
          kind: 'text',
          text: `${e.prefix ?? ''}${milieu}${e.suffix ?? ''}`,
          value: null,
          decimals: 0,
        };
        break;
      }
    }
  }
  return {
    id: check.id,
    mode: check.mode,
    rawRows: (datasets[JEU_PRINCIPAL] ?? []).length,
    fetchedAt: new Date().toISOString(),
    values,
    invariants,
  };
}
