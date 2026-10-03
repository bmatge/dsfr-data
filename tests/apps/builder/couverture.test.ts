/**
 * Garde-fou de couverture du Builder « Créer un graphique » (#1204).
 *
 * CE FICHIER EXISTE À CAUSE D'UN CAS RÉEL. Le podium, le barres + ligne et
 * trois cartes (régions, académies, monde) existaient dans la bibliothèque sans
 * que le Builder les propose, et rien ne le signalait : la liste des tuiles et
 * la liste des types de la bibliothèque vivaient chacune de leur côté.
 *
 * Trois ensembles de la bibliothèque sont comparés à ce que le Builder expose :
 *   1. les types de graphique (`DSFRChartType`, lus dans le source du composant) ;
 *   2. les composants d'affichage publics du manifeste (`custom-elements.json`) ;
 *   3. les attributs de `dsfr-data-chart` (même manifeste).
 * Chacun est soit EXPOSÉ — une tuile `data-type`, un contrôle
 * `data-attribut="balise:attribut"` dans `index.html` ou un gabarit TS —, soit
 * écrit par le générateur sans contrôle (`ECRITS_SANS_CONTROLE`, vérifié sur du
 * code généré), soit EXCLU avec sa raison dans
 * `apps/builder/src/couverture-exclusions.ts`.
 *
 * Preuves de mutation : elles sont DANS ce fichier (dernier bloc), rejouées à
 * chaque exécution — retirer une exclusion, ajouter un type, un composant ou un
 * attribut à la bibliothèque, exclure ce qui est exposé : chaque geste rougit.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  ECRITS_SANS_CONTROLE,
  EXCLUSIONS,
  ISSUE_DE_SUITE,
  type ExclusionBuilder,
} from '../../../apps/builder/src/couverture-exclusions';
import { generateDynamicCodeForApi } from '../../../apps/builder/src/ui/code-generator';
import { state } from '../../../apps/builder/src/state';

vi.mock('../../../apps/builder/src/ui/accessible-table', () => ({
  updateAccessibleTable: vi.fn(),
}));

const RACINE = resolve(import.meta.dirname, '../../..');
const BUILDER = join(RACINE, 'apps/builder');

// ---------------------------------------------------------------------------
// Ce que déclare la bibliothèque
// ---------------------------------------------------------------------------

interface DeclarationCem {
  tagName?: string;
  attributes?: { name: string }[];
  mixins?: { name: string }[];
}
interface ManifesteCem {
  modules: { declarations?: DeclarationCem[] }[];
}

const MANIFESTE = JSON.parse(
  readFileSync(join(RACINE, 'packages/core/custom-elements.json'), 'utf8')
) as ManifesteCem;

/** Types de `DSFRChartType`, lus dans le source du composant (l'union n'a pas de forme à l'exécution). */
function typesDeLaBibliotheque(): string[] {
  const src = readFileSync(join(RACINE, 'packages/core/src/components/dsfr-data-chart.ts'), 'utf8');
  const union = /type DSFRChartType =([^;]+);/.exec(src);
  if (!union) throw new Error('union DSFRChartType introuvable dans dsfr-data-chart.ts');
  return [...union[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/**
 * Conteneurs d'affichage que la règle des mixins ne voit pas : ils ne
 * s'abonnent à aucune source eux-mêmes, mais ce qu'ils affichent en dépend.
 */
const CONTENEURS_D_AFFICHAGE = ['dsfr-data-kpi-group', 'dsfr-data-map'];

/**
 * Composants d'affichage publics : ceux qui CONSOMMENT une source pour la
 * montrer (`SourceSubscriberMixin`) sans la transformer (`TransformerMixin`),
 * plus les conteneurs nommés ci-dessus. La règle se lit dans le manifeste : un
 * composant d'affichage ajouté à la bibliothèque entre ici sans geste.
 */
function composantsDAffichage(manifeste: ManifesteCem): string[] {
  const out: string[] = [];
  for (const mod of manifeste.modules) {
    for (const decl of mod.declarations ?? []) {
      if (!decl.tagName) continue;
      const mixins = (decl.mixins ?? []).map((m) => m.name);
      const affiche =
        mixins.includes('SourceSubscriberMixin') && !mixins.includes('TransformerMixin');
      if (affiche || CONTENEURS_D_AFFICHAGE.includes(decl.tagName)) out.push(decl.tagName);
    }
  }
  return out.sort();
}

function attributsDe(manifeste: ManifesteCem, tag: string): string[] {
  for (const mod of manifeste.modules) {
    for (const decl of mod.declarations ?? []) {
      if (decl.tagName === tag) return (decl.attributes ?? []).map((a) => a.name);
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Ce qu'expose le Builder
// ---------------------------------------------------------------------------

/** Sources du Builder qui rendent des contrôles : `index.html` et les gabarits TS. */
function sourcesDuBuilder(): string[] {
  const out = [readFileSync(join(BUILDER, 'index.html'), 'utf8')];
  const parcourir = (dir: string): void => {
    for (const entree of readdirSync(dir, { withFileTypes: true })) {
      const chemin = join(dir, entree.name);
      if (entree.isDirectory()) parcourir(chemin);
      // Le registre généré recopie les attributs des contrôles : il ne les expose pas.
      else if (entree.name.endsWith('.ts') && !entree.name.endsWith('.generated.ts')) {
        out.push(readFileSync(chemin, 'utf8'));
      }
    }
  };
  parcourir(join(BUILDER, 'src'));
  return out;
}

/** Tuiles du sélecteur de type (`data-type` des `.chart-type-btn` de `index.html`). */
function tuiles(html: string): string[] {
  return [...html.matchAll(/class="chart-type-btn[^"]*"[^>]*\bdata-type="([^"]+)"/g)].map(
    (m) => m[1]
  );
}

/** Type de la bibliothèque écrit par une tuile, quand son nom diffère. */
const TYPE_ECRIT_PAR_LA_TUILE: Record<string, string> = { horizontalBar: 'bar', doughnut: 'pie' };

/** `balise:attribut` de tous les contrôles (`data-attribut`, liste séparée par des espaces). */
function attributsExposes(sources: string[]): Set<string> {
  const out = new Set<string>();
  for (const src of sources) {
    for (const m of src.matchAll(/data-attribut="([^"]+)"/g)) {
      for (const ref of m[1].split(/\s+/).filter(Boolean)) out.add(ref);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// La vérification (pure : rejouée par les preuves de mutation)
// ---------------------------------------------------------------------------

interface Entree {
  types: string[];
  manifeste: ManifesteCem;
  tuiles: string[];
  exposes: Set<string>;
  exclusions: readonly ExclusionBuilder[];
  ecritsSansControle: readonly { attribut: string; deduitDe: string }[];
}

function verifierCouverture(e: Entree): string[] {
  const erreurs: string[] = [];
  const typesExposes = new Set(e.tuiles.map((t) => TYPE_ECRIT_PAR_LA_TUILE[t] ?? t));
  const composants = composantsDAffichage(e.manifeste);
  const composantsExposes = new Set([...e.exposes].map((ref) => ref.split(':')[0]));
  const attributsChart = attributsDe(e.manifeste, 'dsfr-data-chart');
  const controlesChart = new Set(
    [...e.exposes].filter((r) => r.startsWith('dsfr-data-chart:')).map((r) => r.split(':')[1])
  );
  const sansControle = new Set(e.ecritsSansControle.map((x) => x.attribut));

  const exclus = (genre: ExclusionBuilder['genre']): Set<string> =>
    new Set(e.exclusions.filter((x) => x.genre === genre).flatMap((x) => [...x.noms]));

  // 1. Ce que la bibliothèque déclare est exposé ou exclu.
  for (const type of e.types) {
    if (!typesExposes.has(type) && !exclus('type').has(type)) {
      erreurs.push(`type « ${type} » : ni tuile dans le Builder, ni exclusion déclarée`);
    }
  }
  for (const tag of composants) {
    if (!composantsExposes.has(tag) && !exclus('composant').has(tag)) {
      erreurs.push(`composant ${tag} : ni contrôle dans le Builder, ni exclusion déclarée`);
    }
  }
  for (const attr of attributsChart) {
    if (!controlesChart.has(attr) && !sansControle.has(attr) && !exclus('attribut').has(attr)) {
      erreurs.push(`dsfr-data-chart ${attr} : ni contrôle dans le Builder, ni exclusion déclarée`);
    }
  }

  // 2. Les exclusions restent vraies, et visent quelque chose.
  const vus = new Set<string>();
  for (const x of e.exclusions) {
    if (!x.raison.trim()) erreurs.push(`exclusion (${x.noms.join(', ')}) : raison vide`);
    for (const nom of x.noms) {
      const cle = `${x.genre}:${nom}`;
      if (vus.has(cle)) erreurs.push(`exclusion ${cle} : déclarée deux fois`);
      vus.add(cle);
      const declare =
        x.genre === 'type'
          ? e.types.includes(nom)
          : x.genre === 'composant'
            ? composants.includes(nom)
            : attributsChart.includes(nom);
      if (!declare) {
        erreurs.push(`exclusion ${cle} : ne vise rien que la bibliothèque déclare`);
        continue;
      }
      const expose =
        x.genre === 'type'
          ? typesExposes.has(nom)
          : x.genre === 'composant'
            ? composantsExposes.has(nom)
            : controlesChart.has(nom) || sansControle.has(nom);
      if (expose) erreurs.push(`exclusion ${cle} : devenue fausse, le Builder l'expose`);
    }
  }

  // 3. Les attributs écrits sans contrôle existent, et n'ont pas de contrôle.
  for (const { attribut, deduitDe } of e.ecritsSansControle) {
    if (!attributsChart.includes(attribut)) {
      erreurs.push(`écrit sans contrôle « ${attribut} » : absent du manifeste`);
    }
    if (controlesChart.has(attribut)) {
      erreurs.push(`écrit sans contrôle « ${attribut} » : il a désormais un contrôle`);
    }
    if (!deduitDe.trim()) erreurs.push(`écrit sans contrôle « ${attribut} » : origine non dite`);
  }

  // 4. Un contrôle ne cite que des attributs que la bibliothèque déclare.
  for (const ref of e.exposes) {
    const [tag, attr] = ref.split(':');
    if (!attributsDe(e.manifeste, tag).includes(attr)) {
      erreurs.push(`contrôle data-attribut="${ref}" : attribut absent du manifeste`);
    }
  }

  return erreurs;
}

const SOURCES = sourcesDuBuilder();
const REEL: Entree = {
  types: typesDeLaBibliotheque(),
  manifeste: MANIFESTE,
  tuiles: tuiles(SOURCES[0]),
  exposes: attributsExposes(SOURCES),
  exclusions: EXCLUSIONS,
  ecritsSansControle: ECRITS_SANS_CONTROLE,
};

/** Copie du manifeste, modifiable. */
const copie = (): ManifesteCem => structuredClone(MANIFESTE);

describe('couverture du Builder — état versionné', () => {
  it('chaque type, composant d’affichage et attribut de dsfr-data-chart est exposé ou exclu avec sa raison', () => {
    expect(verifierCouverture(REEL)).toEqual([]);
  });

  it('la mesure voit bien la bibliothèque et le Builder (pas un contrôle à vide)', () => {
    expect(REEL.types).toEqual(
      expect.arrayContaining(['bar', 'bar-line', 'map', 'map-reg', 'map-aca', 'map-monde'])
    );
    expect(REEL.types.length).toBeGreaterThanOrEqual(11);
    expect(composantsDAffichage(MANIFESTE)).toEqual([
      'dsfr-data-a11y',
      'dsfr-data-chart',
      'dsfr-data-display',
      'dsfr-data-kpi',
      'dsfr-data-kpi-group',
      'dsfr-data-list',
      'dsfr-data-map',
      'dsfr-data-map-layer',
      'dsfr-data-podium',
      'dsfr-data-repeat',
    ]);
    expect(attributsDe(MANIFESTE, 'dsfr-data-chart').length).toBeGreaterThanOrEqual(49);
    expect(REEL.tuiles).toEqual(
      expect.arrayContaining(['podium', 'bar-line', 'map-reg', 'map-aca', 'map-monde'])
    );
    for (const ref of [
      'dsfr-data-chart:series-field',
      'dsfr-data-chart:stacked',
      'dsfr-data-chart:value-field-2',
      'dsfr-data-podium:max-items',
    ]) {
      expect(REEL.exposes.has(ref), ref).toBe(true);
    }
  });

  it('ce que #1204 a ajouté n’est plus exclu', () => {
    const exclus = EXCLUSIONS.flatMap((x) => [...x.noms]);
    for (const nom of [
      'bar-line',
      'map-reg',
      'map-aca',
      'map-monde',
      'dsfr-data-podium',
      'series-field',
      'stacked',
      'value-field-2',
    ]) {
      expect(exclus, nom).not.toContain(nom);
    }
  });

  it('chaque réglage « à exposer plus tard » cite l’issue de suite', () => {
    expect(ISSUE_DE_SUITE).toMatch(/^#\d+$/);
    const plusTard = EXCLUSIONS.filter((x) => x.suite !== undefined);
    expect(plusTard.length).toBeGreaterThan(0);
    for (const x of plusTard) expect(x.suite, x.noms.join(', ')).toBe(ISSUE_DE_SUITE);
  });
});

describe('attributs écrits sans contrôle : vérifiés sur du code généré', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="generated-code"></div><div id="raw-data"></div>';
    Object.assign(state, {
      labelField: 'region',
      valueField: 'budget',
      valueFieldLabel: '',
      extraSeries: [],
      seriesField: '',
      stacked: false,
      aggregation: 'sum',
      sortOrder: 'none',
      title: 'Budget',
      palette: 'default',
      generationMode: 'dynamic',
      advancedMode: false,
      databoxEnabled: false,
      fields: [
        { name: 'region', type: 'string', sample: 'Bretagne' },
        { name: 'budget', type: 'number', sample: 1 },
      ],
      savedSource: { id: 'a1', name: 'API', type: 'api', apiUrl: 'https://api.exemple.fr/budget' },
    });
  });

  /** Attributs de la balise `<dsfr-data-chart>` du code généré pour un type. */
  function attributsEcrits(type: 'horizontalBar' | 'pie'): string[] {
    state.chartType = type;
    generateDynamicCodeForApi();
    const code = document.getElementById('generated-code')!.textContent!;
    const balise = /<dsfr-data-chart\b([^>]*)>/.exec(code);
    expect(balise, 'balise dsfr-data-chart introuvable').not.toBeNull();
    return [...balise![1].matchAll(/\s([a-z][a-z0-9-]*)(?==|\s|$)/g)].map((m) => m[1]);
  }

  it('source, name, horizontal et fill sont bien écrits par le générateur', () => {
    const ecrits = new Set([...attributsEcrits('horizontalBar'), ...attributsEcrits('pie')]);
    for (const { attribut } of ECRITS_SANS_CONTROLE) {
      expect(ecrits.has(attribut), attribut).toBe(true);
    }
  });
});

describe('preuves de mutation : le garde-fou voit chaque écart', () => {
  it('retirer une exclusion rougit, pour chaque genre', () => {
    for (const nom of ['dsfr-data-kpi-group', 'x-min', 'gauge-value', 'reference-lines']) {
      const sans = EXCLUSIONS.map((x) => ({ ...x, noms: x.noms.filter((n) => n !== nom) })).filter(
        (x) => x.noms.length > 0
      );
      const erreurs = verifierCouverture({ ...REEL, exclusions: sans });
      expect(erreurs, nom).toHaveLength(1);
      expect(erreurs[0]).toContain(nom);
      expect(erreurs[0]).toContain('ni exclusion déclarée');
    }
  });

  it('un type ajouté à la bibliothèque rougit', () => {
    expect(verifierCouverture({ ...REEL, types: [...REEL.types, 'treemap'] })).toEqual([
      'type « treemap » : ni tuile dans le Builder, ni exclusion déclarée',
    ]);
  });

  it('retirer une tuile rougit : c’est exactement la panne d’avant #1204', () => {
    const erreurs = verifierCouverture({
      ...REEL,
      tuiles: REEL.tuiles.filter((t) => t !== 'bar-line' && t !== 'map-aca'),
    });
    expect(erreurs).toEqual([
      'type « bar-line » : ni tuile dans le Builder, ni exclusion déclarée',
      'type « map-aca » : ni tuile dans le Builder, ni exclusion déclarée',
    ]);
  });

  it('un attribut ajouté à dsfr-data-chart rougit', () => {
    const manifeste = copie();
    for (const mod of manifeste.modules) {
      for (const decl of mod.declarations ?? []) {
        if (decl.tagName === 'dsfr-data-chart') decl.attributes!.push({ name: 'smooth' });
      }
    }
    expect(verifierCouverture({ ...REEL, manifeste })).toEqual([
      'dsfr-data-chart smooth : ni contrôle dans le Builder, ni exclusion déclarée',
    ]);
  });

  it('un composant d’affichage ajouté à la bibliothèque rougit', () => {
    const manifeste = copie();
    manifeste.modules.push({
      declarations: [
        { tagName: 'dsfr-data-sparkline', mixins: [{ name: 'SourceSubscriberMixin' }] },
      ],
    });
    expect(verifierCouverture({ ...REEL, manifeste })).toEqual([
      'composant dsfr-data-sparkline : ni contrôle dans le Builder, ni exclusion déclarée',
    ]);
    // Un transformateur n'est pas un composant d'affichage : il n'a pas à être tranché ici.
    const transformateur = copie();
    transformateur.modules.push({
      declarations: [
        {
          tagName: 'dsfr-data-window',
          mixins: [{ name: 'SourceSubscriberMixin' }, { name: 'TransformerMixin' }],
        },
      ],
    });
    expect(verifierCouverture({ ...REEL, manifeste: transformateur })).toEqual([]);
  });

  it('retirer le contrôle du podium rougit', () => {
    const exposes = new Set([...REEL.exposes].filter((r) => !r.startsWith('dsfr-data-podium:')));
    expect(verifierCouverture({ ...REEL, exposes })).toEqual([
      'composant dsfr-data-podium : ni contrôle dans le Builder, ni exclusion déclarée',
    ]);
  });

  it('une exclusion devenue fausse rougit', () => {
    const exclusions: ExclusionBuilder[] = [
      ...EXCLUSIONS,
      { genre: 'attribut', noms: ['stacked'], raison: 'Pas de contrôle.' },
      { genre: 'type', noms: ['map-reg'], raison: 'Pas de tuile.' },
    ];
    expect(verifierCouverture({ ...REEL, exclusions })).toEqual([
      "exclusion attribut:stacked : devenue fausse, le Builder l'expose",
      "exclusion type:map-reg : devenue fausse, le Builder l'expose",
    ]);
  });

  it('une exclusion sans cible, sans raison ou en double rougit', () => {
    const exclusions: ExclusionBuilder[] = [
      ...EXCLUSIONS,
      { genre: 'attribut', noms: ['n-existe-pas'], raison: 'Attribut inventé.' },
      { genre: 'attribut', noms: ['x-min'], raison: '  ' },
    ];
    expect(verifierCouverture({ ...REEL, exclusions })).toEqual([
      'exclusion attribut:n-existe-pas : ne vise rien que la bibliothèque déclare',
      'exclusion (x-min) : raison vide',
      'exclusion attribut:x-min : déclarée deux fois',
    ]);
  });

  it('un contrôle qui cite un attribut inconnu rougit', () => {
    const exposes = new Set([...REEL.exposes, 'dsfr-data-chart:empile']);
    expect(verifierCouverture({ ...REEL, exposes })).toEqual([
      'contrôle data-attribut="dsfr-data-chart:empile" : attribut absent du manifeste',
    ]);
  });
});
