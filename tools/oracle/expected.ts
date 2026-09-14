/**
 * Ce que l'oracle ATTEND, calculé depuis les lignes brutes d'un contrôle.
 *
 * Un seul chemin pour les deux alimentations : en mode déterministe les lignes
 * viennent des fixtures (les mêmes que celles servies à la page), en mode
 * vivant elles viennent d'être retéléchargées. L'attendu a donc exactement la
 * même forme des deux côtés, et le spec Playwright n'a qu'une comparaison à
 * écrire.
 */
import type { Check, Expect, Row } from './manifest.js';
import { JEU_PRINCIPAL } from './manifest.js';
import { aggregate, applyFilter, legendClasses, runPipeline, toNum } from './compute.js';

export interface AttenduKpi {
  kind: 'kpi';
  value: number | null;
  decimals: number;
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

export type Attendu =
  AttenduKpi | AttenduLignes | AttenduGraphique | AttenduListe | AttenduLegende | AttenduUrls;

/** Clé d'un attendu dans le rapport : le genre et l'id observé. */
export function cleAttendu(e: Expect): string {
  return `${e.kind}:${e.id}`;
}

export interface ExpectedCheck {
  id: string;
  mode: Check['mode'];
  /** Nombre de lignes brutes du jeu principal, pour le rapport. */
  rawRows: number;
  /** Instant du calcul — en mode vivant, il doit coller au rendu. */
  fetchedAt: string;
  values: Record<string, Attendu>;
}

/** Calcule l'attendu d'un contrôle à partir de ses jeux de lignes brutes. */
export function computeExpectedFor(check: Check, datasets: Record<string, Row[]>): ExpectedCheck {
  const values: Record<string, Attendu> = {};
  for (const e of check.expects) {
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
    const from = e.from ?? JEU_PRINCIPAL;
    const rows = e.pipeline ? runPipeline(datasets, e.pipeline, from) : (datasets[from] ?? []);
    switch (e.kind) {
      case 'kpi': {
        const filtrees = applyFilter(rows, e.filter);
        values[cleAttendu(e)] = {
          kind: 'kpi',
          value: aggregate(filtrees, e.agg, e.field, e.weight),
          decimals: e.decimals ?? 0,
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
        values[cleAttendu(e)] = { kind: 'legend', classes: legendClasses(valeurs, e.classes) };
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
  };
}
