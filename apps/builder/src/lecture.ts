/**
 * Réglages de LECTURE d'un graphique (#1218, suite de #1204) : ce qui change ce
 * que l'usager lit sans changer la donnée — unité des infobulles, bornes des
 * axes, lignes de référence, cibles, couleur fixée par catégorie, libellé des
 * catégories vides, chiffre de synthèse d'une carte.
 *
 * Module PUR (aucun accès au DOM, aucun import de l'état) : les types, les
 * valeurs par défaut, la table « quel réglage pour quel type » et la traduction
 * en attributs de `dsfr-data-chart`. Le formulaire (`ui/lecture.ts`), le
 * générateur (`ui/code-generator.ts`) et les tests lisent la même table.
 *
 * La table d'applicabilité est MESURÉE dans le navigateur sur DSFR Chart 2.1.1
 * (échelles Chart.js lues après rendu, 2026-10-05), pas déduite du manifeste :
 * - `y-min` / `y-max` : barres, lignes, nuage, radar. Sur des barres
 *   HORIZONTALES l'axe des valeurs est l'axe X — ce sont `x-min` / `x-max` qui
 *   agissent, et `y-min` / `y-max` y ajoutent deux catégories fantômes. Sans
 *   effet sur un « barres + ligne » (DSFR Chart y lit `y-bar-*` / `y-line-*`).
 * - `x-min` / `x-max` : nuage de points (et barres horizontales, ci-dessus).
 *   Sans effet sur l'axe des étiquettes d'une courbe.
 * - Les bornes sont des bornes SUGGÉRÉES : DSFR Chart les arrondit à la
 *   graduation voisine, et des barres partent toujours de zéro.
 * - `reference-lines` : sur des barres horizontales les axes sont inversés
 *   (un seuil est une ligne verticale, `axis:"x"`).
 */

/** Types du Builder (recopié de `state.ts` pour rester sans import d'état). */
type TypeGraphique = string;

/** Une ligne de référence saisie dans le formulaire. */
export interface ReferenceLineSetting {
  /** `value` : seuil sur l'axe des valeurs ; `label` : repère sur une étiquette (date, catégorie). */
  kind: 'value' | 'label';
  /** Saisie brute : un nombre pour un seuil, une étiquette pour un repère. */
  value: string;
  /** Libellé affiché en pastille (facultatif). */
  label: string;
}

/** Une cible saisie dans le formulaire. */
export interface TargetSetting {
  /** Échéance sur l'axe des étiquettes (ex. `2030`), au-delà des données ou non. */
  x: string;
  /** Valeur visée, saisie brute. */
  value: string;
  /** Libellé affiché en pastille (facultatif). */
  label: string;
  /** Barres + ligne : mesure visée. Ignoré pour une courbe (première série). */
  series: 'bar' | 'line';
}

/** Une couleur fixée pour une série ou une catégorie. */
export interface ColorMapEntry {
  /** Nom de série ou libellé de catégorie, tel qu'affiché. */
  key: string;
  /** Couleur hexadécimale (`#rrggbb`). */
  color: string;
}

/**
 * Chiffre de synthèse d'une carte : `''` laisse le défaut de la bibliothèque
 * (moyenne des territoires), `sum` la somme, `none` aucun chiffre, `value` une
 * valeur publiée saisie à la main (`map-summary-value`).
 */
export type MapSummaryMode = '' | 'sum' | 'none' | 'value';

/** Les réglages de lecture, tels que portés par l'état du Builder. */
export interface LectureSettings {
  /** Unité des infobulles (`unit-tooltip`) ; unité de la LIGNE sur un barres + ligne. */
  unitTooltip: string;
  /** Barres + ligne : unité des barres (`unit-tooltip-bar`). */
  unitTooltipBar: string;
  /** Bornes de l'axe des valeurs (saisie brute, vide = automatique). */
  axisMin: string;
  axisMax: string;
  /** Nuage de points : bornes de l'axe horizontal. */
  xAxisMin: string;
  xAxisMax: string;
  referenceLines: ReferenceLineSetting[];
  targets: TargetSetting[];
  /** Zone future grisée derrière les cibles (`targets-zone`, activée par défaut). */
  targetsZone: boolean;
  /** Légende « données historiques / trajectoire » (`targets-legend`, affichée par défaut). */
  targetsLegend: boolean;
  colorMap: ColorMapEntry[];
  /** Libellé des catégories vides (`empty-label`) ; vide = défaut de la bibliothèque. */
  emptyLabel: string;
  mapSummary: MapSummaryMode;
  /** Valeur publiée (`map-summary-value`), lue quand `mapSummary === 'value'`. */
  mapSummaryValue: string;
}

