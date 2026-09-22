import { describe, it, expect, beforeEach } from 'vitest';
import type { ChartConfig } from '@dsfr-data/shared';
import { tabularDatalistSelectAttr } from '../../../apps/builder-ia/src/ui/code-generator.js';
import { state } from '../../../apps/builder-ia/src/state.js';

/**
 * #985 — le tableau Tabular de l'Assistant IA emet `select` depuis ses
 * colonnes : l'adaptateur le traduit en `columns=`, l'API ne rend que ces
 * colonnes. Jamais un nom que la source ne connait pas : l'API repondrait 400.
 */

type Etat = { fields: Array<{ name: string; type: string; sample: unknown }> };

function config(extra: Partial<ChartConfig> = {}): ChartConfig {
  return { type: 'datalist', valueField: '', ...extra };
}

beforeEach(() => {
  (state as unknown as Etat).fields = ['nom', 'Code sexe', "Libellé de l'élu", 'region'].map(
    (name) => ({ name, type: 'string', sample: '' })
  );
});

describe('#985 — tabularDatalistSelectAttr', () => {
  it('colonnes de la liste et champ de tri, noms a espaces et apostrophe echappes', () => {
    const attr = tabularDatalistSelectAttr(
      config({
        colonnes: "nom:Nom, Libellé de l'élu:Libellé, Code sexe:Sexe",
        labelField: 'region',
        sortOrder: 'asc',
      })
    );
    expect(attr).toBe('\n    select="nom, Libellé de l&#039;élu, Code sexe, region"');
  });

  it('sans colonnes choisies (le tableau affiche tout) : pas de select', () => {
    expect(tabularDatalistSelectAttr(config())).toBe('');
  });

  it('un nom inconnu de la source (invente par le modele) : pas de select', () => {
    expect(tabularDatalistSelectAttr(config({ colonnes: 'nom:Nom, population:Pop' }))).toBe('');
  });

  it('le champ de libelle ne compte que s’il sert au tri', () => {
    expect(tabularDatalistSelectAttr(config({ colonnes: 'nom:Nom', labelField: 'region' }))).toBe(
      '\n    select="nom"'
    );
  });
});
