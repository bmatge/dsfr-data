import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Garde #292 : la bibliothèque publiée ne doit jamais charger de code
 * exécutable depuis un CDN tiers au runtime (CSP strict, posture souveraine,
 * option sovereign-only). Les plugins Leaflet passent par des chunks import()
 * produits par le build.
 */
const CORE_SRC = join(__dirname, '..', 'packages', 'core', 'src');
const CDN_PATTERNS = ['cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com'];

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectTsFiles(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('no CDN URLs in packages/core/src (#292)', () => {
  it('contains no third-party CDN hostname', () => {
    const offenders: string[] = [];
    for (const file of collectTsFiles(CORE_SRC)) {
      const content = readFileSync(file, 'utf-8');
      for (const pattern of CDN_PATTERNS) {
        if (content.includes(pattern)) {
          offenders.push(`${file} -> ${pattern}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
