/**
 * Decoupage des skills en sections adressables (#513).
 *
 * L'exigence forte est l'invariant de PARTITION : passer aux sections ne doit
 * faire disparaitre aucune connaissance. Les tests verifient donc, pour les 30
 * skills reelles, que chaque bloc du contenu se retrouve dans exactement une
 * section — pas seulement que le decoupage « marche » sur un exemple jouet.
 */
import { describe, it, expect } from 'vitest';
import { SKILLS } from '../../packages/shared/src/skills/skills';
import {
  SKILL_SECTION_IDS,
  splitSkillContent,
  availableSections,
  selectSkillSection,
} from '../../packages/shared/src/skills/skills-sections';

/** Lignes signifiantes (hors vide) d'un texte markdown. */
function meaningfulLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
}

const ALL_SKILLS = Object.values(SKILLS);

/**
 * Fixture : une skill de composant qui n'a PAS de section « pieges » (#950).
 *
 * Les tests qui verifient le message « cette skill n'a pas de section X »
 * designaient jusqu'ici un composant reel — `dsfrDataChart`, puis
 * `dsfrDataSource` apres que #929 eut donne des pieges au premier. Un test qui
 * s'appuie sur l'absence d'une chose finit toujours par se faire contredire par
 * le progres : il construit desormais sa propre donnee.
 */
