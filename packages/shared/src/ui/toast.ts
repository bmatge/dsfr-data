/**
 * DSFR toast notification system
 * Uses fr-alert classes for consistent styling
 */

type ToastType = 'success' | 'error' | 'warning' | 'info';

const CONTAINER_ID = 'dsfr-data-toast-container';
const DEFAULT_DURATION = 5000;

function getOrCreateContainer(): HTMLElement {
  let container = document.getElementById(CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = CONTAINER_ID;
    container.setAttribute('aria-live', 'polite');
    container.style.cssText =
      'position:fixed;top:5rem;right:1rem;z-index:10000;display:flex;flex-direction:column;gap:0.5rem;max-width:400px;';
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(
  message: string,
  type: ToastType = 'info',
  duration: number = DEFAULT_DURATION
): void {
  const container = getOrCreateContainer();

  const toast = document.createElement('div');
  toast.className = `fr-alert fr-alert--${type} fr-alert--sm`;
  // Les fr-alert DSFR sont concues pour vivre DANS la page (fond transparent
  // + lisere colore). En toast flottant, le contenu du dessous transparait :
  // on leur donne un fond opaque et une ombre de carte flottante.
  // Deux affectations : le blanc concret d'abord (survit aux moteurs CSS qui
  // rejettent var(), jsdom des tests inclus), le token theme ensuite (gagne
  // dans les navigateurs, suit le mode sombre).
  toast.style.backgroundColor = '#fff';
  toast.style.backgroundColor = 'var(--background-default-grey, #fff)';
  toast.style.boxShadow = '0 2px 6px rgba(0, 0, 18, 0.16)';
  if (type === 'error') {
    toast.setAttribute('role', 'alert');
  }

  const p = document.createElement('p');
  p.textContent = message;
  toast.appendChild(p);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'fr-btn--close fr-btn';
  closeBtn.setAttribute('aria-label', 'Fermer le message');
  closeBtn.addEventListener('click', () => remove());
  toast.appendChild(closeBtn);

  container.appendChild(toast);

  const timer = setTimeout(() => remove(), duration);

  function remove() {
    clearTimeout(timer);
    toast.remove();
  }
}

export function toastSuccess(message: string, duration?: number): void {
  showToast(message, 'success', duration);
}

export function toastError(message: string, duration?: number): void {
  showToast(message, 'error', duration);
}

export function toastWarning(message: string, duration?: number): void {
  showToast(message, 'warning', duration);
}

export function toastInfo(message: string, duration?: number): void {
  showToast(message, 'info', duration);
}
