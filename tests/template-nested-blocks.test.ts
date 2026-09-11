import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * #769 — un bloc de gabarit imbriqué est signalé au lieu de rendre un texte
 * tronqué sans erreur.
 *
 * L'imbrication reste NON prise en charge (limite documentée) : `BLOCK_RE`
 * est paresseux, un bloc dans un bloc de même type se fermerait sur la
 * mauvaise balise. Ce qui manquait est le signal : cinq pages du banc d'essai
 * portaient un `{{#if}}` enveloppant un `{{#each}}`, déclarées vérifiées sur
 * trois contrôles verts — le seul symptôme était `[DEBUTFIN]` dans une
 * infobulle qu'il fallait ouvrir.
 */

import { renderTemplate, hasNestedTemplateBlocks } from '@/utils/template-expression.js';

afterEach(() => {
  vi.restoreAllMocks();
});

const NESTED = '{{#if mail}}<ul>{{#each mail}}<li>{{.}}</li>{{/each}}</ul>{{/if}}';

describe('#769 — détection', () => {
  it('reconnaît un bloc dans un bloc, de même type ou non', () => {
    expect(hasNestedTemplateBlocks(NESTED)).toBe(true);
    expect(hasNestedTemplateBlocks('{{#if a}}x{{#if b}}y{{/if}}{{/if}}')).toBe(true);
    expect(hasNestedTemplateBlocks('{{#each a}}{{#unless .}}-{{/unless}}{{/each}}')).toBe(true);
  });

  it('des blocs côte à côte ne sont pas imbriqués', () => {
    expect(
      hasNestedTemplateBlocks(
        '<ul>{{#each mail}}<li>{{.}}</li>{{/each}}</ul>{{#unless mail}}<p>Aucun</p>{{/unless}}'
      )
    ).toBe(false);
    expect(hasNestedTemplateBlocks('<p>{{nom}}</p>')).toBe(false);
  });
});

describe('#769 — avertissement', () => {
  it('nomme le composant et la limite, et propose la forme à plat', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderTemplate(NESTED, { mail: ['a@b.fr'] }, { origin: 'dsfr-data-display#fiches' });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = String(warnSpy.mock.calls[0][0]);
    expect(message).toContain('dsfr-data-display#fiches');
    expect(message).toContain('imbriqués');
    expect(message).toContain('{{#unless liste}}');
  });

  it('une seule fois par gabarit, même rendu pour mille lignes', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tpl = '{{#if x}}{{#each x}}{{.}}{{/each}}{{/if}} — gabarit B';
    for (let i = 0; i < 1000; i++) renderTemplate(tpl, { x: [i] });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('un gabarit par avertissement : deux gabarits distincts, deux avertissements', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderTemplate('{{#if a}}{{#if b}}1{{/if}}{{/if}} — gabarit C', {});
    renderTemplate('{{#if a}}{{#if b}}1{{/if}}{{/if}} — gabarit D', {});
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('signalé même quand la condition extérieure est fausse', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderTemplate('{{#if absent}}{{#each x}}{{.}}{{/each}}{{/if}} — gabarit E', {});
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('aucun avertissement pour des blocs côte à côte', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderTemplate('{{#each m}}<li>{{.}}</li>{{/each}}{{#unless m}}vide{{/unless}}', { m: [] });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('le rendu reste inchangé', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tpl = '[DEBUT{{#if m}}{{#each m}}<{{.}}>{{/each}}{{/if}}FIN] — gabarit F';
    // Le comportement tronqué observé par le banc, conservé à l'identique :
    // les balises intérieures sont vidées par la substitution.
    expect(renderTemplate(tpl, { m: ['x'] })).toBe('[DEBUT<>FIN] — gabarit F');
  });
});
