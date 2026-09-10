import { describe, it, expect } from 'vitest';

/**
 * Tests #737 — bloc `{{#each champ}}…{{/each}}` du moteur de templates
 * partagé (dsfr-data-display, dsfr-data-map-popup).
 *
 * Avant : `BLOCK_RE` ne connaissait que `if` et `unless` (#664), un champ
 * tableau ne pouvait être rendu qu'aplati par `join` — jamais en liste
 * structurée.
 *
 * Invariant à préserver : la pré-passe travaille sur le TEXTE du template et
 * une valeur substituée n'est JAMAIS rescannée. Les éléments parcourus
 * passent donc par `vars`, pas par le texte.
 */

import { renderTemplate, resolveTemplateBlocks } from '@/utils/template-expression.js';

describe('#737 — bloc {{#each}}', () => {
  it('rend une liste à partir d’un champ tableau', () => {
    expect(
      renderTemplate('<ul>{{#each tags}}<li>{{.}}</li>{{/each}}</ul>', {
        tags: ['audit', 'formation'],
      })
    ).toBe('<ul><li>audit</li><li>formation</li></ul>');
  });

  it('ne rend rien pour un tableau vide, un null ou un champ absent', () => {
    const tpl = '<ul>{{#each tags}}<li>{{.}}</li>{{/each}}</ul>';
    expect(renderTemplate(tpl, { tags: [] })).toBe('<ul></ul>');
    expect(renderTemplate(tpl, { tags: null })).toBe('<ul></ul>');
    expect(renderTemplate(tpl, { tags: '' })).toBe('<ul></ul>');
    expect(renderTemplate(tpl, {})).toBe('<ul></ul>');
  });

  it('ignore les éléments vides du tableau', () => {
    expect(
      renderTemplate('{{#each tags}}[{{.}}]{{/each}}', { tags: ['a', '', null, undefined, 'b'] })
    ).toBe('[a][b]');
  });

  it('traite une valeur scalaire comme un élément unique', () => {
    expect(renderTemplate('{{#each tag}}[{{.}}]{{/each}}', { tag: 'audit' })).toBe('[audit]');
  });

  it('échappe la valeur de l’élément', () => {
    expect(renderTemplate('{{#each tags}}<li>{{.}}</li>{{/each}}', { tags: ['<b>x</b>'] })).toBe(
      '<li>&lt;b&gt;x&lt;/b&gt;</li>'
    );
  });

  it('échappe aussi la forme brute quand raw n’est pas demandé', () => {
    expect(renderTemplate('{{#each tags}}{{{.}}}{{/each}}', { tags: ['<i>x</i>'] })).toBe(
      '&lt;i&gt;x&lt;/i&gt;'
    );
  });

  it('ne rescanne pas la valeur : un élément qui contient {{...}} est rendu littéralement', () => {
    expect(
      renderTemplate('{{#each tags}}[{{.}}]{{/each}}', { tags: ['{{secret}}'], secret: 'fuite' })
    ).toBe('[{{secret}}]');
  });

  it('{{$index}} porte le rang de l’élément et masque celui de la ligne', () => {
    expect(
      renderTemplate(
        '{{$index}}|{{#each tags}}{{$index}}:{{.}} {{/each}}',
        { tags: ['a', 'b'] },
        {
          vars: { $index: () => '7' },
        }
      )
    ).toBe('7|0:a 1:b ');
  });

  it('applique les formats de la grammaire à l’élément', () => {
    const fr = (n: number) =>
      n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    expect(renderTemplate('{{#each n}}[{{.:number:2}}]{{/each}}', { n: [1234.5, 2] })).toBe(
      `[${fr(1234.5)}][${fr(2)}]`
    );
  });

  it('résout les champs de l’enregistrement dans le corps du bloc', () => {
    expect(
      renderTemplate('{{#each tags}}<li>{{nom}} : {{.}}</li>{{/each}}', {
        nom: 'Alpha',
        tags: ['a', 'b'],
      })
    ).toBe('<li>Alpha : a</li><li>Alpha : b</li>');
  });

  it('plusieurs blocs each dans le même template', () => {
    expect(
      renderTemplate('{{#each a}}{{.}}{{/each}}-{{#each b}}{{.}}{{/each}}', {
        a: ['1', '2'],
        b: ['3'],
      })
    ).toBe('12-3');
  });

  it('laisse les blocs {{#if}} et {{#unless}} inchangés', () => {
    expect(renderTemplate('{{#if a}}oui{{/if}}{{#unless b}}non{{/unless}}', { a: 1, b: '' })).toBe(
      'ouinon'
    );
  });

  it('limite documentée : pas d’imbrication (un each dans un if n’est pas développé)', () => {
    // BLOCK_RE ferme sur la première balise de fin du même type et le corps
    // n'est pas rescanné : le bloc interne survit à la pré-passe, puis la
    // substitution vide ses balises.
    const withBlocks = resolveTemplateBlocks('{{#if a}}{{#each t}}[{{.}}]{{/each}}{{/if}}', {
      a: 1,
      t: ['x'],
    });
    expect(withBlocks).toBe('{{#each t}}[{{.}}]{{/each}}');
    expect(renderTemplate('{{#if a}}{{#each t}}[{{.}}]{{/each}}{{/if}}', { a: 1, t: ['x'] })).toBe(
      '[]'
    );
  });

  it('une ouverture sans fermeture n’est pas un bloc', () => {
    expect(resolveTemplateBlocks('{{#each t}}x', { t: ['a'] })).toBe('{{#each t}}x');
  });
});
