import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests traversants #277 (EPIC B) — attributs fantômes de dsfr-data-query.
 *
 * Bug d'origine : `transform`, `server-side` et `page-size` étaient déclarés
 * (docstrings détaillées, introspection Lit → documentés au builder-IA comme
 * fonctionnels) mais jamais lus : zéro effet. La doc de `where` promettait la
 * syntaxe ODSQL alors que le parseur est colon-only → un where ODSQL était
 * silencieusement ignoré (toutes les lignes passent).
 *
 * Contrat fixé :
 * - les 3 attributs sont supprimés (un console.warn de migration est émis si
 *   l'attribut HTML est encore présent) ;
 * - un where non parsable (syntaxe ODSQL, opérateur inconnu, valeur
 *   manquante) produit un reportConfigError — visible en console et via
 *   l'attribut data-dsfr-config-error ;
 * - le relais de commandes vers la source reste actif sans `server-side`
 *   (il l'a toujours été — l'attribut était un no-op).
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataLoaded,
  dispatchSourceCommand,
  subscribeToSourceCommands,
} from '@/utils/data-bridge.js';

describe('#277 — attributs fantômes supprimés', () => {
  let query: DsfrDataQuery;

  beforeEach(() => {
    query = new DsfrDataQuery();
    query.id = 'b3-query';
    query.source = 'b3-src';
    clearDataCache('b3-src');
    clearDataMeta('b3-src');
    clearDataCache('b3-query');
    clearDataMeta('b3-query');
  });

  afterEach(() => {
    (query as any)._cleanup();
  });

  it('transform, serverSide et pageSize ne sont plus des propriétés du composant', () => {
    expect('transform' in query).toBe(false);
    expect('serverSide' in query).toBe(false);
    expect('pageSize' in query).toBe(false);
  });

  it("l'introspection Lit (elementProperties) ne les expose plus au builder-IA", () => {
    const props = (DsfrDataQuery as any).elementProperties as Map<string, unknown>;
    const names = [...props.keys()];
    expect(names).not.toContain('transform');
    expect(names).not.toContain('serverSide');
    expect(names).not.toContain('pageSize');
  });

  it('un attribut HTML retiré encore présent émet un console.warn de migration', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    query.setAttribute('server-side', '');
    query.setAttribute('page-size', '50');
    query.setAttribute('transform', 'results');

    (query as any)._warnRemovedAttributes();

    expect(warnSpy).toHaveBeenCalledTimes(3);
    expect(warnSpy.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/server-side/);
    warnSpy.mockRestore();
  });

  it('aucun warn quand les attributs retirés ne sont pas utilisés', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (query as any)._warnRemovedAttributes();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('le relais de commandes vers la source fonctionne sans server-side', () => {
    const received: Array<Record<string, unknown>> = [];
    const unsub = subscribeToSourceCommands('b3-src', (cmd) =>
      received.push(cmd as Record<string, unknown>)
    );

    (query as any)._initialize();
    dispatchSourceCommand('b3-query', { page: 2 });

    expect(received).toHaveLength(1);
    expect(received[0].page).toBe(2);
    unsub();
  });
});

describe('#277 — where non parsable signalé via reportConfigError', () => {
  let query: DsfrDataQuery;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    query = new DsfrDataQuery();
    query.id = 'b3-where';
    query.source = 'b3-src';
    clearDataCache('b3-src');
    clearDataCache('b3-where');
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    (query as any)._cleanup();
    errorSpy.mockRestore();
  });

  it('une syntaxe ODSQL est signalée (ODSQL non supporté par query)', () => {
    query.where = "population > 5000 AND status = 'active'";
    (query as any)._initialize();

    expect(query.getAttribute('data-dsfr-config-error')).toMatch(/where/);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('ODSQL'));
  });

  it('un opérateur inconnu est signalé avec la liste des opérateurs supportés', () => {
    query.where = 'region:like:IDF';
    (query as any)._initialize();

    expect(query.getAttribute('data-dsfr-config-error')).toMatch(/like/);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('eq'));
  });

  it('une valeur manquante sur un opérateur à valeur est signalée', () => {
    query.where = 'population:gt';
    (query as any)._initialize();

    expect(query.getAttribute('data-dsfr-config-error')).toMatch(/valeur/);
  });

  it('isnull / isnotnull restent valides sans valeur', () => {
    query.where = 'email:isnull, telephone:isnotnull';
    (query as any)._initialize();

    expect(query.hasAttribute('data-dsfr-config-error')).toBe(false);
  });

  it('un where valide ne pose aucune erreur et filtre normalement', () => {
    query.where = 'population:gt:5000';
    (query as any)._initialize();

    expect(query.hasAttribute('data-dsfr-config-error')).toBe(false);

    dispatchDataLoaded('b3-src', [
      { ville: 'Paris', population: 12000 },
      { ville: 'Cassis', population: 3000 },
    ]);
    expect(query.getData()).toEqual([{ ville: 'Paris', population: 12000 }]);
  });

  it("l'erreur est levée quand le where redevient valide", () => {
    query.where = 'population > 5000';
    (query as any)._initialize();
    expect(query.hasAttribute('data-dsfr-config-error')).toBe(true);

    query.where = 'population:gt:5000';
    (query as any)._initialize();
    expect(query.hasAttribute('data-dsfr-config-error')).toBe(false);
  });

  it('le traitement continue en mode dégradé (clauses valides appliquées, données émises)', () => {
    query.where = 'population > 5000';
    (query as any)._initialize();

    dispatchDataLoaded('b3-src', [
      { ville: 'Paris', population: 12000 },
      { ville: 'Cassis', population: 3000 },
    ]);

    // La clause non parsable est ignorée : toutes les lignes passent,
    // mais l'erreur de config est visible (DOM + console)
    expect(query.getData()).toHaveLength(2);
    expect(query.hasAttribute('data-dsfr-config-error')).toBe(true);
  });
});
