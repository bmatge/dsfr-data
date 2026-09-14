import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * L'oracle ne vaut que par son INDÉPENDANCE : s'il importait l'adaptateur ODS,
 * les agrégations ou la traduction de filtres de la lib, il se tromperait de
 * la même façon qu'elle et ne verrait rien. Ce garde refuse tout import vers
 * `packages/`, `@dsfr-data/*` ou l'alias `@/`.
 */
describe('oracle — garde d’indépendance', () => {
  it('tools/oracle n’importe rien de la bibliothèque', () => {
    const dir = resolve(__dirname, '../../tools/oracle');
    const offenders: string[] = [];
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.ts')) continue;
      const src = readFileSync(join(dir, file), 'utf-8');
      for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const spec = m[1];
        if (spec.includes('packages/') || spec.startsWith('@dsfr-data/') || spec.startsWith('@/')) {
          offenders.push(`${file} → ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
