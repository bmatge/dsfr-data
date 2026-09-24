/**
 * Correspondance sans modèle : phrase de l'usager → repère (#1012, ADR-143 §6).
 *
 * Le moteur est `searchSkills()` (skill-matching.ts), inchangé : on vérifie ici
 * la PROJECTION du registre (libellé, synonymes, attributs, titres de fiches),
 * le seuil, les raisons exposées et la détection d'ambiguïté.
 *
 * Les cas carto portent sur le registre GÉNÉRÉ (qui fait foi pour les ids) et
 * sur les vraies fiches du builder IA. Le cas builder porte sur un registre
 * fabriqué : le registre du builder graphique est livré par #1006.
 */
import { describe, it, expect } from 'vitest';

import { SKILLS } from '../../packages/shared/src/skills/skills';
import { REGISTRE as REGISTRE_CARTO } from '../../apps/builder-carto/src/assistant/reperes.generated';
import {
  ECART_AMBIGUITE,
  MAX_CANDIDATS,
  SEUIL_REPERE,
  formulerCorrespondance,
  projeterReperes,
  trouverRepere,
  type ResultatCorrespondance,
} from '../../packages/shared/src/ia/reperes-matching';
import { MIN_SCORE, type MatchableSkill } from '../../packages/shared/src/ia/skill-matching';
import type { RegistreReperes, Repere } from '../../packages/shared/src/ui/reperes-types';

const FICHES = Object.values(SKILLS);

function repere(partiel: Partial<Repere> & Pick<Repere, 'id' | 'libelle'>): Repere {
  const segments = partiel.id.split('.');
  return {
    genre: 'controle',
    element: 'button',
    zone: segments.slice(0, -1).join('.'),
    attributs: [],
    prerequis: [],
    synonymes: [],
    sources: [],
    ...partiel,
  };
}

function zone(id: string, libelle: string): Repere {
  return repere({ id, libelle, genre: 'zone', element: 'section', zone: undefined });
}

/**
 * Registre du builder graphique, fabriqué : le vrai est livré par #1006.
 * L'id `builder.donnees.series.ajouter` est celui convenu avec #1006 (les
 * séries sont dans la section Données) ; c'est son registre généré qui fera foi.
 */
const REGISTRE_BUILDER: RegistreReperes = {
  app: 'builder',
  prefixe: 'builder',
  reperes: [
    zone('builder.type', 'Type de graphique'),
    repere({
      id: 'builder.type.choix',
      libelle: 'Type de graphique',
      element: 'select',
      attributs: [{ tag: 'dsfr-data-chart', nom: 'type', description: 'Type de graphique.' }],
      synonymes: ['barres', 'courbe', 'camembert'],
    }),
    zone('builder.donnees', 'Données'),
    zone('builder.donnees.series', 'Séries'),
    repere({
      id: 'builder.donnees.series.ajouter',
      libelle: 'Ajouter une série',
      prerequis: ['type-multi-series'],
      synonymes: ['série'],
    }),
    repere({
      id: 'builder.donnees.series.retirer',
      libelle: 'Retirer la série',
    }),
  ],
};

function ids(r: ResultatCorrespondance): string[] {
  return r.candidats.map((c) => c.repere.id);
}

