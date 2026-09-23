/**
 * Correspondance question → lignes du code du Playground (#1105) : lecture
 * du code, mots de la question, synonymes, validation d'un repère de code,
 * plan compact envoyé au modèle.
 */
import { describe, expect, it } from 'vitest';

import {
  correspondanceCode,
  libelleRepereCode,
  lireCode,
  MAX_LIGNES_PLAN,
  motsDe,
  planDuCode,
  SYNONYMES_ATTRIBUTS,
} from '../../../apps/playground/src/assistant/correspondance-code';
import { lireRepereCode } from '../../../apps/playground/src/assistant/adaptateur';
import cem from '../../../packages/core/custom-elements.json';

const CODE = [
  '<dsfr-data-source id="src" api-type="opendatasoft"',
  '  dataset-id="communes" limit="15"></dsfr-data-source>',
  '<dsfr-data-chart source="src" type="bar"',
  '  color="#000091"></dsfr-data-chart>',
  '<dsfr-data-kpi source="src" color="blue"></dsfr-data-kpi>',
].join('\n');

const ids = (question: string, code = CODE): string[] =>
  correspondanceCode(question, code)?.candidats.map((c) => c.id) ?? [];

describe('lireCode', () => {
  it('chaque attribut porte la ligne où il est écrit, et la ligne de sa balise', () => {
    const limit = lireCode(CODE).find((o) => o.attribut === 'limit');
    expect(limit).toMatchObject({
      ligne: 2,
      ligneBalise: 1,
      tag: 'dsfr-data-source',
      valeur: '15',
    });
  });

  it('découpe les lignes comme CodeMirror (\\r\\n, \\r)', () => {
    const code = CODE.split('\n').join('\r\n');
    expect(lireCode(code).find((o) => o.attribut === 'color')?.ligne).toBe(4);
    const codeR = CODE.split('\n').join('\r');
    expect(lireCode(codeR).find((o) => o.tag === 'dsfr-data-kpi')?.ligne).toBe(5);
  });

  it('code vide ou sans balise dsfr-data : rien', () => {
    expect(lireCode('')).toEqual([]);
    expect(lireCode('<div class="x"></div>')).toEqual([]);
  });
});

describe('motsDe', () => {
  it('minuscules, sans accents, découpés sur la ponctuation', () => {
    expect(motsDe('Où est la « Limite » de 15 ?')).toEqual([
      'ou',
      'est',
      'la',
      'limite',
      'de',
      '15',
    ]);
  });

  it('une question très longue est bornée (entrée externe)', () => {
    expect(motsDe('a '.repeat(10_000)).length).toBeLessThanOrEqual(60);
  });
});

describe('correspondanceCode', () => {
  it('nom d’attribut et valeur citée : une seule ligne', () => {
    expect(ids('comment changer la limite de 15 ?')).toEqual([
      'playground.ligne.1.dsfr-data-source.limit',
    ]);
    expect(correspondanceCode('limite de 15', CODE)?.texte).toBe(
      'Ligne 2 : limit="15" (dsfr-data-source).'
    );
  });

  it('le nom même de l’attribut suffit', () => {
    expect(ids('où est dataset-id ?')).toEqual(['playground.ligne.1.dsfr-data-source.dataset-id']);
  });

  it('une valeur citée seule suffit', () => {
    expect(ids('je veux remplacer communes')).toEqual([
      'playground.ligne.1.dsfr-data-source.dataset-id',
    ]);
  });

  it('pluriel : « couleurs » vaut « couleur »', () => {
    expect(ids('les couleurs')).toEqual([
      'playground.ligne.3.dsfr-data-chart.color',
      'playground.ligne.5.dsfr-data-kpi.color',
    ]);
  });

  it('« on » n’est pas l’attribut `on`', () => {
    const code = '<dsfr-data-facets id="f" on="click" source="s"></dsfr-data-facets>';
    expect(ids('comment on fait', code)).toEqual([]);
  });

  it('rien ne correspond : null (le modèle prend le relais)', () => {
    expect(correspondanceCode('bonjour, par où commencer ?', CODE)).toBeNull();
    expect(correspondanceCode('limite', '')).toBeNull();
  });

  it('les synonymes ne citent que des attributs réels des composants', () => {
    const reels = new Set<string>();
    for (const m of (
      cem as {
        modules: { declarations?: { tagName?: string; attributes?: { name: string }[] }[] }[];
      }
    ).modules) {
      for (const d of m.declarations ?? []) {
        if (d.tagName) for (const a of d.attributes ?? []) reels.add(a.name);
      }
    }
    for (const [mot, attributs] of Object.entries(SYNONYMES_ATTRIBUTS)) {
      for (const a of attributs) expect(reels.has(a), `${mot} → ${a}`).toBe(true);
    }
  });
});

describe('libelleRepereCode', () => {
  it('ligne, balise et attribut du code courant : un libellé', () => {
    expect(libelleRepereCode('playground.ligne.1.dsfr-data-source', CODE)).toBe(
      'Ligne 1 — dsfr-data-source'
    );
    expect(libelleRepereCode('playground.ligne.1.dsfr-data-source.limit', CODE)).toBe(
      'Ligne 2 — dsfr-data-source (limit)'
    );
  });

  it('ligne absente, autre balise, attribut absent, id mal formé : null', () => {
    for (const id of [
      'playground.ligne.40.dsfr-data-source',
      'playground.ligne.2.dsfr-data-source',
      'playground.ligne.1.dsfr-data-chart',
      'playground.ligne.1.dsfr-data-source.color',
      'playground.ligne.0.dsfr-data-source',
      'playground.actions.copier',
      'playground.ligne.1.<script>',
    ]) {
      expect(libelleRepereCode(id, CODE), id).toBeNull();
    }
  });
});

describe('planDuCode', () => {
  it('une ligne par balise, ses attributs et son repère ; les ids forment l’enum', () => {
    const plan = planDuCode(CODE)!;
    expect(plan.texte).toContain(
      '- L3 <dsfr-data-chart> source="src" type="bar" color="#000091" — playground.ligne.3.dsfr-data-chart'
    );
    expect(plan.reperes).toContain('playground.ligne.1.dsfr-data-source');
    expect(plan.reperes).toContain('playground.ligne.1.dsfr-data-source.limit');
    for (const id of plan.reperes) expect(lireRepereCode(id), id).not.toBeNull();
  });

  it('au plus MAX_LIGNES_PLAN balises, valeurs raccourcies, secrets masqués', () => {
    const long = 'x'.repeat(200);
    const code = Array.from(
      { length: MAX_LIGNES_PLAN + 5 },
      (_, i) =>
        `<dsfr-data-source id="s${i}" url="${long}" headers='{"Authorization":"Bearer abc"}'></dsfr-data-source>`
    ).join('\n');
    const plan = planDuCode(code)!;
    const lignes = plan.texte.split('\n').filter((l) => l.startsWith('- L'));
    expect(lignes).toHaveLength(MAX_LIGNES_PLAN);
    expect(plan.texte).toContain('(5 balises de plus, non listées)');
    expect(plan.texte).not.toContain(long);
    expect(plan.texte).not.toContain('Bearer');
    expect(plan.texte).toContain('headers="***"');
  });

  it('sans balise dsfr-data : pas de plan', () => {
    expect(planDuCode('<p>rien</p>')).toBeNull();
  });
});
