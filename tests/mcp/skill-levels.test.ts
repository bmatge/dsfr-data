/**
 * dataviz-metier adressable par niveau et par reference (#1035).
 *
 * Arbitrage du 2026-09-24 : designation par un SECOND parametre (`niveau` ou
 * `reference`), le vocabulaire des sections reste ferme (#513) ; sans niveau
 * demande et sans dialogue possible, l'INTERMEDIAIRE est servi, ANNONCE.
 *
 * Verifie ici, sur la skill reelle lue dans `skills/dataviz-metier/` :
 *  1. la correspondance niveau -> references lue dans la table du SKILL.md ;
 *  2. `get_skill` du serveur MCP par niveau, par reference, par defaut, et ses
 *     erreurs (niveau/reference inconnus, parametres exclusifs, skill sans
 *     niveaux) ;
 *  3. `list_skills` et `get_relevant_skills` qui annoncent niveaux et
 *     references, et les quatre sections qui restent une partition ;
 *  4. la copie `mcp-server/src/skill-levels.generated.ts` a jour, source sans import.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseLevels, parseMarkdownSkill } from '../../scripts/lib/markdown-skills';
import { readMarkdownSkillFiles } from '../../scripts/lib/markdown-skills-fs';
import { buildCopy, MCP_COPIES } from '../../scripts/lib/skill-matching-copy';
import { splitSkillContent } from '../../apps/builder-ia/src/skills-sections';
import {
  selectSkillText,
  relevantSkillText,
  describeSkillLine,
  selectSection,
  SKILL_SECTION_IDS,
  type Skill,
} from '../../mcp-server/src/skills';
import { normalizeReferenceId } from '../../packages/shared/src/ia/skill-levels';

const root = resolve(__dirname, '../..');
const files = readMarkdownSkillFiles(resolve(root, 'skills'), 'dataviz-metier');
const parsed = parseMarkdownSkill(files);

/** La fiche telle que `build-skills-json.ts` la publie dans skills.json. */
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

const refContent = (id: string): string => {
  const ref = parsed.references.find((r) => r.id === id);
  if (!ref) throw new Error(`référence ${id} absente`);
  return ref.content;
};

/** Un extrait distinctif de chaque référence : sa première ligne de titre. */
const titre = (id: string): string => refContent(id).split('\n')[0];

describe('correspondance niveau -> références (table « Choisir le niveau » du SKILL.md)', () => {
  it('base : une seule référence, niveau-base', () => {
    expect(parsed.levels?.base).toEqual(['niveau-base']);
  });

  it('intermédiaire : les références de sa ligne, dans l’ordre du SKILL.md', () => {
    expect(parsed.levels?.intermediaire).toEqual([
      'trouver-l-histoire',
      'choisir-la-forme',
      'grille-de-relecture',
      'structure-narrative',
    ]);
  });

  it('avancé : « les précédentes » puis le cas d’école', () => {
    expect(parsed.levels?.avance).toEqual([
      'niveau-base',
      'trouver-l-histoire',
      'choisir-la-forme',
      'grille-de-relecture',
      'structure-narrative',
      'cas-d-ecole-portrait-federation',
    ]);
  });

  it('toutes les références du dossier sont adressables une à une', () => {
    expect(parsed.references.map((r) => `references/${r.id}.md`)).toEqual([
      ...files.references.keys(),
    ]);
    for (const r of parsed.references) expect(r.title.length).toBeGreaterThan(3);
  });

  it('parseLevels : sans table, pas de niveaux ; référence citée absente signalée', () => {
    expect(parseLevels('# Rien\n\n| a | b |\n', [])).toBeNull();
    const t = parseLevels(
      '| **Base** | x | [a](references/a.md) | y |\n| **Avancé** | x | les précédentes, [b](references/b.md) | y |',
      ['a']
    );
    expect(t?.levels).toEqual({ base: ['a'], avance: ['a', 'b'] });
    expect(t?.missing).toEqual(['b']);
  });

  it('une table qui cite une référence absente fait échouer le build', () => {
    const skillMd = files.skillMd.replace(
      'references/niveau-base.md)',
      'references/niveau-disparu.md)'
    );
    expect(() => parseMarkdownSkill({ ...files, skillMd })).toThrow(/niveau-disparu/);
  });
});

