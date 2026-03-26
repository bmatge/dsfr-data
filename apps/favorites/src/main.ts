/**
 * Favorites app - main entry point
 */

import { escapeHtml, formatDateShort, openModal, closeModal, setupModalOverlayClose, toastInfo, toastSuccess, toastError, loadFromStorage, saveToStorage, STORAGE_KEYS, appHref, navigateTo, initAuth, getApiAdapter } from '@dsfr-data/shared';
import { loadFavorites, saveFavorites, deleteFavorite, findFavorite } from './favorites-manager.js';
import type { Favorite } from './favorites-manager.js';
import { getPreviewHTML } from './preview.js';

// State (re-loaded after initAuth in DOMContentLoaded)
let favorites = loadFavorites();
let selectedId: string | null = null;
let deleteTargetId: string | null = null;
let currentSort = 'date-desc';

function sortFavorites(favs: Favorite[], sortBy: string): Favorite[] {
  const sorted = [...favs];
  switch (sortBy) {
    case 'date-desc': return sorted.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    case 'date-asc': return sorted.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    case 'name-asc': return sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    case 'type': return sorted.sort((a, b) => (a.chartType || '').localeCompare(b.chartType || ''));
    default: return sorted;
  }
}

function exportFavorites(): void {
  const favs = loadFromStorage(STORAGE_KEYS.FAVORITES, []);
  const blob = new Blob([JSON.stringify(favs, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'dsfr-data-favoris.json';
  a.click();
  URL.revokeObjectURL(url);
  toastSuccess('Favoris exportes');
}

function importFavorites(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result as string);
        if (!Array.isArray(imported)) throw new Error('Format invalide');
        const existing = loadFromStorage<Favorite[]>(STORAGE_KEYS.FAVORITES, []);
        const merged = [...existing, ...imported.filter((imp: Favorite) => !existing.some((e: Favorite) => e.id === imp.id))];
        saveToStorage(STORAGE_KEYS.FAVORITES, merged);
        toastSuccess(`${imported.length} favoris importes`);
        window.location.reload();
      } catch {
        toastError('Fichier invalide');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function renderSidebar(): void {
  const listEl = document.getElementById('favorites-list');
  const countEl = document.getElementById('favorites-count');
  if (!listEl || !countEl) return;

  countEl.textContent = String(favorites.length);

  if (favorites.length === 0) {
    listEl.innerHTML = `
      <div class="empty-sidebar">
        <i class="ri-star-line"></i>
        <p>Aucun favori enregistre</p>
        <p class="fr-text--sm">Creez un graphique dans le Builder ou Playground, puis sauvegardez-le en favori.</p>
        <a href="${appHref('builder')}" class="fr-btn fr-btn--sm fr-btn--secondary fr-mt-1w"><i class="ri-bar-chart-box-line"></i> Ouvrir le Builder</a>
      </div>
    `;
    return;
  }

  const sorted = sortFavorites(favorites, currentSort);

  const searchTerm = (document.getElementById('fav-search') as HTMLInputElement | null)?.value?.toLowerCase() || '';
  const filtered = searchTerm
    ? sorted.filter(fav => fav.name.toLowerCase().includes(searchTerm))
    : sorted;

  listEl.innerHTML = filtered.map(fav => `
    <div class="favorite-item ${selectedId === fav.id ? 'active' : ''}"
         data-id="${fav.id}"
         onclick="selectFavorite('${fav.id}')">
      <div class="favorite-item-name" style="display: flex; align-items: center; gap: 0.25rem;">
        <span id="fav-name-${fav.id}" style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(fav.name)}</span>
        <button class="fr-btn fr-btn--sm fr-btn--tertiary-no-outline" style="padding: 0; min-height: 0; width: 1.5rem; height: 1.5rem; flex-shrink: 0;"
                onclick="event.stopPropagation(); renameFavorite('${fav.id}')" title="Renommer">
          <i class="ri-pencil-line" aria-hidden="true" style="font-size: 0.875rem;"></i>
        </button>
      </div>
      <div class="favorite-item-meta">
        <span class="favorite-item-type">${fav.chartType || 'chart'}</span>
        <span>${formatDateShort(fav.createdAt)}</span>
        <span>${fav.source || 'builder'}</span>
      </div>
    </div>
  `).join('');
}

function renderContent(): void {
  const contentEl = document.getElementById('main-content');
  if (!contentEl) return;

  if (!selectedId) {
    contentEl.innerHTML = `
      <div class="empty-content">
        <i class="ri-bar-chart-box-line"></i>
        <h2>Selectionnez un favori</h2>
        <p>Choisissez un favori dans la liste de gauche pour voir son apercu et son code.</p>
        ${favorites.length === 0 ? `
          <a href="${appHref('builder')}" class="fr-btn fr-btn--icon-left fr-icon-add-line">
            Creer un graphique
          </a>
        ` : ''}
      </div>
    `;
    return;
  }

  const fav = findFavorite(favorites, selectedId);
  if (!fav) {
    selectedId = null;
    renderContent();
    return;
  }

  contentEl.innerHTML = `
    <div class="content-header">
      <h1>
        <i class="ri-star-fill" style="color: var(--text-action-high-blue-france);" aria-hidden="true"></i>
        ${escapeHtml(fav.name)}
      </h1>
      <div class="content-actions">
        <button class="fr-btn fr-btn--sm fr-btn--secondary fr-btn--icon-left fr-icon-code-s-slash-line"
                onclick="openInPlayground('${fav.id}')">
          Playground
        </button>
        <button class="fr-btn fr-btn--sm fr-btn--secondary fr-btn--icon-left fr-icon-tools-line"
                onclick="openInBuilder('${fav.id}')">
          Builder
        </button>
        <button class="fr-btn fr-btn--sm fr-btn--icon-left fr-icon-clipboard-line"
                onclick="copyCode('${fav.id}')">
          Copier le code
        </button>
        <button class="fr-btn fr-btn--sm fr-btn--tertiary-no-outline fr-icon-delete-line"
                onclick="showDeleteModal('${fav.id}')"
                title="Supprimer">
        </button>
      </div>
    </div>
    <div class="content-body">
      <div class="preview-section">
        <iframe id="preview-frame" class="preview-frame" sandbox="allow-scripts allow-same-origin"></iframe>
      </div>
      <div class="code-section">
        <div class="code-header">
          <span>Code HTML/JS</span>
          <span class="fr-text--sm">${fav.source || 'builder'} - ${formatDateShort(fav.createdAt)}</span>
        </div>
        <pre id="code-display">${escapeHtml(fav.code)}</pre>
      </div>
    </div>
  `;

  // Load preview in iframe
  setTimeout(() => {
    const iframe = document.getElementById('preview-frame') as HTMLIFrameElement | null;
    if (iframe) {
      iframe.srcdoc = getPreviewHTML(fav.code);
    }
  }, 50);
}

function selectFavorite(id: string): void {
  selectedId = id;
  renderSidebar();
  renderContent();
}

function openInPlayground(id: string): void {
  const fav = findFavorite(favorites, id);
  if (fav) {
    sessionStorage.setItem('playground-code', fav.code);
    navigateTo('playground', { from: 'favorites' });
  }
}

function openInBuilder(id: string): void {
  const fav = findFavorite(favorites, id);
  if (fav) {
    if (fav.builderState) {
      sessionStorage.setItem('builder-state', JSON.stringify(fav.builderState));
      navigateTo('builder', { from: 'favorites' });
    } else {
      toastInfo('Ce favori a ete cree avant la mise a jour. Il sera ouvert dans le Playground.');
      sessionStorage.setItem('playground-code', fav.code);
      navigateTo('playground', { from: 'favorites' });
    }
  }
}

function copyCode(id: string): void {
  const fav = findFavorite(favorites, id);
  if (fav) {
    navigator.clipboard.writeText(fav.code).then(() => {
      const btn = document.querySelector(`[onclick="copyCode('${id}')"]`);
      if (btn) {
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="ri-check-line" aria-hidden="true"></i> Copie !';
        setTimeout(() => { btn.innerHTML = originalText; }, 2000);
      }
    });
  }
}

function renameFavorite(id: string): void {
  const fav = findFavorite(favorites, id);
  if (!fav) return;

  const nameSpan = document.getElementById(`fav-name-${id}`);
  if (!nameSpan) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'fr-input fr-input--sm';
  input.value = fav.name;
  input.style.cssText = 'padding: 0.125rem 0.25rem; height: 1.5rem; font-size: 0.875rem;';

  const commitRename = () => {
    const newName = input.value.trim();
    if (newName && newName !== fav.name) {
      fav.name = newName;
      saveFavorites(favorites);
      renderSidebar();
      renderContent();
    } else {
      // Revert: just re-render
      renderSidebar();
    }
  };

  input.addEventListener('blur', commitRename);
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      input.removeEventListener('blur', commitRename);
      renderSidebar();
    }
  });

  nameSpan.replaceWith(input);
  input.focus();
  input.select();
}

