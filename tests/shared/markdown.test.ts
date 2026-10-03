import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../../packages/shared/src/ui/markdown';

describe('renderMarkdown', () => {
  it('rend un tableau GFM en <table>', () => {
    const md = ['| A | B |', '|---|---|', '| 1 | 2 |', '| 3 | 4 |'].join('\n');
    const html = renderMarkdown(md);
    expect(html).toContain('<table');
    expect(html).toContain('<th>A</th>');
    expect(html).toContain('<td>1</td>');
    expect(html).toContain('<td>4</td>');
    expect(html).not.toContain('|---|');
  });

  it('rend une liste a puces en <ul><li>', () => {
    const html = renderMarkdown('- un\n- deux');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>un</li>');
    expect(html).toContain('<li>deux</li>');
  });

  it('gere gras et code inline', () => {
    const html = renderMarkdown('Voici **gras** et `code`.');
    expect(html).toContain('<strong>gras</strong>');
    expect(html).toContain('<code>code</code>');
  });

  it('rend un bloc de code fence sans le reformater', () => {
    const html = renderMarkdown('```json\n{"a":1}\n```');
    expect(html).toContain('<pre><code>');
    expect(html).toMatch(/a&quot;:1/); // contenu echappe (securite), pas de fence
    expect(html).not.toContain('```');
  });

  it('echappe le HTML (pas d injection)', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('convertit les sauts de ligne simples en <br>', () => {
    const html = renderMarkdown('ligne1\nligne2');
    expect(html).toContain('ligne1<br>ligne2');
  });
});
