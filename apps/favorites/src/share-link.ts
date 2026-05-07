/**
 * Public share link helpers (issue #148).
 *
 * Wraps the /api/shares endpoints with the auth + CSRF flow used elsewhere in
 * the app, and exposes the modal state machine consumed by main.ts.
 */

import { authenticatedFetch, openModal, closeModal, toastSuccess } from '@dsfr-data/shared';

export interface PublicShare {
  id: string; // = token
  resource_id: string;
  expires_at: string | null;
  revoked_at: string | null;
}

/**
 * Build the public view URL given a token. Uses the current origin so that the
 * URL stays consistent when the app is deployed under various domains.
 */
export function buildPublicShareUrl(token: string): string {
  // The favorites app sits at /apps/favorites/ — the public view page is a
  // sibling at /apps/favorites/public-view.html. window.location works because
  // this code only ever runs in the favorites app context.
  const url = new URL('public-view.html', window.location.href);
  url.searchParams.set('token', token);
  return url.toString();
}

/**
 * Look for an existing, non-revoked, non-expired public share for the given
 * favorite. Returns null if none. Used to surface "you already shared this"
 * before creating a new token.
 */
export async function findActivePublicShare(favoriteId: string): Promise<PublicShare | null> {
  const res = await authenticatedFetch(
    `/api/shares?resource_type=favorite&resource_id=${encodeURIComponent(favoriteId)}`
  );
  if (!res.ok) return null;
  const list = (await res.json()) as PublicShare[];
  const now = Date.now();
  return (
    list.find(
      (s) =>
        (s as { target_type?: string }).target_type === 'public' &&
        !s.revoked_at &&
        (!s.expires_at || new Date(s.expires_at).getTime() > now)
    ) ?? null
  );
}

/**
 * Create a new public share for a favorite. Returns the share row including
 * its id (the token). Throws if the server refuses.
 */
export async function createPublicShare(
  favoriteId: string,
  options: { expiresAt?: string } = {}
): Promise<PublicShare> {
  const res = await authenticatedFetch('/api/shares', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resource_type: 'favorite',
      resource_id: favoriteId,
      target_type: 'public',
      expires_at: options.expiresAt,
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    const e = new Error(err.error ?? `HTTP ${res.status}`);
    (e as Error & { code?: string }).code = err.code;
    throw e;
  }
  return (await res.json()) as PublicShare;
}

export async function revokePublicShare(token: string): Promise<void> {
  const res = await authenticatedFetch(`/api/shares/${encodeURIComponent(token)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
}

// ---- Modal state machine -----------------------------------------------

type ModalState = 'loading' | 'active' | 'error';

function showState(state: ModalState): void {
  for (const s of ['loading', 'active', 'error'] as const) {
    const el = document.getElementById(`share-modal-state-${s}`);
    if (el) (el as HTMLElement).hidden = s !== state;
  }
}

function setActiveShare(share: PublicShare): void {
  const url = buildPublicShareUrl(share.id);
  const input = document.getElementById('share-public-url') as HTMLInputElement | null;
  if (input) input.value = url;

  const hint = document.getElementById('share-expiration-hint');
  if (hint) {
    if (share.expires_at) {
      const d = new Date(share.expires_at);
      hint.textContent = `Expire le ${d.toLocaleDateString('fr-FR')} a ${d.toLocaleTimeString(
        'fr-FR',
        { hour: '2-digit', minute: '2-digit' }
      )}.`;
    } else {
      hint.textContent = 'Aucune date d\u2019expiration.';
    }
  }
  showState('active');
}

function setError(message: string): void {
  const el = document.getElementById('share-error-message');
  if (el) el.textContent = message;
  showState('error');
}

/**
 * Open the share modal for a given favorite. Reuses an existing active share
 * if present, otherwise creates a new one. Wires up the copy / revoke / close
 * buttons for the lifetime of this modal opening.
 */
export async function openShareModal(favoriteId: string): Promise<void> {
  let currentShare: PublicShare | null = null;

  showState('loading');
  openModal('share-modal');

  try {
    currentShare =
      (await findActivePublicShare(favoriteId)) ?? (await createPublicShare(favoriteId));
    setActiveShare(currentShare);
  } catch (err) {
    const code = (err as Error & { code?: string }).code;
    const message =
      code === 'PRIVATE_SOURCE_NOT_SUPPORTED'
        ? 'Ce favori utilise une source privee (clef API). Le partage public ne supporte pas encore les sources privees \u2014 voir le ticket de suivi.'
        : (err as Error).message || 'Erreur lors de la generation du lien.';
    setError(message);
  }

  // ---- Wire up buttons (idempotent: replace listeners every open) ----

  const copyBtn = document.getElementById('share-copy-btn') as HTMLButtonElement | null;
  if (copyBtn) {
    const fresh = copyBtn.cloneNode(true) as HTMLButtonElement;
    copyBtn.replaceWith(fresh);
    fresh.addEventListener('click', () => {
      const input = document.getElementById('share-public-url') as HTMLInputElement | null;
      if (!input) return;
      navigator.clipboard.writeText(input.value).then(() => {
        toastSuccess('Lien copie dans le presse-papiers');
      });
    });
  }

  const revokeBtn = document.getElementById('share-revoke-btn') as HTMLButtonElement | null;
  if (revokeBtn) {
    const fresh = revokeBtn.cloneNode(true) as HTMLButtonElement;
    revokeBtn.replaceWith(fresh);
    fresh.addEventListener('click', async () => {
      if (!currentShare) return;
      try {
        await revokePublicShare(currentShare.id);
        closeModal('share-modal');
        toastSuccess('Lien public revoque');
      } catch {
        setError('Impossible de revoquer le lien.');
      }
    });
  }

  for (const id of ['share-close-btn', 'share-error-close-btn']) {
    const btn = document.getElementById(id);
    if (btn) {
      const fresh = btn.cloneNode(true) as HTMLButtonElement;
      btn.replaceWith(fresh);
      fresh.addEventListener('click', () => closeModal('share-modal'));
    }
  }
}
