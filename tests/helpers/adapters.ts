/**
 * Helpers partages par les tests d'adapters.
 */
import { getAdapter } from '@/adapters/api-adapter.js';
import type { ApiAdapter } from '@/adapters/api-adapter.js';

/**
 * `getAdapter` rend `ApiAdapter | null` — null pour un type inconnu (#283).
 *
 * Les tests qui visent un type CONNU passent par ici : l'echec dit alors quel
 * adapter manque, au lieu de planter sur un acces a null quelques lignes plus
 * bas. Le comportement « null pour un type inconnu » garde ses propres tests,
 * qui appellent `getAdapter` directement.
 */
export function requireAdapter(type: string): ApiAdapter {
  const adapter = getAdapter(type);
  if (!adapter) throw new Error(`adapter "${type}" introuvable`);
  return adapter;
}
