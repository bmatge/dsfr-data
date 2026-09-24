/**
 * Garde-fou de couverture du Studio (#1109) : chaque composant et attribut du
 * manifeste est ECRIT par le Studio (mesure sur son export) ou EXCLU avec sa
 * raison. Meme logique que `npm run check:studio-couverture` (bloquant en CI).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  attributsEcritsParLeStudio,
  balisesEcrites,
  verifierCouverture,
  type ManifesteCem,
} from '../../../apps/studio/src/couverture';
import { EXCLUSIONS, type ExclusionDeclaree } from '../../../apps/studio/src/couverture-exclusions';

const MANIFESTE = JSON.parse(
  readFileSync(resolve(__dirname, '../../../packages/core/custom-elements.json'), 'utf8')
) as ManifesteCem;

// Mesure couteuse (quelques milliers d'exports) : une seule fois.
const ECRITS = attributsEcritsParLeStudio();

/** Copie du manifeste avec un attribut ajoute a un composant. */
function avecAttribut(tag: string, nom: string): ManifesteCem {
  const copie = structuredClone(MANIFESTE);
  for (const mod of copie.modules) {
    for (const decl of mod.declarations ?? []) {
      if (decl.tagName === tag) decl.attributes = [...(decl.attributes ?? []), { name: nom }];
    }
  }
  return copie;
}

describe('couverture du Studio — etat versionne', () => {
  it('chaque composant et attribut du manifeste est ecrit ou exclu avec sa raison', () => {
    const bilan = verifierCouverture(MANIFESTE, ECRITS, EXCLUSIONS);
    expect(bilan.erreurs).toEqual([]);
    expect(bilan.composants.total).toBe(28);
  });

  it('mesure ce que #1109 a ajoute : volet, gabarit, regroupement', () => {
    expect([...(ECRITS.get('dsfr-data-map-popup') ?? [])]).toEqual(
      expect.arrayContaining(['for', 'mode', 'title-field'])
    );
    const couche = ECRITS.get('dsfr-data-map-layer') ?? new Set();
    for (const a of [
      'popup-template',
      'popup-fields',
      'cluster',
      'cluster-radius',
      'group-field',
    ]) {
      expect(couche.has(a), a).toBe(true);
    }
  });

  it('mesure ce que #1111 a ajoute : le bloc libre ecrit le reste de la lib', () => {
    // Composants hors des blocs guides : transformateurs, interactions, compagnons.
    for (const tag of ['dsfr-data-pivot', 'dsfr-data-search', 'dsfr-data-map-legend']) {
      expect(ECRITS.has(tag), tag).toBe(true);
    }
    // La selection au clic, impossible a cabler par les blocs guides, s'ecrit
    // dans un bloc libre avec son contexte.
    expect(ECRITS.get('dsfr-data-map-layer')?.has('refine-on-click')).toBe(true);
    expect(ECRITS.get('dsfr-data-map-popup')?.has('width')).toBe(true);
    // Ce que le bloc libre refuse reste non ecrit : la balise de suivi, les
    // attributs retires, les reglages de connexion de la source.
    expect(ECRITS.has('dsfr-data-beacon')).toBe(false);
    expect(ECRITS.get('dsfr-data-kpi')?.has('valeur')).toBe(false);
    expect(ECRITS.get('dsfr-data-source')?.has('headers')).toBe(false);
    const bilan = verifierCouverture(MANIFESTE, ECRITS, EXCLUSIONS);
    expect(bilan.composants).toEqual({ total: 28, ecrits: 27 });
  });

  it('chaque exclusion porte une raison', () => {
    for (const ex of EXCLUSIONS) expect(ex.raison.trim().length, ex.composant).toBeGreaterThan(20);
  });
});

