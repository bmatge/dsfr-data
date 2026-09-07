import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildLintCopy, LINT_GENERATED_HEADER } from '../../scripts/lib/lint-markup-copy.js';

/**
 * Les copies vers le serveur MCP (#608).
 *
 * `mcp-server/` est hors des workspaces npm et publie separement : il ne peut
 * importer aucun module du monorepo. L'analyseur y est donc DUPLIQUE par le
 * build. Une duplication sans garde-fou derive — ces tests la rendent
 * bruyante, comme le fait deja `skill-matching.test.ts`.
 */

const ROOT = join(__dirname, '../..');
const SOURCE = join(ROOT, 'packages/shared/src/debug/lint-markup.ts');
const COPIE = join(ROOT, 'mcp-server/src/lint-markup.generated.ts');
const CONTRAT = join(ROOT, 'mcp-server/src/component-contract.generated.ts');

describe('copie de l’analyseur vers le serveur MCP', () => {
  it('la copie commitée est à jour', () => {
    // Si ce test casse : npm run build:lint-markup
    expect(readFileSync(COPIE, 'utf-8')).toBe(buildLintCopy(readFileSync(SOURCE, 'utf-8')));
  });

  it('la copie porte l’en-tête « ne pas editer »', () => {
    expect(readFileSync(COPIE, 'utf-8').startsWith(LINT_GENERATED_HEADER)).toBe(true);
  });

  it('la source ne contient AUCUN import — contrainte structurelle', () => {
    // Un import rendrait la copie non resoluble cote MCP : les chemins du
    // monorepo n'existent pas dans le paquet publie.
    expect(readFileSync(SOURCE, 'utf-8')).not.toMatch(/^\s*import\s/m);
  });

  it('la génération REFUSE une source qui contiendrait un import', () => {
    // Refuser de generer plutot que livrer un fichier casse.
    expect(() => buildLintCopy("import { x } from 'y';\nexport const a = 1;")).toThrow(/import/);
  });
});

describe('contrat des composants généré depuis le manifeste', () => {
  it('existe et couvre les balises du manifeste', () => {
    expect(existsSync(CONTRAT)).toBe(true);
    const src = readFileSync(CONTRAT, 'utf-8');
    expect(src).toContain('dsfr-data-source');
    expect(src).toContain('dsfr-data-query');
    expect(src).toContain('NE PAS EDITER');
  });

  it('est aligné sur custom-elements.json — l’autorité, générée depuis le code', () => {
    // Une liste d'attributs ecrite a la main derive en silence, et le linter
    // se met a signaler des attributs parfaitement valides.
    const cem = JSON.parse(readFileSync(join(ROOT, 'packages/core/custom-elements.json'), 'utf-8'));
    const tagsCem = new Set<string>();
    for (const mod of cem.modules ?? []) {
      for (const decl of mod.declarations ?? []) {
        if (decl.tagName) tagsCem.add(decl.tagName);
      }
    }
    const src = readFileSync(CONTRAT, 'utf-8');
    for (const tag of tagsCem) {
      expect(src.includes(`"${tag}"`), `${tag} absent du contrat MCP`).toBe(true);
    }
  });
});
