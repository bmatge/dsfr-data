/**
 * Garde-fous « intelligents » de la refonte v2 (Claude Design) :
 *
 * 1. Garde-fou de cardinalité : quand le champ d'étiquettes a trop de valeurs
 *    distinctes, l'axe X sera illisible — bandeau au-dessus de l'aperçu avec
 *    des suggestions actionnables (agréger par un champ catégoriel, trier par
 *    valeur décroissante).
 * 2. Statut « dirty » : compare la configuration courante à celle du dernier
 *    « Générer » et l'affiche dans la barre d'action (« Modifications non
 *    générées » / « Graphique à jour »).
 *
 * La cardinalité du champ d'étiquettes est celle du JEU quand on peut la
 * connaître (#1172) : l'échantillon chargé s'il est complet, sinon une requête
 * de regroupement à l'API (`real-cardinality.ts`). À défaut — fournisseur sans
 * regroupement serveur, requête en attente ou en échec — elle retombe sur
 * l'échantillon, et le bandeau le DIT.
 */

import { state } from '../state.js';
import { selectChartType } from './chart-type-selector.js';
import { lookupRealCardinality } from './real-cardinality.js';

/** Seuil au-delà duquel l'axe X est considéré illisible. */
const CARDINALITY_THRESHOLD = 50;

/** Cardinalités mémoïsées par champ pour la source courante. */
let cardinalityCache: Map<string, number> | null = null;
let cacheSourceKey = '';

function rowsOfCurrentSource(): Record<string, unknown>[] {
  // localData = lignes brutes chargées de la source ; state.data n'est rempli
  // qu'à la génération (résultat agrégé).
  if (Array.isArray(state.localData) && state.localData.length > 0) {
    return state.localData as Record<string, unknown>[];
  }
  return Array.isArray(state.data) ? (state.data as Record<string, unknown>[]) : [];
}

/** Nombre de valeurs distinctes d'un champ sur l'échantillon (mémoïsé). */
export function fieldCardinality(fieldName: string): number {
  const rows = rowsOfCurrentSource();
  const key = `${state.savedSource?.id ?? ''}:${rows.length}`;
  if (!cardinalityCache || cacheSourceKey !== key) {
    cardinalityCache = new Map();
    cacheSourceKey = key;
  }
  const cached = cardinalityCache.get(fieldName);
  if (cached !== undefined) return cached;

  const uniques = new Set<string>();
  for (const row of rows) {
    const v = row[fieldName];
    if (v !== null && v !== undefined && v !== '') uniques.add(String(v));
  }
  cardinalityCache.set(fieldName, uniques.size);
  return uniques.size;
}

/** D'où vient une cardinalité affichée. */
export type CardinalityOrigin =
  /** L'échantillon chargé est le jeu entier : le compte est exact. */
  | 'complet'
  /** Compte demandé à l'API (regroupement serveur). */
  | 'reel'
  /** Compte fait sur un échantillon partiel : un minimum, à annoncer comme tel. */
  | 'echantillon';

export interface LabelCardinality {
  /** Nombre de valeurs distinctes non vides. */
  n: number;
  /** `n` est un minimum (plafond de la requête atteint, ou échantillon partiel). */
  atLeast: boolean;
  origin: CardinalityOrigin;
  /** Lignes de l'échantillon chargé. */
  sampleRows: number;
  /** Nombre de groupes rendus par l'API, valeur vide comprise (`reel` seulement). */
  groups?: number;
}

/** L'échantillon chargé couvre-t-il tout le jeu annoncé par la source ? */
export function isSampleComplete(): boolean {
  const total = state.savedSource?.recordCount;
  return !(typeof total === 'number' && total > rowsOfCurrentSource().length);
}

/**
 * Cardinalité du champ pour le jeu, avec sa provenance (#1172). Peut lancer la
 * requête de regroupement (une seule par source et par champ) : l'évènement
 * `builder:cardinality-updated` signale l'arrivée de la réponse.
 */
