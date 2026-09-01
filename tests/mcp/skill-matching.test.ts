/**
 * Moteur de matching partage builder-IA <-> serveur MCP (#514).
 *
 * Deux choses sont verifiees ici :
 *  1. le COMPORTEMENT du moteur, sur les 29 skills reelles — un banc de prompts
 *     qui exige qu'aucune skill anciennement remontee ne disparaisse ;
 *  2. la COPIE : `mcp-server/src/skill-matching.generated.ts` doit etre le
 *     fichier source, a l'en-tete pres. C'est ce qui remplace « faire la
 *     correction deux fois » par « la faire une fois et regenerer ».
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { SKILLS } from '../../apps/builder-ia/src/skills';
import {
  searchSkills,
  scoreSkill,
  matchSkills,
  normalize,
  tokenize,
  headingsOf,
  MIN_SCORE,
  type MatchableSkill,
} from '../../apps/builder-ia/src/skill-matching';
import { buildCopy } from '../../scripts/lib/skill-matching-copy';

const ALL = Object.values(SKILLS);

/** Le moteur historique du MCP : un simple `includes` sur les triggers. */
function legacyMatch(message: string): string[] {
  const lower = message.toLowerCase();
  return ALL.filter((s) => s.trigger.some((t) => lower.includes(t.toLowerCase()))).map((s) => s.id);
}

const skill = (over: Partial<MatchableSkill> = {}): MatchableSkill => ({
  id: 'x',
  name: 'dsfr-data-x',
  description: '',
  trigger: [],
  content: '',
  ...over,
});

