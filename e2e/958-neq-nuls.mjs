/**
 * Lance e2e/958-neq-nuls.html dans un vrai navigateur, contre le VRAI portail,
 * et rend les cinq chiffres affichés + les avertissements de la bibliothèque.
 * Jetable : la preuve de #958, pas un contrôle du dépôt.
 *
 *   node e2e/958-neq-nuls.mjs <port>
 */
import { chromium } from 'playwright';

const port = process.argv[2] ?? '5321';
const navigateur = await chromium.launch();
const page = await navigateur.newPage();
const dits = [];
page.on('console', (m) => {
  if (m.type() === 'warning' || m.type() === 'error') dits.push(m.text());
});
await page.goto(`http://localhost:${port}/e2e/958-neq-nuls.html`);

const lire = async (id) => {
  const el = page.locator(`#${id} .dsfr-data-kpi__value`);
  await el.waitFor({ timeout: 30_000 });
  for (let i = 0; i < 40; i++) {
    const a = (await el.textContent())?.trim();
    await page.waitForTimeout(250);
    const b = (await el.textContent())?.trim();
    if (a === b && a && a !== '—') return a;
  }
  return (await el.textContent())?.trim();
};

const chiffres = {};
for (const id of ['k-total', 'k-eq', 'k-serveur', 'k-client', 'k-null']) {
  chiffres[id] = await lire(id);
}
console.log(JSON.stringify({ chiffres, dits }, null, 2));
await navigateur.close();
