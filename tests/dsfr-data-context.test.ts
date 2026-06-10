import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests #229 (EPIC #224) — cœur dsfr-data-context + dsfr-data-context-filter.
 *
 * Le fan-out qui manquait : chaque dsfr-data-source est un pipeline isolé,
 * un dashboard multi-vues à filtre commun exigeait du JS d'orchestration
 * écrit à la main. dsfr-data-context écoute des éléments d'UI, recompose un
 * where par source (au dialecte de son adapter) et diffuse à N sources via
 * dispatchSourceCommand — un whereKey STABLE par filtre (AND systématique,
 * ADR-031, jamais « le dernier gagne »).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import '@/components/dsfr-data-context.js';
import '@/components/dsfr-data-context-filter.js';
import { subscribeToSourceCommands, clearDataCache } from '@/utils/data-bridge.js';
import type { DsfrDataContext } from '@/components/dsfr-data-context.js';
import type { DsfrDataContextFilter } from '@/components/dsfr-data-context-filter.js';

interface Captured {
  sourceId: string;
  where?: string;
  whereKey?: string;
}

function captureCommands(sourceIds: string[]): { commands: Captured[]; unsub: () => void } {
  const commands: Captured[] = [];
  const unsubs = sourceIds.map((id) =>
    subscribeToSourceCommands(id, (cmd) =>
      commands.push({ sourceId: id, ...(cmd as Record<string, unknown>) } as Captured)
    )
  );
  return { commands, unsub: () => unsubs.forEach((u) => u()) };
}

/** Source factice exposant un adapter au whereFormat donné */
function fakeSource(id: string, whereFormat: 'colon' | 'odsql' | null) {
  const el = document.createElement('div');
  el.id = id;
  if (whereFormat) {
    (el as unknown as Record<string, unknown>).getAdapter = () => ({
      capabilities: { whereFormat },
    });
  }
  document.body.appendChild(el);
  return el;
}

function buildContext(html: string): DsfrDataContext {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  return wrapper.querySelector('dsfr-data-context') as DsfrDataContext;
}

let cleanup: HTMLElement[] = [];

beforeEach(() => {
  for (const id of ['src-a', 'src-b', 'src-c']) clearDataCache(id);
});

afterEach(() => {
  document.body.innerHTML = '';
  cleanup = [];
});

describe('#229 — AC : 1 filtre in → les N sources se mettent à jour', () => {
  it('diffuse le where colon à toutes les sources du contexte', async () => {
    cleanup.push(fakeSource('src-a', 'colon'), fakeSource('src-b', 'colon'));
    const { commands, unsub } = captureCommands(['src-a', 'src-b']);

    const select = document.createElement('select');
    select.id = 'ui-cat';
    select.multiple = true;
    for (const v of ['alimentaire', 'jouets', 'hygiene']) {
      const o = document.createElement('option');
      o.value = v;
      select.appendChild(o);
    }
    document.body.appendChild(select);

    const ctx = buildContext(`
      <dsfr-data-context id="ctx" sources="src-a src-b">
        <dsfr-data-context-filter field="categorie" operator="in" ui="ui-cat">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);
    await ctx.updateComplete;

    (select.options[0] as HTMLOptionElement).selected = true;
    (select.options[1] as HTMLOptionElement).selected = true;
    select.dispatchEvent(new Event('change', { bubbles: true }));

    const a = commands.filter((c) => c.sourceId === 'src-a');
    const b = commands.filter((c) => c.sourceId === 'src-b');
    expect(a.at(-1)?.where).toBe('categorie:in:alimentaire|jouets');
    expect(b.at(-1)?.where).toBe('categorie:in:alimentaire|jouets');
    // whereKey stable par filtre (merge multi-émetteurs côté source)
    expect(a.at(-1)?.whereKey).toBeTruthy();
    expect(a.at(-1)?.whereKey).toBe(b.at(-1)?.whereKey);

    unsub();
  });

  it('traduit en ODSQL pour une source dont l’adapter est en odsql', async () => {
    cleanup.push(fakeSource('src-a', 'odsql'));
    const { commands, unsub } = captureCommands(['src-a']);

    const input = document.createElement('input');
    input.id = 'ui-dept';
    input.value = '75';
    document.body.appendChild(input);

    const ctx = buildContext(`
      <dsfr-data-context id="ctx2" sources="src-a">
        <dsfr-data-context-filter field="dept" operator="eq" ui="ui-dept">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);
    await ctx.updateComplete;

    input.dispatchEvent(new Event('change', { bubbles: true }));

    // filterToOdsql (couche partagee #275) emet des doubles quotes
    expect(commands.at(-1)?.where).toBe('dept = "75"');
    unsub();
  });
});

