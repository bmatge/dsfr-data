/**
 * Progress indicator UI — section summaries + generate button status.
 *
 * Shows a compact text summary next to each section header (source name,
 * chart type, fields, palette, checked options…) so the user sees their
 * choices at a glance without expanding each section. Also keeps the
 * Generate-button sub-text ("Il manque : X, Y") and the empty-state
 * checklist in sync with the state.
 *
 * Pure DOM update functions — the skeleton lives in apps/builder/index.html.
 */

import { state, getCompleteness, type BuilderState, type Completeness } from '../state.js';

type StepKey = 'source' | 'type' | 'config' | 'generate';

const GENERATE_MISSING_ID = 'generate-missing';
const GENERATE_BTN_ID = 'generate-btn';

const CHART_TYPE_LABELS: Record<string, string> = {
  bar: 'Barres verticales',
  horizontalBar: 'Barres horizontales',
  line: 'Courbe',
  pie: 'Camembert',
  doughnut: 'Anneau',
  radar: 'Radar',
  scatter: 'Nuage de points',
  gauge: 'Jauge',
  kpi: 'Indicateur KPI',
  map: 'Carte',
  datalist: 'Tableau',
};

/** One entry per section header — value is a short text summary (may be ''). */
interface SectionSummary {
  /** If 'partial', render the badge in warning colors; 'done' in neutral. */
  tone: 'done' | 'partial';
  text: string;
}

/** Returns whether the chart has been generated at least once. */
function isGenerated(): boolean {
  const empty = document.getElementById('empty-state');
  if (!empty) return false;
  return empty.style.display === 'none' || window.getComputedStyle(empty).display === 'none';
}

/** Join an array of checked-option labels with commas, return '' if empty. */
function joinChecked(labels: Array<string | false>): string {
  return labels.filter(Boolean).join(', ');
}

/** Human-readable summary for each configurable section. */
function buildSummaries(s: BuilderState, c: Completeness): Record<string, SectionSummary | null> {
  // Source — show name of the loaded source (or nothing if none).
  const sourceName = s.savedSource?.name || s.savedSource?.id || '';

  // Type of chart — label only when a source is loaded (so the default "bar"
  // doesn't mislead before the user interacts).
  const typeLabel = c.source && s.chartType ? CHART_TYPE_LABELS[s.chartType] || s.chartType : '';

  // Configuration — depends on chart type.
  let configText = '';
  let configTone: 'done' | 'partial' = 'done';
  if (c.source && s.chartType) {
    if (c.config) {
      switch (s.chartType) {
        case 'datalist':
          configText = s.labelField;
          break;
        case 'kpi':
        case 'gauge':
          configText = s.valueField;
          break;
        case 'map':
          configText = `${s.codeField} → ${s.valueField}`;
          break;
        default: {
          const extra = s.extraSeries?.length || 0;
          const main = `${s.labelField} × ${s.valueField}`;
          configText = extra > 0 ? `${main} (+${extra} série${extra > 1 ? 's' : ''})` : main;
        }
      }
    } else {
      configText = 'à compléter';
      configTone = 'partial';
    }
  }

  // Appearance — palette (hide when still on DSFR default).
  const paletteText = s.palette && s.palette !== 'default' ? s.palette : '';

  // Generation mode — mention only when dynamic (non-default).
  const genModeText = s.generationMode === 'dynamic' ? 'dynamique' : '';

  // Normalize / Facets / DataBox / A11y — list checked options or count.
  const normalizeText = s.normalizeConfig.enabled ? 'activée' : '';

  const facetsText = s.facetsConfig.enabled
    ? `${s.facetsConfig.fields.length || 0} champ${
        (s.facetsConfig.fields.length || 0) > 1 ? 's' : ''
      }`
    : '';

  const databoxText = s.databoxEnabled
    ? joinChecked([
        !!s.databoxTitle && 'titre',
        !!s.databoxSource && 'source',
        !!s.databoxDate && 'date',
        s.databoxDownload && 'téléchargement',
        s.databoxScreenshot && 'capture',
        s.databoxFullscreen && 'plein écran',
        !!s.databoxTrend && 'tendance',
      ]) || 'activé'
    : '';

  const a11yText = s.a11yEnabled
    ? joinChecked([
        s.a11yTable && 'tableau',
        s.a11yDownload && 'téléchargement',
        !!s.a11yDescription.trim() && 'description',
      ])
    : '';

  return {
    'section-source': sourceName ? { tone: 'done', text: sourceName } : null,
    'section-type': typeLabel ? { tone: 'done', text: typeLabel } : null,
    'section-data': configText ? { tone: configTone, text: configText } : null,
    'section-appearance': paletteText ? { tone: 'done', text: paletteText } : null,
    'section-generation-mode': genModeText ? { tone: 'done', text: genModeText } : null,
    'section-normalize': normalizeText ? { tone: 'done', text: normalizeText } : null,
    'section-facets': facetsText ? { tone: 'done', text: facetsText } : null,
    'section-databox': databoxText ? { tone: 'done', text: databoxText } : null,
    'section-a11y': a11yText ? { tone: 'done', text: a11yText } : null,
  };
}

