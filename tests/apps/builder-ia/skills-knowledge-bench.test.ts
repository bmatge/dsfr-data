/**
 * Banc de prompts « connaissance fine » — critere de succes de l'epic #511.
 *
 * Les trois briques de l'epic ne valent que bout a bout : il ne suffit pas que
 * la reference soit generee (#512), qu'elle soit adressable (#513) et que le
 * matching soit unifie (#514) — encore faut-il qu'une VRAIE question trouve sa
 * reponse. Chaque scenario rejoue donc le chemin complet :
 *
 *   question -> getRelevantSkills -> selectSkillSection -> la reponse est la
 *
 * Chaque scenario porte aussi son « avant » : la preuve que la partie REDIGEE
 * a la main ne contenait pas la reponse. C'est ce qui distingue un banc utile
 * d'un test qui se contente de confirmer ce qu'on vient d'ecrire.
 */
import { describe, it, expect } from 'vitest';
import { SKILLS, getRelevantSkills } from '../../../apps/builder-ia/src/skills';
import {
  splitSkillContent,
  selectSkillSection,
} from '../../../apps/builder-ia/src/skills-sections';
import type { SkillSectionId } from '../../../apps/builder-ia/src/skills-sections';

interface Scenario {
  question: string;
  skill: string;
  section: SkillSectionId;
  /** Fragments que la section doit contenir pour repondre. */
  answers: string[];
  /**
   * Sous-ensemble de `answers` reellement ABSENT du texte redige a la main
   * avant l'epic — ce que la generation apporte, et rien de plus.
   *
   * La distinction compte : le guide de `dsfr-data-source` citait deja les NOMS
   * des evenements, mais ne disait nulle part qu'ils sont emis sur `document`
   * ni comment filtrer sur `detail.sourceId`. C'est cette moitie-la qui
   * manquait, et c'est elle qu'on prouve.
   */
  newKnowledge: string[];
}

const SCENARIOS: Scenario[] = [
  {
    question: 'quel evenement ecouter quand la source change',
    skill: 'dsfrDataSource',
    section: 'reference',
    answers: ['dsfr-data-loaded', 'document.addEventListener', 'detail.sourceId'],
    // Le guide citait les noms d'evenements, jamais la maniere de les ecouter.
    newKnowledge: ['document.addEventListener', 'detail.sourceId'],
  },
  {
    question: 'comment regler l’espacement entre les kpi du groupe',
    skill: 'dsfrDataKpiGroup',
    section: 'reference',
    answers: ['--dsfr-data-kpi-group-gap', 'Variables CSS publiques'],
    newKnowledge: ['--dsfr-data-kpi-group-gap', 'Variables CSS publiques'],
  },
  {
    question: 'que peut-on placer a l’interieur de dsfr-data-kpi-group',
    skill: 'dsfrDataKpiGroup',
    section: 'reference',
    answers: ['**Slots**'],
    newKnowledge: ['**Slots**'],
  },
  {
    question: 'dsfr-data-query relaie-t-il la pagination vers la source amont',
    skill: 'dsfrDataQuery',
    section: 'reference',
    answers: ['dsfr-data-source-command', 'AMONT'],
    newKnowledge: ['AMONT'],
  },
  {
    question: 'l’attribut couleur du kpi est-il encore valide',
    skill: 'dsfrDataKpi',
    section: 'reference',
    answers: ['**DEPRECIE**', 'color-token'],
    // Le guide listait l'alias ; il ne le signalait pas comme a proscrire.
    newKnowledge: ['**DEPRECIE**'],
  },
  {
    question: 'le composant search previent-il la page quand la saisie change',
    skill: 'dsfrDataSearch',
    section: 'reference',
    answers: ['dsfr-data-search-change'],
    newKnowledge: ['dsfr-data-search-change'],
  },
];

describe('banc de prompts « connaissance fine » (#511)', () => {
  describe.each(SCENARIOS)('« $question »', (scenario) => {
    const skill = SKILLS[scenario.skill];

    it('la skill attendue est retrouvee par le matching', () => {
      const ids = getRelevantSkills(scenario.question, null).map((s) => s.id);
      expect(ids).toContain(scenario.skill);
    });

    it('la section ciblee contient la reponse', () => {
      const section = selectSkillSection(skill.content, scenario.section);
      for (const answer of scenario.answers) {
        expect(
          section,
          `${scenario.skill}/${scenario.section} devrait contenir "${answer}"`
        ).toContain(answer);
      }
    });

    it('la reponse tient dans une fraction de la fiche', () => {
      const section = selectSkillSection(skill.content, scenario.section);
      expect(section.length).toBeLessThan(skill.content.length);
    });

    it('la connaissance apportee etait bien absente du texte redige', () => {
      // Le « avant » de l'epic. Un scenario dont la reponse figurait deja dans
      // le guide ne prouverait rien — d'ou cette contre-verification.
      const parts = splitSkillContent(skill.content);
      const handwritten = [parts.guide, parts.exemples, parts.pieges].join('\n');
      expect(scenario.newKnowledge.length).toBeGreaterThan(0);
      for (const fragment of scenario.newKnowledge) {
        expect(
          handwritten.includes(fragment),
          `"${fragment}" est deja dans le texte redige : le scenario ne prouve rien`
        ).toBe(false);
      }
    });
  });

  it('le gain de taille est reel sur l’ensemble du banc', () => {
    const full = SCENARIOS.map((s) => SKILLS[s.skill].content.length);
    const targeted = SCENARIOS.map(
      (s) => selectSkillSection(SKILLS[s.skill].content, s.section).length
    );
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    // Avant l'epic, repondre a l'une de ces questions coutait la fiche entiere
    // — quand la reponse s'y trouvait, ce qui n'etait que partiellement le cas
    // (cf. `newKnowledge` scenario par scenario).
    expect(avg(targeted)).toBeLessThan(avg(full) * 0.7);
  });
});
