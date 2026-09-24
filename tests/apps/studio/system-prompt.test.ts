/**
 * Prompt du Studio (#1109) : les options de bloc citees au modele viennent du
 * SCHEMA des outils (meme source que la validation des appels), jamais de sa
 * connaissance des skills ; et les consignes tirees du constat « Aides
 * nationales » sont presentes.
 */
import { describe, it, expect } from 'vitest';
import { createEmptyDashboard, DIAGNOSTIC_TOOLS, OUTILS_SKILLS } from '@dsfr-data/shared';
import { buildSystemPrompt } from '../../../apps/studio/src/ia/system-prompt';
import { blockOptionNames, describeBlockVocabulary } from '../../../apps/studio/src/ia/vocabulaire';
import { DATA_INSPECTION_TOOLS } from '../../../apps/studio/src/ia/agent-loop';
import { CODE_TOOLS } from '../../../apps/studio/src/ia/code-tools';
import { DOCUMENT_TOOLS, FINISH_TOOL } from '../../../apps/studio/src/document';

const PROMPT = buildSystemPrompt({
  source: null,
  fields: [],
  sampleRecord: null,
  document: createEmptyDashboard(),
  diagnostic: true,
});
const VOCABULAIRE = describeBlockVocabulary();

/**
 * Partie REDIGEE du prompt : sans le vocabulaire engendre (qui cite par
 * construction le schema, y compris des VALEURS en camelCase comme
 * `horizontalBar`), sans les donnees ni le document (noms de champs du jeu).
 */
function partieRedigee(prompt: string): string {
  const sansVocabulaire = prompt.replace(VOCABULAIRE, '');
  const coupe = sansVocabulaire.search(/\n## Donn/);
  return coupe === -1 ? sansVocabulaire : sansVocabulaire.slice(0, coupe);
}

interface OutilSchema {
  function: { name: string; parameters?: unknown };
}

/** Noms d'outils et de parametres, a toute profondeur des schemas. */
function nomsDesOutils(outils: readonly OutilSchema[]): Set<string> {
  const noms = new Set<string>();
  const parcourir = (noeud: unknown): void => {
    if (!noeud || typeof noeud !== 'object') return;
    const n = noeud as { properties?: Record<string, unknown>; items?: unknown };
    for (const [nom, enfant] of Object.entries(n.properties ?? {})) {
      noms.add(nom);
      parcourir(enfant);
    }
    parcourir(n.items);
  };
  for (const o of outils) {
    noms.add(o.function.name);
    parcourir(o.function.parameters);
  }
  return noms;
}

const NOMS_AUTORISES = new Set([
  ...nomsDesOutils([
    ...DATA_INSPECTION_TOOLS,
    ...OUTILS_SKILLS,
    ...DOCUMENT_TOOLS,
    FINISH_TOOL,
    ...DIAGNOSTIC_TOOLS,
    ...CODE_TOOLS,
  ] as readonly OutilSchema[]),
  // Identifiant de skill (argument de get_skill), pas une option de bloc.
  'datavizMetier',
]);

/**
 * Noms qui ont la forme d'une option : identifiant camelCase, ou cle suivie
 * de « : » et d'une valeur JSON (`style:"title"`, `config:{…}`, `cluster:true`).
 */
function optionsCitees(texte: string): string[] {
  const camel = texte.match(/\b[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*\b/g) ?? [];
  const cles = [...texte.matchAll(/\b([a-z][A-Za-z0-9_]*):(?=["{[]|true\b|false\b|\d)/g)].map(
    (m) => m[1]
  );
  return [...new Set([...camel, ...cles])];
}

describe('#1109 — le prompt tire ses options du schema des outils', () => {
  it('le vocabulaire engendre est dans le prompt et liste chaque option du schema', () => {
    expect(PROMPT).toContain(VOCABULAIRE);
    for (const nom of blockOptionNames()) expect(VOCABULAIRE).toContain(`- ${nom}`);
    // Les options de carte ajoutees par #1109 y sont, avec leurs valeurs.
    expect(VOCABULAIRE).toContain('- popupMode = popup | panel-right | panel-left | modal');
    expect(VOCABULAIRE).toContain('- cluster (booléen)');
  });

  it('la partie redigee ne cite aucune option absente du schema', () => {
    const redigee = partieRedigee(PROMPT);
    // Garde-fou du garde-fou : la partie redigee cite bien des options
    // (sinon le test ne verifierait rien).
    expect(optionsCitees(redigee)).toEqual(
      expect.arrayContaining(['latField', 'kind', 'config', 'type', 'style'])
    );
    const horsSchema = optionsCitees(redigee).filter((n) => !NOMS_AUTORISES.has(n));
    expect(horsSchema).toEqual([]);
  });

  it('le detecteur voit une option inventee (ex. groupField, popupWidth:"400px")', () => {
    const invente = `${partieRedigee(PROMPT)}\n- Carte : groupField regroupe, popupWidth:"400px".`;
    const horsSchema = optionsCitees(invente).filter((n) => !NOMS_AUTORISES.has(n));
    expect(horsSchema.sort()).toEqual(['groupField', 'popupWidth']);
  });

  it('la section Documentation ne promet plus les skills comme vocabulaire', () => {
    expect(PROMPT).not.toContain('consulte-les pour les configurations avancées');
    expect(PROMPT).toContain('SENS');
    expect(PROMPT).toContain(
      'Seules les options du « Vocabulaire des blocs » sont écrivables dans le Studio'
    );
    expect(PROMPT).toContain('IMPOSSIBLE ici');
  });
});

describe('#1109 — consignes du constat « Aides nationales »', () => {
  it('un plan ne decrit que des operations executables, sinon le dire d’emblée', () => {
    expect(PROMPT).toContain("Avant d'annoncer un plan");
    expect(PROMPT).toContain("dis-le D'EMBLÉE");
    expect(PROMPT).toContain("propose l'alternative réalisable");
  });

  it('pas de blocs non demandes', () => {
    expect(PROMPT).toContain("N'ajoute QUE les blocs demandés");
  });

  it('clustering ≠ regroupement par entite', () => {
    expect(PROMPT).toContain('Clustering ≠ regroupement par entité');
    expect(PROMPT).toContain("PROCHES À L'ÉCRAN");
    expect(PROMPT).toContain('« un point par ville »');
  });

  it('total repete par entite : le reperer et le dire', () => {
    expect(PROMPT).toContain('Total répété');
    expect(PROMPT).toContain('CONSTANTE pour une même entité');
    expect(PROMPT).toContain('dis-le');
  });
});
