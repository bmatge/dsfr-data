import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Empilement de la Carto face au volet Diagnostic (#612).
 *
 * CE FICHIER EXISTE A CAUSE D'UNE REGRESSION REELLE. L'epic #602 a monte le
 * volet Diagnostic dans les sept apps ; dans la Carto, il s'ouvrait DERRIERE
 * les panneaux flottants de configuration. Le volet est a `z-index: 780`
 * (echelle commune d'app-ui, partagee par les sept apps), la Carto posait son
 * mobilier a 1000 — et `.carto-workspace` ne cree pas de contexte
 * d'empilement, donc les deux echelles concouraient dans le contexte racine.
 *
 * Deux invariants a tenir, et ils tirent en sens INVERSE :
 *   - le mobilier flottant (panneaux, pastille) passe SOUS le tiroir ;
 *   - les modales passent AU-DESSUS.
 *
 * D'ou le refus d'isoler `.carto-workspace` : `isolation: isolate` aurait
 * confine les deux, or les modales vivent dans le workspace
 * (`#onboard-modal`) et seraient passees sous le tiroir ouvert.
 */

const CARTO_CSS = join(__dirname, '../../../apps/builder-carto/src/styles/carto.css');
const PANEL_TS = join(__dirname, '../../../packages/app-ui/src/app-diagnostic-panel.ts');

/** z-index declare pour un selecteur, lu dans la feuille. */
function zIndexDe(css: string, selecteur: string): number | null {
  const bloc = new RegExp(`\\n${selecteur.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(css);
  if (!bloc) return null;
  const z = /z-index:\s*(\d+)/.exec(bloc[1]);
  return z ? Number(z[1]) : null;
}

describe('empilement Carto / volet Diagnostic (#612)', () => {
  const css = readFileSync(CARTO_CSS, 'utf-8');

  /** L'echelle commune d'app-ui — la source, pas une constante recopiee. */
  const zVolet = (() => {
    const src = readFileSync(PANEL_TS, 'utf-8');
    const m = /app-diagnostic-panel\{[^}]*z-index:\s*(\d+)/.exec(src);
    return m ? Number(m[1]) : NaN;
  })();

  it('le volet déclare bien un z-index lisible', () => {
    // Si ce test casse, c'est la lecture de l'echelle commune qui a derive :
    // tous les autres deviendraient vrais pour de mauvaises raisons.
    expect(Number.isFinite(zVolet)).toBe(true);
    expect(zVolet).toBeGreaterThan(0);
  });

  it('les panneaux flottants passent SOUS le tiroir', () => {
    const z = zIndexDe(css, '.carto-panels');

    expect(z).not.toBeNull();
    expect(z!, `.carto-panels doit rester sous le volet (${zVolet})`).toBeLessThan(zVolet);
  });

  it('la pastille de statut passe SOUS le tiroir', () => {
    const z = zIndexDe(css, '.carto-status');

    expect(z).not.toBeNull();
    expect(z!, `.carto-status doit rester sous le volet (${zVolet})`).toBeLessThan(zVolet);
  });

  it('les modales passent AU-DESSUS du tiroir', () => {
    // Sens inverse : une modale doit couvrir tout, tiroir compris.
    const overlay = zIndexDe(css, '.carto-modal-overlay');
    const sombre = zIndexDe(css, '.carto-modal-overlay--dark');

    expect(overlay!, 'une modale doit couvrir le volet').toBeGreaterThan(zVolet);
    expect(sombre!, 'une modale bloquante doit couvrir le volet').toBeGreaterThan(zVolet);
  });

  it('le workspace n’est PAS isolé — sinon les modales seraient confinées', () => {
    // `isolation: isolate` reglerait le premier invariant et casserait le
    // second : les modales sont DANS le workspace (`#onboard-modal`).
    const bloc = /\n\.carto-workspace\s*\{([^}]*)\}/.exec(css);

    expect(bloc).not.toBeNull();
    expect(bloc![1]).not.toContain('isolation');
    expect(bloc![1]).not.toMatch(/z-index:\s*\d/);
  });

  it('le canevas reste un contexte d’empilement — Leaflet y est confiné', () => {
    // Leaflet monte ses controles a z-index 1000. Sans ce contexte, ils
    // repasseraient au-dessus du tiroir.
    const bloc = /\n\.carto-canvas\s*\{([^}]*)\}/.exec(css);

    expect(bloc![1]).toMatch(/position:\s*absolute/);
    expect(bloc![1]).toMatch(/z-index:\s*\d/);
  });

  it('le mobilier bas réserve la hauteur du rail', () => {
    // La pastille de statut vit a `bottom: 16px`, exactement ou le rail
    // replie se pose : sans reserve, le rail la recouvrirait.
    for (const selecteur of ['.carto-panels', '.carto-status']) {
      const bloc = new RegExp(`\\n${selecteur.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(css);
      expect(bloc![1], `${selecteur} doit réserver --app-diagnostic-h`).toContain(
        'var(--app-diagnostic-h'
      );
    }
  });

  it('aucun z-index de la Carto ne se glisse entre le mobilier et les modales', () => {
    // Filet large : une valeur nouvelle dans la zone du volet signalerait
    // qu'on refait le conflit sans s'en apercevoir.
    // Hors commentaires : la note d'entete CITE l'echelle commune, elle ne
    // la declare pas.
    const regles = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const valeurs = [...regles.matchAll(/z-index:\s*(\d+)/g)].map((m) => Number(m[1]));
    const litigieuses = valeurs.filter((z) => z >= zVolet && z < 1200);

    expect(litigieuses, `z-index en conflit avec le volet (${zVolet})`).toEqual([]);
  });
});
