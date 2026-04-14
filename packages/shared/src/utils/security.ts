const UNSAFE_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

export function isUnsafeKey(key: string): boolean {
  return UNSAFE_KEYS.has(key);
}