/** Inject/update `.section-summary` next to each section <h3>. */
function renderSectionSummaries(s: BuilderState, c: Completeness): void {
  const summaries = buildSummaries(s, c);
  for (const [id, summary] of Object.entries(summaries)) {
    const section = document.getElementById(id);
    if (!section) continue;
    const header = section.querySelector<HTMLElement>('.config-section-header');
    if (!header) continue;

    // Legacy dot-badge from the first iteration — remove it if present.
    header.querySelector('.section-status')?.remove();

    let summaryEl = header.querySelector<HTMLElement>('.section-summary');
    if (!summaryEl) {
      summaryEl = document.createElement('span');
      summaryEl.className = 'section-summary';
      // Insert right after <h3>, before the caret icon.
      const h3 = header.querySelector('h3');
      if (h3 && h3.parentNode === header) {
        h3.insertAdjacentElement('afterend', summaryEl);
      } else {
        header.appendChild(summaryEl);
      }
    }

    if (summary) {
      summaryEl.textContent = summary.text;
      summaryEl.classList.toggle('section-summary--partial', summary.tone === 'partial');
      summaryEl.hidden = false;
    } else {
      summaryEl.textContent = '';
      summaryEl.hidden = true;
    }
  }
}

/** Update the "Generate" button state + its missing-requirements sub-text. */
function renderGenerateButton(c: Completeness): void {
  const btn = document.getElementById(GENERATE_BTN_ID) as HTMLButtonElement | null;
  const missingEl = document.getElementById(GENERATE_MISSING_ID);
  const ready = c.source && c.type && c.config;

  if (btn) {
    btn.classList.toggle('fr-btn--ready', ready);
  }

  if (missingEl) {
    if (ready) {
      missingEl.textContent = '';
      missingEl.hidden = true;
    } else {
      missingEl.textContent = `Il manque : ${c.missing.join(', ')}.`;
      missingEl.hidden = false;
    }
  }
}

/** Update the checklist inside the preview empty-state. */
function renderEmptyStateChecklist(c: Completeness): void {
  const steps = document.querySelectorAll<HTMLElement>('.empty-state-steps li');
  steps.forEach((li) => {
    const step = li.dataset.step as StepKey | undefined;
    if (!step) return;
    li.classList.toggle('done', c[step]);
  });
}

/**
 * Public API — single entry point. Recompute completeness from the current
 * state and refresh all three UI surfaces.
 *
 * Safe to call as often as needed (cheap DOM reads/writes, no layout thrash).
 */
export function updateProgress(): void {
  const c = getCompleteness(state, isGenerated());
  renderSectionSummaries(state, c);
  renderGenerateButton(c);
  renderEmptyStateChecklist(c);
}
