import { test, expect, type Page } from '@playwright/test';

/**
 * SPIKE #889 — spec JETABLE (branche spike/repeat-clonage-dom, rien à fusionner).
 *
 * Lancement :
 *   npx playwright test --config e2e/spike-repeat/playwright.config.ts
 *
 * Le rapport chiffré est imprimé sur la sortie standard (lignes `SPIKE ...`) ;
 * les assertions ne portent que sur ce qui doit être vrai pour que le
 * chiffre ait un sens (119 canvas, zéro erreur console, identité).
 */

type Mode = 'display' | 'innerhtml' | 'clone' | 'clone-keyed';
const MODES: Mode[] = ['display', 'innerhtml', 'clone', 'clone-keyed'];
/** quiet=1 : console.warn neutralisé (isole le coût des avertissements #765, O(N²)). */
const QUIETS = [false, true];
const RUNS = 3;

interface Reemit {
  ms: number;
  renderMs: number | null;
  identity: boolean | null;
  canvases: number;
  libelle: string;
  stats: { created: number; patched: number; writes: number; lastRenderMs: number } | null;
}

function collectConsole(page: Page) {
  const errors: string[] = [];
  const warnings: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
    if (msg.type() === 'warning') warnings.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return { errors, warnings };
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const fmt = (xs: number[]) => xs.map((x) => x.toFixed(0)).join(' / ');

test.describe('3. mesure — 119 lignes × (query + graphique)', () => {
  const results: Record<string, { first: number[]; repeated: number[]; scoped: number[] }> = {};

  for (const quiet of QUIETS)
    for (const mode of MODES) {
      for (let run = 1; run <= RUNS; run++) {
        const label = quiet ? `${mode} (quiet)` : mode;
        test(`${label} — run ${run}`, async ({ page }) => {
          const { errors, warnings } = collectConsole(page);
          await page.setViewportSize({ width: 1200, height: 900 });
          await page.goto(`/e2e/spike-repeat/spike.html?mode=${mode}${quiet ? '&quiet=1' : ''}`);

          // Premier rendu : jusqu'au 119e canvas.
          await expect
            .poll(() => page.evaluate(() => (window as any).__spike.firstRenderMs), {
              timeout: 60_000,
            })
            .not.toBeNull();
          const first = await page.evaluate(() => (window as any).__spike.firstRenderMs as number);
          expect(await page.locator('canvas').count()).toBe(119);
          expect(await page.locator('[data-dsfr-config-error]').count()).toBe(0);
          // Aucun id non résolu ne doit avoir atteint le document.
          expect(await page.locator('[id*="{{"]').count()).toBe(0);

          // Ré-émission de la source RÉPÉTÉE (mêmes clés, libellés modifiés).
          const repeated = (await page.evaluate(() =>
            (window as any).__spikeReemitRepeated()
          )) as Reemit;
          expect(repeated.canvases).toBe(119);
          expect(repeated.libelle).toContain('(v2)');
          if (mode === 'clone-keyed') {
            expect(repeated.identity).toBe(true);
            expect(repeated.stats?.created).toBe(0);
            expect(repeated.stats?.patched).toBe(119);
          } else {
            expect(repeated.identity).toBe(false);
          }

          // Ré-émission de la source SCOPÉE (ce que fait un contexte) : 119 refiltres.
          const scoped = (await page.evaluate(() => (window as any).__spikeReemitScoped())) as {
            ms: number;
          };

          const r = (results[label] ??= { first: [], repeated: [], scoped: [] });
          const silenced = await page.evaluate(() => (window as any).__spikeWarnCount ?? 0);
          r.first.push(first);
          r.repeated.push(repeated.ms);
          r.scoped.push(scoped.ms);
          console.log(
            `SPIKE ${label} run ${run}: premier rendu ${first.toFixed(0)} ms | ré-émission répétée ${repeated.ms.toFixed(0)} ms` +
              (repeated.renderMs !== null
                ? ` (rendu sync ${repeated.stats?.lastRenderMs.toFixed(1)} ms, writes ${repeated.stats?.writes})`
                : '') +
              ` | identité ${repeated.identity} | ré-émission scopée ${scoped.ms.toFixed(0)} ms` +
              ` | erreurs ${errors.length} avert. ${warnings.length} (neutralisés ${silenced})`
          );
          const freq = new Map<string, number>();
          for (const w of warnings) {
            const k = w.replace(/\s+/g, ' ').slice(0, 110);
            freq.set(k, (freq.get(k) ?? 0) + 1);
          }
          const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
          console.log('SPIKE avertissements les plus fréquents :', JSON.stringify(top));
          expect(errors).toEqual([]);
        });
      }
    }

  test.afterAll(() => {
    console.log('\nSPIKE — synthèse (3 runs, ms ; médiane entre crochets)');
    console.log(
      '| mode | premier rendu (119e canvas) | ré-émission source répétée | ré-émission source scopée |'
    );
    console.log('|---|---|---|---|');
    for (const label of Object.keys(results)) {
      const r = results[label];
      console.log(
        `| ${label} | ${fmt(r.first)} [${median(r.first).toFixed(0)}] | ${fmt(r.repeated)} [${median(r.repeated).toFixed(0)}] | ${fmt(r.scoped)} [${median(r.scoped).toFixed(0)}] |`
      );
    }
    for (const suffix of ['', ' (quiet)']) {
      const ref = results[`display${suffix}`] && median(results[`display${suffix}`].first);
      const clone = results[`clone${suffix}`] && median(results[`clone${suffix}`].first);
      const ih = results[`innerhtml${suffix}`] && median(results[`innerhtml${suffix}`].first);
      if (ref && clone)
        console.log(
          `SPIKE ratio clone / display au premier rendu${suffix} : ${(clone / ref).toFixed(2)}`
        );
      if (ih && clone)
        console.log(
          `SPIKE ratio clone / innerhtml (même répéteur)${suffix} : ${(clone / ih).toFixed(2)}`
        );
    }
  });
});

test.describe('1, 2, 4, 5 — imbrication, rehaussement, attributs, pertes', () => {
  test('en vrai navigateur', async ({ page }) => {
    const { errors, warnings } = collectConsole(page);
    await page.goto('/e2e/spike-repeat/spike-features.html');

    // 1. Sonde de rehaussement hors document.
    await expect.poll(() => page.evaluate(() => (window as any).__probe)).toBeTruthy();
    const probe = await page.evaluate(() => (window as any).__probe);
    console.log('SPIKE sonde de rehaussement :', JSON.stringify(probe));
    expect(probe.isConnected).toBe(false);
    expect(probe.cacheUnderFakeId).toBe(false);
    expect(probe.innerTemplateChildren).toBeGreaterThan(0);
    expect(probe.innerTemplateHtml).toContain('{{interieur}}');
    expect(probe.bindingsSeen).not.toContain('{{interieur}}');

    // 2a. Second test de #877, rejoué : display intérieur, placeholders intacts.
    await expect(page.locator('#cas-display .inner-item')).toHaveCount(3, { timeout: 15_000 });
    const items = await page.locator('#cas-display .inner-item').allTextContents();
    console.log('SPIKE imbrication (display intérieur) :', JSON.stringify(items));
    expect(items).toEqual(['[Question un|001]', '[Question deux|002]', '[Question trois|003]']);
    await expect(page.locator('#cas-display h2')).toHaveText('Chapitre un');

    // 2b. Répéteur dans répéteur.
    await expect(page.locator('#cas-repeat .inner-rep-item')).toHaveCount(3, { timeout: 15_000 });
    const items2 = await page.locator('#cas-repeat .inner-rep-item').allTextContents();
    console.log('SPIKE imbrication (répéteur intérieur) :', JSON.stringify(items2));
    expect(items2).toEqual([
      '[Question un|001|0]',
      '[Question deux|002|1]',
      '[Question trois|003|2]',
    ]);
    await expect(page.locator('#cas-repeat .chap-titre')).toHaveText('Chapitre un (1)');
    const ids = await page
      .locator('#cas-repeat .inner-rep-item')
      .evaluateAll((els) => els.map((e) => e.id));
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => /^spike-repeat-\d+-00[123]$/.test(id))).toBe(true);
    expect(await page.locator('[id*="{{"]').count()).toBe(0);

    // 4. Attributs booléens posés / retirés selon un champ ; {{#if}} dans une valeur.
    await expect(page.locator('#cas-attrs .probe')).toHaveCount(2);
    const attrs = await page.locator('#cas-attrs .probe').evaluateAll((els) =>
      els.map((e) => ({
        code: e.getAttribute('data-code'),
        cls: e.className.trim(),
        hidden: e.hasAttribute('hidden'),
        ariaCurrent: e.hasAttribute('aria-current'),
        leftover: [...e.attributes].some(
          (a) => a.name.startsWith('data-if-') || a.name.startsWith('data-unless-')
        ),
      }))
    );
    console.log('SPIKE attributs :', JSON.stringify(attrs));
    expect(attrs).toEqual([
      { code: 'a', cls: 'probe base est-vrai', hidden: true, ariaCurrent: false, leftover: false },
      { code: 'b', cls: 'probe base', hidden: false, ariaCurrent: true, leftover: false },
    ]);
    const charts = await page
      .locator('#cas-attrs .probe-chart')
      .evaluateAll((els) => els.map((e) => e.hasAttribute('horizontal')));
    expect(charts).toEqual([true, false]);

    // 5a. {{{brut}}} sur un nœud texte : rendu LITTÉRAL (pas de HTML).
    const bruts = await page
      .locator('#cas-attrs .brut')
      .evaluateAll((els) =>
        els.map((e) => ({ text: e.textContent, strong: e.querySelector('strong, em') !== null }))
      );
    console.log('SPIKE {{{brut}}} sur nœud texte :', JSON.stringify(bruts));
    expect(bruts[0].strong).toBe(false);
    expect(bruts[0].text).toBe('<strong>gras</strong> & texte');

    // 5b. {{#if}} englobant deux frères : balises vidées, contenu TOUJOURS rendu, avertissement.
    const englobants = await page
      .locator('#cas-attrs .englobant')
      .evaluateAll((els) =>
        els.map((e) => ({ spans: e.querySelectorAll('span').length, text: e.textContent?.trim() }))
      );
    console.log('SPIKE {{#if}} englobant :', JSON.stringify(englobants));
    expect(englobants).toEqual([
      { spans: 2, text: 'AB' },
      { spans: 2, text: 'AB' },
    ]);
    const splitWarnings = warnings.filter((w) => w.includes('bloc sans fermeture'));
    console.log('SPIKE avertissements « bloc sans fermeture » :', splitWarnings.length);
    expect(splitWarnings.length).toBeGreaterThan(0);

    // 5c. {{#if}} dans UN nœud texte : fonctionne.
    expect(await page.locator('#cas-attrs .dans-texte').allTextContents()).toEqual(['oui', 'non']);

    // 5d. Entités : la valeur est du texte (pas « &lt;strong&gt; » visible).
    const entites = await page.locator('#cas-attrs .entites').allTextContents();
    console.log('SPIKE entités :', JSON.stringify(entites));
    expect(entites[0]).toBe('<strong>gras</strong> & texte');

    // Identité en mode keyed : ré-émettre rep-attrs, mêmes nœuds.
    const identity = await page.evaluate(async () => {
      const before = [...document.querySelectorAll('#cas-attrs .probe')];
      before.forEach((e, i) => ((e as any).__tag = i));
      document.getElementById('rep-attrs')!.setAttribute(
        'data',
        JSON.stringify([
          { code: 'b', flag: true, html: 'x' },
          { code: 'a', flag: false, html: 'y' },
        ])
      );
      await new Promise((r) => setTimeout(r, 100));
      const after = [...document.querySelectorAll('#cas-attrs .probe')];
      return {
        same: after.every((e) => before.includes(e)),
        order: after.map((e) => e.getAttribute('data-code')),
        hidden: after.map((e) => e.hasAttribute('hidden')),
        cls: after.map((e) => e.className.trim()),
      };
    });
    console.log(
      'SPIKE identité par clé (réordonnée, valeurs changées) :',
      JSON.stringify(identity)
    );
    expect(identity.same).toBe(true);
    expect(identity.order).toEqual(['b', 'a']);
    expect(identity.hidden).toEqual([true, false]);
    expect(identity.cls).toEqual(['probe base est-vrai', 'probe base']);

    const otherWarnings = warnings.filter((w) => !w.includes('bloc sans fermeture'));
    console.log('SPIKE autres avertissements :', JSON.stringify(otherWarnings));
    expect(errors).toEqual([]);
  });
});
