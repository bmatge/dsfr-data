/**
 * Simple modal state management helpers
 */

/**
 * Open a modal by adding the 'active' class
 */
export function openModal(id: string): void {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('active');
  }
}

/**
 * Close a modal by removing the 'active' class
 */
export function closeModal(id: string): void {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('active');
  }
}

/**
 * Setup click-outside-to-close behavior on a modal overlay
 */
export function setupModalOverlayClose(id: string): void {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('click', (e: Event) => {
      if ((e.target as HTMLElement).id === id) {
        closeModal(id);
      }
    });
  }
}

let confirmStyleInjected = false;

function injectConfirmStyles(): void {
  if (confirmStyleInjected) return;
  confirmStyleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .confirm-dialog-overlay {
      display: flex;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 10000;
      align-items: center;
      justify-content: center;
    }
    .confirm-dialog-content {
      background: var(--background-default-grey, white);
      padding: 2rem;
      border-radius: 8px;
      max-width: 400px;
      width: 90%;
    }
    .confirm-dialog-content p {
      margin: 0 0 1.5rem;
      color: var(--text-default-grey, #333);
    }
    .confirm-dialog-content label {
      display: block;
      margin: 0 0 0.5rem;
      color: var(--text-default-grey, #333);
      font-weight: 500;
    }
    .confirm-dialog-content input.prompt-dialog-input {
      width: 100%;
      padding: 0.5rem 0.75rem;
      margin-bottom: 1.5rem;
      border: 1px solid var(--border-default-grey, #ccc);
      border-radius: 4px;
      font: inherit;
    }
    .confirm-dialog-actions {
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
    }
  `;
  document.head.appendChild(style);
}

/**
 * DSFR-styled replacement for native confirm().
 * Returns a Promise that resolves to true (confirm) or false (cancel).
 */
export function confirmDialog(message: string): Promise<boolean> {
  injectConfirmStyles();

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-dialog-overlay';
    const content = document.createElement('div');
    content.className = 'confirm-dialog-content';
    const messageEl = document.createElement('p');
    messageEl.textContent = message;
    const actions = document.createElement('div');
    actions.className = 'confirm-dialog-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'fr-btn fr-btn--secondary';
    cancelBtn.dataset.action = 'cancel';
    cancelBtn.textContent = 'Annuler';
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'fr-btn';
    confirmBtn.dataset.action = 'confirm';
    confirmBtn.textContent = 'Confirmer';
    actions.append(cancelBtn, confirmBtn);
    content.append(messageEl, actions);
    overlay.append(content);

    const cleanup = (result: boolean) => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(result);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cleanup(false);
    };

    overlay.addEventListener('click', (e: Event) => {
      const target = e.target as HTMLElement;
      if (target === overlay) {
        cleanup(false);
        return;
      }
      const action = target.dataset.action;
      if (action === 'confirm') cleanup(true);
      else if (action === 'cancel') cleanup(false);
    });

    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);

    // Focus the confirm button for keyboard accessibility
    confirmBtn.focus();
  });
}

export interface PromptDialogOptions {
  /** Visible label above the input field. Defaults to the same as `message`. */
  label?: string;
  /** Input placeholder. */
  placeholder?: string;
  /** Confirm button label. Defaults to "Valider". */
  confirmLabel?: string;
  /** Cancel button label. Defaults to "Annuler". */
  cancelLabel?: string;
}

/**
 * DSFR-styled replacement for native prompt().
 * Resolves to the entered string, or null if the user cancelled (Escape, click outside, Cancel button).
 * An empty string is treated as a cancellation.
 */
export function promptDialog(
  message: string,
  defaultValue: string = '',
  options: PromptDialogOptions = {}
): Promise<string | null> {
  injectConfirmStyles();

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-dialog-overlay';
    const content = document.createElement('div');
    content.className = 'confirm-dialog-content';
    const messageEl = document.createElement('p');
    messageEl.textContent = message;
    const labelEl = document.createElement('label');
    const inputId = `prompt-dialog-input-${Date.now()}`;
    labelEl.htmlFor = inputId;
    labelEl.textContent = options.label ?? '';
    const inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.id = inputId;
    inputEl.className = 'prompt-dialog-input';
    inputEl.value = defaultValue;
    if (options.placeholder) inputEl.placeholder = options.placeholder;
    const actions = document.createElement('div');
    actions.className = 'confirm-dialog-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'fr-btn fr-btn--secondary';
    cancelBtn.dataset.action = 'cancel';
    cancelBtn.textContent = options.cancelLabel ?? 'Annuler';
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'fr-btn';
    confirmBtn.dataset.action = 'confirm';
    confirmBtn.textContent = options.confirmLabel ?? 'Valider';
    actions.append(cancelBtn, confirmBtn);
    if (options.label) content.append(messageEl, labelEl, inputEl, actions);
    else content.append(messageEl, inputEl, actions);
    overlay.append(content);

    const cleanup = (result: string | null) => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(result);
    };

    const submit = () => {
      const value = inputEl.value.trim();
      cleanup(value || null);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cleanup(null);
      else if (e.key === 'Enter' && document.activeElement === inputEl) {
        e.preventDefault();
        submit();
      }
    };

    overlay.addEventListener('click', (e: Event) => {
      const target = e.target as HTMLElement;
      if (target === overlay) {
        cleanup(null);
        return;
      }
      const action = target.dataset.action;
      if (action === 'confirm') submit();
      else if (action === 'cancel') cleanup(null);
    });

    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);

    // Focus and select the input for immediate editing
    inputEl.focus();
    inputEl.select();
  });
}
