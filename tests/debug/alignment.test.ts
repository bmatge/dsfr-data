import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_EVENTS } from '@/utils/data-bridge.js';
import { BUS_EVENTS, STAGE_ROLES } from '@dsfr-data/shared';

/**
 * Garde-fous d'alignement du collecteur (#604).
 *
 * Le collecteur duplique deux choses depuis `packages/core` — les noms
 * d'evenements et la classification des balises — parce qu'il doit pouvoir
 * tourner SANS la bibliotheque (script autonome, #608). Une duplication sans
 * garde-fou derive : ces tests la rendent bruyante.
 *
 * Meme doctrine que `provider-config-alignment`, `attribute-convention` et
 * le garde-fou d'import de `skill-matching.ts`.
 */

const COMPONENTS_DIR = join(__dirname, '../../packages/core/src/components');

describe('alignement du collecteur avec le coeur (#604)', () => {
  it('les noms d’événements du bus sont identiques à DATA_EVENTS', () => {
    // Si un nom change cote core, le collecteur ecoute dans le vide et le
    // volet reste desesperement muet — sans la moindre erreur.
    expect(BUS_EVENTS.LOADED).toBe(DATA_EVENTS.LOADED);
    expect(BUS_EVENTS.ERROR).toBe(DATA_EVENTS.ERROR);
    expect(BUS_EVENTS.LOADING).toBe(DATA_EVENTS.LOADING);
    expect(BUS_EVENTS.SOURCE_COMMAND).toBe(DATA_EVENTS.SOURCE_COMMAND);
  });

  it('couvre exactement les mêmes clés que DATA_EVENTS', () => {
    expect(Object.keys(BUS_EVENTS).sort()).toEqual(Object.keys(DATA_EVENTS).sort());
  });

  /**
   * La table STAGE_ROLES doit refleter l'usage REEL des mixins : un nouveau
   * transformateur non declare disparaitrait silencieusement du graphe.
   */
  describe('STAGE_ROLES reflète l’usage des mixins', () => {
    const files = readdirSync(COMPONENTS_DIR).filter((f) => f.endsWith('.ts'));

    const transformers: string[] = [];
    const subscribers: string[] = [];
    for (const file of files) {
      const src = readFileSync(join(COMPONENTS_DIR, file), 'utf-8');
      const tag = file.replace(/\.ts$/, '');
      if (src.includes('TransformerMixin(')) transformers.push(tag);
      if (src.includes('SourceSubscriberMixin(')) subscribers.push(tag);
    }

    it('trouve bien des composants à classer (le scan fonctionne)', () => {
      expect(transformers.length).toBeGreaterThan(0);
      expect(subscribers.length).toBeGreaterThan(0);
    });

    it('tout composant TransformerMixin est déclaré "transform"', () => {
      for (const tag of transformers) {
        expect(STAGE_ROLES[tag], `${tag} utilise TransformerMixin`).toBe('transform');
      }
    });

    it('tout composant SourceSubscriberMixin est déclaré "display"', () => {
      for (const tag of subscribers) {
        expect(STAGE_ROLES[tag], `${tag} utilise SourceSubscriberMixin`).toBe('display');
      }
    });

    it('dsfr-data-source est la seule source', () => {
      const sources = Object.entries(STAGE_ROLES)
        .filter(([, role]) => role === 'source')
        .map(([tag]) => tag);
      expect(sources).toEqual(['dsfr-data-source']);
    });

    it('aucune balise déclarée n’a disparu du coeur', () => {
      const known = new Set(files.map((f) => f.replace(/\.ts$/, '')));
      for (const tag of Object.keys(STAGE_ROLES)) {
        expect(known.has(tag), `${tag} n'existe plus dans packages/core`).toBe(true);
      }
    });
  });
});
