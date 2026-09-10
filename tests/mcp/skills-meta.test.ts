/**
 * Tampon de fraicheur des fiches servies par le serveur MCP (#733).
 *
 * Ce que ces tests protegent : la capacite a DATER ce qu'on lit. Rien ne
 * deploie le VPS automatiquement, une instance peut donc servir des fiches en
 * retard de plusieurs versions sur le depot. Sans tampon, un lecteur ne peut
 * pas distinguer « le code ne documente pas X » de « l'instance est ancienne »,
 * et c'est exactement l'erreur qu'ont commise trois agents le meme jour.
 *
 * Les fonctions sont importees depuis `mcp-server/src/` : c'est le code livre,
 * pas une copie.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  describeMeta,
  healthFields,
  metaPathFor,
  parseMeta,
  SKILLS_META_FILENAME,
} from '../../mcp-server/src/skills-meta';

const RACINE = join(__dirname, '../..');

describe('tampon de fraicheur des fiches (#733)', () => {
  describe('metaPathFor', () => {
    it('pose le sidecar a cote du fichier de fiches', () => {
      expect(metaPathFor('/usr/share/nginx/html/dist/skills.json')).toBe(
        `/usr/share/nginx/html/dist/${SKILLS_META_FILENAME}`
      );
    });

    it('remplace le nom quel qu il soit — le fichier local peut etre renomme', () => {
      expect(metaPathFor('/tmp/fiches-0.25.json')).toBe(`/tmp/${SKILLS_META_FILENAME}`);
    });

    it('accepte un chemin relatif sans repertoire', () => {
      expect(metaPathFor('skills.json')).toBe(SKILLS_META_FILENAME);
    });
  });

  describe('parseMeta', () => {
    it('lit un tampon complet', () => {
      expect(
        parseMeta({
          generatedAt: '2026-09-10T15:00:31.860Z',
          libVersion: '0.26.0',
          commit: 'a4de3f9',
          skills: 31,
        })
      ).toEqual({
        generatedAt: '2026-09-10T15:00:31.860Z',
        libVersion: '0.26.0',
        commit: 'a4de3f9',
        skills: 31,
      });
    });

    it('tolere un commit absent : un build sans depot git reste valide', () => {
      const meta = parseMeta({ generatedAt: '2026-09-10T00:00:00.000Z', libVersion: '0.26.0' });
      expect(meta?.commit).toBe('inconnu');
    });

    it('rend null sur un document inutilisable plutot que d echouer', () => {
      // Une instance anterieure a #733 ne sert pas de sidecar du tout ; un
      // document casse ne doit pas etre plus grave qu'un document absent.
      expect(parseMeta(null)).toBeNull();
      expect(parseMeta([])).toBeNull();
      expect(parseMeta('coucou')).toBeNull();
      expect(parseMeta({ libVersion: '0.26.0' })).toBeNull();
      expect(parseMeta({ generatedAt: '2026-09-10', libVersion: 26 })).toBeNull();
    });
  });

  describe('describeMeta', () => {
    it('annonce version et date de generation', () => {
      const texte = describeMeta({
        generatedAt: '2026-09-10T15:00:31.860Z',
        libVersion: '0.26.0',
        commit: 'a4de3f9',
      });
      expect(texte).toContain('0.26.0');
      expect(texte).toContain('2026-09-10');
      expect(texte).toContain('a4de3f9');
      expect(texte).not.toContain('15:00');
    });

    it('dit explicitement quand la fraicheur est inconnue', () => {
      expect(describeMeta(null)).toMatch(/inconnue/);
    });
  });

  describe('healthFields', () => {
    it('expose les trois champs a /health', () => {
      expect(
        healthFields({
          generatedAt: '2026-09-10T15:00:31.860Z',
          libVersion: '0.26.0',
          commit: 'a4de3f9',
        })
      ).toEqual({
        libVersion: '0.26.0',
        generatedAt: '2026-09-10T15:00:31.860Z',
        commit: 'a4de3f9',
      });
    });

    it('rend les champs a null sans les omettre — un client doit voir le trou', () => {
      expect(healthFields(null)).toEqual({
        libVersion: null,
        generatedAt: null,
        commit: null,
      });
    });
  });

  describe('cablage', () => {
    it('le generateur emet les trois champs dans le sidecar', () => {
      const source = readFileSync(join(RACINE, 'scripts/build-skills-json.ts'), 'utf-8');
      expect(source).toContain('generatedAt');
      expect(source).toContain('libVersion');
      expect(source).toContain(SKILLS_META_FILENAME);
    });

    it('skills.json reste un TABLEAU au premier niveau (consommateurs deployes)', () => {
      // Le sidecar existe precisement pour ne pas changer cette forme : le
      // client skills du studio teste `Array.isArray`, et le serveur MCP est
      // distribue separement de l'instance dont il telecharge les fiches.
      const source = readFileSync(join(RACINE, 'scripts/build-skills-json.ts'), 'utf-8');
      expect(source).toContain('JSON.stringify(skills, null, 2)');
    });

    it('list_skills et /health servent le tampon', () => {
      const source = readFileSync(join(RACINE, 'mcp-server/src/index.ts'), 'utf-8');
      expect(source).toContain('describeMeta');
      expect(source).toContain('healthFields');
    });

    it('la procedure de release rappelle de redeployer chartsbuilder', () => {
      const claude = readFileSync(join(RACINE, 'CLAUDE.md'), 'utf-8');
      expect(claude).toMatch(/redeployer|redéployer/i);
      expect(claude).toContain('chartsbuilder');
    });
  });
});