const SKILL_SANS_PIEGES = [
  '## <fixture-composant> - Role dans le pipeline',
  '',
  'Composant fictif, present uniquement pour ce test.',
  '',
  '### Exemples',
  '',
  '```html',
  '<fixture-composant source="data"></fixture-composant>',
  '```',
].join('\n');

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

    it('regroupe les 6 composants carto dans la reference du skill dsfrDataMap', () => {
      const parts = splitSkillContent(SKILLS.dsfrDataMap.content);
      for (const tag of [
        'dsfr-data-map',
        'dsfr-data-map-layer',
        'dsfr-data-map-popup',
        'dsfr-data-map-inset',
        'dsfr-data-map-timeline',
        'dsfr-data-map-legend',
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
    /**
     * Marge d'une skill au seuil « reference < contenu / 2 » (#950).
     *
     * Le verdict est inchange. Ce qui change, c'est qu'on sait DE COMBIEN on
     * passe : sur `dsfrDataChart`, la marge etait de 63 caracteres apres #947,
     * et rien ne le disait — si bien que #929 a fait tomber, en ajoutant le
     * JSDoc de `map-summary-field`, un test qui ne parle ni de JSDoc ni de cet
     * attribut.
     */
    function margeReference(skill: (typeof ALL_SKILLS)[number]) {
      const contenu = skill.content.length;
      const reference = splitSkillContent(skill.content).reference.length;
      const seuil = contenu / 2;
      return { id: skill.id, contenu, reference, marge: Math.round(seuil - reference) };
    }

    /** Seules les skills qui portent une reference generee sont concernees. */
    const A_REFERENCE = ALL_SKILLS.filter((s) => splitSkillContent(s.content).reference.length > 0);

    /**
     * Le seuil ne porte QUE sur `dsfrDataChart` — c'est le perimetre historique
     * (#513), et il faut le dire, parce qu'il n'a rien d'un invariant general :
     * huit skills a reference le depassent deja (dsfrDataSource, dsfrDataFacets,
     * dsfrDataContext, dsfrDataUnpivot, dsfrDataA11y, dsfrDataContextFilter,
     * dsfrDataSearch, dsfrDataConcat), simplement parce que leur partie ecrite a
     * la main est courte. L'etendre serait un changement de verdict, pas une
     * amelioration de message : c'est l'arbitrage laisse ouvert par #950.
     */
    const SOUS_SEUIL_MOITIE = ['dsfrDataChart'] as const;

    it('la reference des skills surveillees reste sous la moitie du contenu — et on dit de combien', () => {
      // Rapport systematique, meme au vert : c'est l'ABSENCE de ce chiffre qui
      // a laisse #947 s'arreter a 63 caracteres du seuil sans que rien ne le
      // signale, et fait tomber #929 sur un message illisible.
      const marges = A_REFERENCE.map(margeReference).sort((a, b) => a.marge - b.marge);
      const ligne = (m: (typeof marges)[number]) =>
        `  ${m.id.padEnd(24)} ${m.reference}/${m.contenu} car., marge ${m.marge >= 0 ? '+' : ''}${m.marge}`;
      const surveillees = marges.filter((m) => SOUS_SEUIL_MOITIE.includes(m.id as never));
      // `process.stdout` et non `console` : l'environnement happy-dom remplace
      // la console globale et vitest n'en relaie rien — un console.info() ici
      // ne s'afficherait jamais, donc ne servirait a rien.
      process.stdout.write(
        `[skills-sections] seuil "reference < contenu / 2", applique a ${surveillees.length} skill(s) :\n` +
          surveillees.map(ligne).join('\n') +
          `\n  --- pour information, les 5 marges les plus serrees sur ${marges.length} skills a reference :\n` +
          marges.slice(0, 5).map(ligne).join('\n') +
          '\n'
      );

      const depassent = surveillees.filter((m) => m.marge < 0);
      const diagnostic = depassent
        .map(
          (m) =>
            `La reference de \`${m.id}\` depasse la moitie de son contenu ` +
            `(${m.reference} caracteres de reference pour ${m.contenu} au total, marge ${m.marge}). ` +
            `Cause habituelle : un JSDoc d'attribut a grossi dans le composant. ` +
            `Remede : deplacer l'explication longue vers la partie guide de la skill ` +
            `(packages/shared/src/skills/skills.ts), en laissant dans le JSDoc la regle et sa forme courte. ` +
            `C'est ce qu'a fait #929 pour map-summary-field. Voir #950.`
        )
        .join('\n');

      expect(
        depassent.map((m) => m.id),
        diagnostic || 'seuil respecte'
      ).toEqual([]);
    });

    it('les exemples de dsfrDataChart restent sous le quart du contenu', () => {
      const chart = SKILLS.dsfrDataChart.content;
      const parts = splitSkillContent(chart);
      // Le cas qui motive #513 : 16 Ko renvoyes pour repondre « quels
      // attributs ? ». Une section ciblee doit coûter bien moins.
      expect(
        parts.exemples.length,
        `Les exemples de dsfrDataChart pesent ${parts.exemples.length} caracteres pour ` +
          `${chart.length} de contenu (seuil : le quart). Un bloc d'exemples a grossi : ` +
          `en deplacer une partie vers le guide, ou l'elaguer.`
      ).toBeLessThan(chart.length / 4);
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
      // Fixture construite ici, et non un composant reel (#950). Ce test
      // s'appuie sur l'ABSENCE d'une section : le designer sur une vraie skill
      // en fait une prophetie que le progres finit par contredire. Il pointait
      // dsfrDataChart jusqu'a ce que #929 lui donne des pieges, puis
      // dsfrDataSource — qui pouvait en recevoir demain.
      const out = selectSkillSection(SKILL_SANS_PIEGES, 'pieges');
      expect(out).toContain("n'a pas de section");
      expect(out).toContain('Sections disponibles');
      // Le message doit lister ce qui existe, sinon l'agent ne sait pas rebondir.
      expect(out).toContain('guide');
      expect(out).toContain('exemples');
      expect(out).not.toContain('pieges,');
    });

    it('la fixture sans pieges n’expose bien que guide et exemples', () => {
      expect(availableSections(SKILL_SANS_PIEGES)).toEqual(['guide', 'exemples']);
    });

    it('sert le piege de l’arrondi amont sur une carte (#929)', () => {
      const out = selectSkillSection(content, 'pieges');
      expect(out).toContain('map-summary-field');
      expect(out.length).toBeLessThan(content.length);
    });

    it('explique quand la section est inconnue', () => {
      const out = selectSkillSection(content, 'nawak');
      expect(out).toContain('inconnue');
      expect(out).toContain('tout');
    });
  });
});
