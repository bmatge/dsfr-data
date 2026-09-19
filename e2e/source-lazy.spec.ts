import { test, expect, type Page } from '@playwright/test';

/**
 * `lazy` sur `dsfr-data-source` (#931, AM-083) — ce que seul un vrai
 * navigateur prouve : happy-dom n'a pas d'`IntersectionObserver`, et un
 * panneau d'onglet fermé n'y est pas « sans boîte ».
 *
 * La fixture porte la forme des deux générateurs de portrait du portail
 * Sports : six onglets, huit sources chacune, quarante-huit sources. Le même
 * document est mesuré DEUX fois — l'attribut `lazy` est retiré à la volée
 * pour la mesure de référence — pour que le chiffre d'avant et celui d'après
 * viennent de la même page.
 */

const FIXTURE = '/e2e/source-lazy.html';
const DATA = 'source-lazy-data.json';

/** Compte les requêtes de données émises, dans l'ordre. */
function trackRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes(DATA)) seen.push(r.url());
  });
  return seen;
}

/** Sert la fixture sans l'attribut `lazy` : la page d'avant, au mot près. */
async function stripLazy(page: Page): Promise<void> {
  await page.route(`**${FIXTURE}`, async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replaceAll(' lazy>', '>');
    await route.fulfill({
      response,
      body,
      headers: { ...response.headers(), 'content-type': 'text/html' },
    });
  });
}

test.describe('dsfr-data-source lazy — une page à onglets ne paie que ce qu’on regarde', () => {
  test('sans l’attribut, les 48 sources partent au chargement', async ({ page }) => {
    const requests = trackRequests(page);
    await stripLazy(page);
    await page.goto(FIXTURE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    expect(requests.length).toBe(48);
  });

  test('avec lazy, seul le visible charge — puis l’onglet qu’on ouvre', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    const requests = trackRequests(page);

    await page.goto(FIXTURE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    // Cinq onglets sur six sont fermés : leurs consommateurs n'ont pas de
    // boîte, ils n'intersectent jamais. Le premier onglet ne paie lui-même
    // que ce qui tient dans le viewport plus la marge de 200 px.
    const auRepos = requests.length;
    expect(auRepos).toBeGreaterThan(0);
    expect(auRepos).toBeLessThanOrEqual(8);

    await page.click('button[data-onglet="4"]');
    await page.waitForTimeout(1000);
    const apresOuverture = requests.length;
    expect(apresOuverture).toBeGreaterThan(auRepos);
    expect(apresOuverture).toBeLessThanOrEqual(16);

    // La donnée de l'onglet ouvert est juste : 12 + 7 + 31.
    await expect(page.locator('#panneau-4 .dsfr-data-kpi__value').first()).toHaveText('50');

    // Aucune requête n'est émise deux fois : la porte ne s'ouvre qu'une fois.
    expect(new Set(requests).size).toBe(requests.length);
    expect(errors).toEqual([]);
  });

  test('une source déjà chargée ne repart pas quand on referme puis rouvre l’onglet', async ({
    page,
  }) => {
    const requests = trackRequests(page);
    const duTroisieme = () => requests.filter((u) => u.includes('s=s3-')).length;
    await page.goto(FIXTURE, { waitUntil: 'networkidle' });
    expect(duTroisieme()).toBe(0);

    await page.click('button[data-onglet="3"]');
    await page.waitForTimeout(800);
    const apresPremiereOuverture = duTroisieme();
    expect(apresPremiereOuverture).toBeGreaterThan(0);

    await page.click('button[data-onglet="1"]');
    await page.waitForTimeout(400);
    await page.click('button[data-onglet="3"]');
    await page.waitForTimeout(800);
    expect(duTroisieme()).toBe(apresPremiereOuverture);
  });
});