describe('get_skill("datavizMetier", …) côté MCP', () => {
  it('niveau base : index puis la seule référence niveau-base', () => {
    const { text, error } = selectSkillText(metier, { niveau: 'base' });
    expect(error).toBe(false);
    expect(text).toContain('Choisir le niveau'); // l'index (SKILL.md)
    expect(text).toContain(titre('niveau-base'));
    expect(text).not.toContain(titre('trouver-l-histoire'));
    expect(text).not.toContain('PAR DÉFAUT');
    expect(text.length).toBeLessThan(metier.content.length / 3);
  });

  it('niveau intermediaire : ses quatre références, pas le cas d’école', () => {
    const { text } = selectSkillText(metier, { niveau: 'intermediaire' });
    for (const id of metier.levels?.intermediaire ?? []) expect(text).toContain(titre(id));
    expect(text).not.toContain(titre('cas-d-ecole-portrait-federation'));
    expect(text).not.toContain(titre('niveau-base'));
  });

  it('niveau avance : les précédentes et le cas d’école, pas les références hors niveau', () => {
    const { text } = selectSkillText(metier, { niveau: 'avance' });
    expect(text).toContain(titre('cas-d-ecole-portrait-federation'));
    expect(text).toContain(titre('niveau-base'));
    expect(text).not.toContain(titre('echelles-honnetes'));
  });

  it('sans niveau : l’intermédiaire, ANNONCÉ, avec la façon d’en changer', () => {
    const { text, error } = selectSkillText(metier, {});
    expect(error).toBe(false);
    expect(text).toContain('Niveau intermédiaire servi PAR DÉFAUT');
    expect(text).toContain('niveau: "base"');
    expect(text).toContain('niveau: "avance"');
    expect(text).toContain(titre('choisir-la-forme'));
    // Même contenu que l'intermédiaire demandé, en-tête mis à part.
    const demande = selectSkillText(metier, { niveau: 'intermediaire' }).text;
    expect(text.split('\n---\n').slice(2)).toEqual(demande.split('\n---\n').slice(2));
  });

  it('par référence : le contenu exact de ce fichier, seul', () => {
    const { text, error } = selectSkillText(metier, { reference: 'echelles-honnetes' });
    expect(error).toBe(false);
    expect(text).toContain(refContent('echelles-honnetes'));
    expect(text).not.toContain('Choisir le niveau');
    expect(text).not.toContain(titre('choisir-la-forme'));
  });

  it('une référence recopiée d’un lien (references/x.md) est reconnue', () => {
    expect(normalizeReferenceId(' references/Choisir-la-forme.md ')).toBe('choisir-la-forme');
    expect(selectSkillText(metier, { reference: 'references/anti-patterns.md' }).text).toContain(
      refContent('anti-patterns')
    );
  });

  it('niveau inconnu : erreur qui liste les niveaux valides', () => {
    const r = selectSkillText(metier, { niveau: 'expert' });
    expect(r.error).toBe(true);
    expect(r.text).toContain('Niveau "expert" inconnu');
    expect(r.text).toContain('base, intermediaire, avance');
  });

  it('référence inconnue : erreur qui liste les références — jamais un chemin', () => {
    for (const reference of ['inexistante', '../../SKILL', '/etc/passwd', 'references/../README']) {
      const r = selectSkillText(metier, { reference });
      expect(r.error, reference).toBe(true);
      expect(r.text).toContain('Références valides');
      expect(r.text).toContain('choisir-la-forme');
    }
  });

  it('niveau et reference, ou avec une section : exclusifs', () => {
    expect(selectSkillText(metier, { niveau: 'base', reference: 'annotation' }).error).toBe(true);
    expect(selectSkillText(metier, { niveau: 'base', section: 'guide' }).error).toBe(true);
  });

  it('les sections restent servies telles quelles, « tout » rend la fiche entière', () => {
    expect(selectSkillText(metier, { section: 'guide' }).text).toBe(selectSection(metier, 'guide'));
    expect(selectSkillText(metier, { section: 'tout' }).text).toBe(metier.content);
  });

  it('une skill sans niveaux : comportement historique, niveau refusé', () => {
    const tech: Skill = {
      id: 'dsfrDataChart',
      name: 'dsfr-data-chart',
      description: 'Graphiques',
      trigger: ['graphique'],
      content: '## Chart\ncontenu',
    };
    expect(selectSkillText(tech, {}).text).toBe('## Chart\ncontenu');
    const r = selectSkillText(tech, { niveau: 'base' });
    expect(r.error).toBe(true);
    expect(r.text).toContain('ne publie ni niveaux ni références');
  });

  it('instance antérieure à #1035 (pas de levels) : fiche complète sans niveau, comme avant', () => {
    const ancienne: Skill = {
      ...metier,
      index: undefined,
      levels: undefined,
      references: undefined,
    };
    expect(selectSkillText(ancienne, {}).text).toBe(metier.content);
    expect(selectSkillText(ancienne, { reference: 'annotation' }).error).toBe(true);
  });
});