describe('#229 — AC : apply-to limite la diffusion', () => {
  it('seules les sources listées reçoivent le filtre', async () => {
    cleanup.push(
      fakeSource('src-a', 'colon'),
      fakeSource('src-b', 'colon'),
      fakeSource('src-c', 'colon')
    );
    const { commands, unsub } = captureCommands(['src-a', 'src-b', 'src-c']);

    const input = document.createElement('input');
    input.id = 'ui-annee';
    input.value = '2026';
    document.body.appendChild(input);

    const ctx = buildContext(`
      <dsfr-data-context id="ctx3" sources="src-a src-b src-c">
        <dsfr-data-context-filter field="annee" operator="eq" ui="ui-annee" apply-to="src-a src-c">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);
    await ctx.updateComplete;

    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(commands.some((c) => c.sourceId === 'src-a' && c.where)).toBe(true);
    expect(commands.some((c) => c.sourceId === 'src-c' && c.where)).toBe(true);
    expect(commands.filter((c) => c.sourceId === 'src-b' && c.where)).toHaveLength(0);

    unsub();
  });
});

describe('#229 — AC : 2 filtres combinés en AND sur une même source', () => {
  it('chaque filtre a son whereKey distinct (le merge côté source fait le AND)', async () => {
    cleanup.push(fakeSource('src-a', 'colon'));
    const { commands, unsub } = captureCommands(['src-a']);

    const sel = document.createElement('select');
    sel.id = 'ui-f1';
    const opt = document.createElement('option');
    opt.value = 'alimentaire';
    sel.appendChild(opt);
    document.body.appendChild(sel);

    const input = document.createElement('input');
    input.id = 'ui-f2';
    input.value = '100';
    document.body.appendChild(input);

    const ctx = buildContext(`
      <dsfr-data-context id="ctx4" sources="src-a">
        <dsfr-data-context-filter field="categorie" operator="eq" ui="ui-f1"></dsfr-data-context-filter>
        <dsfr-data-context-filter field="prix" operator="lt" ui="ui-f2"></dsfr-data-context-filter>
      </dsfr-data-context>
    `);
    await ctx.updateComplete;

    sel.value = 'alimentaire';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    const withWhere = commands.filter((c) => c.where);
    const keys = new Set(withWhere.map((c) => c.whereKey));
    expect(keys.size).toBe(2); // deux émetteurs distincts → AND côté source
    expect(withWhere.some((c) => c.where === 'categorie:eq:alimentaire')).toBe(true);
    expect(withWhere.some((c) => c.where === 'prix:lt:100')).toBe(true);

    unsub();
  });
});

describe('#229 — AC : non-régression — source hors contexte jamais touchée', () => {
  it('une source non référencée ne reçoit aucune commande', async () => {
    cleanup.push(fakeSource('src-a', 'colon'), fakeSource('src-b', 'colon'));
    const { commands, unsub } = captureCommands(['src-b']);

    const input = document.createElement('input');
    input.id = 'ui-x';
    input.value = 'v';
    document.body.appendChild(input);

    const ctx = buildContext(`
      <dsfr-data-context id="ctx5" sources="src-a">
        <dsfr-data-context-filter field="f" operator="eq" ui="ui-x"></dsfr-data-context-filter>
      </dsfr-data-context>
    `);
    await ctx.updateComplete;

    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(commands).toHaveLength(0);
    unsub();
  });
});

describe('#229 — housekeeping', () => {
  it('vider l’UI retire le filtre (where vide sur le même whereKey, contrat #276)', async () => {
    cleanup.push(fakeSource('src-a', 'colon'));
    const { commands, unsub } = captureCommands(['src-a']);

    const input = document.createElement('input');
    input.id = 'ui-clear';
    input.value = 'x';
    document.body.appendChild(input);

    const ctx = buildContext(`
      <dsfr-data-context id="ctx6" sources="src-a">
        <dsfr-data-context-filter field="f" operator="eq" ui="ui-clear"></dsfr-data-context-filter>
      </dsfr-data-context>
    `);
    await ctx.updateComplete;

    input.dispatchEvent(new Event('change', { bubbles: true }));
    const setCmd = commands.at(-1);
    input.value = '';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const clearCmd = commands.at(-1);

    expect(setCmd?.where).toBe('f:eq:x');
    expect(clearCmd?.where).toBe('');
    expect(clearCmd?.whereKey).toBe(setCmd?.whereKey);

    unsub();
  });

  it('le disconnect libère tous les filtres actifs (leçon #297)', async () => {
    cleanup.push(fakeSource('src-a', 'colon'));
    const { commands, unsub } = captureCommands(['src-a']);

    const input = document.createElement('input');
    input.id = 'ui-disc';
    input.value = 'actif';
    document.body.appendChild(input);

    const ctx = buildContext(`
      <dsfr-data-context id="ctx7" sources="src-a">
        <dsfr-data-context-filter field="statut" operator="eq" ui="ui-disc"></dsfr-data-context-filter>
      </dsfr-data-context>
    `);
    await ctx.updateComplete;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(commands.at(-1)?.where).toBe('statut:eq:actif');

    ctx.remove();

    expect(commands.at(-1)?.where).toBe('');
    unsub();
  });

  it('doublon field+operator+source : warning console (AND conservé, ADR-031)', async () => {
    cleanup.push(fakeSource('src-a', 'colon'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    for (const id of ['ui-d1', 'ui-d2']) {
      const i = document.createElement('input');
      i.id = id;
      document.body.appendChild(i);
    }

    const ctx = buildContext(`
      <dsfr-data-context id="ctx8" sources="src-a">
        <dsfr-data-context-filter field="cat" operator="eq" ui="ui-d1"></dsfr-data-context-filter>
        <dsfr-data-context-filter field="cat" operator="eq" ui="ui-d2"></dsfr-data-context-filter>
      </dsfr-data-context>
    `);
    await ctx.updateComplete;

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('cat'));
    warnSpy.mockRestore();
  });

  it('ui introuvable → reportConfigError (data-dsfr-config-error, #283)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = buildContext(`
      <dsfr-data-context id="ctx9" sources="src-a">
        <dsfr-data-context-filter field="f" operator="eq" ui="introuvable"></dsfr-data-context-filter>
      </dsfr-data-context>
    `);
    await ctx.updateComplete;
    const filter = ctx.querySelector('dsfr-data-context-filter') as DsfrDataContextFilter;
    await filter.updateComplete;

    expect(filter.hasAttribute('data-dsfr-config-error')).toBe(true);
    errorSpy.mockRestore();
  });

  it('between : deux ids d’UI → gte + lt', async () => {
    cleanup.push(fakeSource('src-a', 'colon'));
    const { commands, unsub } = captureCommands(['src-a']);

    for (const [id, v] of [
      ['ui-min', '10'],
      ['ui-max', '20'],
    ] as const) {
      const i = document.createElement('input');
      i.id = id;
      i.value = v;
      document.body.appendChild(i);
    }

    const ctx = buildContext(`
      <dsfr-data-context id="ctx10" sources="src-a">
        <dsfr-data-context-filter field="prix" operator="between" ui="ui-min ui-max">
        </dsfr-data-context-filter>
      </dsfr-data-context>
    `);
    await ctx.updateComplete;

    document.getElementById('ui-min')!.dispatchEvent(new Event('change', { bubbles: true }));

    expect(commands.at(-1)?.where).toBe('prix:gte:10, prix:lt:20');
    unsub();
  });
});
