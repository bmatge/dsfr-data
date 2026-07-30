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
    (popup as unknown as Record<string, CallableFunction>)._renderTemplate.call(
      popup,
      record
    ) as string;

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
