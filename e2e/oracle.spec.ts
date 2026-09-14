import { test, expect, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECKS, type Check } from '../tools/oracle/manifest.js';
import { closeEnough, parseDisplayedNumber, roundTo, toNum } from '../tools/oracle/compute.js';
import type { ExpectedCheck } from '../tools/oracle/run.js';

/**
 * Oracle de non-régression numérique — côté BIBLIOTHÈQUE.
 *
 * `npm run oracle:expected` a recalculé, depuis les lignes brutes, ce que
 * chaque contrôle doit afficher (tools/oracle/out/expected.json). Ici la lib
 * rend le même balisage, depuis la source, contre la vraie API, et on lit
 * ce qu'elle affiche : la valeur des KPI (texte fr-FR) et les lignes des
 * queries (cache de données). Un écart à la précision affichée est un échec.
 *
 * Dépend des API tierces : lancé la nuit, à la demande, ou sur une PR
 * étiquetée `oracle` (workflow oracle.yml), jamais sur chaque PR.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const EXPECTED_PATH = resolve(HERE, '../tools/oracle/out/expected.json');
const FIXTURES = resolve(HERE, 'oracle');

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

function loadExpected(): Map<string, ExpectedCheck> {
  if (!existsSync(EXPECTED_PATH)) {
    throw new Error(
      `${EXPECTED_PATH} absent : lancer d'abord \`npm run oracle:expected\` (ou \`npm run oracle\`).`
    );
  }
  const list = JSON.parse(readFileSync(EXPECTED_PATH, 'utf-8')) as ExpectedCheck[];
  return new Map(list.map((e) => [e.id, e]));
}

/** Page de fixture : la lib depuis la source (redirection /dist du serveur de dev). */
function writeFixture(check: Check): string {
  mkdirSync(FIXTURES, { recursive: true });
  const file = resolve(FIXTURES, `${check.id}.html`);
  writeFileSync(
    file,
    `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>oracle — ${check.id}</title>
<script type="module">
  import { getDataCache } from '/dist/dsfr-data.esm.js';
  window.__oracle = { getDataCache };
</script>
</head><body>
<!-- ${check.origin} -->
${check.markup}
</body></html>`
  );
  return `/e2e/oracle/${check.id}.html`;
}

async function kpiValue(page: Page, id: string): Promise<number | null> {
  const value = page.locator(`#${id} .dsfr-data-kpi__value`);
  await expect(value).toBeVisible({ timeout: 90_000 });
  await expect
    .poll(async () => (await value.textContent())?.trim() ?? '', { timeout: 90_000 })
    .not.toMatch(/^(|—|…|-)$/);
  return parseDisplayedNumber((await value.textContent()) ?? '');
}

async function queryRows(page: Page, id: string): Promise<Record<string, unknown>[]> {
  await expect
    .poll(
      () =>
        page.evaluate((qid) => {
          const rows = (
            window as unknown as { __oracle: { getDataCache: (i: string) => unknown } }
          ).__oracle.getDataCache(qid);
          return Array.isArray(rows) ? rows.length : 0;
        }, id),
      { timeout: 90_000 }
    )
    .toBeGreaterThan(0);
  return page.evaluate(
    (qid) =>
      (
        window as unknown as { __oracle: { getDataCache: (i: string) => unknown } }
      ).__oracle.getDataCache(qid) as Record<string, unknown>[],
    id
  );
}

const expected = loadExpected();

for (const check of CHECKS) {
  test(`${check.id} — ${check.origin}`, async ({ page }) => {
    const exp = expected.get(check.id);
    expect(exp, `pas d'attendu pour ${check.id} : relancer oracle:expected`).toBeDefined();
    await page.goto(writeFixture(check));

    for (const e of check.expects) {
      if (e.kind === 'kpi') {
        const observed = await kpiValue(page, e.id);
        const want = exp!.kpis[e.id];
        expect(observed, `${e.id} : valeur illisible`).not.toBeNull();
        expect(want, `${e.id} : attendu nul (lignes brutes vides ?)`).not.toBeNull();
        const decimals = e.decimals ?? 0;
        const ok = closeEnough(observed!, roundTo(want!, decimals), decimals);
        expect(
          ok,
          `${check.id} / ${e.id} : affiché ${observed}, recalculé ${want} (${exp!.rawRows} lignes brutes)`
        ).toBe(true);
      } else {
        const rows = await queryRows(page, e.id);
        const want = exp!.groups[e.id];
        expect(rows.length, `${e.id} : nombre de groupes`).toBe(want.length);
        for (let i = 0; i < want.length; i++) {
          expect(String(rows[i][e.by]), `${e.id} ligne ${i} : clé`).toBe(String(want[i][e.by]));
          for (const col of Object.keys(e.columns)) {
            const o = toNum(rows[i][col]);
            const w = toNum(want[i][col]);
            expect(o, `${e.id} ligne ${i} / ${col}`).not.toBeNull();
            expect(
              closeEnough(o!, w!, 6),
              `${check.id} / ${e.id} ligne ${i} (${want[i][e.by]}) / ${col} : lib ${o}, oracle ${w}`
            ).toBe(true);
          }
        }
      }
    }
  });
}