describe('couverture du Studio — le garde-fou mord', () => {
  it('ROUGE sur un attribut nouveau de la lib, ni ecrit ni exclu', () => {
    const bilan = verifierCouverture(
      avecAttribut('dsfr-data-map-layer', 'attribut-fictif'),
      ECRITS,
      EXCLUSIONS
    );
    expect(bilan.erreurs).toHaveLength(1);
    expect(bilan.erreurs[0]).toContain('dsfr-data-map-layer attribut-fictif');
    expect(bilan.erreurs[0]).toContain('couverture-exclusions.ts');
  });

  it('ROUGE sur un composant nouveau de la lib, ni ecrit ni exclu', () => {
    const copie = structuredClone(MANIFESTE);
    copie.modules.push({
      declarations: [{ tagName: 'dsfr-data-fictif', attributes: [{ name: 'source' }] }],
    });
    const bilan = verifierCouverture(copie, ECRITS, EXCLUSIONS);
    expect(bilan.erreurs).toHaveLength(1);
    expect(bilan.erreurs[0]).toContain('dsfr-data-fictif');
  });

  it("ROUGE sur l'exclusion d'un attribut que le Studio ecrit", () => {
    const fausse: ExclusionDeclaree = {
      composant: 'dsfr-data-map-layer',
      attributs: ['cluster'],
      raison: 'Exclusion devenue fausse, pour le test.',
    };
    const bilan = verifierCouverture(MANIFESTE, ECRITS, [...EXCLUSIONS, fausse]);
    expect(bilan.erreurs).toEqual([
      "dsfr-data-map-layer cluster : exclu, mais le Studio l'ecrit — retirer l'exclusion devenue fausse.",
    ]);
  });

  it("ROUGE sur l'exclusion d'un composant que le Studio ecrit", () => {
    const fausse: ExclusionDeclaree = {
      composant: 'dsfr-data-map-popup',
      raison: 'Exclusion devenue fausse, pour le test.',
    };
    const bilan = verifierCouverture(MANIFESTE, ECRITS, [...EXCLUSIONS, fausse]);
    expect(bilan.erreurs.some((e) => e.startsWith('dsfr-data-map-popup : exclu'))).toBe(true);
  });

  it('ROUGE sur une exclusion qui ne vise rien, sauf evolution nommee', () => {
    const orpheline: ExclusionDeclaree = {
      composant: 'dsfr-data-map-layer',
      attributs: ['attribut-disparu'],
      raison: 'Attribut retire de la lib, pour le test.',
    };
    const rouge = verifierCouverture(MANIFESTE, ECRITS, [...EXCLUSIONS, orpheline]);
    expect(rouge.erreurs).toHaveLength(1);
    expect(rouge.erreurs[0]).toContain('attribut-disparu');

    const attendue = verifierCouverture(MANIFESTE, ECRITS, [
      ...EXCLUSIONS,
      { ...orpheline, enAttente: '#0000' },
    ]);
    expect(attendue.erreurs).toEqual([]);
  });

  it('group-field (#1108) est ecrit par le Studio, et plus exclu', () => {
    expect(ECRITS.get('dsfr-data-map-layer')?.has('group-field')).toBe(true);
    expect(EXCLUSIONS.some((e) => e.attributs?.includes('group-field'))).toBe(false);
  });
});

describe('lecture des balises produites', () => {
  it('saute les valeurs entre guillemets, meme quand elles contiennent « > »', () => {
    const html =
      `<dsfr-data-source id="s" data='[{"a":"1 > 0"}]'></dsfr-data-source>\n` +
      '<dsfr-data-map fit-bounds height="500px"><dsfr-data-map-layer cluster type="marker"></dsfr-data-map-layer></dsfr-data-map>';
    const lu = balisesEcrites(html);
    expect([...(lu.get('dsfr-data-source') ?? [])]).toEqual(['id', 'data']);
    expect([...(lu.get('dsfr-data-map') ?? [])]).toEqual(['fit-bounds', 'height']);
    expect([...(lu.get('dsfr-data-map-layer') ?? [])]).toEqual(['cluster', 'type']);
  });
});
