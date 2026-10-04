import { test, expect, type Page } from '@playwright/test';
import { startReference } from '../tests/relay/support/reference.mjs';
import {
  answerPortal,
  PORTAL_HOST,
  RECORDS_PATH,
  ROWS,
  startPortalUpstream,
  TOTAL,
  TOTAL_BY_REGION,
} from '../tests/relay/support/portal-upstream.mjs';

/**
 * Relais cachable du site hôte — critères d'acceptation de #1232 (constat
 * AM-114 du banc d'essai, ADR-155 lot 2), dans un VRAI navigateur, contre le
 * VRAI relais de référence (`proxy/relay/node/`, code de production).
 *
 *   - la source émet sa requête vers le relais, et deux cibles différentes
 *     produisent deux URL différentes ;
 *   - une même requête rejouée produit la même URL au caractère près ;
 *   - sans relais configuré, le comportement ne change pas.
 *
 * Ce que seul un navigateur prouve : le relais est sur une AUTRE origine que
 * la page, et n'autorise aucun en-tête de requête (C-MET-3). Si la bibliothèque
 * envoyait un en-tête, le navigateur ferait une pré-vérification, que le relais
 * refuse — la donnée ne s'afficherait pas.
 *
 * Aucun service réel : le portail est un faux amont local, son hôte est en
 * `.test`, la résolution DNS et la connexion sont injectées dans le relais.
 */

type Portal = Awaited<ReturnType<typeof startPortalUpstream>>;
type Reference = Awaited<ReturnType<typeof startReference>>;

let portal: Portal;
let relay: Reference;

test.beforeAll(async () => {
  portal = await startPortalUpstream();
  relay = await startReference({ upstreamPort: portal.port });
});

test.afterAll(async () => {
  await relay?.close();
  await portal?.close();
});

const chiffres = (texte: string | null): string => (texte ?? '').replace(/\D/g, '');

/** Préfixe du relais, sans barre finale. */
const relais = (): string => relay.url.href.replace(/\/+$/, '');

/** Sert le portail EN DIRECT (source sans relais) : même jeu que derrière le relais. */
async function servirLePortailEnDirect(page: Page): Promise<string[]> {
  const directes: string[] = [];
  await page.route(`https://${PORTAL_HOST}/**`, async (route) => {
    directes.push(route.request().url());
    const charge = answerPortal(route.request().url());
    await route.fulfill({
      status: charge === null ? 404 : 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(charge ?? { error: 'inconnu' }),
    });
  });
  return directes;
}

/** Observe les requêtes parties au relais, et l'état de cache de leurs réponses. */
function observerLeRelais(page: Page): { relayees: string[]; cache: Record<string, string> } {
  const relayees: string[] = [];
  const cache: Record<string, string> = {};
  page.on('request', (r) => {
    if (r.url().startsWith(relais())) relayees.push(r.url());
  });
  page.on('response', (r) => {
    if (r.url().startsWith(relais())) cache[r.url()] = r.headers()['x-relay-cache'] ?? '';
  });
  return { relayees, cache };
}

