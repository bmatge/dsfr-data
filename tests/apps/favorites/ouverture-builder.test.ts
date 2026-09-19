/**
 * « Ouvrir dans le Builder » : la bonne cible, et le bon motif (#965).
 *
 * Le message historique — « Ce favori a été créé avant la mise à jour » —
 * accusait l'âge. Le motif réel est l'origine du favori (Playground, Builder
 * carto) ou l'absence de configuration enregistrée.
 */
import { describe, it, expect } from 'vitest';
import { ouvertureDepuisFavori } from '../../../apps/favorites/src/ouverture-builder.js';

describe('ouvertureDepuisFavori', () => {
  it('ouvre dans le Builder un favori du Builder (cas nominal, à ne pas casser)', () => {
    const o = ouvertureDepuisFavori({
      sourceApp: 'builder',
      code: '<dsfr-data-chart></dsfr-data-chart>',
      builderStateJson: { chartType: 'bar' },
    });
    expect(o.cible).toBe('builder');
    if (o.cible === 'builder') expect(o.etat).toEqual({ chartType: 'bar' });
  });

  it('lit aussi la clé locale historique `builderState`', () => {
    const o = ouvertureDepuisFavori({ sourceApp: 'builder', builderState: { chartType: 'pie' } });
    expect(o.cible).toBe('builder');
  });

  it("renvoie un favori du Playground au Playground, en nommant l'origine", () => {
    const o = ouvertureDepuisFavori({ sourceApp: 'playground', code: '<p>x</p>' });
    expect(o.cible).toBe('playground');
    if (o.cible === 'playground') {
      expect(o.motif).toBe('origine-playground');
      expect(o.message).toMatch(/vient du Playground/);
      // Le motif faux ne doit jamais revenir.
      expect(o.message).not.toMatch(/avant la mise à jour|ancien/i);
    }
  });

  it('ne pousse pas une configuration de carte à couches dans le Builder graphique', () => {
    // Le Builder carto n'a aucun chemin de reprise : sa configuration appliquée
    // au Builder graphique produisait un état muet et faux.
    const o = ouvertureDepuisFavori({
      sourceApp: 'builder-carto',
      code: '<dsfr-data-map></dsfr-data-map>',
      builderStateJson: { layers: [] },
    });
    expect(o.cible).toBe('playground');
    if (o.cible === 'playground') {
      expect(o.motif).toBe('origine-carto');
      expect(o.message).toMatch(/Builder carto/);
    }
  });

  it("dit l'absence de configuration quand l'origine est inconnue", () => {
    const o = ouvertureDepuisFavori({ code: '<p>x</p>' });
    expect(o.cible).toBe('playground');
    if (o.cible === 'playground') {
      expect(o.motif).toBe('sans-configuration');
      expect(o.message).toMatch(/pas de configuration/);
      expect(o.message).not.toMatch(/avant la mise à jour/i);
    }
  });

  it('annonce dans tous les cas que le code est conservé', () => {
    for (const fav of [
      { sourceApp: 'playground' },
      { sourceApp: 'builder-carto', builderStateJson: {} },
      {},
    ]) {
      const o = ouvertureDepuisFavori(fav);
      if (o.cible === 'playground') expect(o.message).toMatch(/code intact/);
    }
  });
});
