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

    /**
     * Le tag vient du decorateur `@customElement('...')`, PAS du nom de
     * fichier : les deux coincident aujourd'hui, mais un fichier renomme
     * ferait passer le garde-fou en verifiant le mauvais tag — un garde-fou
     * qui se trompe de cible est pire qu'aucun garde-fou.
     */
    function tagOf(src: string, file: string): string {
      const match = /@customElement\(\s*['"]([^'"]+)['"]\s*\)/.exec(src);
      return match ? match[1] : file.replace(/\.ts$/, '');
    }

    const transformers: string[] = [];
    const subscribers: string[] = [];
    const declaredTags: string[] = [];
    for (const file of files) {
      const src = readFileSync(join(COMPONENTS_DIR, file), 'utf-8');
      const tag = tagOf(src, file);
      declaredTags.push(tag);
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
      const known = new Set(declaredTags);
      for (const tag of Object.keys(STAGE_ROLES)) {
        expect(known.has(tag), `${tag} n'existe plus dans packages/core`).toBe(true);
      }
    });

    it('le scan lit bien le décorateur et non le nom de fichier', () => {
      // Meta-test NON TAUTOLOGIQUE : les 23 fichiers s'appellent tous
      // `dsfr-data-*.ts`, donc verifier que les tags commencent par
      // `dsfr-data-` passerait a l'identique si la regex cassait et que
      // `tagOf` retombait sur le nom de fichier. On lui donne donc une source
      // ou les deux DIVERGENT : seul un scan qui lit vraiment le decorateur
      // rend le bon tag.
      const decoy = `@customElement('dsfr-data-tag-du-decorateur')\nexport class X {}`;

      expect(tagOf(decoy, 'un-nom-de-fichier-sans-rapport.ts')).toBe('dsfr-data-tag-du-decorateur');
      // Et le repli reste sain quand il n'y a pas de decorateur.
      expect(tagOf('export class X {}', 'dsfr-data-truc.ts')).toBe('dsfr-data-truc');
    });
  });
});
