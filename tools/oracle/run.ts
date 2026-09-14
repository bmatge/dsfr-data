/**
 * `npm run oracle:expected` — télécharge les lignes brutes de chaque contrôle
 * et écrit les valeurs ATTENDUES dans tools/oracle/out/expected.json.
 * Le spec Playwright `e2e/oracle.spec.ts` rend ensuite le balisage et compare.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECKS } from './manifest.js';
import { fetchRawRows } from './raw.js';
import { aggregate, applyFilter, groupBy, type Row } from './compute.js';

export interface ExpectedCheck {
  id: string;
  rawRows: number;
  fetchedAt: string;
  kpis: Record<string, number | null>;
  groups: Record<string, Row[]>;
}

export async function computeExpected(): Promise<ExpectedCheck[]> {
  const out: ExpectedCheck[] = [];
  for (const check of CHECKS) {
    const rows = await fetchRawRows(check.source);
    const expected: ExpectedCheck = {
      id: check.id,
      rawRows: rows.length,
      fetchedAt: new Date().toISOString(),
      kpis: {},
      groups: {},
    };
    for (const e of check.expects) {
      if (e.kind === 'kpi') {
        expected.kpis[e.id] = aggregate(applyFilter(rows, e.filter), e.agg, e.field);
      } else {
        expected.groups[e.id] = groupBy(rows, e);
      }
    }
    out.push(expected);
    process.stdout.write(
      `${check.id}: ${rows.length} lignes brutes, ${check.expects.length} attendu(s)\n`
    );
  }
  return out;
}

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, 'out/expected.json');

const expected = await computeExpected();
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(expected, null, 2));
process.stdout.write(`→ ${OUT}\n`);
