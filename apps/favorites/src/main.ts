/**
 * Favorites app - main entry point
 */

import {
  escapeHtml,
  formatDateShort,
  openModal,
  closeModal,
  setupModalOverlayClose,
  toastInfo,
  toastSuccess,
  toastError,
  exportPreviewImage,
  ImageExportError,
  IMAGE_EXPORT_MESSAGES,
  loadFromStorage,
  saveToStorage,
  STORAGE_KEYS,
  appHref,
  navigateTo,
  initAuth,
  getApiAdapter,
} from '@dsfr-data/shared';
import { loadFavorites, saveFavorites, deleteFavorite, findFavorite } from './favorites-manager.js';
import type { Favorite } from './favorites-manager.js';
import { getPreviewHTML } from './preview.js';
import { openShareModal } from './share-link.js';

// State (re-loaded after initAuth in DOMContentLoaded)
let favorites = loadFavorites();
let selectedId: string | null = null;
let deleteTargetId: string | null = null;
let currentSort = 'date-desc';

function sortFavorites(favs: Favorite[], sortBy: string): Favorite[] {
  const sorted = [...favs];
  switch (sortBy) {
    case 'date-desc':
      return sorted.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    case 'date-asc':
      return sorted.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    case 'name-asc':
      return sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    case 'type':
      return sorted.sort((a, b) => (a.chartType || '').localeCompare(b.chartType || ''));
    default:
      return sorted;
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
        const merged = [
          ...existing,
          ...imported.filter((imp: Favorite) => !existing.some((e: Favorite) => e.id === imp.id)),
        ];
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

/**
 * Type de visualisation d'un favori. Les builders historiques stockent
 * souvent un chartType générique (« chart », « playground ») : on déduit
 * alors le type réel du code sauvegardé (balises bar-chart, pie-chart,
 * dsfr-data-map, type=\"…\"…) pour une vignette représentative.
 */
function inferChartType(fav: Favorite): string {
  const stored = (fav.chartType || '').toLowerCase();
  const code = (fav.code || '').toLowerCase();
  // Deux familles de cartes stockées sous le même chartType « map » :
  // <dsfr-data-map> (fond Géoplateforme + couches, builder-carto) est
  // distinguée AVANT de retourner le type stocké. `[\s>]` évite de matcher
  // les balises enfants <dsfr-data-map-layer>.
  if (/<dsfr-data-map[\s>]/.test(code)) return 'carto';
  if (stored && !['chart', 'playground', 'builder'].includes(stored)) return stored;

  // Cartes DSFR Charts (choroplèthes) : le type= des couches Leaflet (marker,
  // geoshape…) ne doit pas masquer la nature « carte » du favori.
  if (/<map-chart|map-reg|map-aca|map-monde|dsfr-data-world-map/.test(code)) return 'map';
  // type= lu UNIQUEMENT sur la balise dsfr-data-chart (attributs multilignes) :
  // un type= générique attrapait <script type="module"> ou databox-type="chart"
  // et rabattait tous les favoris sur la vignette barres.
  const KNOWN_TYPES = new Set([
    'bar',
    'line',
    'pie',
    'doughnut',
    'radar',
    'scatter',
    'gauge',
    'kpi',
    'datalist',
  ]);
  const chartTag = code.match(/<dsfr-data-chart[^>]*?type="([a-z-]+)"/)?.[1];
  if (chartTag) {
    if (chartTag.startsWith('map')) return 'map';
    if (chartTag === 'bar-line') return 'line';
    if (chartTag === 'doughnut') return 'pie';
    if (KNOWN_TYPES.has(chartTag)) return chartTag;
  }
  if (/<line-chart|bar-line-chart/.test(code)) return 'line';
  if (/<pie-chart|doughnut|donut/.test(code)) return 'pie';
  if (/<gauge-chart|gauge/.test(code)) return 'gauge';
  if (/dsfr-data-kpi/.test(code)) return 'kpi';
  if (/dsfr-data-list|<table-chart/.test(code)) return 'datalist';
  if (/<radar-chart/.test(code)) return 'radar';
  if (/<scatter-chart/.test(code)) return 'scatter';
  if (/<bar-chart/.test(code)) return 'bar';
  return stored || 'chart';
}

/** Libellé du tag de type affiché sur la vignette et le panneau. */
function chartTypeLabel(t: string): string {
  if (t === 'carto') return 'map · couches';
  return t;
}

/**
 * Vignette SVG par type de graphique (refonte v2 — Claude Design).
 * Illustration légère : le rendu réel (iframe) vit dans le panneau d'aperçu.
 */
function thumbSvg(chartType: string | undefined): string {
  const t = (chartType || 'bar').toLowerCase();
  if (t.includes('line') || t === 'courbe') {
    return `<svg viewBox="0 0 200 110" aria-hidden="true"><polyline points="12,85 45,60 78,70 111,38 144,48 177,20" fill="none" stroke="#000091" stroke-width="2.5"></polyline><polyline points="12,95 45,88 78,80 111,72 144,78 177,58" fill="none" stroke="#e1000f" stroke-width="2"></polyline><line x1="10" y1="100" x2="195" y2="100" stroke="#ccc"></line></svg>`;
  }
  if (t.includes('gauge') || t.includes('jauge')) {
    return `<svg viewBox="0 0 200 110" aria-hidden="true"><path d="M 40 95 A 60 60 0 0 1 160 95" fill="none" stroke="#e3e3fd" stroke-width="16" stroke-linecap="round"></path><path d="M 40 95 A 60 60 0 0 1 122 41" fill="none" stroke="#000091" stroke-width="16" stroke-linecap="round"></path><text x="100" y="92" text-anchor="middle" font-size="20" font-weight="700" fill="#161616" font-family="Marianne, sans-serif">68 %</text></svg>`;
  }
  if (t.includes('pie') || t.includes('donut') || t.includes('doughnut')) {
    return `<svg viewBox="0 0 200 110" aria-hidden="true"><circle cx="100" cy="55" r="38" fill="none" stroke="#e3e3fd" stroke-width="16"></circle><circle cx="100" cy="55" r="38" fill="none" stroke="#000091" stroke-width="16" stroke-dasharray="120 240" transform="rotate(-90 100 55)"></circle><circle cx="100" cy="55" r="38" fill="none" stroke="#e1000f" stroke-width="16" stroke-dasharray="50 310" stroke-dashoffset="-120" transform="rotate(-90 100 55)"></circle></svg>`;
  }
  if (t === 'carto' || t.includes('couche') || t.includes('geoportail')) {
    // Carte Géoplateforme à couches (builder-carto) : carte pliée + marqueur + pile de couches.
    return `<svg viewBox="0 0 200 110" aria-hidden="true"><path d="M 25 30 L 66 20 L 112 30 L 153 20 L 153 84 L 112 94 L 66 84 L 25 94 Z" fill="#f5f5fe" stroke="#6a6af4" stroke-width="2" stroke-linejoin="round"></path><line x1="66" y1="20" x2="66" y2="84" stroke="#cacafb" stroke-width="2"></line><line x1="112" y1="30" x2="112" y2="94" stroke="#cacafb" stroke-width="2"></line><path d="M 34 74 C 58 60 78 78 104 60 S 136 48 146 42" fill="none" stroke="#cacafb" stroke-width="2.5"></path><path d="M 89 32 c -9 0 -15 6.5 -15 15 c 0 10 15 25 15 25 s 15 -15 15 -25 c 0 -8.5 -6 -15 -15 -15 Z" fill="#e1000f"></path><circle cx="89" cy="47" r="5.5" fill="#fff"></circle><g transform="translate(160,48)"><polygon points="15,0 30,8 15,16 0,8" fill="#000091"></polygon><polygon points="15,10 30,18 15,26 0,18" fill="#6a6af4" opacity="0.85"></polygon><polygon points="15,20 30,28 15,36 0,28" fill="#cacafb"></polygon></g></svg>`;
  }
  if (t.includes('map') || t.includes('carte')) {
    // Choroplèthe DSFR Charts : hexagone (la France) découpé en régions
    // irrégulières (pas de symétrie centrale : trois quadrilatères réguliers
    // se lisent comme un cube isométrique) + mini-légende.
    return `<svg viewBox="0 0 200 110" aria-hidden="true"><g stroke="#fff" stroke-width="2" stroke-linejoin="round"><polygon points="95,8 135,31 118,44 78,48 55,31" fill="#cacafb"></polygon><polygon points="135,31 135,77 128,70 118,44" fill="#6a6af4"></polygon><polygon points="55,31 78,48 72,74 55,77" fill="#8585f6"></polygon><polygon points="78,48 118,44 128,70 95,78 72,74" fill="#000091"></polygon><polygon points="55,77 72,74 95,78 128,70 135,77 95,100" fill="#e3e3fd"></polygon></g><polygon points="95,8 135,31 135,77 95,100 55,77 55,31" fill="none" stroke="#000091" stroke-width="2" stroke-linejoin="round"></polygon><rect x="156" y="38" width="11" height="9" fill="#cacafb"></rect><rect x="156" y="51" width="11" height="9" fill="#6a6af4"></rect><rect x="156" y="64" width="11" height="9" fill="#000091"></rect></svg>`;
  }
  if (t.includes('datalist') || t.includes('table') || t.includes('list')) {
    return `<svg viewBox="0 0 200 110" aria-hidden="true"><rect x="20" y="14" width="160" height="16" fill="#e3e3fd"></rect><rect x="20" y="36" width="160" height="12" fill="#f6f6f6" stroke="#ddd"></rect><rect x="20" y="52" width="160" height="12" fill="#fff" stroke="#ddd"></rect><rect x="20" y="68" width="160" height="12" fill="#f6f6f6" stroke="#ddd"></rect><rect x="20" y="84" width="160" height="12" fill="#fff" stroke="#ddd"></rect></svg>`;
  }
  if (t.includes('radar')) {
    return `<svg viewBox="0 0 200 110" aria-hidden="true"><polygon points="100,12 145,40 128,95 72,95 55,40" fill="none" stroke="#ddd"></polygon><polygon points="100,30 130,46 120,82 80,82 70,46" fill="#6a6af433" stroke="#000091" stroke-width="2"></polygon></svg>`;
  }
  if (t.includes('scatter') || t.includes('nuage')) {
    return `<svg viewBox="0 0 200 110" aria-hidden="true"><line x1="15" y1="100" x2="190" y2="100" stroke="#ccc"></line><line x1="15" y1="8" x2="15" y2="100" stroke="#ccc"></line><circle cx="45" cy="75" r="5" fill="#000091"></circle><circle cx="70" cy="55" r="5" fill="#6a6af4"></circle><circle cx="95" cy="62" r="5" fill="#000091"></circle><circle cx="120" cy="35" r="5" fill="#6a6af4"></circle><circle cx="150" cy="42" r="5" fill="#000091"></circle><circle cx="170" cy="22" r="5" fill="#6a6af4"></circle></svg>`;
  }
  if (t.includes('kpi')) {
    return `<svg viewBox="0 0 200 110" aria-hidden="true"><rect x="30" y="20" width="6" height="70" fill="#0063cb"></rect><text x="48" y="62" font-size="34" font-weight="700" fill="#161616" font-family="Marianne, sans-serif">42 %</text><text x="48" y="82" font-size="11" fill="#666" font-family="Marianne, sans-serif">indicateur clé</text></svg>`;
  }
  return `<svg viewBox="0 0 200 110" aria-hidden="true"><rect x="18" y="55" width="20" height="45" fill="#000091"></rect><rect x="48" y="30" width="20" height="70" fill="#6a6af4"></rect><rect x="78" y="62" width="20" height="38" fill="#000091"></rect><rect x="108" y="18" width="20" height="82" fill="#6a6af4"></rect><rect x="138" y="44" width="20" height="56" fill="#000091"></rect><rect x="168" y="70" width="20" height="30" fill="#6a6af4"></rect><line x1="10" y1="100" x2="195" y2="100" stroke="#ccc"></line></svg>`;
}

/** Grille de vignettes (remplace la sidebar v1). */
function renderGrid(): void {
  const listEl = document.getElementById('favorites-list');
  const countEl = document.getElementById('favorites-count');
  const emptySearchEl = document.getElementById('fav-empty-search');
  if (!listEl || !countEl) return;

  countEl.textContent = String(favorites.length);

  if (favorites.length === 0) {
    listEl.innerHTML = `
      <div class="favs-empty">
        <i class="ri-star-line" aria-hidden="true"></i>
        <p><strong>Aucun favori enregistré</strong></p>
        <p class="fr-text--sm">Créez un graphique dans le Builder ou le Playground, puis sauvegardez-le en favori.</p>
        <a href="${appHref('builder')}" class="fr-btn fr-btn--sm fr-btn--secondary fr-mt-1w"><i class="ri-bar-chart-box-line" aria-hidden="true"></i> Ouvrir le Builder</a>
      </div>
    `;
    if (emptySearchEl) emptySearchEl.style.display = 'none';
    return;
  }

  const sorted = sortFavorites(favorites, currentSort);
  const searchTerm =
    (document.getElementById('fav-search') as HTMLInputElement | null)?.value?.toLowerCase() || '';
  const filtered = searchTerm
    ? sorted.filter((fav) => fav.name.toLowerCase().includes(searchTerm))
    : sorted;

  if (emptySearchEl) {
    emptySearchEl.style.display = filtered.length === 0 ? '' : 'none';
    emptySearchEl.textContent = `Aucun favori ne correspond à « ${searchTerm} ».`;
  }

  listEl.innerHTML = filtered
    .map(
      (fav) => `
    <div class="fav-card ${selectedId === fav.id ? 'fav-card--active' : ''}"
         data-id="${fav.id}" role="button" tabindex="0"
         onclick="selectFavorite('${fav.id}')"
         onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectFavorite('${fav.id}')}">
      <div class="fav-card__thumb">${thumbSvg(inferChartType(fav))}</div>
      <div class="fav-card__body">
        <span class="fav-card__name">${escapeHtml(fav.name)}</span>
        <div class="fav-card__meta">
          <span class="fav-card__tag">${escapeHtml(chartTypeLabel(inferChartType(fav)))}</span>
          <span class="fav-card__tag">${escapeHtml(fav.sourceApp || fav.source || 'builder')}</span>
          <span class="fav-card__date">${formatDateShort(fav.createdAt)}</span>
        </div>
      </div>
    </div>
  `
    )
    .join('');
}

/** Panneau latéral d'aperçu (remplace la zone de contenu v1). */
function renderPanel(): void {
  const panel = document.getElementById('fav-panel');
  if (!panel) return;

  if (!selectedId) {
    panel.setAttribute('hidden', '');
    return;
  }

  const fav = findFavorite(favorites, selectedId);
  if (!fav) {
    selectedId = null;
    panel.setAttribute('hidden', '');
    return;
  }

  panel.removeAttribute('hidden');

  const nameEl = document.getElementById('fav-panel-name');
  if (nameEl) {
    nameEl.textContent = fav.name;
    nameEl.id = 'fav-panel-name';
  }
  const tagsEl = document.getElementById('fav-panel-tags');
  if (tagsEl) {
    tagsEl.innerHTML = `
      <span class="fav-card__tag">${escapeHtml(chartTypeLabel(inferChartType(fav)))}</span>
      <span class="fav-card__tag">${escapeHtml(fav.sourceApp || fav.source || 'builder')}</span>`;
  }
  const metaEl = document.getElementById('fav-panel-meta');
  if (metaEl) {
    metaEl.textContent = `${fav.sourceApp || fav.source || 'builder'} · Enregistré le ${formatDateShort(fav.createdAt)}`;
  }
  const codeEl = document.getElementById('code-display');
  if (codeEl) codeEl.textContent = fav.code;

  // Rendu réel du favori dans l'iframe (conservé de la v1).
  setTimeout(() => {
    const iframe = document.getElementById('preview-frame') as HTMLIFrameElement | null;
    if (iframe) {
      iframe.srcdoc = getPreviewHTML(fav.code);
    }
  }, 50);
}

function closePanel(): void {
  selectedId = null;
  renderGrid();
  renderPanel();
}

function selectFavorite(id: string): void {
  selectedId = id;
  renderGrid();
  renderPanel();
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
    const builderState = fav.builderStateJson ?? fav.builderState;
    if (builderState) {
      sessionStorage.setItem('builder-state', JSON.stringify(builderState));
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
      const btn = document.getElementById('fav-panel-copy-btn');
      if (btn) {
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="ri-check-line" aria-hidden="true"></i> Copié !';
        setTimeout(() => {
          btn.innerHTML = originalText;
        }, 2000);
      }
    });
  }
}