test('une source Opendatasoft charge, pagine et délègue un group-by à travers le relais', async ({
  page,
}) => {
  // AUCUNE interception du réseau dans ce test : dès qu'une route est posée,
  // Playwright répond lui-même aux pré-vérifications CORS, et une requête non
  // « simple » passerait à tort. Ici, le navigateur parle au relais pour de bon.
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  const { relayees, cache } = observerLeRelais(page);
  const logsAuDepart = relay.logs.length;
  const requetesAuDepart = portal.requests.length;

  await page.goto(`/e2e/relay-url.html?direct=0&relais=${encodeURIComponent(relais())}`);

  // --- a : chargée et PAGINÉE à travers le relais ------------------------
  await expect(page.locator('#a-n')).toContainText(String(ROWS.length), { timeout: 15_000 });
  await expect
    .poll(async () => chiffres(await page.locator('#a-somme').textContent()))
    .toContain(String(TOTAL));

  // --- b : group-by DÉLÉGUÉ à travers le relais --------------------------
  const lignes = page.locator('#b-l tbody tr');
  await expect(lignes).toHaveCount(TOTAL_BY_REGION.size, { timeout: 15_000 });
  const attendues = [...TOTAL_BY_REGION].sort((x, y) => y[1] - x[1]);
  for (const [i, [region, total]] of attendues.entries()) {
    await expect(lignes.nth(i)).toContainText(region);
    expect(chiffres(await lignes.nth(i).locator('td').nth(1).textContent())).toBe(String(total));
  }

  const prefixe = `${relais()}/${PORTAL_HOST}${RECORDS_PATH}`;
  const deA = relayees.filter((u) => !u.includes('group_by='));
  const deB = relayees.filter((u) => u.includes('group_by='));

  // Critère 1 — la requête part vers le relais, sous <relais>/<hôte>/<chemin>?<requête>
  for (const url of relayees) expect(url.startsWith(`${prefixe}?`)).toBe(true);
  expect(deA).toEqual([
    `${prefixe}?limit=100`,
    `${prefixe}?limit=100&offset=100`,
    `${prefixe}?limit=100&offset=200`,
  ]);
  // … et deux cibles différentes produisent deux URL différentes
  expect(deB.length).toBeGreaterThanOrEqual(1);
  expect(new Set(deB).size).toBe(1);
  expect(deB[0]).toContain('group_by=region');
  expect(new Set([...deA, ...deB]).size).toBe(4);

  // Le portail a reçu, par le relais, le chemin et la requête octet pour octet
  const recues = portal.requests.map((r) => r.url);
  const cibles = [...deA, deB[0]].map((u) => u.slice(`${relais()}/${PORTAL_HOST}`.length));
  expect(recues).toEqual(expect.arrayContaining(cibles));
  // … et rien du visiteur : ni cookie, ni origine, ni référent, ni clé
  for (const requete of portal.requests.slice(requetesAuDepart)) {
    expect(requete.headers.cookie).toBeUndefined();
    expect(requete.headers.origin).toBeUndefined();
    expect(requete.headers.referer).toBeUndefined();
    expect(requete.headers.authorization).toBeUndefined();
  }

  // Requête « simple » : aucune pré-vérification CORS n'a atteint le relais,
  // qui est pourtant sur une autre origine que la page.
  expect(new URL(relais()).origin).not.toBe(new URL(page.url()).origin);
  const methodes = relay.logs.slice(logsAuDepart).map((l) => l.method);
  expect(methodes.length).toBeGreaterThanOrEqual(4);
  expect(methodes.every((m) => m === 'GET')).toBe(true);

  // Critère 2 — la même requête rejouée produit la même URL au caractère près…
  const vuesParLePortail = portal.requests.length;
  const vuesParLeRelais = relay.logs.length;
  const avant = relayees.length;
  await page.evaluate(() =>
    (document.getElementById('a') as unknown as { reload(): void }).reload()
  );
  await expect.poll(() => relayees.length).toBe(avant + 3);
  expect(relayees.slice(avant)).toEqual(deA);
  // … donc un cache la sert, et le portail n'est pas rappelé. Lequel, peu importe :
  // le cache HTTP du navigateur (le relais répond `Cache-Control: public, max-age`)
  // ou, s'il est coupé, celui du relais (`X-Relay-Cache: HIT`).
  await expect(page.locator('#a-n')).toContainText(String(ROWS.length));
  await expect.poll(() => deA.every((u) => cache[u] !== undefined)).toBe(true);
  expect(portal.requests.length).toBe(vuesParLePortail);
  expect(relay.logs.slice(vuesParLeRelais).every((l) => l.cache === 'HIT')).toBe(true);

  // Le témoin : ce que ferait une bibliothèque qui enverrait la clé au relais.
  // Le navigateur pré-vérifie, le relais n'autorise aucun en-tête, la requête ne
  // part pas — et le journal du relais VOIT cette pré-vérification : son absence
  // plus haut n'est donc pas un angle mort de l'instrument.
  const logsAvant = relay.logs.length;
  const issue = await page.evaluate(async (url) => {
    try {
      const response = await fetch(url, { headers: { Authorization: 'Apikey CLE' } });
      return `HTTP ${response.status}`;
    } catch (e) {
      return (e as Error).name;
    }
  }, `${prefixe}?limit=1&temoin=entete`);
  expect(issue).toBe('TypeError');
  const apres = relay.logs.slice(logsAvant).map((l) => l.method);
  expect(apres).toContain('OPTIONS');
  expect(apres).not.toContain('GET');

  expect(erreurs).toEqual([]);
});

test('sans relais, rien ne change : la source voisine appelle le portail en direct', async ({
  page,
}) => {
  const { relayees } = observerLeRelais(page);
  const directes = await servirLePortailEnDirect(page);

  await page.goto(`/e2e/relay-url.html?relais=${encodeURIComponent(relais())}`);

  await expect(page.locator('#c-n')).toContainText(String(ROWS.length), { timeout: 15_000 });
  await expect
    .poll(async () => chiffres(await page.locator('#c-somme').textContent()))
    .toContain(String(TOTAL));
  // Critère 3 — la source c, sans `relay-url`, appelle le portail lui-même
  expect(directes).toEqual([
    `https://${PORTAL_HOST}${RECORDS_PATH}?limit=100`,
    `https://${PORTAL_HOST}${RECORDS_PATH}?limit=100&offset=100`,
    `https://${PORTAL_HOST}${RECORDS_PATH}?limit=100&offset=200`,
  ]);

  // … pendant que ses voisines, sur la même page, passent par le relais : mêmes chiffres
  await expect(page.locator('#a-n')).toContainText(String(ROWS.length), { timeout: 15_000 });
  expect(chiffres(await page.locator('#a-somme').textContent())).toBe(
    chiffres(await page.locator('#c-somme').textContent())
  );
  expect(relayees.length).toBeGreaterThanOrEqual(4);
  expect(relayees.every((u) => !directes.includes(u))).toBe(true);
});
