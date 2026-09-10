import { describe, it, expect } from 'vitest';

/**
 * Tests #426 (connexe) — dsfr-data-map-popup : le moteur de template du popup
 * doit supporter les memes expressions que dsfr-data-display.
 *
 * Bug d'origine : {{champ:number}} etait cherche comme un champ litteralement
 * nomme "champ:number" → chaine vide dans les volets d'information.
 */

import { resolveTemplateExpression, formatTemplateValue } from '@/utils/template-expression.js';
import { DsfrDataMapPopup } from '@/components/dsfr-data-map-popup.js';

describe('resolveTemplateExpression (util partage)', () => {
  const item = {
    nom: 'CC du Val',
    population: 14785684,
    conso: '1234.5',
    nested: { val: 'deep' },
    vide: null,
  };

  it('resout un champ simple et un chemin imbrique', () => {
    expect(resolveTemplateExpression(item, 'nom')).toBe('CC du Val');
    expect(resolveTemplateExpression(item, 'nested.val')).toBe('deep');
  });

  it('formate :number en fr-FR (nombre et chaine numerique)', () => {
    expect(resolveTemplateExpression(item, 'population:number')).toBe(
      (14785684).toLocaleString('fr-FR')
    );
    expect(resolveTemplateExpression(item, 'conso:number')).toBe((1234.5).toLocaleString('fr-FR'));
  });

  it('applique le fallback |défaut sur null/undefined', () => {
    expect(resolveTemplateExpression(item, 'vide|N/A')).toBe('N/A');
    expect(resolveTemplateExpression(item, 'absent|N/A')).toBe('N/A');
    expect(resolveTemplateExpression(item, 'absent')).toBe('');
  });

  it('combine format et fallback : champ:number|défaut', () => {
    expect(resolveTemplateExpression(item, 'absent:number|N/A')).toBe('N/A');
    expect(resolveTemplateExpression(item, 'population:number|N/A')).toBe(
      (14785684).toLocaleString('fr-FR')
    );
  });

  it("resout les variables speciales fournies par l'appelant", () => {
    expect(resolveTemplateExpression(item, '$index', { $index: () => '5' })).toBe('5');
  });

  it('formatTemplateValue laisse passer les non-numeriques', () => {
    expect(formatTemplateValue('abc', 'number')).toBe('abc');
    expect(formatTemplateValue('abc', 'inconnu')).toBe('abc');
  });
});