export function labelCardinality(fieldName: string): LabelCardinality {
  const sampleRows = rowsOfCurrentSource().length;
  const sampleN = fieldCardinality(fieldName);
  if (isSampleComplete()) {
    return { n: sampleN, atLeast: false, origin: 'complet', sampleRows };
  }
  const real = lookupRealCardinality(state.savedSource, fieldName);
  if (real.status === 'ok') {
    return {
      n: real.distinct,
      atLeast: real.capped,
      origin: 'reel',
      sampleRows,
      groups: real.groups,
    };
  }
  return { n: sampleN, atLeast: true, origin: 'echantillon', sampleRows };
}

/** Mention de repli, quand un compte ne porte que sur l'échantillon chargé. */
export function sampleMention(sampleRows: number): string {
  return `calculé sur un échantillon de ${sampleRows.toLocaleString('fr-FR')} ligne${sampleRows > 1 ? 's' : ''}`;
}

/** Meilleur champ catégoriel de remplacement (2..30 valeurs, le plus petit). */
function bestCategoricalField(excluding: string): string | null {
  let best: { name: string; n: number } | null = null;
  for (const f of state.fields) {
    if (f.name === excluding || f.type !== 'string') continue;
    const n = fieldCardinality(f.name);
    if (n >= 2 && n <= 30 && (!best || n < best.n)) best = { name: f.name, n };
  }
  return best?.name ?? null;
}

/**
 * Met à jour le bandeau garde-fou. À appeler quand le champ d'étiquettes ou la
 * source change. Sans objet pour les types mono-valeur (KPI, jauge) et le
 * tableau (paginé).
 */
export function updateCardinalityGuard(): void {
  const guard = document.getElementById('cardinality-guard');
  const textEl = document.getElementById('cardinality-guard-text');
  const actionsEl = document.getElementById('cardinality-guard-actions');
  if (!guard || !textEl || !actionsEl) return;

  const exemptTypes = ['kpi', 'gauge', 'datalist'];
  const rows = rowsOfCurrentSource();
  if (!state.labelField || rows.length === 0 || exemptTypes.includes(state.chartType)) {
    guard.hidden = true;
    return;
  }

  const card = labelCardinality(state.labelField);
  const n = card.n;
  // Regroupement personnalisé actif : l'utilisateur pilote déjà l'axe.
  if (n <= CARDINALITY_THRESHOLD || state.queryGroupBy) {
    guard.hidden = true;
    return;
  }

  const count = `${card.atLeast ? 'Au moins ' : ''}${n.toLocaleString('fr-FR')} catégories détectées`;
  const mention = card.origin === 'echantillon' ? ` (${sampleMention(card.sampleRows)})` : '';
  textEl.textContent = '';
  const strong = document.createElement('strong');
  strong.textContent = count;
  textEl.append(
    strong,
    ` sur « ${state.labelField} »${mention} — l'axe sera illisible. Suggestions :`
  );

  actionsEl.innerHTML = '';
  const alt = bestCategoricalField(state.labelField);
  if (alt) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fr-btn fr-btn--sm fr-btn--secondary';
    btn.textContent = `Agréger par ${alt}`;
    btn.addEventListener('click', () => {
      state.labelField = alt;
      const sel = document.getElementById('label-field') as HTMLSelectElement | null;
      if (sel) sel.value = alt;
      updateCardinalityGuard();
    });
    actionsEl.appendChild(btn);
  }
  if (state.sortOrder !== 'desc') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fr-btn fr-btn--sm fr-btn--secondary';
    btn.textContent = 'Trier par valeur décroissante';
    btn.addEventListener('click', () => {
      state.sortOrder = 'desc';
      const sel = document.getElementById('sort-order') as HTMLSelectElement | null;
      if (sel) sel.value = 'desc';
      updateCardinalityGuard();
    });
    actionsEl.appendChild(btn);
  }
  const tableBtn = document.createElement('button');
  tableBtn.type = 'button';
  tableBtn.className = 'fr-btn fr-btn--sm fr-btn--secondary';
  tableBtn.textContent = 'Passer en tableau';
  tableBtn.addEventListener('click', () => {
    selectChartType('datalist');
    updateCardinalityGuard();
  });
  actionsEl.appendChild(tableBtn);

  guard.hidden = false;
}

