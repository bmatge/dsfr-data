import { computeAggregation } from './aggregations.js';
import { formatValue, type FormatType } from './formatters.js';

/**
 * Lignes secondaires declaratives de <dsfr-data-kpi> (attribut JSON `lines`).
 *
 * Chaque ligne est rendue entre la valeur et le `label`. Elle est soit
 * data-driven (`value` = expression "champ:fn" evaluee sur la source), soit
 * un texte statique (`text`), avec une couleur declarative optionnelle.
 *
 * Util PUR et testable : aucune dependance Lit/DOM.
 */

/** Specification d'une ligne (un item du tableau JSON `lines`). */
export interface KpiLineSpec {
  /** Expression "champ:fn" calculee sur la source (ex. "evol:avg"). */
  value?: string;
  /** Texte statique. Ignore si `value` est fourni. */
  text?: string;
  /** Format de la valeur calculee. Defaut "pourcentage". */
  format?: FormatType;
  /** Force le signe `+` sur les valeurs positives. */
  sign?: boolean;
  /** Texte accole avant. */
  prefix?: string;
  /** Texte accole apres (ex. "vs mai 2025"). */
  suffix?: string;
  /** Couleur : "auto" (vert si >=0, rouge si <0), token DSFR, ou couleur CSS. */
  color?: string;
  /** Repli si la valeur calculee n'est pas un nombre fini (ex. "n.d."). */
  na?: string;
}

/** Ligne resolue, prete a afficher. */
export interface ResolvedKpiLine {
  /** Texte final. */
  text: string;
  /** Couleur CSS resolue, ou null (herite). */
  color: string | null;
}

/** Tokens de couleur DSFR acceptes (anglais + francais), sinon couleur CSS brute. */
const COLOR_TOKENS: Record<string, string> = {
  success: 'var(--text-default-success)',
  vert: 'var(--text-default-success)',
  error: 'var(--text-default-error)',
  rouge: 'var(--text-default-error)',
  warning: 'var(--text-default-warning)',
  orange: 'var(--text-default-warning)',
  info: 'var(--text-default-info)',
  bleu: 'var(--text-default-info)',
  grey: 'var(--text-mention-grey)',
  gris: 'var(--text-mention-grey)',
};

/**
 * Parse l'attribut JSON `lines`. Retourne null si le JSON est invalide ou
 * n'est pas un tableau (le composant remonte alors une erreur de config).
 * Les items non-objets sont ignores.
 */
export function parseKpiLines(json: string): KpiLineSpec[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  return parsed.filter((it): it is KpiLineSpec => !!it && typeof it === 'object');
}

function resolveColor(color: string | undefined, numericValue: number | null): string | null {
  if (!color) return null;
  if (color === 'auto') {
    if (numericValue === null || !Number.isFinite(numericValue)) return null;
    return numericValue >= 0 ? COLOR_TOKENS.success : COLOR_TOKENS.error;
  }
  return COLOR_TOKENS[color] ?? color;
}

function joinParts(prefix: string | undefined, body: string, suffix: string | undefined): string {
  return [prefix, body, suffix].filter((p) => p != null && p !== '').join(' ');
}

/**
 * Resout une ligne en `{ text, color }`, ou null si elle doit etre masquee
 * (valeur non resoluble sans repli `na`, ou spec vide).
 */
export function resolveKpiLine(spec: KpiLineSpec, data: unknown): ResolvedKpiLine | null {
  // Ligne data-driven : la valeur prime sur le texte statique.
  if (spec.value) {
    const raw = computeAggregation(data, spec.value);
    const num = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
    if (num === null) {
      // Donnee absente, Infinity (division par zero), non-nombre : repli `na`
      // si fourni, sinon on masque la ligne (pas de "+Infinity %" affiche).
      if (spec.na == null) return null;
      return {
        text: joinParts(spec.prefix, spec.na, spec.suffix),
        color: resolveColor(spec.color === 'auto' ? undefined : spec.color, null),
      };
    }
    const body = (spec.sign && num > 0 ? '+' : '') + formatValue(num, spec.format ?? 'pourcentage');
    return {
      text: joinParts(spec.prefix, body, spec.suffix),
      color: resolveColor(spec.color, num),
    };
  }

  // Ligne texte statique.
  if (spec.text != null) {
    return {
      text: joinParts(spec.prefix, spec.text, spec.suffix),
      color: resolveColor(spec.color, null),
    };
  }

  return null;
}

/** Resout toutes les lignes, en filtrant celles a masquer. */
export function resolveKpiLines(specs: KpiLineSpec[], data: unknown): ResolvedKpiLine[] {
  return specs.map((s) => resolveKpiLine(s, data)).filter((l): l is ResolvedKpiLine => l !== null);
}
