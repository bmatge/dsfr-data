import { describe, it, expect } from 'vitest';
import { escapeHtml, jsonAttr } from '../../packages/shared/src/utils/escape-html';

describe('escapeHtml', () => {
  it('should escape ampersand', () => {
    expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
  });

  it('should escape less than', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('should escape greater than', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('should escape double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('should escape single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#039;s');
  });

  it('should handle null', () => {
    expect(escapeHtml(null)).toBe('');
  });

  it('should handle undefined', () => {
    expect(escapeHtml(undefined)).toBe('');
  });

  it('should handle empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('should return string unchanged if no special chars', () => {
    expect(escapeHtml('hello world 123')).toBe('hello world 123');
  });

  it('should handle multiple special chars', () => {
    expect(escapeHtml('<div class="test">&</div>')).toBe(
      '&lt;div class=&quot;test&quot;&gt;&amp;&lt;/div&gt;'
    );
  });
});

/**
 * `jsonAttr` — JSON destine a un attribut a guillemets SIMPLES (#615).
 *
 * La recette du generateur de l'Assistant IA a montre que
 * `data='${JSON.stringify(…)}'` casse sur une etiquette francaise ordinaire :
 * `JSON.stringify` echappe `"`, jamais `'`. Le meme patron etait ecrit a
 * quatre endroits, avec trois echappements differents (un complet, un partiel,
 * deux absents).
 */
describe('jsonAttr', () => {
  /** Relit la valeur comme un navigateur le ferait. */
  const relire = (valeur: unknown): unknown => {
    const doc = new DOMParser().parseFromString(
      `<dsfr-data-source data='${jsonAttr(valeur)}'></dsfr-data-source>`,
      'text/html'
    );
    return JSON.parse(doc.querySelector('dsfr-data-source')!.getAttribute('data')!);
  };

  it('traverse l’apostrophe — le defaut d’origine', () => {
    const lignes = [{ region: "Provence-Alpes-Cote d'Azur" }, { region: "Val-d'Oise" }];

    expect(relire(lignes)).toEqual(lignes);
  });

  it('traverse l’esperluette sans la decoder', () => {
    // Sans echapper `&`, un `&amp;` present dans la donnee redevient `&` a la
    // lecture : corruption silencieuse, aucun message.
    expect(relire([{ nom: 'Recherche &amp; Developpement' }])).toEqual([
      { nom: 'Recherche &amp; Developpement' },
    ]);
  });

  it('traverse un chevron sans ouvrir de balise', () => {
    expect(relire([{ note: '<script>alert(1)</script>' }])).toEqual([
      { note: '<script>alert(1)</script>' },
    ]);
    expect(jsonAttr([{ note: '<b>' }])).not.toContain('<b>');
  });

  it('laisse le JSON valide — le guillemet double n’est PAS echappe', () => {
    // C'est pour cela que `escapeHtml` ne convient pas ici : il transformerait
    // les `"` de la syntaxe JSON en `&quot;` et rendrait la valeur illisible.
    expect(jsonAttr([{ a: 'b' }])).toContain('"a"');
  });

  it('accepte les valeurs qui ne sont pas des tableaux', () => {
    expect(relire({ '93': 5098666, '95': 1249674 })).toEqual({ '93': 5098666, '95': 1249674 });
  });
});

describe('aucun generateur ne serialise a la main dans un attribut simple', () => {
  it('tous les sites d’appel passent par jsonAttr', async () => {
    // Le patron etait duplique SIX fois, avec quatre echappements
    // differents : un complet (dashboard), un partiel sans esperluette
    // (builder, carto), deux absents (builder-ia). Ce garde-fou a lui-meme
    // debusque les deux derniers. Un site de plus ecrit a la main repasserait
    // sous le defaut sans bruit.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const racine = join(__dirname, '../..');

    for (const fichier of [
      'apps/builder-ia/src/ui/code-generator.ts',
      'apps/builder/src/ui/code-generator.ts',
      'packages/shared/src/dashboard/export-html.ts',
      'apps/builder-carto/src/ui/code-generator.ts',
    ]) {
      const src = readFileSync(join(racine, fichier), 'utf-8');
      expect(src, `${fichier} : JSON.stringify dans un attribut simple`).not.toMatch(
        /='\$\{JSON\.stringify/
      );
    }
  });
});