// ------------------------------------------------------------------
// Statut « dirty » (configuration modifiée depuis le dernier Générer)
// ------------------------------------------------------------------

/** Sous-ensemble de l'état qui influe sur le rendu généré. */
function configSnapshot(): string {
  const s = state as unknown as Record<string, unknown>;
  const keys = [
    'chartType',
    'labelField',
    'labelFieldLabel',
    'valueField',
    'valueFieldLabel',
    'extraSeries',
    'lineField',
    'lineFieldLabel',
    'podiumMaxItems',
    'seriesField',
    'stacked',
    'codeField',
    'sortField',
    'sortOrder',
    'aggregation',
    'queryFilter',
    'queryGroupBy',
    'queryAggregate',
    'title',
    'subtitle',
    'palette',
    'generationMode',
    'refreshInterval',
    'normalizeConfig',
    'facetsConfig',
    'urlSync',
    'urlPageParam',
    'datalistColumns',
    'datalistRecherche',
    'datalistFiltres',
    'datalistExportCsv',
    'datalistExportHtml',
    'databoxEnabled',
    'databoxTitle',
    'databoxSource',
    'databoxDate',
    'databoxTrend',
    'databoxDownload',
    'databoxScreenshot',
    'databoxFullscreen',
    'a11yEnabled',
    'a11yTable',
    'a11yDownload',
    'a11yDescription',
  ];
  const subset: Record<string, unknown> = {};
  for (const k of keys) subset[k] = s[k];
  subset.__sourceId = state.savedSource?.id ?? null;
  // Variante/unité KPI : lues du DOM par code-generator (pas
  // dans le state) — on les intègre au snapshot depuis le DOM aussi.
  subset.__kpiVariant =
    (document.getElementById('kpi-variant') as HTMLSelectElement | null)?.value ?? '';
  subset.__kpiUnit = (document.getElementById('kpi-unit') as HTMLInputElement | null)?.value ?? '';
  return JSON.stringify(subset);
}

let lastGeneratedSnapshot: string | null = null;

/** À appeler juste après une génération réussie. */
export function markGenerated(): void {
  lastGeneratedSnapshot = configSnapshot();
  updateDirtyStatus();
}

/** Met à jour la puce de statut de la barre d'action. */
export function updateDirtyStatus(): void {
  const wrap = document.getElementById('builder-dirty-status');
  const text = document.getElementById('builder-dirty-status-text');
  if (!wrap || !text) return;

  if (lastGeneratedSnapshot === null) {
    // Rien encore généré : le sous-texte « Il manque… » suffit.
    wrap.hidden = true;
    return;
  }
  const dirty = configSnapshot() !== lastGeneratedSnapshot;
  wrap.hidden = false;
  wrap.classList.toggle('builder-dirty-status--dirty', dirty);
  text.textContent = dirty ? 'Modifications non générées' : 'Graphique à jour';
}

/** Initialisation : délégation d'évènements sur le panneau de configuration. */
export function initSmartGuards(): void {
  const aside = document.querySelector('.builder-config-panel');
  if (!aside) return;
  const onAnyChange = () => {
    // Les listeners individuels de main.ts mettent à jour state avant nous
    // (ordre d'attachement) ; un microtask garantit la lecture post-mutation.
    queueMicrotask(() => {
      updateDirtyStatus();
      updateCardinalityGuard();
    });
  };
  aside.addEventListener('input', onAnyChange);
  aside.addEventListener('change', onAnyChange);
  aside.addEventListener('click', (e) => {
    // Boutons (type de graphique, séries…) : ils mutent l'état au clic.
    if ((e.target as HTMLElement).closest('button')) onAnyChange();
  });
}
