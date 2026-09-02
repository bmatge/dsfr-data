import { describe, it, expect } from 'vitest';
import { navItemsFor } from '../../../packages/app-ui/src/app-header.js';
import type { User } from '@dsfr-data/shared';

/**
 * Navigation principale (#575) : « Suivi » et « Admin » ne sont proposées
 * qu'aux administrateurs connectés (ergonomie ; les apps gardent leurs
 * contrôles d'accès).
 */

const user = (role: User['role']): User =>
  ({ id: 1, email: 'x@example.org', name: 'X', role }) as unknown as User;

const ids = (u: User | null) => navItemsFor(u).map((i) => i.id);

describe('navItemsFor (#575)', () => {
  it('anonyme : ni Suivi ni Admin', () => {
    expect(ids(null)).not.toContain('monitoring');
    expect(ids(null)).not.toContain('admin');
    expect(ids(null)).toContain('builder');
  });

  it('connecté non admin : ni Suivi ni Admin', () => {
    for (const role of ['editor', 'viewer'] as const) {
      expect(ids(user(role))).not.toContain('monitoring');
      expect(ids(user(role))).not.toContain('admin');
    }
  });

  it('admin : Suivi puis Admin en fin de nav', () => {
    expect(ids(user('admin')).slice(-2)).toEqual(['monitoring', 'admin']);
  });

  it('les autres entrées sont identiques quel que soit le rôle', () => {
    const base = ids(null);
    expect(ids(user('admin')).filter((id) => base.includes(id))).toEqual(base);
  });
});
