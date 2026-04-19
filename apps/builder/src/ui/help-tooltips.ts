/**
 * Help tooltip system for the Builder.
 * Shows contextual popover help when clicking on "?" icons.
 * Also manages the preview empty state step indicators.
 */

import { TOOLTIPS } from './help-texts.js';
import { updateProgress } from './progress-indicator.js';

let activePopover: HTMLElement | null = null;
let activeBtn: HTMLElement | null = null;

/**
 * Initialize the help tooltip system.
 * Listens for clicks on .help-btn elements and shows/hides the popover.
 */
export function initHelpTooltips(): void {
  const popover = document.getElementById('help-popover');
  if (!popover) return;

  // Delegate click on all help buttons
  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.help-btn') as HTMLElement | null;

    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      const key = btn.dataset.help as keyof typeof TOOLTIPS;
      if (!key || !(key in TOOLTIPS)) return;

      // Toggle: if same button, close
      if (activeBtn === btn) {
        hidePopover();
        return;
      }

      showPopover(btn, TOOLTIPS[key]);
      return;
    }

    // Click outside: close
    if (activePopover && !popover.contains(e.target as Node)) {
      hidePopover();
    }
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activePopover) {
      hidePopover();
    }
  });
}

function showPopover(btn: HTMLElement, text: string): void {
  const popover = document.getElementById('help-popover');
  const content = document.getElementById('help-popover-content');
  if (!popover || !content) return;

  content.textContent = text;
  popover.style.display = 'block';

  // Position relative to button
  const rect = btn.getBoundingClientRect();
  const popW = popover.offsetWidth;
  const popH = popover.offsetHeight;

  // Prefer below-right, but stay in viewport
  let top = rect.bottom + 6;
  let left = rect.left;

  // Adjust if overflowing right
  if (left + popW > window.innerWidth - 16) {
    left = window.innerWidth - popW - 16;
  }
  // Adjust if overflowing left
  if (left < 16) left = 16;

  // If not enough space below, show above
  if (top + popH > window.innerHeight - 16) {
    top = rect.top - popH - 6;
  }

  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;

  activePopover = popover;
  activeBtn = btn;
}

function hidePopover(): void {
  const popover = document.getElementById('help-popover');
  if (popover) popover.style.display = 'none';
  activePopover = null;
  activeBtn = null;
}

/**
 * Update the preview empty state steps (checkmarks), the top stepper,
 * section indicators and the Generate button sub-text.
 *
 * Backwards-compatible alias for `updateProgress()` — many call sites across
 * the Builder still use this name.
 */
export function updatePreviewSteps(): void {
  updateProgress();
}
