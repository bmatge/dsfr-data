/**
 * Lightweight product tour system.
 * Highlights elements with an overlay and shows a popover with step info.
 * Tour completion state is stored via saveToStorage (synced to server when authenticated).
 */

// ─── Types ─────────────────────────────────────────────────────────────

export interface TourStep {
  /** CSS selector for the target element */
  selector: string;
  /** Step title */
  title: string;
  /** Step description (plain text or HTML) */
  description: string;
  /** Preferred popover position */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Called before showing this step — can open collapsed sections, etc. */
  onBeforeShow?: () => void;
}

export interface TourConfig {
  /** Unique tour ID (used for localStorage key) */
  id: string;
  /** Tour steps */
  steps: TourStep[];
  /** Called when tour completes or is skipped */
  onComplete?: () => void;
}

// ─── Tour state (synced to server via saveToStorage hook) ─────────────

import { loadFromStorage, saveToStorage, STORAGE_KEYS } from '../storage/local-storage.js';

type TourState = Record<string, string>; // tourId → ISO date of completion

/** Migrate legacy per-tour localStorage keys (dsfr-data-tour-*) to unified TOURS key */
let _migrated = false;
function _migrateLegacyKeys(): void {
  if (_migrated) return;
  _migrated = true;
  const prefix = 'dsfr-data-tour-';
  const tourIds = ['builder', 'sources', 'builder-ia', 'builder-carto', 'playground', 'dashboard'];
  let migrated = false;
  const state = loadFromStorage<TourState>(STORAGE_KEYS.TOURS, {});
  for (const id of tourIds) {
    const val = localStorage.getItem(prefix + id);
    if (val && !state[id]) {
      state[id] = val;
      migrated = true;
    }
    if (val) localStorage.removeItem(prefix + id);
  }
  if (migrated) saveToStorage(STORAGE_KEYS.TOURS, state);
}

function _loadState(): TourState {
  _migrateLegacyKeys();
  return loadFromStorage<TourState>(STORAGE_KEYS.TOURS, {});
}

function _saveState(state: TourState): void {
  saveToStorage(STORAGE_KEYS.TOURS, state);
}

export function shouldShowTour(tourId: string): boolean {
  return !_loadState()[tourId];
}

export function markTourComplete(tourId: string): void {
  const state = _loadState();
  state[tourId] = new Date().toISOString();
  _saveState(state);
}

export function resetTour(tourId: string): void {
  const state = _loadState();
  delete state[tourId];
  _saveState(state);
}

/** Reset all tour completions (for testing/debug) */
export function resetAllTours(): void {
  _saveState({});
}

// ─── Tour engine ───────────────────────────────────────────────────────

let currentTour: TourConfig | null = null;
let currentStep = 0;
let overlayEl: HTMLElement | null = null;
let popoverEl: HTMLElement | null = null;

/**
 * Start a product tour. Creates overlay + popover, highlights first step.
 */
export function startTour(config: TourConfig): void {
  if (config.steps.length === 0) return;
  currentTour = config;
  currentStep = 0;

  createOverlay();
  showStep(0);
}

/**
 * Start a tour only if it hasn't been completed yet, or forced via ?tour=restart.
 * Handles the ?tour=restart URL parameter automatically (cleans up URL after use).
 */
export function startTourIfFirstVisit(config: TourConfig, delay = 600): void {
  const params = new URLSearchParams(window.location.search);
  if (params.get('tour') === 'restart') {
    // Remove query param without reload
    params.delete('tour');
    const clean = params.toString();
    const url = window.location.pathname + (clean ? '?' + clean : '') + window.location.hash;
    window.history.replaceState({}, '', url);
    resetTour(config.id);
    setTimeout(() => startTour(config), delay);
    return;
  }
  if (!shouldShowTour(config.id)) return;
  setTimeout(() => startTour(config), delay);
}

function createOverlay(): void {
  // Cleanup any existing tour
  cleanup();

  // Overlay (4 rects around the highlighted element)
  overlayEl = document.createElement('div');
  overlayEl.className = 'tour-overlay';
  overlayEl.innerHTML = `
    <div class="tour-overlay-top"></div>
    <div class="tour-overlay-left"></div>
    <div class="tour-overlay-right"></div>
    <div class="tour-overlay-bottom"></div>
  `;
  document.body.appendChild(overlayEl);

  // Popover
  popoverEl = document.createElement('div');
  popoverEl.className = 'tour-popover';
  popoverEl.setAttribute('role', 'dialog');
  popoverEl.setAttribute('aria-modal', 'false');
  document.body.appendChild(popoverEl);

  // Click on overlay = skip
  overlayEl.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).classList.contains('tour-overlay-top') ||
        (e.target as HTMLElement).classList.contains('tour-overlay-left') ||
        (e.target as HTMLElement).classList.contains('tour-overlay-right') ||
        (e.target as HTMLElement).classList.contains('tour-overlay-bottom')) {
      endTour();
    }
  });

  // Escape = skip
  document.addEventListener('keydown', handleEscape);
}

