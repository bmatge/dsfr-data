import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_CAPABILITIES,
  getCapabilities,
  setCapabilities,
  resetCapabilities,
  effectiveCapabilities,
} from '../../../apps/builder-ia/src/ia/albert-capabilities';

describe('builder-ia albert-capabilities', () => {
  beforeEach(() => {
    localStorage.clear();
    resetCapabilities();
  });

  it('defaut conservateur : aucune capacite avancee', () => {
    expect(DEFAULT_CAPABILITIES.jsonSchema).toBe(false);
    expect(DEFAULT_CAPABILITIES.toolCalling).toBe(false);
  });

  it('getCapabilities retourne null sans sonde', () => {
    expect(getCapabilities()).toBeNull();
  });

  it('effectiveCapabilities retombe sur le defaut sans sonde', () => {
    expect(effectiveCapabilities()).toEqual(DEFAULT_CAPABILITIES);
  });

  it('setCapabilities persiste et est relu', () => {
    setCapabilities({
      model: 'openweight-large',
      jsonSchema: true,
      toolCalling: true,
      probedAt: 123,
    });
    const caps = getCapabilities();
    expect(caps?.jsonSchema).toBe(true);
    expect(caps?.toolCalling).toBe(true);
    expect(caps?.model).toBe('openweight-large');
    // Persiste en localStorage.
    expect(localStorage.getItem('dsfr-data-ia-capabilities')).toContain('openweight-large');
  });

  it('relit rerank et rerankModel depuis localStorage (#526 — champs perdus avant)', () => {
    // Cache memoire vide + localStorage ecrit par une session precedente :
    // c'est le chemin d'un rechargement de page apres une sonde reussie.
    resetCapabilities();
    localStorage.setItem(
      'dsfr-data-ia-capabilities',
      JSON.stringify({
        model: 'openweight-large',
        jsonSchema: true,
        toolCalling: true,
        rerank: true,
        rerankModel: 'bge-reranker-v2-m3',
        probedAt: 456,
      })
    );
    const caps = getCapabilities();
    expect(caps?.rerank).toBe(true);
    expect(caps?.rerankModel).toBe('bge-reranker-v2-m3');
  });

  it('resetCapabilities efface tout', () => {
    setCapabilities({ model: 'm', jsonSchema: true, toolCalling: false, probedAt: 1 });
    resetCapabilities();
    expect(getCapabilities()).toBeNull();
    expect(effectiveCapabilities()).toEqual(DEFAULT_CAPABILITIES);
  });

  it('tolere un localStorage corrompu', () => {
    localStorage.setItem('dsfr-data-ia-capabilities', 'not-json');
    expect(getCapabilities()).toBeNull();
  });
});