/** Valeurs par défaut : aucun réglage posé, donc aucun attribut écrit. */
export function lectureDefaults(): LectureSettings {
  return {
    unitTooltip: '',
    unitTooltipBar: '',
    axisMin: '',
    axisMax: '',
    xAxisMin: '',
    xAxisMax: '',
    referenceLines: [],
    targets: [],
    targetsZone: true,
    targetsLegend: true,
    colorMap: [],
    emptyLabel: '',
    mapSummary: '',
    mapSummaryValue: '',
  };
}

/** Clés d'état des réglages de lecture (instantané des favoris, statut « modifié »). */
export const LECTURE_KEYS = Object.keys(lectureDefaults()) as (keyof LectureSettings)[];

/** Couleur proposée pour une nouvelle ligne « couleur par catégorie » (bleu France). */
export const COLOR_MAP_DEFAULT = '#000091';

// ---------------------------------------------------------------------------
// Quel réglage pour quel type
// ---------------------------------------------------------------------------

const CARTES = ['map', 'map-reg', 'map-aca', 'map-monde'];

/** Types dont l'infobulle porte une unité. */
export const UNIT_TYPES: readonly TypeGraphique[] = [
  'bar',
  'horizontalBar',
  'line',
  'pie',
  'doughnut',
  'radar',
  'scatter',
  'bar-line',
];

/** Types dont l'axe des valeurs se borne. */
export const AXIS_BOUNDS_TYPES: readonly TypeGraphique[] = [
  'bar',
  'horizontalBar',
  'line',
  'scatter',
  'radar',
];

/** Types dont l'axe horizontal, numérique, se borne à part. */
export const X_BOUNDS_TYPES: readonly TypeGraphique[] = ['scatter'];

/** Types qui tracent des lignes de référence (cartésiens de la bibliothèque). */
export const REFERENCE_LINE_TYPES: readonly TypeGraphique[] = [
  'bar',
  'horizontalBar',
  'line',
  'bar-line',
  'scatter',
];

/** Types qui tracent des cibles : il faut une trajectoire. */
export const TARGET_TYPES: readonly TypeGraphique[] = ['line', 'bar-line'];

/** Types dont une série ou une catégorie peut recevoir une couleur fixe. */
export const COLOR_MAP_TYPES: readonly TypeGraphique[] = UNIT_TYPES;

/** Types dont les étiquettes sont des catégories, qui peuvent être vides. */
export const EMPTY_LABEL_TYPES: readonly TypeGraphique[] = [
  'bar',
  'horizontalBar',
  'line',
  'pie',
  'doughnut',
  'radar',
  'bar-line',
];

/** Types qui affichent un chiffre de synthèse sous leur titre. */
export const MAP_SUMMARY_TYPES: readonly TypeGraphique[] = CARTES;

/** Réglages de lecture proposés pour un type (source unique du formulaire). */
export interface LectureApplicability {
  unit: boolean;
  unitBar: boolean;
  axisBounds: boolean;
  xBounds: boolean;
  referenceLines: boolean;
  targets: boolean;
  colorMap: boolean;
  emptyLabel: boolean;
  mapSummary: boolean;
}

export function lectureApplicability(type: TypeGraphique): LectureApplicability {
  return {
    unit: UNIT_TYPES.includes(type),
    unitBar: type === 'bar-line',
    axisBounds: AXIS_BOUNDS_TYPES.includes(type),
    xBounds: X_BOUNDS_TYPES.includes(type),
    referenceLines: REFERENCE_LINE_TYPES.includes(type),
    targets: TARGET_TYPES.includes(type),
    colorMap: COLOR_MAP_TYPES.includes(type),
    emptyLabel: EMPTY_LABEL_TYPES.includes(type),
    mapSummary: MAP_SUMMARY_TYPES.includes(type),
  };
}

// ---------------------------------------------------------------------------
// Lecture défensive d'un état déposé (favori, retour d'une autre app)
// ---------------------------------------------------------------------------