function handleEscape(e: KeyboardEvent): void {
  if (e.key === 'Escape') endTour();
}

function showStep(index: number): void {
  if (!currentTour || !popoverEl || !overlayEl) return;
  const step = currentTour.steps[index];
  if (!step) { endTour(); return; }

  // onBeforeShow hook (e.g. open collapsed section)
  if (step.onBeforeShow) {
    step.onBeforeShow();
    // Small delay to let DOM update
    requestAnimationFrame(() => requestAnimationFrame(() => positionStep(step, index)));
    return;
  }

  positionStep(step, index);
}

function positionStep(step: TourStep, index: number): void {
  if (!currentTour || !popoverEl || !overlayEl) return;

  const target = document.querySelector(step.selector) as HTMLElement | null;
  if (!target) {
    // Skip this step if element not found
    if (index < currentTour.steps.length - 1) {
      currentStep = index + 1;
      showStep(currentStep);
    } else {
      endTour();
    }
    return;
  }

  // Scroll target into view
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Wait for scroll to settle
  setTimeout(() => {
    if (!popoverEl || !overlayEl || !currentTour) return;

    const rect = target.getBoundingClientRect();
    const pad = 6;

    // Position overlay cutout (4 rects around target)
    const top = overlayEl.querySelector('.tour-overlay-top') as HTMLElement;
    const left = overlayEl.querySelector('.tour-overlay-left') as HTMLElement;
    const right = overlayEl.querySelector('.tour-overlay-right') as HTMLElement;
    const bottom = overlayEl.querySelector('.tour-overlay-bottom') as HTMLElement;

    top.style.cssText = `position:fixed;top:0;left:0;right:0;height:${rect.top - pad}px;`;
    left.style.cssText = `position:fixed;top:${rect.top - pad}px;left:0;width:${rect.left - pad}px;height:${rect.height + pad * 2}px;`;
    right.style.cssText = `position:fixed;top:${rect.top - pad}px;right:0;left:${rect.right + pad}px;height:${rect.height + pad * 2}px;`;
    bottom.style.cssText = `position:fixed;left:0;right:0;top:${rect.bottom + pad}px;bottom:0;`;

    // Determine step count
    const total = currentTour!.steps.length;
    const isLast = index === total - 1;
    const isFirst = index === 0;

    // Popover content
    popoverEl.innerHTML = `
      <div class="tour-popover-header">
        <span class="tour-popover-counter">${index + 1}/${total}</span>
        <button class="tour-popover-close" aria-label="Fermer" type="button">&times;</button>
      </div>
      <h4 class="tour-popover-title">${step.title}</h4>
      <p class="tour-popover-desc">${step.description}</p>
      <div class="tour-popover-footer">
        <button class="tour-popover-skip" type="button">Passer</button>
        <div class="tour-popover-nav">
          ${isFirst ? '' : '<button class="tour-popover-prev" type="button">Precedent</button>'}
          <button class="tour-popover-next" type="button">${isLast ? 'Terminer' : 'Suivant'}</button>
        </div>
      </div>
    `;

    // Bind buttons
    popoverEl.querySelector('.tour-popover-close')?.addEventListener('click', endTour);
    popoverEl.querySelector('.tour-popover-skip')?.addEventListener('click', endTour);
    popoverEl.querySelector('.tour-popover-prev')?.addEventListener('click', () => {
      currentStep = Math.max(0, currentStep - 1);
      showStep(currentStep);
    });
    popoverEl.querySelector('.tour-popover-next')?.addEventListener('click', () => {
      if (isLast) {
        endTour();
      } else {
        currentStep = index + 1;
        showStep(currentStep);
      }
    });

    // Position popover with auto-flip when overflowing viewport
    const pw = 340;
    const estimatedPopoverHeight = 180; // approximate popover height
    let pos = step.position || 'bottom';

    // Auto-flip: if preferred position overflows, try the opposite
    if (pos === 'bottom' && rect.bottom + pad + 8 + estimatedPopoverHeight > window.innerHeight) {
      pos = 'top';
    } else if (pos === 'top' && rect.top - pad - 8 - estimatedPopoverHeight < 0) {
      pos = 'bottom';
    } else if (pos === 'right' && rect.right + pad + 8 + pw > window.innerWidth) {
      pos = 'left';
    } else if (pos === 'left' && rect.left - pad - 8 - pw < 0) {
      pos = 'right';
    }

    let px: number, py: number;

    if (pos === 'bottom') {
      px = rect.left + rect.width / 2 - pw / 2;
      py = rect.bottom + pad + 8;
    } else if (pos === 'top') {
      px = rect.left + rect.width / 2 - pw / 2;
      py = rect.top - pad - 8;
    } else if (pos === 'right') {
      px = rect.right + pad + 8;
      py = rect.top;
    } else {
      px = rect.left - pad - pw - 8;
      py = rect.top;
    }

    // Keep in viewport horizontally
    px = Math.max(12, Math.min(px, window.innerWidth - pw - 12));

    popoverEl.style.left = `${px}px`;
    popoverEl.style.width = `${pw}px`;

    if (pos === 'top') {
      // Position above: use bottom anchor so popover grows upward
      popoverEl.style.bottom = `${window.innerHeight - py}px`;
      popoverEl.style.top = 'auto';
    } else {
      // Position below/side: clamp to viewport bottom
      py = Math.max(12, Math.min(py, window.innerHeight - estimatedPopoverHeight - 12));
      popoverEl.style.top = `${py}px`;
      popoverEl.style.bottom = 'auto';
    }

    popoverEl.style.display = 'block';
    popoverEl.classList.add('tour-popover-visible');
  }, 350);
}

