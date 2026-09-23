/**
 * Règle 6 de check:reperes (#1013) : une visite guidée ne cite que des repères
 * du registre. Fonctions pures de `scripts/lib/reperes-tours.ts`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { reperesDesVisites, verifierVisites } from '../../scripts/lib/reperes-tours';
import { REPERES as REPERES_BUILDER } from '../../apps/builder/src/assistant/reperes.generated';
import { REPERES as REPERES_CARTO } from '../../apps/builder-carto/src/assistant/reperes.generated';
import { REPERES as REPERES_PIPELINE } from '../../apps/pipeline-helper/src/assistant/reperes.generated';
import { REPERES as REPERES_PLAYGROUND } from '../../apps/playground/src/assistant/reperes.generated';

const RACINE = resolve(import.meta.dirname, '../..');

describe('reperesDesVisites', () => {
  it('lit les propriétés repere littérales, dans l’ordre', () => {
    const src = `
      const T = { steps: [
        { repere: 'carto.couches', title: 'a' },
        { repere : "carto.actions.generer", title: 'b' },
      ] };`;
    expect(reperesDesVisites(src)).toEqual({
      litteraux: ['carto.couches', 'carto.actions.generer'],
      nonLitteraux: 0,
    });
  });

  it('ignore commentaires, chaînes et annotations de type', () => {
    const src = `
      // { repere: 'x.commentaire' }
      /* repere: 'x.bloc' */
      interface E { repere?: string }
      const d = "le repere: 'x.chaine'";
      const t = \`repere: 'x.gabarit'\`;
      const monrepere = { autrerepere: 'x.nom-voisin' };`;
    expect(reperesDesVisites(src)).toEqual({ litteraux: [], nonLitteraux: 0 });
  });

  it('compte un repère calculé : il échapperait au contrôle', () => {
    expect(reperesDesVisites(`const s = { repere: prefixe + '.couches' };`)).toEqual({
      litteraux: [],
      nonLitteraux: 1,
    });
  });
});

describe('verifierVisites', () => {
  const registres = new Map([['carto', new Set(['carto.couches', 'carto.actions.generer'])]]);
  const fichier = (contenu: string) => ({ chemin: 'visites.ts', contenu });

  it('vert quand tout repère cité est au registre', () => {
    expect(verifierVisites([fichier(`[{ repere: 'carto.couches' }]`)], registres)).toEqual([]);
  });

  it('rouge sur un repère absent du registre, un préfixe inconnu, un repère calculé', () => {
    const problemes = verifierVisites(
      [
        fichier(
          `[{ repere: 'carto.fantome' }, { repere: 'inconnu.zone' }, { repere: ids.couches }]`
        ),
      ],
      registres
    );
    expect(problemes.map((p) => p.message)).toEqual([
      "1 etape(s) de visite dont le repere n'est pas un litteral (« repere: '<id>' » attendu)",
      'visite citant « carto.fantome », absent du registre',
      "visite citant « inconnu.zone » : aucune app n'a de registre de prefixe « inconnu »",
    ]);
  });

  it('les visites du dépôt citent des repères des registres commités', () => {
    const reg = new Map<string, Set<string>>([
      ['builder', new Set(REPERES_BUILDER.map((r) => r.id))],
      ['carto', new Set(REPERES_CARTO.map((r) => r.id))],
      ['pipeline', new Set(REPERES_PIPELINE.map((r) => r.id))],
      ['playground', new Set(REPERES_PLAYGROUND.map((r) => r.id))],
    ]);
    const fichiers = [
      'packages/shared/src/tour/tour-configs.ts',
      'apps/builder/src/ui/tour.ts',
    ].map((chemin) => ({ chemin, contenu: readFileSync(join(RACINE, chemin), 'utf-8') }));
    const problemes = verifierVisites(fichiers, reg).filter(
      // Les préfixes des autres apps sont couverts par check:reperes lui-même.
      (p) => !p.message.includes('aucune app')
    );
    expect(problemes).toEqual([]);
  });
});