describe('trouverRepere — phrases de l’issue', () => {
  it('« afficher les POI dans une fiche » → le mode de la popup (registre carto réel)', () => {
    const r = trouverRepere(REGISTRE_CARTO, 'afficher les POI dans une fiche', { fiches: FICHES });
    expect(r.statut).toBe('trouve');
    if (r.statut !== 'trouve') return;
    expect(r.repere.repere.id).toBe('carto.elements.clic.popup-mode');
    expect(r.repere.score).toBeGreaterThanOrEqual(SEUIL_REPERE);
    // La raison est exposée : c'est le synonyme « fiche » de reperes.config.ts.
    expect(r.repere.raisons).toContain('trigger: fiche');
    expect(r.repere.chemin).toEqual([
      'Éléments de la couche',
      'Au clic sur un élément',
      'Comportement au clic',
    ]);
    expect(formulerCorrespondance(r)).toBe(
      "C'est ici : Éléments de la couche › Au clic sur un élément › Comportement au clic."
    );
  });

  it('« ajouter une série » → builder.donnees.series.ajouter (registre fabriqué)', () => {
    const r = trouverRepere(REGISTRE_BUILDER, 'ajouter une série');
    expect(r.statut).toBe('trouve');
    if (r.statut !== 'trouve') return;
    expect(r.repere.repere.id).toBe('builder.donnees.series.ajouter');
    expect(r.repere.raisons).toEqual(['trigger: série', 'nom: Ajouter une série']);
    expect(r.repere.chemin).toEqual(['Données', 'Séries', 'Ajouter une série']);
    expect(formulerCorrespondance(r)).toBe("C'est ici : Données › Séries › Ajouter une série.");
  });

  it('une phrase hors sujet → aucun repère', () => {
    for (const phrase of [
      'je veux une recette de gâteau au chocolat',
      'quelle météo demain à Lyon ?',
      '',
      '   ',
    ]) {
      const r = trouverRepere(REGISTRE_CARTO, phrase, { fiches: FICHES });
      expect(r, phrase).toEqual({ statut: 'aucun', candidats: [] });
      expect(formulerCorrespondance(r)).toContain('Aucun réglage');
    }
  });
});

describe('projeterReperes', () => {
  it('nom = libellé, triggers = synonymes, ordre du registre conservé', () => {
    const projetes = projeterReperes(REGISTRE_CARTO);
    expect(projetes.map((p) => p.id)).toEqual(REGISTRE_CARTO.reperes.map((r) => r.id));
    const popup = projetes.find((p) => p.id === 'carto.elements.clic.popup-mode');
    expect(popup?.name).toBe('Comportement au clic');
    expect(popup?.trigger).toEqual(
      expect.arrayContaining(['fiche', 'popup', 'infobulle', 'panneau latéral', 'au clic'])
    );
    // Libellés des zones englobantes, en signal faible.
    expect(popup?.description).toContain('Au clic sur un élément');
  });

  it('un nom d’attribut composé est un trigger, un nom d’un seul mot ne l’est pas', () => {
    const projetes = projeterReperes(REGISTRE_CARTO);
    const champs = projetes.find((p) => p.id === 'carto.elements.clic.popup-fields');
    expect(champs?.trigger).toContain('popup-fields');
    const popup = projetes.find((p) => p.id === 'carto.elements.clic.popup-mode');
    expect(popup?.trigger).not.toContain('mode');
    // « mode sombre » ne mène donc pas au mode de la popup.
    const r = trouverRepere(REGISTRE_CARTO, 'mode sombre', { fiches: FICHES });
    expect(ids(r)).not.toContain('carto.elements.clic.popup-mode');
  });

  it('les titres « <tag> — <titre> » des fiches liées par data-attribut deviennent des triggers', () => {
    const projetes = projeterReperes(REGISTRE_CARTO, { fiches: FICHES });
    const popup = projetes.find((p) => p.id === 'carto.elements.clic.popup-mode');
    // Fiche dsfrDataMap : « ### dsfr-data-map-popup — Affichage au clic ».
    expect(popup?.trigger).toContain('Affichage au clic');
    // `dsfr-data-map-popup` ne cite pas `dsfr-data-map` : les titres du
    // conteneur ne sont pas rattachés à un attribut de la popup.
    expect(popup?.content).not.toContain('Attributs dsfr-data-map (conteneur)');
    const fond = projetes.find((p) => p.id === 'carto.carte.fond');
    expect(fond?.content).toContain('### Attributs dsfr-data-map (conteneur)');
  });

  it('une fiche injectée suffit à rendre un repère trouvable', () => {
    const registre: RegistreReperes = {
      app: 'demo',
      prefixe: 'demo',
      reperes: [
        zone('demo.liste', 'Liste'),
        repere({
          id: 'demo.liste.sens',
          libelle: 'Sens',
          element: 'select',
          attributs: [{ tag: 'dsfr-data-x', nom: 'orientation', description: '' }],
        }),
      ],
    };
    const fiche: MatchableSkill = {
      id: 'x',
      name: 'dsfr-data-x',
      description: '',
      trigger: [],
      content: '## Guide\n\n### dsfr-data-x — Rangement vertical\n\ntexte',
    };
    expect(trouverRepere(registre, 'un rangement vertical').statut).toBe('aucun');
    const r = trouverRepere(registre, 'un rangement vertical', { fiches: [fiche] });
    expect(r.statut).toBe('trouve');
    if (r.statut !== 'trouve') return;
    expect(r.repere.repere.id).toBe('demo.liste.sens');
    expect(r.repere.raisons).toContain('trigger: Rangement vertical');
  });

  it('genres : on peut restreindre aux contrôles', () => {
    const projetes = projeterReperes(REGISTRE_CARTO, { genres: ['controle'] });
    expect(projetes.length).toBeGreaterThan(0);
    expect(projetes.every((p) => p.repere.genre === 'controle')).toBe(true);
  });
});

