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
    overlay.innerHTML = `
      <div class="confirm-dialog-content">
        <p>${message}</p>
        <div class="confirm-dialog-actions">
          <button class="fr-btn fr-btn--secondary" data-action="cancel">Annuler</button>
          <button class="fr-btn" data-action="confirm">Confirmer</button>
        </div>
      </div>
    `;

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
      if (target === overlay) { cleanup(false); return; }
      const action = target.dataset.action;
      if (action === 'confirm') cleanup(true);
      else if (action === 'cancel') cleanup(false);
    });

    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);

    // Focus the confirm button for keyboard accessibility
    const confirmBtn = overlay.querySelector<HTMLElement>('[data-action="confirm"]');
    confirmBtn?.focus();
  });
}
