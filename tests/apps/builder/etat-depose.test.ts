/**
 * Relecture de l'instantané déposé par une autre app (#978) — décision pure.
 */
import { describe, it, expect } from 'vitest';
import {
  ORIGINES_ETAT_DEPOSE,
  estOrigineEtatDepose,
  lireEtatDepose,
  messageEtatRefuse,
} from '../../../apps/builder/src/etat-depose';

describe('estOrigineEtatDepose', () => {
  it('accepte les trois apps qui déposent un état : favoris, Playground, tableau de bord', () => {
    expect([...ORIGINES_ETAT_DEPOSE].sort()).toEqual(['dashboard', 'favorites', 'playground']);
    expect(estOrigineEtatDepose('dashboard')).toBe(true);
    expect(estOrigineEtatDepose('favorites')).toBe(true);
    expect(estOrigineEtatDepose('playground')).toBe(true);
  });

  it('refuse une origine absente ou inconnue', () => {
    expect(estOrigineEtatDepose(null)).toBe(false);
    expect(estOrigineEtatDepose('')).toBe(false);
    expect(estOrigineEtatDepose('pipeline-helper')).toBe(false);
    expect(estOrigineEtatDepose('__proto__')).toBe(false);
  });
});

describe('lireEtatDepose', () => {
  it('rend la configuration d’un graphique', () => {
    const lecture = lireEtatDepose(JSON.stringify({ chartType: 'pie', title: 'T' }));
    expect(lecture).toEqual({ lisible: true, etat: { chartType: 'pie', title: 'T' } });
  });

  it('décode une configuration encodée deux fois (colonne texte)', () => {
    const brut = JSON.stringify(JSON.stringify({ chartType: 'bar', title: 'Double' }));
    const lecture = lireEtatDepose(brut);
    expect(lecture.lisible).toBe(true);
    if (lecture.lisible) expect(lecture.etat.title).toBe('Double');
  });

  it('dit « illisible » pour un JSON invalide', () => {
    expect(lireEtatDepose('{pas du json')).toEqual({ lisible: false, motif: 'illisible' });
    expect(lireEtatDepose(JSON.stringify('{pas du json'))).toEqual({
      lisible: false,
      motif: 'illisible',
    });
  });

  it('refuse ce qui n’est pas un objet', () => {
    for (const brut of ['null', '42', '[1,2]', 'true', JSON.stringify('[3]')]) {
      expect(lireEtatDepose(brut)).toEqual({ lisible: false, motif: 'pas-une-configuration' });
    }
  });

  it('refuse la configuration d’une carte à couches (Builder carto)', () => {
    const carto = {
      map: { center: [46, 2] },
      layers: [],
      activeLayerId: '',
      generationMode: 'embedded',
    };
    expect(lireEtatDepose(JSON.stringify(carto))).toEqual({
      lisible: false,
      motif: 'configuration-carte',
    });
  });
});

describe('messageEtatRefuse', () => {
  it('nomme la provenance, la raison et l’effet', () => {
    const msg = messageEtatRefuse('dashboard', 'illisible');
    expect(msg).toContain('depuis le tableau de bord');
    expect(msg).toContain('illisible');
    expect(msg).toContain('configuration vierge');
  });
});
