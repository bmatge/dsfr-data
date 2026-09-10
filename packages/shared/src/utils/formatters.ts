/**
 * Formatters — famille UNIQUE (#317), consommee par les composants
 * (packages/core re-exporte) ET par les previews des apps : la preview du
 * builder affiche exactement ce que rendra le composant.
 *
 * Politique `%` documentee : `formatPercentage(5)` rend « 5 % » — la valeur
 * est un POURCENTAGE deja exprime (5 = 5 %), pas un ratio (0.05). C'est le
 * contrat du composant dsfr-data-kpi (`format="pourcentage"`).
 *
 * Options (#665) : `decimals` fixe le nombre de decimales affichees (defauts
 * INCHANGES quand absent — les previews consomment la meme famille), `unit`
 * accole un suffixe apres une espace insecable (U+00A0, celle qu'Intl fr-FR
 * place avant « € », « % » et « Md »). `format="date"` (#667) delegue a
 * formatDate. Pas de grammaire `euro:3` : les decimales passent par l'option.
 */

import { toNumber } from './number-parser.js';

export type FormatType = 'nombre' | 'pourcentage' | 'euro' | 'decimal' | 'compact' | 'date';

/** Formats acceptes par `formatValue` et par l'attribut `format` de dsfr-data-kpi. */
export const FORMAT_TYPES: readonly FormatType[] = [
  'nombre',
  'pourcentage',
  'euro',
  'decimal',
  'compact',
  'date',
];

/** Garde de type : `format` est-il un FormatType connu ? (`euro:3` est refuse, #665) */
export function isFormatType(format: unknown): format is FormatType {
  return typeof format === 'string' && (FORMAT_TYPES as readonly string[]).includes(format);
}

/** Options de formatage (#665). */
export interface FormatValueOptions {
  /**
   * Nombre de decimales affichees (fixe : min = max), entier 0..20.
   * Sur `compact`, plafond seulement (« 42 » reste « 42 », pas « 42,0 »).
   * Ignore sur `date`. Absent : defauts historiques de chaque format.
   */
  decimals?: number;
  /**
   * Suffixe accole apres une espace insecable (« 44,9 Md € »). Ignore sur
   * `date` et sur une valeur non formatable (« — » reste seul).
   */
  unit?: string;
}

/** Espace insecable entre nombre et unite — convention Intl fr-FR (€, %, Md). */
const UNIT_SPACE = '\u00a0';

/** Decimales valides pour Intl (entier 0..20), sinon undefined (= defaut du format). */
function sanitizeDecimals(decimals: number | undefined): number | undefined {
  if (decimals === undefined || decimals === null) return undefined;
  const d = Number(decimals);
  return Number.isInteger(d) && d >= 0 && d <= 20 ? d : undefined;
}

/**
 * Formate un nombre selon le type specifie — '—' pour le non-numerique
 * (toNumber strict #301 : '1 234,5' est parse, 'abc' rend '—', jamais 0).
 * `format="date"` accepte une chaine ISO (ou un timestamp) et rend JJ/MM/AAAA.
 */
export function formatValue(
  value: number | string | null | undefined,
  format: FormatType = 'nombre',
  options: FormatValueOptions = {}
): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  if (format === 'date') {
    return formatDate(typeof value === 'number' ? new Date(value) : value);
  }

  const parsed = typeof value === 'string' ? toNumber(value, true) : value;
  const num = parsed === null ? NaN : parsed;

  if (isNaN(num)) {
    return '—';
  }

  const decimals = sanitizeDecimals(options.decimals);
  let out: string;
  switch (format) {
    case 'nombre':
      out = formatNumber(num, decimals);
      break;
    case 'pourcentage':
      out = formatPercentage(num, decimals);
      break;
    case 'euro':
      out = formatCurrency(num, decimals);
      break;
    case 'decimal':
      out = formatDecimal(num, decimals);
      break;
    case 'compact':
      out = formatCompact(num, decimals);
      break;
    default:
      out = formatNumber(num, decimals);
  }

  const unit = typeof options.unit === 'string' ? options.unit.trim() : '';
  return unit ? `${out}${UNIT_SPACE}${unit}` : out;
}