describe('list_skills et get_relevant_skills annoncent niveaux et références', () => {
  it('list_skills : sections, puis niveaux (défaut signalé) et références', () => {
    const line = describeSkillLine(metier);
    expect(line).toContain('sections: ');
    expect(line).toContain('niveaux: base, intermediaire (défaut), avance');
    for (const r of metier.references ?? []) expect(line).toContain(r.id);
  });

  it('get_relevant_skills : l’index et ce qui est adressable, pas les 1 500 lignes', () => {
    const text = relevantSkillText(metier);
    expect(text).toContain('Choisir le niveau');
    expect(text).toContain('niveau: "intermediaire"');
    expect(text).toContain('servi par défaut');
    for (const r of metier.references ?? []) expect(text).toContain(`\`${r.id}\` — ${r.title}`);
    expect(text).not.toContain(refContent('echelles-honnetes'));
    expect(text.length).toBeLessThan(metier.content.length / 4);
  });

  it('get_relevant_skills avec section : la section, inchangée', () => {
    expect(relevantSkillText(metier, 'guide')).toBe(selectSection(metier, 'guide'));
  });

  it('le vocabulaire des sections reste fermé à quatre valeurs (#513)', () => {
    expect([...SKILL_SECTION_IDS]).toEqual(['guide', 'reference', 'exemples', 'pieges']);
  });

  it('les quatre sections restent une partition du contenu : rien de perdu, rien d’inventé', () => {
    const lines = (t: string) =>
      t
        .split('\n')
        .map((l) => l.trimEnd())
        .filter((l) => l.trim().length > 0);
    const s = metier.sections ?? {};
    const parts = SKILL_SECTION_IDS.flatMap((id) => lines(s[id] ?? ''));
    const covered = new Set(parts);
    const original = new Set(lines(metier.content));
    expect(lines(metier.content).filter((l) => !covered.has(l))).toEqual([]);
    expect(parts.filter((l) => !original.has(l))).toEqual([]);
  });
});

describe('copie vers le serveur MCP', () => {
  const copie = MCP_COPIES[1];
  const source = readFileSync(resolve(root, copie.source), 'utf-8');

  it('la copie MCP est identique à la source, à l’en-tête près', () => {
    expect(readFileSync(resolve(root, copie.copy), 'utf-8')).toBe(buildCopy(source, copie));
  });

  it('la source n’a aucun import (condition de la copie)', () => {
    expect(source).not.toMatch(/^\s*import\s/m);
  });
});
