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
 * Les cardinalités sont calculées sur l'échantillon chargé (state.data).
 */

import { state } from '../state.js';
import { selectChartType } from './chart-type-selector.js';

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

  const n = fieldCardinality(state.labelField);
  // Regroupement personnalisé actif : l'utilisateur pilote déjà l'axe.
  if (n <= CARDINALITY_THRESHOLD || state.queryGroupBy) {
    guard.hidden = true;
    return;
  }

  const total =
    state.savedSource?.recordCount && state.savedSource.recordCount > rows.length ? '+' : '';
  textEl.innerHTML = `<strong>${n.toLocaleString('fr-FR')}${total} catégories détectées</strong> sur « ${state.labelField} » — l'axe sera illisible. Suggestions :`;

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
  // Variante/unité KPI : lues du DOM par chart-renderer/code-generator (pas
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