function renameFavorite(id: string): void {
  const fav = findFavorite(favorites, id);
  if (!fav) return;

  // v2 : le renommage se fait depuis l'en-tête du panneau d'aperçu.
  const nameSpan = document.getElementById('fav-panel-name');
  if (!nameSpan) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'fr-input fr-input--sm';
  input.value = fav.name;
  input.style.cssText = 'padding: 0.125rem 0.25rem; height: 1.5rem; font-size: 0.875rem;';

  // renderPanel() ne reconstruit pas le DOM du panneau : il faut restaurer
  // le span (avec son id) avant de re-rendre, sinon le nom disparaît.
  const restoreSpan = () => {
    input.replaceWith(nameSpan);
  };

  const commitRename = () => {
    const newName = input.value.trim();
    if (newName && newName !== fav.name) {
      fav.name = newName;
      saveFavorites(favorites);
    }
    restoreSpan();
    renderGrid();
    renderPanel();
  };

  input.addEventListener('blur', commitRename);
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      input.removeEventListener('blur', commitRename);
      restoreSpan();
      renderPanel();
    }
  });

  nameSpan.replaceWith(input);
  input.focus();
  input.select();
}

function shareFavorite(id: string): void {
  const fav = findFavorite(favorites, id);
  if (!fav) return;
  // openShareModal handles its own UI state (loading / active / error)
  void openShareModal(id);
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

    // v2 : la suppression du favori affiché ferme le panneau.
    if (selectedId === deleteTargetId) {
      selectedId = null;
    }

    handleCloseDeleteModal();
    renderGrid();
    renderPanel();
  }
}

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
  await initAuth();
  // Reload favorites from (now-updated) localStorage
  favorites = loadFavorites();

  renderGrid();
  renderPanel();

  const deleteBtn = document.getElementById('confirm-delete-btn');
  if (deleteBtn) deleteBtn.addEventListener('click', confirmDelete);

  // Panneau d'aperçu : actions et fermeture
  document.getElementById('fav-panel-close-btn')?.addEventListener('click', closePanel);
  document.getElementById('fav-panel-copy-btn')?.addEventListener('click', () => {
    if (selectedId) copyCode(selectedId);
  });
  document.getElementById('fav-panel-builder-btn')?.addEventListener('click', () => {
    if (selectedId) openInBuilder(selectedId);
  });
  document.getElementById('fav-panel-playground-btn')?.addEventListener('click', () => {
    if (selectedId) openInPlayground(selectedId);
  });
  document.getElementById('fav-panel-share-btn')?.addEventListener('click', () => {
    if (selectedId) shareFavorite(selectedId);
  });
  const exportImage = (format: 'png' | 'jpg') => {
    try {
      const frame = document.getElementById('preview-frame') as HTMLIFrameElement | null;
      if (!frame) throw new ImageExportError('iframe-inaccessible');
      const name = favorites.find((f) => f.id === selectedId)?.name || 'favori';
      exportPreviewImage(frame, format, name);
    } catch (err) {
      if (err instanceof ImageExportError) toastError(IMAGE_EXPORT_MESSAGES[err.reason]);
      else throw err;
    }
  };
  document.getElementById('fav-panel-png-btn')?.addEventListener('click', () => exportImage('png'));
  document.getElementById('fav-panel-jpg-btn')?.addEventListener('click', () => exportImage('jpg'));
  document.getElementById('fav-panel-delete-btn')?.addEventListener('click', () => {
    if (selectedId) showDeleteModal(selectedId);
  });
  document.getElementById('fav-panel-rename-btn')?.addEventListener('click', () => {
    if (selectedId) renameFavorite(selectedId);
  });
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && selectedId) {
      const modalOpen = document.querySelector('.modal-overlay.active');
      if (!modalOpen) closePanel();
    }
  });

  // Sort dropdown
  const sortSelect = document.getElementById('fav-sort') as HTMLSelectElement | null;
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      currentSort = sortSelect.value;
      renderGrid();
    });
  }

  // Search input - filters favorites list in real time
  const searchInput = document.getElementById('fav-search') as HTMLInputElement | null;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderGrid();
    });
  }

  // Export / Import
  document.getElementById('export-btn')?.addEventListener('click', exportFavorites);
  document.getElementById('import-btn')?.addEventListener('click', importFavorites);

  setupModalOverlayClose('delete-modal');
  setupModalOverlayClose('share-modal');
});

// Expose functions globally for onclick handlers in HTML
declare global {
  interface Window {
    selectFavorite: typeof selectFavorite;
    openInPlayground: typeof openInPlayground;
    openInBuilder: typeof openInBuilder;
    copyCode: typeof copyCode;
    shareFavorite: typeof shareFavorite;
    showDeleteModal: typeof showDeleteModal;
    closeDeleteModal: typeof handleCloseDeleteModal;
    renameFavorite: typeof renameFavorite;
  }
}

window.selectFavorite = selectFavorite;
window.openInPlayground = openInPlayground;
window.openInBuilder = openInBuilder;
window.copyCode = copyCode;
window.shareFavorite = shareFavorite;
window.showDeleteModal = showDeleteModal;
window.closeDeleteModal = handleCloseDeleteModal;
window.renameFavorite = renameFavorite;