function showDeleteModal(id: string): void {
  const fav = findFavorite(favorites, id);
  if (fav) {
    deleteTargetId = id;
    const nameEl = document.getElementById('delete-name');
    if (nameEl) nameEl.textContent = fav.name;
    openModal('delete-modal');
  }
}

function handleCloseDeleteModal(): void {
  deleteTargetId = null;
  closeModal('delete-modal');
}

function confirmDelete(): void {
  if (deleteTargetId) {
    favorites = deleteFavorite(favorites, deleteTargetId);
    saveFavorites(favorites);
    getApiAdapter()?.deleteItemFromServer(STORAGE_KEYS.FAVORITES, deleteTargetId);

    if (selectedId === deleteTargetId) {
      selectedId = favorites.length > 0 ? favorites[0].id : null;
    }

    handleCloseDeleteModal();
    renderSidebar();
    renderContent();
  }
}

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
  await initAuth();
  // Reload favorites from (now-updated) localStorage
  favorites = loadFavorites();

  if (favorites.length > 0) {
    selectedId = favorites[0].id;
  }

  renderSidebar();
  renderContent();

  const deleteBtn = document.getElementById('confirm-delete-btn');
  if (deleteBtn) deleteBtn.addEventListener('click', confirmDelete);

  // Sort dropdown
  const sortSelect = document.getElementById('fav-sort') as HTMLSelectElement | null;
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      currentSort = sortSelect.value;
      renderSidebar();
    });
  }

  // Search input - filters favorites list in real time
  const searchInput = document.getElementById('fav-search') as HTMLInputElement | null;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderSidebar();
    });
  }

  // Export / Import
  document.getElementById('export-btn')?.addEventListener('click', exportFavorites);
  document.getElementById('import-btn')?.addEventListener('click', importFavorites);

  setupModalOverlayClose('delete-modal');
});

// Expose functions globally for onclick handlers in HTML
declare global {
  interface Window {
    selectFavorite: typeof selectFavorite;
    openInPlayground: typeof openInPlayground;
    openInBuilder: typeof openInBuilder;
    copyCode: typeof copyCode;
    showDeleteModal: typeof showDeleteModal;
    closeDeleteModal: typeof handleCloseDeleteModal;
    renameFavorite: typeof renameFavorite;
  }
}

window.selectFavorite = selectFavorite;
window.openInPlayground = openInPlayground;
window.openInBuilder = openInBuilder;
window.copyCode = copyCode;
window.showDeleteModal = showDeleteModal;
window.closeDeleteModal = handleCloseDeleteModal;
window.renameFavorite = renameFavorite;
