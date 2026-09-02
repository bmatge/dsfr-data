/**
 * Decoupage des skills en sections adressables (#513).
 *
 * L'exigence forte est l'invariant de PARTITION : passer aux sections ne doit
 * faire disparaitre aucune connaissance. Les tests verifient donc, pour les 29
 * skills reelles, que chaque bloc du contenu se retrouve dans exactement une
 * section — pas seulement que le decoupage « marche » sur un exemple jouet.
 */
import { describe, it, expect } from 'vitest';
import { SKILLS } from '../../../apps/builder-ia/src/skills';
import {
  SKILL_SECTION_IDS,
  splitSkillContent,
  availableSections,
  selectSkillSection,
} from '../../../apps/builder-ia/src/skills-sections';

/** Lignes signifiantes (hors vide) d'un texte markdown. */
function meaningfulLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
}

const ALL_SKILLS = Object.values(SKILLS);

describe('sections de skills (#513)', () => {
  describe('invariant de partition', () => {
    it.each(ALL_SKILLS.map((s) => [s.id, s.content] as const))(
      '%s : aucune ligne perdue par le decoupage',
      (_id, content) => {
        const parts = splitSkillContent(content);
        const covered = new Set(SKILL_SECTION_IDS.flatMap((id) => meaningfulLines(parts[id])));
        const missing = meaningfulLines(content).filter((l) => !covered.has(l));
        expect(missing).toEqual([]);
      }
    );

    it.each(ALL_SKILLS.map((s) => [s.id, s.content] as const))(
      '%s : aucune ligne inventee par le decoupage',
      (_id, content) => {
        const parts = splitSkillContent(content);
        const original = new Set(meaningfulLines(content));
        const invented = SKILL_SECTION_IDS.flatMap((id) => meaningfulLines(parts[id])).filter(
          (l) => !original.has(l)
        );
        expect(invented).toEqual([]);
      }
    );

    it.each(ALL_SKILLS.map((s) => [s.id, s.content] as const))(
      '%s : chaque bloc va dans exactement une section',
      (_id, content) => {
        const parts = splitSkillContent(content);
        const counts = new Map<string, number>();
        for (const id of SKILL_SECTION_IDS) {
          for (const line of meaningfulLines(parts[id])) {
            counts.set(line, (counts.get(line) ?? 0) + 1);
          }
        }
        // Une meme ligne peut legitimement se repeter dans le contenu d'origine
        // (separateurs de tableau, balises fermantes) : on compare les comptes.
        const originals = new Map<string, number>();
        for (const line of meaningfulLines(content)) {
          originals.set(line, (originals.get(line) ?? 0) + 1);
        }
        const divergent = [...counts.entries()].filter(([l, n]) => originals.get(l) !== n);
        expect(divergent).toEqual([]);
      }
    );
  });

  describe('classement des blocs', () => {
    it('isole la reference generee (#512) dans la section reference', () => {
      const parts = splitSkillContent(SKILLS.dsfrDataChart.content);
      expect(parts.reference).toContain('### Référence `<dsfr-data-chart>`');
      expect(parts.guide).not.toContain('### Référence `<dsfr-data-chart>`');
      expect(parts.exemples).not.toContain('### Référence `<dsfr-data-chart>`');
    });

    it('regroupe les 5 composants carto dans la reference du skill dsfrDataMap', () => {
      const parts = splitSkillContent(SKILLS.dsfrDataMap.content);
      for (const tag of [
        'dsfr-data-map',
        'dsfr-data-map-layer',
        'dsfr-data-map-popup',
        'dsfr-data-map-inset',
        'dsfr-data-map-timeline',
      ]) {
        expect(parts.reference).toContain(`### Référence \`<${tag}>\``);
      }
    });

    it('classe les blocs "Exemples" en exemples', () => {
      const parts = splitSkillContent(SKILLS.dsfrDataSource.content);
      expect(parts.exemples).toContain('### Exemples');
      expect(parts.exemples).toContain('<dsfr-data-source');
    });

    it('classe les regles imperatives en pieges', () => {
      const parts = splitSkillContent(SKILLS.compositionPatterns.content);
      expect(parts.pieges).toMatch(/REGLE IMPORTANTE/);
    });

    it('garde le preambule (avant tout titre) dans le guide', () => {
      const parts = splitSkillContent(SKILLS.dsfrDataSource.content);
      expect(parts.guide).toContain('## <dsfr-data-source> - Connexion aux données');
    });

    it('ignore les titres situes dans une cloture de code', () => {
      const content = [
        '## Titre reel',
        'texte',
        '```html',
        '### Faux titre dans un exemple',
        '```',
        '## Exemples',
        'snippet',
      ].join('\n');
      const parts = splitSkillContent(content);
      expect(parts.guide).toContain('### Faux titre dans un exemple');
      expect(parts.exemples).toContain('snippet');
    });
  });

  describe('gain de taille', () => {
    it('une section ciblee est nettement plus petite que la fiche entiere', () => {
      const chart = SKILLS.dsfrDataChart.content;
      const parts = splitSkillContent(chart);
      // Le cas qui motive l'issue : 16 Ko renvoyes pour repondre « quels
      // attributs ? ». La reference seule doit coûter bien moins.
      expect(parts.reference.length).toBeLessThan(chart.length / 2);
      expect(parts.exemples.length).toBeLessThan(chart.length / 4);
    });

    it('toutes les skills de composant exposent au moins guide + reference', () => {
      for (const id of ['dsfrDataSource', 'dsfrDataChart', 'dsfrDataQuery', 'dsfrDataMap']) {
        expect(availableSections(SKILLS[id].content)).toEqual(
          expect.arrayContaining(['guide', 'reference'])
        );
      }
    });
  });

  describe('selectSkillSection', () => {
    const content = SKILLS.dsfrDataChart.content;

    it('renvoie le contenu integral sans section (retrocompatible)', () => {
      expect(selectSkillSection(content)).toBe(content);
    });

    it('renvoie le contenu integral pour "tout"', () => {
      expect(selectSkillSection(content, 'tout')).toBe(content);
    });

    it('renvoie la section demandee', () => {
      const ref = selectSkillSection(content, 'reference');
      expect(ref).toContain('### Référence `<dsfr-data-chart>`');
      expect(ref.length).toBeLessThan(content.length);
    });

    it('explique quand la section n’existe pas pour cette skill', () => {
      // dsfrDataChart n'a pas de bloc classe en pieges.
      const out = selectSkillSection(content, 'pieges');
      expect(out).toContain("n'a pas de section");
      expect(out).toContain('Sections disponibles');
    });

    it('explique quand la section est inconnue', () => {
      const out = selectSkillSection(content, 'nawak');
      expect(out).toContain('inconnue');
      expect(out).toContain('tout');
    });
  });
});