function endTour(): void {
  if (currentTour) {
    markTourComplete(currentTour.id);
    currentTour.onComplete?.();
  }
  cleanup();
  currentTour = null;
  currentStep = 0;
}

function cleanup(): void {
  overlayEl?.remove();
  popoverEl?.remove();
  overlayEl = null;
  popoverEl = null;
  document.removeEventListener('keydown', handleEscape);
}

// ─── Inject CSS (once) ─────────────────────────────────────────────────

let cssInjected = false;

export function injectTourStyles(): void {
  if (cssInjected) return;
  cssInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .tour-overlay {
      position: fixed;
      inset: 0;
      z-index: 9998;
      pointer-events: none;
    }
    .tour-overlay-top,
    .tour-overlay-left,
    .tour-overlay-right,
    .tour-overlay-bottom {
      position: fixed;
      background: rgba(0, 0, 0, 0.5);
      pointer-events: auto;
      transition: all 0.3s ease;
    }
    .tour-popover {
      position: fixed;
      z-index: 9999;
      background: var(--background-default-grey, #fff);
      border: 1px solid var(--border-default-grey, #ddd);
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
      padding: 1rem 1.25rem;
      display: none;
      animation: tour-fade-in 0.25s ease;
      font-family: Marianne, arial, sans-serif;
    }
    @keyframes tour-fade-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .tour-popover-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }
    .tour-popover-counter {
      font-size: 0.75rem;
      color: var(--text-mention-grey, #666);
      background: var(--background-alt-grey, #f0f0f0);
      padding: 0.15rem 0.5rem;
      border-radius: 10px;
    }
    .tour-popover-close {
      background: none;
      border: none;
      font-size: 1.25rem;
      cursor: pointer;
      color: var(--text-mention-grey, #666);
      padding: 0 0.25rem;
      line-height: 1;
    }
    .tour-popover-close:hover { color: var(--text-default-grey, #333); }
    .tour-popover-title {
      margin: 0 0 0.5rem;
      font-size: 1rem;
      font-weight: 700;
      color: var(--text-title-grey, #161616);
    }
    .tour-popover-desc {
      margin: 0 0 1rem;
      font-size: 0.875rem;
      line-height: 1.5;
      color: var(--text-default-grey, #3a3a3a);
    }
    .tour-popover-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .tour-popover-nav {
      display: flex;
      gap: 0.5rem;
    }
    .tour-popover-skip {
      background: none;
      border: none;
      font-size: 0.8rem;
      color: var(--text-mention-grey, #666);
      cursor: pointer;
      padding: 0.25rem 0;
      text-decoration: underline;
    }
    .tour-popover-skip:hover { color: var(--text-default-grey, #333); }
    .tour-popover-prev {
      padding: 0.35rem 0.75rem;
      border: 1px solid var(--border-default-grey, #ddd);
      border-radius: 4px;
      background: var(--background-default-grey, #fff);
      color: var(--text-default-grey, #3a3a3a);
      cursor: pointer;
      font-size: 0.8rem;
    }
    .tour-popover-prev:hover { background: var(--background-alt-grey, #f0f0f0); }
    .tour-popover-next {
      padding: 0.35rem 0.75rem;
      border: none;
      border-radius: 4px;
      background: var(--background-action-high-blue-france, #000091);
      color: #fff;
      cursor: pointer;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .tour-popover-next:hover { background: var(--background-action-high-blue-france-hover, #1212ff); }
  `;
  document.head.appendChild(style);
}
