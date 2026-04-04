/**
 * Admin API client — typed fetch wrappers for /api/admin endpoints.
 */

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'editor' | 'viewer';
  authProvider: 'local' | 'proconnect';
  isActive: boolean;
  emailVerified: boolean;
  lastLogin: string | null;
  createdAt: string;
}

export interface UserDetail extends User {
  externalId: string | null;
  idpId: string | null;
  siret: string | null;
  organizationalUnit: string | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface Session {
  id: string;
  authProvider: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  isActive: boolean;
}

export interface AuditEntry {
  id: number;
  userId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface Stats {
  totalUsers: number;
  activeUsers: number;
  byRole: Record<string, number>;
  byProvider: Record<string, number>;
}

const opts: RequestInit = { credentials: 'include' };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/admin${path}`, { ...opts, ...init });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchUsers(
  page = 1,
  limit = 20
): Promise<{ users: User[]; pagination: Pagination }> {
  return api(`/users?page=${page}&limit=${limit}`);
}

export async function fetchUserDetail(
  id: string
): Promise<{ user: UserDetail; resources: Record<string, number> }> {
  return api(`/users/${id}`);
}

export async function changeRole(id: string, role: string): Promise<void> {
  await api(`/users/${id}/role`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
}

export async function changeStatus(id: string, active: boolean): Promise<void> {
  await api(`/users/${id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active }),
  });
}

export async function deleteUser(id: string): Promise<void> {
  await api(`/users/${id}`, { method: 'DELETE' });
}

export async function fetchSessions(userId: string): Promise<Session[]> {
  return api(`/users/${userId}/sessions`);
}

export async function revokeSessions(userId: string): Promise<void> {
  await api(`/users/${userId}/sessions`, { method: 'DELETE' });
}

export async function fetchAudit(
  page = 1,
  limit = 50
): Promise<{ logs: AuditEntry[]; pagination: Pagination }> {
  return api(`/audit?page=${page}&limit=${limit}`);
}

export async function fetchStats(): Promise<Stats> {
  return api('/stats');
}
