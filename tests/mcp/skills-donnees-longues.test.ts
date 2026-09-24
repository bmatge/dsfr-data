/**
 * Donnees longues sur une carte et piege du total repete (#1110).
 *
 * Verifie, sur ce que `get_skill` du serveur MCP SERT (et non sur le fichier
 * source seul) :
 *  1. la fiche carte `dsfrDataMap` porte la recette `group-field` + volet
 *     lateral (`mode="panel-right"`), ses alternatives, et la distinction
 *     clustering / regroupement ;
 *  2. la skill metier `datavizMetier` porte le piege du total repete, dans la
 *     reference `echelles-honnetes` et aux niveaux base et intermediaire.
 */
import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';

import { SKILLS } from '../../packages/shared/src/skills/skills';
import { splitSkillContent } from '../../packages/shared/src/skills/skills-sections';
import { parseMarkdownSkill } from '../../scripts/lib/markdown-skills';
import { readMarkdownSkillFiles } from '../../scripts/lib/markdown-skills-fs';
import { selectSkillText, type Skill } from '../../mcp-server/src/skills';

const root = resolve(__dirname, '../..');

/** La fiche carte telle que `build-skills-json.ts` la publie. */
const carteSource = SKILLS.dsfrDataMap;
const carte: Skill = {
  id: carteSource.id,
  name: carteSource.name,
  description: carteSource.description,
  trigger: carteSource.trigger,
  content: carteSource.content,
  sections: splitSkillContent(carteSource.content),
};

const parsed = parseMarkdownSkill(
  readMarkdownSkillFiles(resolve(root, 'skills'), 'dataviz-metier')
);
const metier: Skill = {
  id: parsed.id,
  name: parsed.name,
  description: parsed.description,
  trigger: parsed.trigger,
  content: parsed.content,
  sections: splitSkillContent(parsed.content),
  index: parsed.index,
  levels: parsed.levels,
  references: parsed.references,
};

describe('get_skill("dsfrDataMap") — donnees longues (#1110)', () => {
  const exemples = selectSkillText(carte, { section: 'exemples' }).text;
  const pieges = selectSkillText(carte, { section: 'pieges' }).text;

  it('sert la recette group-field + volet lateral dans les exemples', () => {
    const debut = exemples.indexOf('### Exemple : données longues');
    expect(debut).toBeGreaterThanOrEqual(0);
    const recette = exemples.slice(debut, exemples.indexOf('\n### ', debut + 1));
    expect(recette).toMatch(/<dsfr-data-map-layer[^>]*\bgroup-field="Ville"/);
    expect(recette).toMatch(/<dsfr-data-map-popup[^>]*\bmode="panel-right"/);
    expect(recette).toContain('popup-fields="Action / aide nationale,Domaine"');
    // Les trois alternatives et leur limite
    expect(recette).toMatch(/group-by[\s\S]*perd les\s+lignes/);
    expect(recette).toContain('dsfr-data-pivot');
    expect(recette).toMatch(/refine-on-click[\s\S]*dsfr-data-list/);
  });

  it('dit que le clustering ne regroupe pas une entite', () => {
    expect(pieges).toContain("clustering n'est pas regroupement");
    expect(pieges).toMatch(/ne\s+dédoublonne pas une entité/);
  });
});

describe('get_skill("datavizMetier") — piege du total repete (#1110)', () => {
  it('la reference echelles-honnetes porte le piege', () => {
    const { text, error } = selectSkillText(metier, { reference: 'echelles-honnetes' });
    expect(error).toBe(false);
    expect(text).toContain("## Le total répété : un attribut de l'entité, pas une valeur de ligne");
    expect(text).toContain('« Chèque énergie : 4 »');
  });

  it.each(['base', 'intermediaire'] as const)('le niveau %s le signale', (niveau) => {
    const { text } = selectSkillText(metier, { niveau });
    expect(text).toMatch(/total répété/i);
    expect(text).toContain('Chèque énergie : 4');
  });
});
