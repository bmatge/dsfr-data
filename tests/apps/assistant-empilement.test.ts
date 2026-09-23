/**
 * Empilement de l'assistant dans CHAQUE app (#1018, ARCHITECTURE §3.8).
 *
 * `tests/apps/app-ui/chrome-mobile.test.ts` vérifie le chrome commun : le
 * panneau (z 770) s'arrête au-dessus du rail du Diagnostic (780) et de la
 * barre d'actions fixe (800), et passe sous le volet. Ce qui peut encore le
 * casser vit dans les apps : une règle d'app posée dans la bande 700-999
 * (entre le panneau et le mobilier bas), une règle qui vise le panneau, ou un
 * bouton « Assistant » hors de la barre qui publie `--app-action-bar-fixed-h`.
 *
 * Les modales des apps (z ≥ 1000) passent AU-DESSUS du panneau : c'est voulu,
 * l'adaptateur ouvre la modale qui porte le réglage montré. Même chose pour le
 * panneau d'aperçu des Sources (1500), qui porte les repères `sources.apercu.*`.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RACINE = resolve(import.meta.dirname, '../..');

const APPS = [
  { app: 'builder', prefixe: 'builder', barre: true },
  { app: 'builder-carto', prefixe: 'carto', barre: true },
  { app: 'dashboard', prefixe: 'dashboard', barre: true },
  { app: 'pipeline-helper', prefixe: 'pipeline', barre: true },
  { app: 'playground', prefixe: 'playground', barre: true },
  { app: 'sources', prefixe: 'sources', barre: false },
];

/** Feuilles CSS d'une app (`src/styles/*.css`). */
function feuilles(app: string): string[] {
  const dossier = join(RACINE, 'apps', app, 'src/styles');
  let noms: string[];
  try {
    noms = readdirSync(dossier).filter((n) => n.endsWith('.css'));
  } catch {
    return [];
  }
  return noms.map((n) => readFileSync(join(dossier, n), 'utf-8'));
}

/** Valeurs de `z-index` déclarées dans un texte CSS, sans expression régulière. */
function zIndex(css: string): number[] {
  const out: number[] = [];
  for (let i = css.indexOf('z-index'); i !== -1; i = css.indexOf('z-index', i + 1)) {
    const deux = css.indexOf(':', i);
    const fin = css.indexOf(';', deux);
    if (deux === -1 || fin === -1) continue;
    const n = Number(css.slice(deux + 1, fin).trim());
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

describe('le panneau Assistant garde sa place dans chaque app (§3.8)', () => {
  for (const { app, prefixe, barre } of APPS) {
    it(`${app} : bouton « Assistant » à sa place, porteur de son repère`, () => {
      const html = readFileSync(join(RACINE, 'apps', app, 'index.html'), 'utf-8');
      const i = html.indexOf('id="assistant-btn"');
      expect(i, 'bouton #assistant-btn').toBeGreaterThan(-1);
      const balise = html.slice(html.lastIndexOf('<', i), html.indexOf('>', i));
      expect(balise).toContain(`data-repere="${prefixe}.actions.assistant"`);
      expect(balise).toContain('aria-expanded="false"');
      if (barre) {
        // Dans la barre : il suit l'empilement mobile de la barre fixe.
        const debut = html.indexOf('<app-action-bar');
        const fin = html.indexOf('</app-action-bar>');
        expect(i > debut && i < fin, 'dans <app-action-bar>').toBe(true);
        expect(balise).toContain('slot="tertiary"');
      }
    });

    it(`${app} : aucune règle d’app entre le panneau et le mobilier bas, ni sur le panneau`, () => {
      for (const css of feuilles(app)) {
        for (const z of zIndex(css)) {
          expect(z < 700 || z >= 1000, `z-index ${z} dans la bande du mobilier bas`).toBe(true);
        }
        expect(css).not.toContain('assistant-panneau');
        expect(css).not.toContain('app-assistant');
      }
    });
  }
});