function texte(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
}

function objet(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Réglages de lecture d'un état quelconque, remis en forme : une clé absente
 * (favori enregistré AVANT #1218) ou mal formée prend sa valeur par défaut —
 * aucun attribut n'est alors écrit, et le graphique se rouvre comme il avait
 * été enregistré.
 */
export function normalizeLecture(source: unknown): LectureSettings {
  const s = objet(source) ?? {};
  const d = lectureDefaults();
  const liste = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? v.map(objet).filter((x): x is Record<string, unknown> => x !== null) : [];
  const mode = texte(s.mapSummary);
  return {
    unitTooltip: texte(s.unitTooltip),
    unitTooltipBar: texte(s.unitTooltipBar),
    axisMin: texte(s.axisMin),
    axisMax: texte(s.axisMax),
    xAxisMin: texte(s.xAxisMin),
    xAxisMax: texte(s.xAxisMax),
    referenceLines: liste(s.referenceLines).map((l) => ({
      kind: l.kind === 'label' ? 'label' : 'value',
      value: texte(l.value),
      label: texte(l.label),
    })),
    targets: liste(s.targets).map((t) => ({
      x: texte(t.x),
      value: texte(t.value),
      label: texte(t.label),
      series: t.series === 'bar' ? 'bar' : 'line',
    })),
    targetsZone: typeof s.targetsZone === 'boolean' ? s.targetsZone : d.targetsZone,
    targetsLegend: typeof s.targetsLegend === 'boolean' ? s.targetsLegend : d.targetsLegend,
    colorMap: liste(s.colorMap).map((c) => ({
      key: texte(c.key),
      color: /^#[0-9a-f]{6}$/i.test(texte(c.color)) ? texte(c.color) : COLOR_MAP_DEFAULT,
    })),
    emptyLabel: texte(s.emptyLabel),
    mapSummary: mode === 'sum' || mode === 'none' || mode === 'value' ? mode : '',
    mapSummaryValue: texte(s.mapSummaryValue),
  };
}

// ---------------------------------------------------------------------------
// Traduction en attributs de dsfr-data-chart
// ---------------------------------------------------------------------------

/**
 * Nombre saisi à la française (`5,5`, `1 200`) → nombre, ou `null` si la saisie
 * est vide ou n'est pas un nombre. Une saisie illisible n'écrit AUCUN attribut :
 * jamais une borne ou un seuil faux.
 */
export function parseNumberInput(raw: string): number | null {
  const t = String(raw ?? '')
    .replace(/\s/g, '')
    .replace(',', '.');
  if (!t || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Un attribut à écrire sur `dsfr-data-chart` : nom et valeur BRUTE (non échappée). */
export interface LectureAttr {
  name: string;
  value: string;
  /** La valeur est du JSON : à écrire entre guillemets simples. */
  json?: boolean;
}

/** Échappe une modalité de `color-map` (même grammaire que `escapeColonValue` de la lib). */
function escapeModalite(value: string): string {
  return value.replace(/%/g, '%25').replace(/,/g, '%2C').replace(/:/g, '%3A').replace(/\|/g, '%7C');
}

/** Lignes de référence valides, au format de l'attribut `reference-lines`. */
export function referenceLinesValue(
  type: TypeGraphique,
  lines: readonly ReferenceLineSetting[]
): Record<string, unknown>[] {
  if (!REFERENCE_LINE_TYPES.includes(type)) return [];
  // Barres horizontales : l'axe des valeurs est l'axe X.
  const axeValeurs = type === 'horizontalBar' ? 'x' : 'y';
  const axeEtiquettes = type === 'horizontalBar' ? 'y' : 'x';
  const out: Record<string, unknown>[] = [];
  for (const l of lines) {
    const item: Record<string, unknown> = {};
    if (l.kind === 'value') {
      const n = parseNumberInput(l.value);
      if (n === null) continue;
      item.axis = axeValeurs;
      item.value = n;
    } else {
      const v = l.value.trim();
      if (!v) continue;
      item.axis = axeEtiquettes;
      // Nuage de points : l'axe horizontal est numérique.
      const n = type === 'scatter' ? parseNumberInput(v) : null;
      if (type === 'scatter' && n === null) continue;
      item.value = n ?? v;
    }
    if (l.label.trim()) item.label = l.label.trim();
    out.push(item);
  }
  return out;
}

/** Cibles valides, au format de l'attribut `targets`. */
export function targetsValue(
  type: TypeGraphique,
  targets: readonly TargetSetting[]
): Record<string, unknown>[] {
  if (!TARGET_TYPES.includes(type)) return [];
  const out: Record<string, unknown>[] = [];
  for (const t of targets) {
    const x = t.x.trim();
    const n = parseNumberInput(t.value);
    if (!x || n === null) continue;
    const item: Record<string, unknown> = { x, value: n };
    // Barres + ligne : 0 = les barres, 1 = la ligne. Une courbe vise sa première série.
    if (type === 'bar-line') item.series = t.series === 'bar' ? 0 : 1;
    if (t.label.trim()) item.label = t.label.trim();
    out.push(item);
  }
  return out;
}

/** Valeur de l'attribut `color-map`, ou chaîne vide. */
export function colorMapValue(type: TypeGraphique, entries: readonly ColorMapEntry[]): string {
  if (!COLOR_MAP_TYPES.includes(type)) return '';
  const vus = new Set<string>();
  const paires: string[] = [];
  for (const e of entries) {
    const key = e.key.trim();
    if (!key || vus.has(key) || !/^#[0-9a-f]{6}$/i.test(e.color)) continue;
    vus.add(key);
    paires.push(`${escapeModalite(key)}:${e.color}`);
  }
  return paires.join(',');
}

/**
 * Attributs de `dsfr-data-chart` que posent les réglages de lecture, pour le
 * type courant. Un réglage qui ne s'applique pas au type n'écrit rien, même
 * s'il reste en mémoire dans l'état (changer de type ne perd pas la saisie).
 * Tableau vide : le code généré est celui d'avant #1218, au caractère près.
 */
export function lectureAttrs(type: TypeGraphique, s: LectureSettings): LectureAttr[] {
  const a = lectureApplicability(type);
  const out: LectureAttr[] = [];
  const nombre = (name: string, raw: string): void => {
    const n = parseNumberInput(raw);
    if (n !== null) out.push({ name, value: String(n) });
  };

  if (a.emptyLabel && s.emptyLabel.trim()) {
    out.push({ name: 'empty-label', value: s.emptyLabel.trim() });
  }
  if (a.unitBar && s.unitTooltipBar.trim()) {
    out.push({ name: 'unit-tooltip-bar', value: s.unitTooltipBar.trim() });
  }
  if (a.unit && s.unitTooltip.trim()) {
    out.push({ name: 'unit-tooltip', value: s.unitTooltip.trim() });
  }
  if (a.axisBounds) {
    // Barres horizontales : l'axe des valeurs est l'axe X.
    const axe = type === 'horizontalBar' ? 'x' : 'y';
    if (a.xBounds) {
      nombre('x-min', s.xAxisMin);
      nombre('x-max', s.xAxisMax);
    }
    nombre(`${axe}-min`, s.axisMin);
    nombre(`${axe}-max`, s.axisMax);
  }
  const lignes = referenceLinesValue(type, s.referenceLines);
  if (lignes.length > 0) {
    out.push({ name: 'reference-lines', value: JSON.stringify(lignes), json: true });
  }
  const cibles = targetsValue(type, s.targets);
  if (cibles.length > 0) {
    out.push({ name: 'targets', value: JSON.stringify(cibles), json: true });
    if (!s.targetsZone) out.push({ name: 'targets-zone', value: 'off' });
    if (!s.targetsLegend) out.push({ name: 'targets-legend', value: 'off' });
  }
  const couleurs = colorMapValue(type, s.colorMap);
  if (couleurs) out.push({ name: 'color-map', value: couleurs });
  if (a.mapSummary) {
    if (s.mapSummary === 'sum' || s.mapSummary === 'none') {
      out.push({ name: 'map-summary', value: s.mapSummary });
    } else if (s.mapSummary === 'value') {
      nombre('map-summary-value', s.mapSummaryValue);
    }
  }
  return out;
}

/** Un réglage de lecture s'applique-t-il au type courant ? */
export function hasLectureAttrs(type: TypeGraphique, s: LectureSettings): boolean {
  return lectureAttrs(type, s).length > 0;
}