describe('moteur de matching partage (#514)', () => {
  describe('primitives', () => {
    it('normalise casse et accents (indispensable en francais)', () => {
      expect(normalize('DONNÉES Régionales')).toBe('donnees regionales');
    });

    it('ne garde que les tokens signifiants', () => {
      // < 4 caracteres et mots vides ecartes.
      expect(tokenize('je veux une carte des donnees par region')).toEqual(['carte', 'region']);
    });

    it('extrait les titres de sections markdown', () => {
      expect(headingsOf('## Un\ntexte\n### Deux\n#### Trois\n')).toEqual(['Un', 'Deux']);
    });
  });

  describe('scoring', () => {
    it('un trigger present tel quel suffit a franchir le seuil', () => {
      const m = scoreSkill(skill({ trigger: ['camembert'] }), 'je veux un camembert');
      expect(m.score).toBeGreaterThanOrEqual(MIN_SCORE);
      expect(m.reasons.join()).toContain('trigger: camembert');
    });

    it('matche un trigger malgre les accents', () => {
      const m = scoreSkill(skill({ trigger: ['données'] }), 'charge mes DONNEES');
      expect(m.score).toBeGreaterThanOrEqual(MIN_SCORE);
    });

    it('matche un trigger multi-mots disperse dans la phrase', () => {
      // Le cas que l'ancien `includes` ratait : « colonnes en lignes » face a
      // « colonnes ANNUELLES en lignes ».
      const m = scoreSkill(
        skill({ trigger: ['colonnes en lignes'] }),
        'depliage des colonnes annuelles en lignes'
      );
      expect(m.score).toBeGreaterThanOrEqual(MIN_SCORE);
      expect(m.reasons.join()).toContain('trigger disperse');
    });

    it('ne matche pas un trigger multi-mots dont un mot manque', () => {
      const m = scoreSkill(skill({ trigger: ['colonnes en lignes'] }), 'trie mes colonnes');
      expect(m.score).toBeLessThan(MIN_SCORE);
    });

    it('la description seule ne suffit pas a remonter une skill', () => {
      // Les signaux faibles servent a CLASSER, pas a inventer des reponses.
      const m = scoreSkill(
        skill({ description: 'Composant de classement visuel' }),
        'classement visuel'
      );
      expect(m.score).toBeLessThan(MIN_SCORE);
    });

    it('la description et les titres departagent deux skills a trigger egal', () => {
      const generic = skill({ id: 'generic', trigger: ['carte'], description: '', content: '' });
      const specific = skill({
        id: 'specific',
        trigger: ['carte'],
        description: 'Animation temporelle des couches',
        content: '## Animation temporelle\n',
      });
      const ranked = searchSkills([generic, specific], 'animation temporelle sur une carte');
      expect(ranked[0].skill.id).toBe('specific');
    });

    it('plafonne les signaux faibles pour ne pas ecraser un vrai trigger', () => {
      const noisy = skill({
        id: 'noisy',
        description: 'carte region departement commune quartier adresse parcelle',
        content: '## carte\n## region\n## departement\n## commune\n## quartier\n',
      });
      const real = skill({ id: 'real', trigger: ['carte'] });
      const ranked = searchSkills(
        [noisy, real],
        'carte region departement commune quartier adresse parcelle'
      );
      expect(ranked[0].skill.id).toBe('real');
    });

    it('classe de facon deterministe a score egal (ordre de declaration)', () => {
      const a = skill({ id: 'a', trigger: ['kpi'] });
      const b = skill({ id: 'b', trigger: ['kpi'] });
      expect(searchSkills([a, b], 'kpi').map((m) => m.skill.id)).toEqual(['a', 'b']);
      expect(searchSkills([b, a], 'kpi').map((m) => m.skill.id)).toEqual(['b', 'a']);
    });

    it('respecte limit', () => {
      expect(searchSkills(ALL, 'graphique carte tableau kpi', { limit: 2 })).toHaveLength(2);
    });
  });

  describe('banc de prompts sur les 29 skills reelles', () => {
    const PROMPTS = [
      'je veux un graphique',
      'quel evenement ecouter quand la source change',
      'comment aplatir des enregistrements imbriques Grist',
      'classement des 5 premieres regions',
      'animer une carte dans le temps',
      'filtrer cote serveur avec ODSQL',
      'ajouter une legende accessible et un tableau equivalent',
      'depliage des colonnes annuelles en lignes',
    ];

    it.each(PROMPTS)('« %s » : aucune skill de l’ancien moteur n’est perdue', (prompt) => {
      const before = legacyMatch(prompt);
      const after = matchSkills(ALL, prompt).map((s) => s.id);
      expect(before.filter((id) => !after.includes(id))).toEqual([]);
    });

    it('retrouve dsfrDataUnpivot la ou l’ancien moteur restait muet', () => {
      const prompt = 'depliage des colonnes annuelles en lignes';
      expect(legacyMatch(prompt)).not.toContain('dsfrDataUnpivot');
      expect(matchSkills(ALL, prompt).map((s) => s.id)).toContain('dsfrDataUnpivot');
    });

    it.each([
      ['classement des 5 premieres regions', 'dsfrDataPodium'],
      ['animer une carte dans le temps', 'dsfrDataMap'],
      ['comment aplatir des enregistrements imbriques Grist', 'dsfrDataNormalize'],
    ])('« %s » classe %s en tete', (prompt, expected) => {
      // L'ancien moteur ne classait pas : il renvoyait dans l'ordre de
      // declaration, et la bonne skill pouvait arriver 4e.
      expect(matchSkills(ALL, prompt)[0].id).toBe(expected);
    });

    it.each(['bonjour comment ca va', 'merci beaucoup, super travail', 'ok parfait'])(
      '« %s » ne remonte rien',
      (prompt) => {
        expect(matchSkills(ALL, prompt)).toEqual([]);
      }
    );
  });

  describe('copie vers le serveur MCP', () => {
    const root = resolve(__dirname, '../..');
    const source = readFileSync(resolve(root, 'apps/builder-ia/src/skill-matching.ts'), 'utf-8');
    const copy = readFileSync(resolve(root, 'mcp-server/src/skill-matching.generated.ts'), 'utf-8');

    it('la copie MCP est identique a la source, a l’en-tete pres', () => {
      // Echec typique : correction du moteur sans "npm run build:skill-matching".
      expect(copy).toBe(buildCopy(source));
    });

    it('la source n’a aucun import (condition de la copie)', () => {
      // Un import rendrait la copie non resoluble cote MCP, qui est publie
      // separement et n'a pas les chemins du monorepo.
      expect(source).not.toMatch(/^\s*import\s/m);
    });
  });
});