/**
 * Nombre en fr-FR pour un affichage (`typeof value === 'number'` seulement :
 * les chaînes — codes INSEE, SIREN — ne passent jamais par ici). Sans
 * `decimals`, au plus 2 décimales (les entiers restent entiers) ; avec
 * `decimals`, exactement ce nombre de décimales (colonnes alignées, même
 * sémantique que `decimals` du KPI). Non fini (NaN, Infinity) → '—'.
 * Réutilisé par dsfr-data-list, dsfr-data-a11y et le KPI (#665, #666).
 */
export function formatNumberFr(value: number, options: { decimals?: number } = {}): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const decimals = sanitizeDecimals(options.decimals);
  return new Intl.NumberFormat(
    'fr-FR',
    decimals !== undefined
      ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals }
      : { maximumFractionDigits: 2 }
  ).format(value);
}

/** Notation compacte fr-FR : 14 785 684 → "14,8 M", 6 676 → "6,7 k" (decimales : plafond, defaut 1) */
function formatCompact(value: number, decimals?: number): string {
  return new Intl.NumberFormat('fr-FR', {
    notation: 'compact',
    maximumFractionDigits: decimals ?? 1,
  }).format(value);
}

/** Nombre entier avec separateurs de milliers (format francais) — ou a `decimals` decimales fixes */
export function formatNumber(value: number, decimals?: number): string {
  if (decimals === undefined) {
    return new Intl.NumberFormat('fr-FR', {
      maximumFractionDigits: 0,
    }).format(Math.round(value));
  }
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Pourcentage : la valeur EST le pourcentage (5 -> « 5 % ») — 0 a 1 decimale par defaut */
export function formatPercentage(value: number, decimals?: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: decimals ?? 1,
  }).format(value / 100);
}

/** Montant en euros, 0 decimale par defaut (contrat du composant kpi) — `decimals` fixe (« 1,749 € ») */
export function formatCurrency(value: number, decimals?: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: decimals ?? 0,
  }).format(value);
}

/** Nombre decimal (1 a 2 decimales par defaut) — `decimals` fixe */
export function formatDecimal(value: number, decimals?: number): string {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals ?? 1,
    maximumFractionDigits: decimals ?? 2,
  }).format(value);
}

/** Date calendaire ISO sans heure (AAAA-MM-JJ). */
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Date au format francais JJ/MM/AAAA — '—' si invalide.
 * Une date calendaire seule (AAAA-MM-JJ) est rendue en UTC : `new Date` la
 * lit a minuit UTC, un fuseau a l'ouest de Greenwich la ferait glisser
 * d'un jour.
 */
export function formatDate(value: string | Date): string {
  const text = typeof value === 'string' ? value.trim() : null;
  const date = text !== null ? new Date(text) : (value as Date);

  if (isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(text !== null && DATE_ONLY_RE.test(text) ? { timeZone: 'UTC' } : {}),
  }).format(date);
}

/**
 * Format KPI des previews d'apps (builder, builder-ia, favorites).
 *
 * @deprecated Wrapper de compatibilite (#317) : delegue a formatValue —
 * la preview rend desormais EXACTEMENT ce que rend le composant (euro
 * etait a 2 decimales ici contre 0 dans le composant). Mapper l'unite :
 * '€'/'EUR' -> 'euro', '%' -> 'pourcentage', sinon 'nombre'.
 */
export function formatKPIValue(value: number, unit?: string): string {
  const format: FormatType =
    unit === '\u20AC' || unit === 'EUR' ? 'euro' : unit === '%' ? 'pourcentage' : 'nombre';
  return formatValue(value, format);
}

/**
 * Format a date to French locale string (court : « 5 juin 2026 »)
 */
export function formatDateShort(isoDate: string): string {
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
