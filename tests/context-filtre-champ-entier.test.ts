import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #924 (PG-030) — un `dsfr-data-context-filter` lit une valeur de formulaire
 * (toujours du texte) et l'émet telle quelle : `reg = "01"`. Sur un champ
 * que le jeu publie en ENTIER, le portail compare en texte et ne trouve
 * rien, là où son `refine` trouvait 1 306 lignes. La Guadeloupe affiche
 * « — », sans erreur ; les régions métropolitaines passent, ce qui cache le
 * défaut.
 *
 * Le comportement ne change pas (émettre un littéral numérique changerait la
 * requête de pages qui fonctionnent) : ce qui change, c'est que le piège se
 * dit, une fois par champ et par source.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import '@/components/dsfr-data-context.js';
import '@/components/dsfr-data-context-filter.js';
import { clearDataCache, setDataCache } from '@/utils/data-bridge.js';
import { resetNumericFieldMismatchWarnings } from '@/utils/numeric-field-mismatch.js';

const SOURCES = ['s-int', 's-txt'];

/** Source factice, avec les lignes qu'elle a déjà émises. */
function fakeSource(id: string, rows: Record<string, unknown>[]) {
  const el = document.createElement('div');
  el.id = id;
  (el as unknown as Record<string, unknown>).getAdapter = () => ({
    capabilities: { whereFormat: 'colon' },
  });
  document.body.appendChild(el);
  setDataCache(id, rows);
}

function select(id: string, values: string[]) {
  const el = document.createElement('select');
  el.id = id;
  for (const v of ['', ...values]) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = v;
    el.appendChild(o);
  }
  document.body.appendChild(el);
  return el;
}

async function mount(html: string) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  return wrapper;
}

/** Les avertissements de ce piège-là, à l'exclusion de tout autre */
function mismatches(spy: { mock: { calls: unknown[][] } }): string[] {
  return spy.mock.calls
    .map((c: unknown[]) => String(c[0]))
    .filter((m: string) => m.includes('en TEXTE'));
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetNumericFieldMismatchWarnings();
  for (const id of SOURCES) clearDataCache(id);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  document.body.innerHTML = '';
});

describe('#924 — « 01 » comparé en texte à un champ publié en nombre', () => {
  it('est signalé, en nommant le champ, la valeur, le type observé et le geste', async () => {
    fakeSource('s-int', [
      { reg: 1, n: 10 },
      { reg: 75, n: 20 },
    ]);
    const ui = select('ui-reg', ['01', '75']);

    await mount(`
      <dsfr-data-context id="ctx" sources="s-int">
        <dsfr-data-context-filter field="reg" operator="eq" ui="ui-reg"></dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    ui.value = '01';
    ui.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 0));

    const messages = mismatches(warn);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('(reg)');
    expect(messages[0]).toContain('"01"');
    expect(messages[0]).toContain('"s-int"');
    expect(messages[0]).toContain('NOMBRE');
    expect(messages[0]).toContain('"1"');
  });

  it('ne se répète pas : un message par champ et par source, pas un par geste', async () => {
    fakeSource('s-int', [{ reg: 1 }, { reg: 2 }, { reg: 75 }]);
    const ui = select('ui-reg', ['01', '02', '75']);

    await mount(`
      <dsfr-data-context id="ctx" sources="s-int">
        <dsfr-data-context-filter field="reg" operator="eq" ui="ui-reg"></dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    for (let i = 0; i < 20; i++) {
      ui.value = ['01', '02', '75'][i % 3];
      ui.dispatchEvent(new Event('change'));
      await new Promise((r) => setTimeout(r, 0));
    }

    expect(mismatches(warn)).toHaveLength(1);
  });

  it('ne parle que de la source concernée quand le même select nourrit deux jeux', async () => {
    fakeSource('s-int', [{ reg: 1 }]);
    fakeSource('s-txt', [{ reg: '01' }]);
    const ui = select('ui-reg', ['01']);

    await mount(`
      <dsfr-data-context id="ctx" sources="s-int s-txt">
        <dsfr-data-context-filter field="reg" operator="eq" ui="ui-reg"></dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    ui.value = '01';
    ui.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 0));

    const messages = mismatches(warn);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('"s-int"');
    expect(messages[0]).not.toContain('"s-txt"');
  });

  it('se tait sur une valeur qui survit à l’aller-retour : « 75 » trouve bien la ligne', async () => {
    fakeSource('s-int', [{ reg: 1 }, { reg: 75 }]);
    const ui = select('ui-reg', ['75']);

    await mount(`
      <dsfr-data-context id="ctx" sources="s-int">
        <dsfr-data-context-filter field="reg" operator="eq" ui="ui-reg"></dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    ui.value = '75';
    ui.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 0));

    expect(mismatches(warn)).toEqual([]);
  });

  it('se tait quand le champ est publié en texte — le cas normal', async () => {
    fakeSource('s-txt', [{ reg: '01' }, { reg: '75' }]);
    const ui = select('ui-reg', ['01']);

    await mount(`
      <dsfr-data-context id="ctx" sources="s-txt">
        <dsfr-data-context-filter field="reg" operator="eq" ui="ui-reg"></dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    ui.value = '01';
    ui.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 0));

    expect(mismatches(warn)).toEqual([]);
  });

  it('se tait quand la source n’a encore rien émis : on ne sait pas le type', async () => {
    const el = document.createElement('div');
    el.id = 's-int';
    document.body.appendChild(el);
    const ui = select('ui-reg', ['01']);

    await mount(`
      <dsfr-data-context id="ctx" sources="s-int">
        <dsfr-data-context-filter field="reg" operator="eq" ui="ui-reg"></dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    ui.value = '01';
    ui.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 0));

    expect(mismatches(warn)).toEqual([]);
  });

  it('se tait sur un champ hétérogène : un nombre ici, une chaîne là', async () => {
    fakeSource('s-int', [{ reg: 1 }, { reg: '01' }]);
    const ui = select('ui-reg', ['01']);

    await mount(`
      <dsfr-data-context id="ctx" sources="s-int">
        <dsfr-data-context-filter field="reg" operator="eq" ui="ui-reg"></dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    ui.value = '01';
    ui.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 0));

    expect(mismatches(warn)).toEqual([]);
  });

  it('couvre aussi un opérateur « in » multi-valeurs', async () => {
    fakeSource('s-int', [{ reg: 1 }, { reg: 75 }]);
    const ui = select('ui-reg', ['75|01']);

    await mount(`
      <dsfr-data-context id="ctx" sources="s-int">
        <dsfr-data-context-filter field="reg" operator="in" ui="ui-reg"></dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    ui.value = '75|01';
    ui.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 0));

    const messages = mismatches(warn);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('"01"');
  });

  it('n’altère pas la clause émise : le where part exactement comme avant', async () => {
    fakeSource('s-int', [{ reg: 1 }]);
    const ui = select('ui-reg', ['01']);
    const commands: unknown[] = [];
    const listen = (e: Event) => commands.push((e as CustomEvent).detail);
    document.addEventListener('dsfr-data-source-command', listen);

    await mount(`
      <dsfr-data-context id="ctx" sources="s-int">
        <dsfr-data-context-filter field="reg" operator="eq" ui="ui-reg"></dsfr-data-context-filter>
      </dsfr-data-context>
    `);

    ui.value = '01';
    ui.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 0));
    document.removeEventListener('dsfr-data-source-command', listen);

    const wheres = (commands as { where?: string }[]).map((c) => c.where).filter(Boolean);
    expect(wheres).toContain('reg:eq:01');
  });
});
