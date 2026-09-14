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

export interface AttenduFacettes {
  kind: 'facets';
  /** Valeurs et compteurs attendus, dans l'ordre d'affichage. */
  values: Array<{ value: string; count: number | null }>;
}

export interface AttenduTexte {
  kind: 'text';
  /** Texte attendu (comparaison textuelle), ou `null` si la comparaison est numérique. */
  text: string | null;
  /** Nombre attendu (comparaison numérique), ou `null` si elle est textuelle. */
  value: number | null;
  decimals: number;
}

export type Attendu =
  | AttenduKpi
  | AttenduLignes
  | AttenduGraphique
  | AttenduListe
  | AttenduLegende
  | AttenduFacettes
  | AttenduTexte;

/**
 * Clé d'un attendu dans le rapport : le genre et l'id observé — plus ce qui
 * distingue DEUX observations du même élément. Une page à deux facettes n'a
 * qu'un `dsfr-data-facets` : sans le nom du groupe, la seconde attente
 * écraserait la première et le contrôle porterait sur une seule des deux.
 */
export function cleAttendu(e: Expect): string {
  if (e.kind === 'facets') return `facets:${e.id}:${e.group}`;
  if (e.kind === 'text' && e.selector) return `text:${e.id}:${e.selector}`;
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
  };
}
