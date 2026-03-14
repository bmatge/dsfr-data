/**
 * Auth types shared between client and server.
 */

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'editor' | 'viewer';
  createdAt?: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
}

export interface ShareTarget {
  type: 'user' | 'group' | 'global';
  id?: string;
  name?: string;
}

export interface ShareInfo {
  id: string;
  target: ShareTarget;
  permission: 'read' | 'write';
}
