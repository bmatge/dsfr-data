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

import {
  parseTemplateExpression,
  sanitizeTemplateUrl,
  resolveTemplateBlocks,
  renderTemplate,
  isTemplateTruthy,
} from '@/utils/template-expression.js';

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

describe('#664 — pipe :url à liste blanche (sécurité)', () => {
  it('bloque javascript: (toutes casses et avec caractères de contrôle)', () => {
    expect(sanitizeTemplateUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeTemplateUrl('JaVaScRiPt:alert(1)')).toBe('');
    expect(sanitizeTemplateUrl('  javascript:alert(1)')).toBe('');
    expect(sanitizeTemplateUrl('java\nscript:alert(1)')).toBe('');
    expect(sanitizeTemplateUrl('java\tscript:alert(1)')).toBe('');
    expect(sanitizeTemplateUrl('javascript:alert(1)')).toBe('');
  });

  it('bloque data: et vbscript:', () => {
    expect(sanitizeTemplateUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(sanitizeTemplateUrl('vbscript:msgbox')).toBe('');
  });

  it('laisse passer http, https, mailto, tel inchangés', () => {
    expect(sanitizeTemplateUrl('https://example.gouv.fr/a?b=1&c=2#x')).toBe(
      'https://example.gouv.fr/a?b=1&c=2#x'
    );
    expect(sanitizeTemplateUrl('http://example.gouv.fr')).toBe('http://example.gouv.fr');
    expect(sanitizeTemplateUrl('HTTPS://EXAMPLE.GOUV.FR')).toBe('HTTPS://EXAMPLE.GOUV.FR');
    expect(sanitizeTemplateUrl('mailto:contact@example.gouv.fr')).toBe(
      'mailto:contact@example.gouv.fr'
    );
    expect(sanitizeTemplateUrl('tel:+33123456789')).toBe('tel:+33123456789');
  });

  it('laisse passer les URL relatives sans schéma (décision documentée)', () => {
    expect(sanitizeTemplateUrl('/fiche/42')).toBe('/fiche/42');
    expect(sanitizeTemplateUrl('#ancre')).toBe('#ancre');
    expect(sanitizeTemplateUrl('?page=2')).toBe('?page=2');
    expect(sanitizeTemplateUrl('fiche.html')).toBe('fiche.html');
    expect(sanitizeTemplateUrl('//cdn.example.gouv.fr/x')).toBe('//cdn.example.gouv.fr/x');
  });

  it('vide, blanc et non-chaîne', () => {
    expect(sanitizeTemplateUrl('')).toBe('');
    expect(sanitizeTemplateUrl('   ')).toBe('');
    expect(sanitizeTemplateUrl(42)).toBe('42');
  });

  it('{{x:url}} passe par le pipe', () => {
    expect(resolveTemplateExpression({ x: 'javascript:alert(1)' }, 'x:url')).toBe('');
    expect(resolveTemplateExpression({ x: 'https://a.fr' }, 'x:url')).toBe('https://a.fr');
    expect(resolveTemplateExpression({ x: null }, 'x:url|#')).toBe('#');
  });

  it('un template sans :url ne filtre pas — le pipe est nécessaire dans href', () => {
    // Comportement historique conservé : l'échappement seul ne filtre pas le schéma.
    expect(renderTemplate('<a href="{{x}}">l</a>', { x: 'javascript:alert(1)' })).toBe(
      '<a href="javascript:alert(1)">l</a>'
    );
    expect(renderTemplate('<a href="{{x:url}}">l</a>', { x: 'javascript:alert(1)' })).toBe(
      '<a href="">l</a>'
    );
  });
});

describe('#664 — blocs {{#if}} / {{#unless}}', () => {
  it('isTemplateTruthy : faux pour null, undefined, "", [], false ; vrai sinon', () => {
    expect(isTemplateTruthy(null)).toBe(false);
    expect(isTemplateTruthy(undefined)).toBe(false);
    expect(isTemplateTruthy('')).toBe(false);
    expect(isTemplateTruthy([])).toBe(false);
    expect(isTemplateTruthy(false)).toBe(false);
    expect(isTemplateTruthy(0)).toBe(true);
    expect(isTemplateTruthy('0')).toBe(true);
    expect(isTemplateTruthy(' ')).toBe(true);
    expect(isTemplateTruthy(['x'])).toBe(true);
    expect(isTemplateTruthy({})).toBe(true);
  });

  it('{{#if}} garde le corps si vrai, le retire sinon', () => {
    const tpl = 'A{{#if site}}<a href="{{site:url}}">Site</a>{{/if}}B';
    expect(resolveTemplateBlocks(tpl, { site: 'https://x.fr' })).toBe(
      'A<a href="{{site:url}}">Site</a>B'
    );
    expect(resolveTemplateBlocks(tpl, { site: '' })).toBe('AB');
    expect(resolveTemplateBlocks(tpl, {})).toBe('AB');
  });

  it('{{#unless}} est le complément', () => {
    const tpl = '{{#unless site}}<em>Pas de site</em>{{/unless}}';
    expect(resolveTemplateBlocks(tpl, { site: '' })).toBe('<em>Pas de site</em>');
    expect(resolveTemplateBlocks(tpl, { site: 'x' })).toBe('');
  });

  it('accepte un chemin imbriqué, des espaces et le multi-ligne', () => {
    const tpl = '{{#if  a.b }}\n<p>ok</p>\n{{/if }}';
    expect(resolveTemplateBlocks(tpl, { a: { b: 1 } })).toBe('\n<p>ok</p>\n');
    expect(resolveTemplateBlocks(tpl, { a: {} })).toBe('');
  });

  it('plusieurs blocs successifs, indépendants', () => {
    const tpl = '{{#if a}}A{{/if}}-{{#unless b}}nb{{/unless}}-{{#if c}}C{{/if}}';
    expect(resolveTemplateBlocks(tpl, { a: 1, b: null, c: 'x' })).toBe('A-nb-C');
    expect(resolveTemplateBlocks(tpl, { a: null, b: 1, c: null })).toBe('--');
  });

  it("un bloc sans fermeture n'est pas reconnu", () => {
    expect(resolveTemplateBlocks('{{#if a}}x', { a: 1 })).toBe('{{#if a}}x');
  });

  it("critère d'acceptation : lien optionnel — rien si vide, lien sinon", () => {
    const tpl = '{{#if site}}<a href="{{site:url}}">Site</a>{{/if}}';
    expect(renderTemplate(tpl, { site: '' })).toBe('');
    expect(renderTemplate(tpl, { site: null })).toBe('');
    expect(renderTemplate(tpl, { site: 'https://x.fr' })).toBe('<a href="https://x.fr">Site</a>');
    expect(renderTemplate(tpl, { site: 'javascript:alert(1)' })).toBe('<a href="">Site</a>');
  });
});

describe('#694 — renderTemplate partagé', () => {
  it('escape par défaut, raw seulement avec option et triple accolade', () => {
    const item = { h: '<b>x</b>' };
    expect(renderTemplate('{{h}}', item)).toBe('&lt;b&gt;x&lt;/b&gt;');
    expect(renderTemplate('{{{h}}}', item)).toBe('&lt;b&gt;x&lt;/b&gt;');
    expect(renderTemplate('{{{h}}}', item, { raw: true })).toBe('<b>x</b>');
    expect(renderTemplate('{{h}}', item, { raw: true })).toBe('&lt;b&gt;x&lt;/b&gt;');
  });

  it('résout les vars avant les champs, avec espaces tolérés', () => {
    expect(
      renderTemplate('#{{ $index }}', { $index: 'non' }, { vars: { $index: () => '7' } })
    ).toBe('#7');
  });

  it('invariant : une valeur contenant {{x}} ou {{#if}} est rendue littéralement', () => {
    const item = { v: '{{secret}} {{#if secret}}S{{/if}}', secret: 'LEAK' };
    expect(renderTemplate('<p>{{v}}</p>', item)).toBe('<p>{{secret}} {{#if secret}}S{{/if}}</p>');
    expect(renderTemplate('<p>{{{v}}}</p>', item, { raw: true })).toBe(
      '<p>{{secret}} {{#if secret}}S{{/if}}</p>'
    );
  });

  it('les placeholders du corps du bloc sont substitués après la pré-passe', () => {
    expect(
      renderTemplate('{{#if tags}}<p>{{tags:join: / }}</p>{{/if}}', { tags: ['a', 'b'] })
    ).toBe('<p>a / b</p>');
  });
});

describe('#694 — dsfr-data-map-popup avec le nouveau moteur', () => {
  const makePopup = (templateHtml: string): DsfrDataMapPopup => {
    const popup = new DsfrDataMapPopup();
    const tpl = document.createElement('template');
    tpl.innerHTML = templateHtml;
    popup.appendChild(tpl);
    return popup;
  };

  it('{{#if}} + {{site:url}} dans un vrai template de popup', () => {
    const popup = makePopup('<h4>{{nom}}</h4>{{#if site}}<a href="{{site:url}}">Site</a>{{/if}}');
    expect(popup.getPopupHtml({ nom: 'A', site: '' })).toBe(
      '<div class="dsfr-data-map__popup"><h4>A</h4></div>'
    );
    expect(popup.getPopupHtml({ nom: 'A', site: 'https://a.fr' })).toBe(
      '<div class="dsfr-data-map__popup"><h4>A</h4><a href="https://a.fr">Site</a></div>'
    );
    expect(popup.getPopupHtml({ nom: 'A', site: 'javascript:alert(1)' })).toBe(
      '<div class="dsfr-data-map__popup"><h4>A</h4><a href="">Site</a></div>'
    );
  });

  it('{{d:date}} et {{tags}} dans le popup', () => {
    const popup = makePopup('<p>{{d:date}} — {{tags}}</p>');
    expect(popup.getPopupHtml({ d: '2026-09-09T10:00:00Z', tags: ['a', 'b'] })).toBe(
      '<div class="dsfr-data-map__popup"><p>09/09/2026 — a, b</p></div>'
    );
  });

  it('{{{champ}}} reste échappé dans le popup', () => {
    const popup = makePopup('<p>{{{h}}}</p>');
    expect(popup.getPopupHtml({ h: '<img src=x onerror=alert(1)>' })).not.toContain('<img');
  });

  it("limite : un bloc placé entre deux attributs est coupé par l'analyse HTML du template", () => {
    // Le parseur HTML voit {{#if site}} comme des attributs : le bloc disparaît, href survit.
    const popup = makePopup('<a {{#if site}}href="{{site:url}}"{{/if}}>Site</a>');
    const html = popup.getPopupHtml({ site: '' });
    expect(html).not.toContain('{{');
    expect(html).toContain('href=""');
    expect(html).toContain('>Site</a>');
  });

  it("recette : le bloc dans une VALEUR d'attribut ou autour de l'élément entier fonctionne", () => {
    const popup = makePopup(
      '<a class="fr-link{{#if externe}} fr-link--ext{{/if}}" href="{{u:url}}">L</a>'
    );
    expect(popup.getPopupHtml({ externe: true, u: '/x' })).toContain(
      '<a class="fr-link fr-link--ext" href="/x">L</a>'
    );
    expect(popup.getPopupHtml({ externe: false, u: '/x' })).toContain(
      '<a class="fr-link" href="/x">L</a>'
    );
  });
});