describe('#426 — templates de dsfr-data-map-popup', () => {
  const makePopup = (templateHtml: string): DsfrDataMapPopup => {
    const popup = new DsfrDataMapPopup();
    const tpl = document.createElement('template');
    tpl.innerHTML = templateHtml;
    popup.appendChild(tpl);
    return popup;
  };

  const render = (popup: DsfrDataMapPopup, record: Record<string, unknown>): string =>
    (
      popup as unknown as Record<string, (this: unknown, ...a: unknown[]) => unknown>
    )._renderTemplate.call(popup, record) as string;

  it('{{champ:number}} rend le nombre formate fr-FR', () => {
    const popup = makePopup('<p>{{population:number}} hab</p>');
    const html = render(popup, { population: 6676 });
    expect(html).toBe(`<p>${(6676).toLocaleString('fr-FR')} hab</p>`);
  });

  it('{{champ|défaut}} rend le fallback', () => {
    const popup = makePopup('<p>{{fioul|non renseigné}}</p>');
    expect(render(popup, {})).toBe('<p>non renseigné</p>');
  });

  it('les champs simples restent echappes (pas de regression XSS)', () => {
    const popup = makePopup('<p>{{nom}}</p>');
    const html = render(popup, { nom: '<img src=x onerror=alert(1)>' });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('un champ absent rend une chaine vide (comportement historique)', () => {
    const popup = makePopup('<p>{{absent}}</p>');
    expect(render(popup, { nom: 'x' })).toBe('<p></p>');
  });
});

// ---------------------------------------------------------------------------
// Épic #694 — moteur de templates : grammaire d'argument, :date, :join, :url,
// blocs {{#if}}/{{#unless}}, renderTemplate partagé display/popup.
// ---------------------------------------------------------------------------

import { parseTemplateExpression } from '@/utils/template-expression.js';

describe('#694 — grammaire {{chemin[:format[:arg]][|défaut]}}', () => {
  it('découpe chemin, format, argument et défaut', () => {
    expect(parseTemplateExpression('tags:join: / |aucun')).toEqual({
      path: 'tags',
      format: 'join',
      arg: ' / ',
      defaultValue: 'aucun',
    });
  });

  it("conserve les espaces de l'argument mais trime le reste", () => {
    expect(parseTemplateExpression(' prix : number : 2 | n/a ')).toEqual({
      path: 'prix',
      format: 'number',
      arg: ' 2 ',
      defaultValue: 'n/a',
    });
  });

  it('sans argument ni défaut, arg est undefined', () => {
    expect(parseTemplateExpression('d:date')).toEqual({
      path: 'd',
      format: 'date',
      arg: undefined,
      defaultValue: '',
    });
    expect(parseTemplateExpression('nom')).toEqual({
      path: 'nom',
      format: '',
      arg: undefined,
      defaultValue: '',
    });
  });

  it("limite documentée : « | » dans l'argument ouvre le défaut", () => {
    const parsed = parseTemplateExpression('tags:join: | ');
    expect(parsed.arg).toBe(' ');
    expect(parsed.defaultValue).toBe('');
  });
});

describe('#662 — pipe :date', () => {
  it('{{d:date}} rend JJ/MM/AAAA', () => {
    expect(resolveTemplateExpression({ d: '2026-09-09T10:00:00Z' }, 'd:date')).toBe('09/09/2026');
  });

  it('accepte un objet Date et un timestamp', () => {
    expect(resolveTemplateExpression({ d: new Date(2026, 8, 9, 12) }, 'd:date')).toBe('09/09/2026');
    expect(resolveTemplateExpression({ d: new Date(2026, 8, 9, 12).getTime() }, 'd:date')).toBe(
      '09/09/2026'
    );
  });

  it('rend « — » pour une date invalide', () => {
    expect(resolveTemplateExpression({ d: 'pas une date' }, 'd:date')).toBe('—');
  });

  it('null passe par le défaut, pas par le format', () => {
    expect(resolveTemplateExpression({ d: null }, 'd:date|inconnue')).toBe('inconnue');
  });

  it(':datetime ajoute HH:MM', () => {
    expect(resolveTemplateExpression({ d: new Date(2026, 8, 9, 14, 5) }, 'd:datetime')).toBe(
      '09/09/2026 14:05'
    );
    expect(resolveTemplateExpression({ d: 'x' }, 'd:datetime')).toBe('—');
  });

  it(':number:2 fixe les décimales', () => {
    expect(resolveTemplateExpression({ p: 1234.5 }, 'p:number:2')).toBe(
      (1234.5).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    );
  });
});

describe('#663 — tableaux joints et pipe :join', () => {
  const item = { tags: ['a', 'b'], vide: [], un: ['seul'] };

  it('{{tags}} joint par « , » par défaut', () => {
    expect(resolveTemplateExpression(item, 'tags')).toBe('a, b');
    expect(resolveTemplateExpression(item, 'un')).toBe('seul');
    expect(resolveTemplateExpression(item, 'vide')).toBe('');
  });

  it('{{tags:join: / }} utilise le séparateur donné, espaces compris', () => {
    expect(resolveTemplateExpression(item, 'tags:join: / ')).toBe('a / b');
    expect(resolveTemplateExpression(item, 'tags:join: · ')).toBe('a · b');
    expect(resolveTemplateExpression(item, 'tags:join:')).toBe('a, b');
    expect(resolveTemplateExpression(item, 'tags:join')).toBe('a, b');
  });

  it(':join sur une valeur scalaire la laisse passer', () => {
    expect(resolveTemplateExpression({ x: 'seul' }, 'x:join: / ')).toBe('seul');
  });

  it('un tableau vide avec défaut ne déclenche pas le défaut (il existe)', () => {
    expect(resolveTemplateExpression(item, 'vide|aucun')).toBe('');
  });
});