describe('seuil et ambiguïté', () => {
  it('le seuil est celui des fiches', () => {
    expect(SEUIL_REPERE).toBe(MIN_SCORE);
  });

  it('deux repères à égalité → ambigu, 2 ou 3 propositions dans l’ordre du registre', () => {
    // « retirer la série » : le libellé cité (8) contre le synonyme « série » (10).
    const r = trouverRepere(REGISTRE_BUILDER, 'retirer la série');
    expect(r.statut).toBe('ambigu');
    expect(ids(r)).toEqual(['builder.donnees.series.ajouter', 'builder.donnees.series.retirer']);

    const registre: RegistreReperes = {
      app: 'demo',
      prefixe: 'demo',
      reperes: ['a', 'b', 'c', 'd'].map((s) =>
        repere({ id: `demo.z.${s}`, libelle: `Réglage ${s}`, synonymes: ['légende'] })
      ),
    };
    const ambigu = trouverRepere(registre, 'où est la légende ?');
    expect(ambigu.statut).toBe('ambigu');
    expect(ids(ambigu)).toEqual(['demo.z.a', 'demo.z.b', 'demo.z.c']);
    expect(ambigu.candidats).toHaveLength(MAX_CANDIDATS);
    expect(formulerCorrespondance(ambigu)).toBe(
      'Plusieurs réglages peuvent correspondre : Réglage a ; Réglage b ; Réglage c.'
    );
    expect(ids(trouverRepere(registre, 'où est la légende ?', { max: 2 }))).toEqual([
      'demo.z.a',
      'demo.z.b',
    ]);
  });

  it('un écart d’au moins ECART_AMBIGUITE points départage', () => {
    // Registre carto : « Fond de carte » (13) devance le bouton « Carte » (10).
    const r = trouverRepere(REGISTRE_CARTO, 'changer le fond de carte', { fiches: FICHES });
    expect(r.statut).toBe('trouve');
    if (r.statut !== 'trouve') return;
    expect(r.repere.repere.id).toBe('carto.carte.fond');
    // Avec un écart plus exigeant, les deux sont proposés.
    const exigeant = trouverRepere(REGISTRE_CARTO, 'changer le fond de carte', {
      fiches: FICHES,
      ecart: ECART_AMBIGUITE + 1,
    });
    expect(exigeant.statut).toBe('ambigu');
    expect(ids(exigeant)).toEqual(['carto.carte.fond', 'carto.carte.plier']);
  });

  it('déterministe : deux appels donnent le même résultat', () => {
    const phrase = 'couleur des éléments';
    expect(trouverRepere(REGISTRE_CARTO, phrase, { fiches: FICHES })).toEqual(
      trouverRepere(REGISTRE_CARTO, phrase, { fiches: FICHES })
    );
  });
});

describe('entrée externe', () => {
  it('une phrase longue et hostile est traitée en temps linéaire', () => {
    const hostile = 'a-'.repeat(20_000) + '—'.repeat(5_000) + 'popup'.repeat(2_000);
    const debut = performance.now();
    trouverRepere(REGISTRE_CARTO, hostile, { fiches: FICHES });
    expect(performance.now() - debut).toBeLessThan(2_000);
  });
});
