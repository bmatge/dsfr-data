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
let confirmSeq = 0;

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
    .confirm-dialog-title {
      margin: 0 0 0.75rem;
      font-size: 1.25rem;
      line-height: 1.75rem;
      color: var(--text-title-grey, #161616);
    }
    /* Primaire « danger » (le DSFR n'a pas de variante) : tokens error. */
    .fr-btn.confirm-dialog-danger {
      background-color: var(--background-flat-error, #ce0500);
      color: var(--text-inverted-error, #fff);
    }
    .fr-btn.confirm-dialog-danger:hover {
      background-color: var(--background-flat-error-hover, #a00000);
    }
    .fr-btn.confirm-dialog-danger:active {
      background-color: var(--background-flat-error-active, #7a0000);
    }
  `;
  document.head.appendChild(style);
}

export interface ConfirmDialogOptions {
  /** Titre de la boîte (h2). Par défaut : le message seul. */
  title?: string;
  /** Libellé du bouton de confirmation. Par défaut : « Supprimer » si `danger`, sinon « Confirmer ». */
  confirmLabel?: string;
  /** Libellé du bouton d'annulation. Par défaut « Annuler ». */
  cancelLabel?: string;
  /**
   * Action destructive : confirmation en primaire **danger**, focus initial sur
   * Annuler (docs/ux/actions.md §8, audit B7). Déduit du message quand il
   * commence par Supprimer / Retirer / Révoquer / Effacer.
   */
  danger?: boolean;
}

const DESTRUCTIVE_VERB = /^(supprimer|retirer|révoquer|revoquer|effacer|purger)\b/i;

/**
 * ConfirmDialog — remplaçant DSFR de confirm() (lot UX 6, #543).
 *
 * `role="alertdialog"`, `aria-modal`, titre relié par `aria-labelledby`,
 * message par `aria-describedby`. Le bouton de confirmation porte le verbe de
 * l'action ; pour une action destructive il est en primaire danger et le
 * **focus initial va sur Annuler**. Échap et le clic hors de la boîte annulent ;
 * le focus revient à l'élément déclencheur.
 *
 * Resolves to true (confirm) or false (cancel).
 */
export function confirmDialog(
  message: string,
  options: ConfirmDialogOptions = {}
): Promise<boolean> {
  injectConfirmStyles();
  const danger = options.danger ?? DESTRUCTIVE_VERB.test(message.trim());
  const verb = message.trim().match(DESTRUCTIVE_VERB)?.[0];
  const confirmLabel =
    options.confirmLabel ??
    (danger && verb ? verb.charAt(0).toUpperCase() + verb.slice(1).toLowerCase() : 'Confirmer');
  const seq = ++confirmSeq;
  const previouslyFocused = document.activeElement as HTMLElement | null;

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-dialog-overlay';
    const content = document.createElement('div');
    content.className = 'confirm-dialog-content';
    content.setAttribute('role', 'alertdialog');
    content.setAttribute('aria-modal', 'true');
    content.tabIndex = -1;

    if (options.title) {
      const titleEl = document.createElement('h2');
      titleEl.className = 'confirm-dialog-title';
      titleEl.id = `confirm-dialog-title-${seq}`;
      titleEl.textContent = options.title;
      content.append(titleEl);
      content.setAttribute('aria-labelledby', titleEl.id);
    }
    const messageEl = document.createElement('p');
    messageEl.id = `confirm-dialog-message-${seq}`;
    messageEl.textContent = message;
    content.setAttribute(options.title ? 'aria-describedby' : 'aria-labelledby', messageEl.id);

    const actions = document.createElement('div');
    actions.className = 'confirm-dialog-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'fr-btn fr-btn--secondary';
    cancelBtn.dataset.action = 'cancel';
    cancelBtn.textContent = options.cancelLabel ?? 'Annuler';
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = danger ? 'fr-btn confirm-dialog-danger' : 'fr-btn';
    confirmBtn.dataset.action = 'confirm';
    confirmBtn.textContent = confirmLabel;
    actions.append(cancelBtn, confirmBtn);
    content.append(messageEl, actions);
    overlay.append(content);

    const cleanup = (result: boolean) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      // Retour du focus au déclencheur — ou à son remplaçant de même id si
      // l'app a re-rendu son panneau entre-temps.
      const target =
        previouslyFocused && previouslyFocused.isConnected
          ? previouslyFocused
          : previouslyFocused?.id
            ? document.getElementById(previouslyFocused.id)
            : null;
      target?.focus?.();
      resolve(result);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Capturé avant les écouteurs de l'app (fermeture de panneau, etc.).
        e.preventDefault();
        e.stopPropagation();
        cleanup(false);
        return;
      }
      // Focus piégé dans la boîte (deux boutons).
      if (e.key === 'Tab') {
        const focusables = [cancelBtn, confirmBtn];
        const idx = focusables.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.shiftKey
          ? focusables[(idx - 1 + focusables.length) % focusables.length]
          : focusables[(idx + 1) % focusables.length];
        e.preventDefault();
        next.focus();
      }
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

    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);

    // Destructif : le focus initial va sur Annuler ; sinon sur la confirmation.
    (danger ? cancelBtn : confirmBtn).focus();
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
