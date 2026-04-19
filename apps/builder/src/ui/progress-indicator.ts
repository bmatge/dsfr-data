/**
 * Progress indicator UI — stepper + section badges + generate button status.
 *
 * Pure DOM update functions. The DOM skeleton (stepper container,
 * section-status spans, generate-missing div) lives in apps/builder/index.html.
 * These functions fill/toggle classes based on a `Completeness` object.
 */

import { state, getCompleteness, type BuilderState, type Completeness } from '../state.js';

/** Key identifying each stepper step. Order matters (left → right). */
type StepperKey = 'source' | 'type' | 'config' | 'generate';

const STEPPER_ORDER: readonly StepperKey[] = ['source', 'type', 'config', 'generate'] as const;

const STEPPER_LABELS: Record<StepperKey, string> = {
  source: 'Source',
  type: 'Type',
  config: 'Configuration',
  generate: 'Générer',
};

/** DOM ids / classes used by index.html. */
const STEPPER_ID = 'progress-stepper';
const GENERATE_MISSING_ID = 'generate-missing';
const GENERATE_BTN_ID = 'generate-btn';

/**
 * Returns whether the chart has been generated at least once.
 * True while the preview iframe is visible (empty-state is hidden).
 */
function isGenerated(): boolean {
  const empty = document.getElementById('empty-state');
  if (!empty) return false;
  return empty.style.display === 'none' || window.getComputedStyle(empty).display === 'none';
}

/** Render/update the 4-step horizontal stepper. */
function renderStepper(c: Completeness): void {
  const container = document.getElementById(STEPPER_ID);
  if (!container) return;

  // First call — inject skeleton. One pill per step, no separator bars.
  // Using <span>✓</span> (not <i class="ri-check-line">) avoids a conflict
  // with Remix Icon's global `[class^="ri-"] { display: inline-block }` rule
  // which would otherwise keep the check visible on non-done steps.
  if (!container.dataset.ready) {
    container.innerHTML = STEPPER_ORDER.map((key, index) =>
      `
        <div class="progress-step" data-step="${key}" role="listitem">
          <span class="progress-step-circle" aria-hidden="true">
            <span class="progress-step-number">${index + 1}</span>
            <span class="progress-step-check">✓</span>
          </span>
          <span class="progress-step-label">${STEPPER_LABELS[key]}</span>
        </div>
      `.trim()
    ).join('');
    container.dataset.ready = '1';
  }

  // Find the first incomplete step (becomes "current").
  const currentKey = STEPPER_ORDER.find((k) => !c[k]) ?? null;

  container.querySelectorAll<HTMLElement>('.progress-step').forEach((el) => {
    const key = el.dataset.step as StepperKey | undefined;
    if (!key) return;
    const done = c[key];
    const current = key === currentKey;
    el.classList.toggle('progress-step--done', done);
    el.classList.toggle('progress-step--current', current);
    el.setAttribute('aria-current', current ? 'step' : 'false');
    el.setAttribute(
      'aria-label',
      `${STEPPER_LABELS[key]}: ${done ? 'complété' : current ? 'en cours' : 'à faire'}`
    );
  });
}

/**
 * Map each `.config-section-header` to a completeness signal, then toggle
 * a status span inside the header. The span is injected once on first call.
 *
 * Design: only mark a section "done" when the user has actually interacted
 * with it (non-default value). Sections that stay on their defaults show no
 * badge. This avoids the "everything looks done before you started" illusion.
 */
function renderSectionIndicators(s: BuilderState, c: Completeness): void {
  const titleCustomized = !!s.title && s.title !== 'Mon graphique';
  const sourceChosen = c.source && !!s.savedSource;

  // Evaluate each section individually. "done" / "partial" / "idle".
  const sections: Record<string, 'done' | 'partial' | 'idle'> = {
    'section-source': sourceChosen ? 'done' : 'idle',
    // Type: the default is "bar" so we only mark done when fields are filled
    // for that type (otherwise the user hasn't really moved past it).
    'section-type': c.source && c.type && c.config ? 'done' : 'idle',
    'section-data': (() => {
      if (!c.source || !c.type) return 'idle';
      return c.config ? 'done' : 'partial';
    })(),
    'section-appearance': titleCustomized ? 'done' : 'idle',
    'section-generation-mode': s.generationMode === 'dynamic' ? 'done' : 'idle',
    'section-normalize': s.normalizeConfig.enabled ? 'done' : 'idle',
    'section-facets': s.facetsConfig.enabled ? 'done' : 'idle',
    'section-databox': s.databoxEnabled ? 'done' : 'idle',
    // Accessibility is enabled by default — only mark done when the user
    // has actually described the chart for screen readers.
    'section-a11y': s.a11yDescription.trim() ? 'done' : 'idle',
  };

  for (const [id, status] of Object.entries(sections)) {
    const section = document.getElementById(id);
    if (!section) continue;
    const header = section.querySelector<HTMLElement>('.config-section-header');
    if (!header) continue;

    let indicator = header.querySelector<HTMLElement>('.section-status');
    if (!indicator) {
      indicator = document.createElement('span');
      indicator.className = 'section-status';
      indicator.setAttribute('aria-hidden', 'true');
      // Insert after the first <h3> (or at end of header).
      const h3 = header.querySelector('h3');
      if (h3 && h3.parentNode === header) {
        h3.insertAdjacentElement('afterend', indicator);
      } else {
        header.appendChild(indicator);
      }
    }

    indicator.classList.toggle('section-status--done', status === 'done');
    indicator.classList.toggle('section-status--partial', status === 'partial');
    indicator.classList.toggle('section-status--idle', status === 'idle');
    indicator.textContent = status === 'done' ? '✓' : status === 'partial' ? '◐' : '';
  }
}

/** Update the "Generate" button state + its missing-requirements sub-text. */
function renderGenerateButton(c: Completeness): void {
  const btn = document.getElementById(GENERATE_BTN_ID) as HTMLButtonElement | null;
  const missingEl = document.getElementById(GENERATE_MISSING_ID);
  const ready = c.source && c.type && c.config;

  if (btn) {
    btn.classList.toggle('fr-btn--ready', ready);
    // Keep it always enabled — clicking still shows an informative toast for
    // edge cases. The visual state carries the signal.
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
    const step = li.dataset.step as StepperKey | undefined;
    if (!step) return;
    li.classList.toggle('done', c[step]);
  });
}

/**
 * Public API — single entry point. Recompute completeness from the current
 * state and refresh all four UI surfaces.
 *
 * Safe to call as often as needed (cheap DOM reads/writes, no layout thrash).
 */
export function updateProgress(): void {
  const c = getCompleteness(state, isGenerated());
  renderStepper(c);
  renderSectionIndicators(state, c);
  renderGenerateButton(c);
  renderEmptyStateChecklist(c);
}
