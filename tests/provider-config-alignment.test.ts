import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Tests traversants #285 (EPIC D) — alignement ProviderConfig ↔ adapter.
 *
 * Bug d'origine : la couche déclarative ProviderConfig existait, était
 * testée, mais n'était branchée nulle part — `getProviderConfig()` jamais
 * appelé, ~60 % des champs lus par personne, `operatorMapping` dupliqué mot
 * pour mot dans tabular-adapter, deux schémas de capacités non alignés
 * (la config Generic a menti sur whereFormat pendant des mois sans qu'aucun
 * test ne le voie). `utils/pagination.ts` et `utils/response-parser.ts`
 * étaient du code mort.
 *
 * Contrat fixé :
 * - `config.capabilities` est le miroir EXACT de `adapter.capabilities`
 *   (même schéma, mêmes valeurs) — toute déviation échoue ici ;
 * - `operatorMapping` et `searchTemplate` vivent dans la config, les
 *   adapters les consomment ;
 * - plus aucun module utilitaire non importé dans packages/core/src/utils/.
 */

import { getAdapter } from '@/adapters/adapter-registry.js';
import type { ProviderId } from '@dsfr-data/shared/lib';

const PROVIDER_IDS: ProviderId[] = ['generic', 'opendatasoft', 'tabular', 'grist', 'insee'];

describe('#285 — AC : un adapter qui dévie de sa config fait échouer un test', () => {
  for (const id of PROVIDER_IDS) {
    it(`${id} : adapter.capabilities === config.capabilities (miroir exact)`, () => {
      const adapter = getAdapter(id)!;
      const config = adapter.getProviderConfig!();
      // toEqual strict : un champ ajouté d'un seul côté ou une valeur
      // divergente (le mensonge historique de Generic) échoue ici
      expect({ ...adapter.capabilities }).toEqual({ ...config.capabilities });
    });

    it(`${id} : config.id correspond au type de l'adapter`, () => {
      const adapter = getAdapter(id)!;
      expect(adapter.getProviderConfig!().id).toBe(id);
    });
  }

  it('ODS : getDefaultSearchTemplate() lit la config (plus de duplication)', () => {
    const adapter = getAdapter('opendatasoft')!;
    expect(adapter.getDefaultSearchTemplate!()).toBe(
      adapter.getProviderConfig!().query.searchTemplate
    );
    expect(adapter.getDefaultSearchTemplate!()).toBe('search("{q}")');
  });

  it('Tabular : getDefaultSearchTemplate() lit la config (null = pas de recherche serveur)', () => {
    const adapter = getAdapter('tabular')!;
    expect(adapter.getDefaultSearchTemplate!()).toBeNull();
    expect(adapter.getProviderConfig!().query.searchTemplate).toBeNull();
  });

  it('Tabular : _mapOperator délègue à config.query.operatorMapping (12 opérateurs)', () => {
    const adapter = getAdapter('tabular')!;
    const mapping = adapter.getProviderConfig!().query.operatorMapping!;
    expect(Object.keys(mapping)).toHaveLength(12);
    for (const [generic, native] of Object.entries(mapping)) {
      expect((adapter as any)._mapOperator(generic), `opérateur ${generic}`).toBe(native);
    }
    // Opérateur inconnu : pass-through (comportement historique)
    expect((adapter as any)._mapOperator('exotic')).toBe('exotic');
  });
});

describe('#285 — AC : pas de module utilitaire non importé dans packages/core/src/utils/', () => {
  it('chaque module de utils/ est importé par au moins un fichier de src/', () => {
    const SRC = join(__dirname, '../packages/core/src');
    const UTILS = join(SRC, 'utils');

    // Tous les fichiers source de packages/core/src (récursif)
    const allSources: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts')) allSources.push(full);
      }
    };
    walk(SRC);

    const orphans: string[] = [];
    for (const utilFile of readdirSync(UTILS)) {
      if (!utilFile.endsWith('.ts')) continue;
      const moduleName = utilFile.replace(/\.ts$/, '');
      const importPattern = `utils/${moduleName}.js`;
      const imported = allSources.some(
        (f) => !f.endsWith(`utils/${utilFile}`) && readFileSync(f, 'utf8').includes(importPattern)
      );
      if (!imported) orphans.push(utilFile);
    }

    expect(
      orphans,
      `Modules utilitaires morts (importés par aucun fichier de src/) : ${orphans.join(', ')} — ` +
        `brancher ou supprimer (pagination.ts et response-parser.ts ont été supprimés ainsi, #285)`
    ).toEqual([]);
  });
});
