/**
 * Anonymous public-view page (issue #148).
 *
 * Reads ?token=... from the URL, fetches /api/public/share/:token, and renders
 * the favorite's stored code in a sandboxed iframe — same path as the
 * authenticated favorites preview.
 *
 * No auth, no localStorage of user data, no header/sidebar : intentionally
 * minimal so the page can be embedded or shared at face value.
 */

import { getPreviewHTML, escapeHtml } from '@dsfr-data/shared';

interface SharedFavorite {
  resourceType: 'favorite';
  name: string;
  chartType: string | null;
  code: string;
}

function getToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  const t = params.get('token');
  if (!t) return null;
  // UUID v4 sanity check matching the server filter — avoid sending obvious
  // garbage to the API.
  return /^[0-9a-f-]{32,40}$/i.test(t) ? t : null;
}

function showEmptyState(icon: string, message: string): void {
  const content = document.getElementById('public-view-content');
  if (!content) return;
  content.innerHTML = `
    <div class="public-view-empty">
      <i class="${icon}" aria-hidden="true"></i>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function setTitle(title: string): void {
  const el = document.getElementById('public-view-title');
  if (el) el.textContent = title;
  document.title = `${title} \u2014 dsfr-data`;
}

async function load(): Promise<void> {
  const token = getToken();
  if (!token) {
    setTitle('Lien invalide');
    showEmptyState('ri-error-warning-line', 'Le lien de partage est manquant ou mal forme.');
    return;
  }

  let res: Response;
  try {
    res = await fetch(`/api/public/share/${encodeURIComponent(token)}`, {
      // Public endpoint — no credentials needed, but explicitly omit to
      // prevent leaking auth cookies to the public route by accident.
      credentials: 'omit',
    });
  } catch {
    setTitle('Erreur reseau');
    showEmptyState('ri-wifi-off-line', 'Impossible de joindre le serveur. Reessayez plus tard.');
    return;
  }

  if (res.status === 404) {
    setTitle('Lien introuvable');
    showEmptyState('ri-link-unlink-m', "Ce lien n'existe pas ou a ete supprime.");
    return;
  }
  if (res.status === 410) {
    const body = (await res.json().catch(() => ({}))) as { code?: string };
    const message =
      body.code === 'EXPIRED'
        ? 'Ce lien a expire.'
        : body.code === 'REVOKED'
          ? 'Ce lien a ete revoque par son auteur.'
          : "Le contenu partage n'est plus disponible.";
    setTitle('Lien indisponible');
    showEmptyState('ri-time-line', message);
    return;
  }
  if (!res.ok) {
    setTitle('Erreur');
    showEmptyState('ri-error-warning-line', 'Erreur lors du chargement du contenu partage.');
    return;
  }

  const fav = (await res.json()) as SharedFavorite;
  setTitle(fav.name || 'Vue partagee');

  const content = document.getElementById('public-view-content');
  if (!content) return;
  content.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.className = 'public-view-frame';
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  iframe.title = fav.name || 'Vue partagee';
  iframe.srcdoc = getPreviewHTML(fav.code);
  content.appendChild(iframe);
}

document.addEventListener('DOMContentLoaded', () => {
  void load();
});
