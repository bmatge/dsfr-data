import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * `dsfr-data-repeat` (#890) — ce que seul un vrai navigateur prouve.
 *
 * happy-dom ordonne les callbacks de cycle de vie à l'envers de Chromium ; les
 * tests unitaires (`tests/dsfr-data-repeat.test.ts`) portent le contrat
 * fonctionnel, ce spec porte : l'interpolation des attributs AVANT toute
 * connexion (aucun `q-{{code}}` ne touche le document), l'identité des
 * instances à la ré-émission, la garde de purge du cache (#895) pour un id porté
 * par une instance FABRIQUÉE par le gabarit, la transparence (zéro `role`) et
 * l'audit axe, puis la mesure de référence (119 lignes).
 */

test.describe('dsfr-data-repeat en vrai navigateur', () => {
  test('attributs résolus avant insertion, identité par clé, garde de purge #895 sur un id fabriqué', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/e2e/repeat.html');

    const kpi = (id: string) => page.locator(`#${id} .dsfr-data-kpi__value`);
    await expect(kpi('k-001')).toHaveText('30');
    await expect(kpi('k-002')).toHaveText('70');
    await expect(kpi('k-003')).toHaveText('60');
    expect(await page.locator('[id*="{{"]').count()).toBe(0);
    expect(await page.locator('[data-dsfr-config-error]').count()).toBe(0);
    // Attribut booléen conditionnel posé sur un composant dsfr-data
    expect(await page.locator('#k-001').getAttribute('horizontal')).not.toBeNull();
    expect(await page.locator('#k-002').getAttribute('horizontal')).toBeNull();
    // Transparence : rien d'annoncé, rien de nommé par la balise — les rôles présents
    // viennent des KPI du gabarit (contenu de l'auteur), jamais de la structure.
    expect(
      await page
        .locator(
          'dsfr-data-repeat [role]:not(dsfr-data-kpi *), dsfr-data-repeat [aria-live]:not(dsfr-data-kpi *)'
        )
        .count()
    ).toBe(0);
    expect(await page.locator('#rep .titre').allTextContents()).toEqual([
      'Question un',
      'Question deux',
      'Question trois',
    ]);

    // Ré-émission de la source répétée (mêmes clés) : mêmes instances, libellés mis à jour
    const result = await page.evaluate(async () => {
      const before = [...document.querySelectorAll('dsfr-data-query')];
      before.forEach((q, i) => ((q as any).__tag = i));
      const src = document.getElementById('rep-questions')!;
      src.setAttribute(
        'data',
        JSON.stringify([
          { code: '001', libelle: 'Question un (v2)', long: false },
          { code: '003', libelle: 'Question trois (v2)', long: true },
        ])
      );
      await new Promise((r) => setTimeout(r, 150));
      const after = [...document.querySelectorAll('dsfr-data-query')];
      // Un KPI monté APRÈS coup sur un id CONSERVÉ doit lire le cache (garde #895) ;
      // sur l'id RETIRÉ, le cache doit être purgé (pas de fuite).
      const tard = document.getElementById('tard')!;
      tard.innerHTML =
        '<dsfr-data-kpi id="tard-001" source="q-001" value="score:sum"></dsfr-data-kpi>' +
        '<dsfr-data-kpi id="tard-002" source="q-002" value="score:sum"></dsfr-data-kpi>';
      await new Promise((r) => setTimeout(r, 150));
      const text = (sel: string) => document.querySelector(sel)?.textContent?.trim() ?? '';
      return {
        ids: after.map((q) => q.id),
        sameQ001: after[0] === before[0] && (after[0] as any).__tag === 0,
        sameQ003: after[1] === before[2],
        titres: [...document.querySelectorAll('#rep .titre')].map((h) => h.textContent),
        horizontal: [...document.querySelectorAll('#rep dsfr-data-kpi')].map((k) =>
          k.hasAttribute('horizontal')
        ),
        tard001: text('#tard-001 .dsfr-data-kpi__value'),
        tard002: text('#tard-002 .dsfr-data-kpi__value'),
      };
    });
    expect(result.ids).toEqual(['q-001', 'q-003']);
    expect(result.sameQ001).toBe(true);
    expect(result.sameQ003).toBe(true);
    expect(result.titres).toEqual(['Question un (v2)', 'Question trois (v2)']);
    expect(result.horizontal).toEqual([false, true]);
    expect(result.tard001).toBe('30');
    expect(result.tard002).not.toBe('70');
    expect(errors).toEqual([]);
  });

  test('audit axe : aucune violation, aucun role posé par la balise', async ({ page }) => {
    await page.goto('/e2e/repeat.html');
    await expect(page.locator('#k-003 .dsfr-data-kpi__value')).toHaveText('60');
    // `grep -c 'role='` = 0 sur le rendu du répéteur hors composants du gabarit (#890) :
    // les KPI portent leurs propres rôles, on les retire de la copie avant de compter.
    const html = await page.locator('#rep').evaluate((el) => {
      const copy = el.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('dsfr-data-kpi, dsfr-data-query, template').forEach((n) => n.remove());
      return copy.outerHTML;
    });
    expect((html.match(/role=/g) ?? []).length).toBe(0);
    expect((html.match(/aria-/g) ?? []).length).toBe(0);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });

  /**
   * Lot 2 (#891) — `scopes` et `lazy` : les trois chiffres annoncés à l'issue.
   * happy-dom n'a pas d'`IntersectionObserver` et ordonne les callbacks à
   * l'envers : seul ce spec prouve `lazy` sur un vrai défilement, et seule une
   * vraie page mesure une ré-émission.
   */
  test('scopes : 119 graphiques sans une seule query, ré-émission de la source scopée ≤ 30 ms, 0 instance recréée', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto('/e2e/repeat-perf.html?mode=scopes');
    await expect
      .poll(() => page.evaluate(() => (window as any).__perf.firstRenderMs), { timeout: 60_000 })
      .not.toBeNull();
    const premier = await page.evaluate(() => (window as any).__perf.firstRenderMs as number);
    expect(await page.locator('canvas').count()).toBe(119);
    // Le gabarit ne contient AUCUNE query : les 119 ids viennent de `scopes`.
    expect(await page.locator('dsfr-data-query').count()).toBe(0);
    expect(await page.locator('[id*="{{"]').count()).toBe(0);
    expect(await page.locator('[data-dsfr-config-error]').count()).toBe(0);
    expect(await page.evaluate(() => (document.getElementById('rep') as any).getScopedIds().length))
      .toBe(119);

    // Écouteurs `document` par type d'événement, rapportés à la ligne.
    const ecouteurs = (await page.evaluate(() => (window as any).__ecouteurs)) as Record<
      string,
      number
    >;
    const parLigne = (ecouteurs['dsfr-data-loaded'] ?? 0) / 119;
    console.log(
      `REPEAT-SCOPES: premier rendu ${premier.toFixed(0)} ms | écouteurs « dsfr-data-loaded » ${ecouteurs['dsfr-data-loaded']} soit ${parLigne.toFixed(2)} par ligne`
    );
    // ≤ 1 + (nombre de feuilles du gabarit) par ligne — une feuille ici.
    expect(parLigne).toBeLessThanOrEqual(2);

    const scope = (await page.evaluate(() => (window as any).__perfReemitScope())) as {
      msRefiltre: number;
      msTotal: number;
      emissions: number;
      identity: boolean;
      canvases: number;
    };
    console.log(
      `REPEAT-SCOPES: ré-émission de la source SCOPÉE — refiltre ${scope.msRefiltre.toFixed(1)} ms ` +
        `pour ${scope.emissions} ids, total (repeint compris) ${scope.msTotal.toFixed(0)} ms | ` +
        `identité ${scope.identity} | ${scope.canvases} canvas`
    );
    expect(scope.emissions).toBe(119);
    expect(scope.identity).toBe(true);
    expect(scope.canvases).toBe(119);
    // Le REFILTRE est ce que `scopes` change : une partition au lieu de 119
    // filtres. Le repeint des 119 graphiques est le coût de DSFR Chart, et il
    // est le même dans les deux modes (mesuré par le test de référence).
    expect(scope.msRefiltre).toBeLessThanOrEqual(30);
    expect(errors).toEqual([]);
  });

  test('référence : le même refiltre avec une query par ligne (lot 1)', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto('/e2e/repeat-perf.html?mode=repeat');
    await expect
      .poll(() => page.evaluate(() => (window as any).__perf.firstRenderMs), { timeout: 60_000 })
      .not.toBeNull();
    const scope = (await page.evaluate(() => (window as any).__perfReemitScope())) as {
      msRefiltre: number;
      msTotal: number;
      emissions: number;
    };
    const ecouteurs = (await page.evaluate(() => (window as any).__ecouteurs)) as Record<
      string,
      number
    >;
    console.log(
      `REPEAT-QUERIES: écouteurs « dsfr-data-loaded » ${ecouteurs['dsfr-data-loaded']} soit ` +
        `${((ecouteurs['dsfr-data-loaded'] ?? 0) / 119).toFixed(2)} par ligne`
    );
    console.log(
      `REPEAT-QUERIES: ré-émission de la source partagée — refiltre ${scope.msRefiltre.toFixed(1)} ms ` +
        `pour ${scope.emissions} ids, total (repeint compris) ${scope.msTotal.toFixed(0)} ms (119 queries)`
    );
  });

  test('lazy : moins de 20 canvas au chargement, 119 après défilement, aucune erreur', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto('/e2e/repeat-perf.html?mode=scopes-lazy');

    // Les titres sont là tout de suite : le plan de la page ne dépend pas du défilement.
    await expect.poll(() => page.locator('#rep h2').count(), { timeout: 30_000 }).toBe(119);
    await page.waitForTimeout(1500);
    const auChargement = await page.locator('canvas').count();
    console.log(`REPEAT-LAZY: ${auChargement} canvas sur 119 au chargement`);
    expect(auChargement).toBeLessThan(20);
    expect(auChargement).toBeGreaterThan(0);

    // Les ids scopés, eux, sont émis pour TOUTES les lignes dès le départ.
    expect(await page.evaluate(() => (document.getElementById('rep') as any).getScopedIds().length))
      .toBe(119);

    // Défilement complet — les graphiques DSFR Chart se rendent à la visibilité,
    // la recette DOIT défiler (le piège des faux positifs du banc).
    // Pas de 800 px, pas de 2 000 : l'IntersectionObserver est ÉCHANTILLONNÉ,
    // une ligne entièrement franchie entre deux relevés n'est jamais signalée
    // (deux lignes manquaient à 2 000 px par cran).
    for (let i = 0; i < 200; i++) {
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(60);
      if ((await page.locator('canvas').count()) >= 119) break;
    }
    await expect.poll(() => page.locator('canvas').count(), { timeout: 30_000 }).toBe(119);
    expect(await page.locator('[data-dsfr-config-error]').count()).toBe(0);
    expect(errors).toEqual([]);
  });

  for (const mode of ['repeat', 'display'] as const) {
    test(`mesure 119 lignes × (query + graphique) — ${mode}`, async ({ page }) => {
      test.setTimeout(120_000);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.setViewportSize({ width: 1200, height: 900 });
      await page.goto(`/e2e/repeat-perf.html?mode=${mode}`);
      await expect
        .poll(() => page.evaluate(() => (window as any).__perf.firstRenderMs), { timeout: 60_000 })
        .not.toBeNull();
      const first = await page.evaluate(() => (window as any).__perf.firstRenderMs as number);
      expect(await page.locator('canvas').count()).toBe(119);
      expect(await page.locator('[id*="{{"]').count()).toBe(0);
      const reemit = (await page.evaluate(() => (window as any).__perfReemit())) as {
        ms: number;
        identity: boolean;
        canvases: number;
        libelle: string;
      };
      expect(reemit.canvases).toBe(119);
      expect(reemit.libelle).toContain('(v2)');
      expect(reemit.identity).toBe(mode === 'repeat');
      console.log(
        `REPEAT-PERF ${mode}: premier rendu ${first.toFixed(0)} ms | ré-émission source répétée ${reemit.ms.toFixed(0)} ms | identité ${reemit.identity}`
      );
      expect(errors).toEqual([]);
    });
  }
});
