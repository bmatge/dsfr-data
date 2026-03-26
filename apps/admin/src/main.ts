/**
 * Admin app — user management, audit log, stats.
 */

import './styles/admin.css';
import { escapeHtml } from '@dsfr-data/shared';
import {
  fetchUsers, fetchUserDetail, fetchAudit, fetchStats,
  changeRole, changeStatus, deleteUser, revokeSessions,
  type User, type UserDetail, type AuditEntry, type Pagination, type Stats,
} from './api.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let users: User[] = [];
let usersPagination: Pagination = { page: 1, limit: 20, total: 0, pages: 0 };
let auditLogs: AuditEntry[] = [];
let auditPagination: Pagination = { page: 1, limit: 50, total: 0, pages: 0 };
let stats: Stats | null = null;
let currentTab: 'users' | 'audit' | 'stats' = 'users';

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  // Check auth — fetch /api/auth/me to know if user is admin
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (!res.ok) {
      showAccessDenied();
      return;
    }
    const data = await res.json();
    if (data.user.role !== 'admin') {
      showAccessDenied();
      return;
    }
  } catch {
    showAccessDenied();
    return;
  }

  document.getElementById('admin-tabs')!.style.display = 'block';
  setupTabs();
  await loadUsers(1);
});

function showAccessDenied(): void {
  document.getElementById('access-denied')!.style.display = 'block';
  document.getElementById('admin-subtitle')!.style.display = 'none';
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function setupTabs(): void {
  // Let DSFR JS handle tab switching natively (aria-selected, left, etc.)
  // We just listen for clicks to lazy-load data when a tab is first opened.
  const tabs = ['users', 'audit', 'stats'] as const;
  for (const tab of tabs) {
    document.getElementById(`tab-${tab}`)!.addEventListener('click', () => onTabClick(tab));
  }
}

async function onTabClick(tab: typeof currentTab): Promise<void> {
  currentTab = tab;
  if (tab === 'users' && users.length === 0) await loadUsers(1);
  if (tab === 'audit' && auditLogs.length === 0) await loadAudit(1);
  if (tab === 'stats' && !stats) await loadStats();
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

async function loadUsers(page: number): Promise<void> {
  const el = document.getElementById('users-list')!;
  el.innerHTML = '<p class="admin-loading">Chargement...</p>';

  try {
    const data = await fetchUsers(page);
    users = data.users;
    usersPagination = data.pagination;
    renderUsersTable();
  } catch (err) {
    el.innerHTML = `<div class="fr-alert fr-alert--error"><p>${escapeHtml(String(err))}</p></div>`;
  }
}

function renderUsersTable(): void {
  const el = document.getElementById('users-list')!;
  if (users.length === 0) {
    el.innerHTML = '<p class="admin-loading">Aucun utilisateur.</p>';
    return;
  }

  const rows = users.map(u => `
    <tr data-clickable data-user-id="${escapeHtml(u.id)}">
      <td>${escapeHtml(u.displayName)}</td>
      <td>${escapeHtml(u.email)}</td>
      <td><span class="badge badge--${u.role}">${u.role}</span></td>
      <td><span class="badge badge--${u.isActive ? 'active' : 'inactive'}">${u.isActive ? 'Actif' : 'Inactif'}</span></td>
      <td>${u.lastLogin ? formatDate(u.lastLogin) : '<span style="color:var(--text-mention-grey)">Jamais</span>'}</td>
      <td>${formatDate(u.createdAt)}</td>
    </tr>
  `).join('');

  el.innerHTML = `
    <div class="admin-table-wrapper">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Nom</th>
            <th>Email</th>
            <th>Role</th>
            <th>Statut</th>
            <th>Derniere connexion</th>
            <th>Inscription</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  // Click handlers
  el.querySelectorAll('tr[data-user-id]').forEach(tr => {
    tr.addEventListener('click', () => openUserDetail(tr.getAttribute('data-user-id')!));
  });

  renderPagination('users-pagination', usersPagination, loadUsers);
}

// ---------------------------------------------------------------------------
// User detail modal
// ---------------------------------------------------------------------------

async function openUserDetail(userId: string): Promise<void> {
  const modal = document.getElementById('user-detail-modal') as HTMLDialogElement;
  const body = document.getElementById('modal-body')!;
  body.innerHTML = '<p class="admin-loading">Chargement...</p>';
  modal.showModal();

  document.getElementById('modal-close')!.onclick = () => modal.close();

  try {
    const { user, resources } = await fetchUserDetail(userId);
    renderUserDetail(user, resources);
  } catch (err) {
    body.innerHTML = `<div class="fr-alert fr-alert--error"><p>${escapeHtml(String(err))}</p></div>`;
  }
}

function renderUserDetail(user: UserDetail, resources: Record<string, number>): void {
  const body = document.getElementById('modal-body')!;
  const totalResources = Object.values(resources).reduce((s, n) => s + n, 0);

  body.innerHTML = `
    <dl class="detail-grid">
      <dt>Email</dt><dd>${escapeHtml(user.email)}</dd>
      <dt>Nom</dt><dd>${escapeHtml(user.displayName)}</dd>
      <dt>Role</dt><dd><span class="badge badge--${user.role}">${user.role}</span></dd>
      <dt>Provider</dt><dd><span class="badge badge--${user.authProvider}">${user.authProvider}</span></dd>
      <dt>Statut</dt><dd><span class="badge badge--${user.isActive ? 'active' : 'inactive'}">${user.isActive ? 'Actif' : 'Inactif'}</span></dd>
      <dt>Email verifie</dt><dd>${user.emailVerified ? 'Oui' : 'Non'}</dd>
      <dt>Derniere connexion</dt><dd>${user.lastLogin ? formatDate(user.lastLogin) : 'Jamais'}</dd>
      <dt>Inscription</dt><dd>${formatDate(user.createdAt)}</dd>
      ${user.siret ? `<dt>SIRET</dt><dd>${escapeHtml(user.siret)}</dd>` : ''}
      ${user.organizationalUnit ? `<dt>Service</dt><dd>${escapeHtml(user.organizationalUnit)}</dd>` : ''}
      <dt>Ressources</dt><dd>${totalResources} (${resources.sources} sources, ${resources.favorites} favoris, ${resources.dashboards} dashboards)</dd>
    </dl>

    <div class="detail-actions">
      <div class="fr-select-group" style="min-width:150px">
        <label class="fr-label" for="detail-role">Role</label>
        <select class="fr-select" id="detail-role">
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>admin</option>
          <option value="editor" ${user.role === 'editor' ? 'selected' : ''}>editor</option>
          <option value="viewer" ${user.role === 'viewer' ? 'selected' : ''}>viewer</option>
        </select>
      </div>
      <button class="fr-btn fr-btn--sm" id="btn-save-role">Modifier le role</button>
      <button class="fr-btn fr-btn--sm fr-btn--secondary" id="btn-toggle-status">
        ${user.isActive ? 'Desactiver' : 'Activer'}
      </button>
      <button class="fr-btn fr-btn--sm fr-btn--secondary" id="btn-revoke-sessions">Revoquer les sessions</button>
      <button class="fr-btn fr-btn--sm fr-btn--tertiary" id="btn-delete-user" style="color:var(--text-default-error)">Supprimer</button>
    </div>
  `;

  // Actions
  document.getElementById('btn-save-role')!.onclick = async () => {
    const newRole = (document.getElementById('detail-role') as HTMLSelectElement).value;
    try {
      await changeRole(user.id, newRole);
      (document.getElementById('user-detail-modal') as HTMLDialogElement).close();
      await loadUsers(usersPagination.page);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  document.getElementById('btn-toggle-status')!.onclick = async () => {
    try {
      await changeStatus(user.id, !user.isActive);
      (document.getElementById('user-detail-modal') as HTMLDialogElement).close();
      await loadUsers(usersPagination.page);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  document.getElementById('btn-revoke-sessions')!.onclick = async () => {
    if (!confirm(`Revoquer toutes les sessions de ${user.email} ?`)) return;
    try {
      await revokeSessions(user.id);
      alert('Sessions revoquees.');
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  document.getElementById('btn-delete-user')!.onclick = async () => {
    if (!confirm(`Supprimer definitivement ${user.email} et toutes ses ressources ?`)) return;
    try {
      await deleteUser(user.id);
      (document.getElementById('user-detail-modal') as HTMLDialogElement).close();
      await loadUsers(usersPagination.page);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

async function loadAudit(page: number): Promise<void> {
  const el = document.getElementById('audit-list')!;
  el.innerHTML = '<p class="admin-loading">Chargement...</p>';

  try {
    const data = await fetchAudit(page);
    auditLogs = data.logs;
    auditPagination = data.pagination;
    renderAuditTable();
  } catch (err) {
    el.innerHTML = `<div class="fr-alert fr-alert--error"><p>${escapeHtml(String(err))}</p></div>`;
  }
}

function renderAuditTable(): void {
  const el = document.getElementById('audit-list')!;
  if (auditLogs.length === 0) {
    el.innerHTML = '<p class="admin-loading">Aucune entree dans le journal d\'audit.</p>';
    return;
  }

  const rows = auditLogs.map(l => `
    <tr>
      <td>${formatDate(l.createdAt)}</td>
      <td><span class="audit-action">${escapeHtml(l.action)}</span></td>
      <td>${l.targetType ? escapeHtml(l.targetType) : ''} ${l.targetId ? `<code>${escapeHtml(l.targetId.substring(0, 8))}...</code>` : ''}</td>
      <td class="audit-details">${l.details ? escapeHtml(JSON.stringify(l.details)) : ''}</td>
      <td>${l.ipAddress ? escapeHtml(l.ipAddress) : ''}</td>
    </tr>
  `).join('');

  el.innerHTML = `
    <div class="admin-table-wrapper">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Action</th>
            <th>Cible</th>
            <th>Details</th>
            <th>IP</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  renderPagination('audit-pagination', auditPagination, loadAudit);
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

async function loadStats(): Promise<void> {
  const el = document.getElementById('stats-content')!;
  el.innerHTML = '<p class="admin-loading">Chargement...</p>';

  try {
    stats = await fetchStats();
    renderStats();
  } catch (err) {
    el.innerHTML = `<div class="fr-alert fr-alert--error"><p>${escapeHtml(String(err))}</p></div>`;
  }
}

function renderStats(): void {
  if (!stats) return;
  const el = document.getElementById('stats-content')!;

  const kpi = (value: number | string, label: string) =>
    `<div class="admin-kpi"><div class="admin-kpi__value">${value}</div><div class="admin-kpi__label">${label}</div></div>`;

  el.innerHTML = `
    <div class="admin-kpi-row fr-mb-4w">
      ${kpi(stats.totalUsers, 'Utilisateurs')}
      ${kpi(stats.activeUsers, 'Actifs')}
      ${kpi(stats.totalUsers - stats.activeUsers, 'Inactifs')}
    </div>
    <h3 class="fr-mt-4w">Par role</h3>
    <div class="admin-kpi-row fr-mb-4w">
      ${kpi(stats.byRole.admin || 0, 'Admin')}
      ${kpi(stats.byRole.editor || 0, 'Editor')}
      ${kpi(stats.byRole.viewer || 0, 'Viewer')}
    </div>
    <h3 class="fr-mt-4w">Par provider</h3>
    <div class="admin-kpi-row fr-mb-4w">
      ${kpi(stats.byProvider.local || 0, 'Local')}
      ${kpi(stats.byProvider.proconnect || 0, 'ProConnect')}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function renderPagination(containerId: string, pagination: Pagination, loadFn: (page: number) => Promise<void>): void {
  const el = document.getElementById(containerId)!;
  if (pagination.pages <= 1) {
    el.innerHTML = '';
    return;
  }

  const buttons: string[] = [];
  if (pagination.page > 1) {
    buttons.push(`<button class="fr-btn fr-btn--sm fr-btn--secondary" data-page="${pagination.page - 1}">&laquo; Prec.</button>`);
  }
  buttons.push(`<span>Page ${pagination.page} / ${pagination.pages} (${pagination.total} resultats)</span>`);
  if (pagination.page < pagination.pages) {
    buttons.push(`<button class="fr-btn fr-btn--sm fr-btn--secondary" data-page="${pagination.page + 1}">Suiv. &raquo;</button>`);
  }

  el.innerHTML = `<div class="admin-pagination">${buttons.join('')}</div>`;
  el.querySelectorAll('button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => loadFn(parseInt(btn.getAttribute('data-page')!)));
  });
}
