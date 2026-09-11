import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #805 — un filtre de contexte sur un champ absent de la source ciblée.
 *
 * Constat du banc (#773) : une facette en mode contexte sur une colonne
 * calculée en aval (`tranche_envoi`, compute d'un normalize) diffusait
 * `where tranche_envoi = …` à la source Opendatasoft → HTTP 400, sans dire ni
 * quel filtre ni quelle colonne. Décisions (2026-09-11) :
 * - schéma inconnu (source pas encore émise, ou colonnes restreintes par
 *   select / group-by) : on diffuse, l'API répond — pas d'attente qui figerait ;
 * - champ absent d'UNE partie des cibles : exclusion de ces cibles + console ;
 * - absent de TOUTES : erreur de configuration nommée, rien n'est diffusé.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import '@/components/dsfr-data-context.js';
import '@/components/dsfr-data-context-filter.js';
import {
  subscribeToSourceCommands,
  clearDataCache,
  dispatchDataLoaded,
} from '@/utils/data-bridge.js';
import type { DsfrDataContext } from '@/components/dsfr-data-context.js';

interface Captured {
  sourceId: string;
  where?: string;
}

/** Source non rehaussée (pas de fetch) : seul le tag et le cache comptent. */
function source(id: string, attrs: Record<string, string> = {}) {
  const el = document.createElement('dsfr-data-source');
  el.id = id;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}

function setup(sources: string, rowsBySource: Record<string, Record<string, unknown>[]>) {
  const commands: Captured[] = [];
  const ids = sources.split(' ');
  const unsubs = ids.map((id) =>
    subscribeToSourceCommands(id, (cmd) =>
      commands.push({ sourceId: id, ...(cmd as Record<string, unknown>) } as Captured)
    )
  );
  for (const [id, rows] of Object.entries(rowsBySource)) dispatchDataLoaded(id, rows);
  const select = document.createElement('select');
  select.id = 'ui-tr';
  for (const v of ['', 'Moins de 70 %']) {
    const o = document.createElement('option');
    o.value = v;
    select.appendChild(o);
  }
  document.body.appendChild(select);
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <dsfr-data-context id="ctx" sources="${sources}">
      <dsfr-data-context-filter field="tranche_envoi" ui="ui-tr"></dsfr-data-context-filter>
    </dsfr-data-context>`;
  document.body.appendChild(wrapper);
  const ctx = wrapper.querySelector('dsfr-data-context') as DsfrDataContext;
  const filterEl = wrapper.querySelector('dsfr-data-context-filter') as HTMLElement;
  const choose = (value: string) => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  };
  return { ctx, filterEl, commands, choose, unsub: () => unsubs.forEach((u) => u()) };
}

const lastWhere = (commands: Captured[], id: string) =>
  commands.filter((c) => c.sourceId === id).at(-1)?.where;

beforeEach(() => {
  for (const id of ['pix', 'autre']) clearDataCache(id);
});
afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('#805 — champ absent des sources ciblées', () => {
  it('AC : absent de toutes les cibles → erreur nommée (champ, source, contexte), rien n’est diffusé', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    source('pix');
    const { ctx, filterEl, commands, choose, unsub } = setup('pix', {
      pix: [{ annee: '2023', taux: 0.5 }],
    });
    await ctx.updateComplete;
    choose('Moins de 70 %');

    const message = filterEl.getAttribute('data-dsfr-config-error') ?? '';
    expect(message).toContain('"tranche_envoi"');
    expect(message).toContain('(pix)');
    expect(message).toContain('"ctx"');
    expect(commands.some((c) => c.where && c.where.includes('tranche_envoi'))).toBe(false);
    unsub();
  });

  it('absent d’une seule cible → cette cible est exclue, avec un message console, les autres filtrées', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    source('pix');
    source('autre');
    const { ctx, filterEl, commands, choose, unsub } = setup('pix autre', {
      pix: [{ annee: '2023' }],
      autre: [{ tranche_envoi: 'Moins de 70 %' }],
    });
    await ctx.updateComplete;
    choose('Moins de 70 %');

    expect(lastWhere(commands, 'autre')).toContain('tranche_envoi');
    expect(lastWhere(commands, 'pix') ?? '').toBe('');
    expect(filterEl.hasAttribute('data-dsfr-config-error')).toBe(false);
    const messages = warn.mock.calls.map((c) => String(c[0]));
    expect(
      messages.some((m) => m.includes('"tranche_envoi" n\'existe pas sur la source "pix"'))
    ).toBe(true);
    unsub();
  });

  it('AC : un champ présent se comporte comme avant', async () => {
    source('pix');
    const { ctx, commands, choose, unsub } = setup('pix', {
      pix: [{ tranche_envoi: 'Moins de 70 %' }],
    });
    await ctx.updateComplete;
    choose('Moins de 70 %');
    expect(lastWhere(commands, 'pix')).toContain('tranche_envoi');
    unsub();
  });

  it('schéma inconnu (source pas encore émise) : diffusé, l’API répondra', async () => {
    source('pix');
    const { ctx, commands, choose, unsub } = setup('pix', {});
    await ctx.updateComplete;
    choose('Moins de 70 %');
    expect(lastWhere(commands, 'pix')).toContain('tranche_envoi');
    unsub();
  });

  it('colonnes restreintes par select : on ne tranche pas, diffusé', async () => {
    // Opendatasoft filtre sur une colonne non sélectionnée : l'absence dans
    // les lignes émises ne prouve rien.
    source('pix', { select: 'annee, taux' });
    const { ctx, commands, choose, unsub } = setup('pix', { pix: [{ annee: '2023' }] });
    await ctx.updateComplete;
    choose('Moins de 70 %');
    expect(lastWhere(commands, 'pix')).toContain('tranche_envoi');
    unsub();
  });

  it('AC : l’erreur se lève quand le filtre est vidé', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    source('pix');
    const { ctx, filterEl, choose, unsub } = setup('pix', { pix: [{ annee: '2023' }] });
    await ctx.updateComplete;
    choose('Moins de 70 %');
    expect(filterEl.hasAttribute('data-dsfr-config-error')).toBe(true);
    choose('');
    expect(filterEl.hasAttribute('data-dsfr-config-error')).toBe(false);
    unsub();
  });
});
