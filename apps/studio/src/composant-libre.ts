/**
 * Bloc « composant libre » du Studio (#1111) : un ou plusieurs composants
 * `dsfr-data-*` et leurs attributs, pour ce que les blocs guides (text, chart,
 * filters, map) n'expriment pas — pivot, recherche, facettes, volet de carte
 * avance, legende…
 *
 * Pas de HTML libre. Chaque appel du modele est une ENTREE EXTERNE, validee
 * ici contre le MANIFESTE, par le meme moteur que le lint de balisage
 * (`lintMarkup`, contrat genere `component-contract.generated.ts`) :
 *   - balise connue du manifeste (sauf les deux refusees ci-dessous) ;
 *   - attributs declares par le composant (plus `id` et `class`) ;
 *   - valeurs d'enumeration permises (relues dans le code, #1111) ;
 *   - `source=`, `left=`, `right=`, `sources=`, `for=` qui visent un id
 *     existant (source du document, composant de ce bloc ou d'un autre bloc
 *     libre) ;
 *   - pas de schema actif (`javascript:`…), pas de contenu actif dans une
 *     valeur ni dans le `<template>` (ce que `nettoyerGabarit` retirerait).
 * Un refus rend au modele un message qui nomme l'attribut en cause et, le cas
 * echeant, les valeurs permises.
 *
 * Le vocabulaire donne au modele (liste des balises du schema de l'outil) est
 * ENGENDRE depuis le meme contrat : jamais ecrit a la main.
 */

import {
  escapeHtml,
  generateWidgetHTML,
  lintMarkup,
  nettoyerGabarit,
  urlInterdite,
} from '@dsfr-data/shared';
import type {
  ComponentAttribute,
  ComponentContract,
  DashboardData,
  FreeComponentSpec,
  LintFinding,
  Widget,
} from '@dsfr-data/shared';
import { COMPONENT_CONTRACT } from '../../../mcp-server/src/component-contract.generated';

/** Le contrat des composants, genere depuis le manifeste (`build:component-contract`). */
export const CONTRAT_COMPOSANTS = COMPONENT_CONTRACT as unknown as ComponentContract;

/** Balises que le bloc libre refuse, avec la raison rendue au modele. */
export const BALISES_REFUSEES: Readonly<Record<string, string>> = {
  'dsfr-data-source':
    'la source du document est posée par le Studio (connexion, pagination) : cite son id dans source=',
  'dsfr-data-beacon': "instrumentation de suivi d'usage, sans objet dans une page du Studio",
};

/** Balises permises dans un bloc libre : le manifeste, moins les refusees. */
export const BALISES_LIBRES: readonly string[] = Object.keys(CONTRAT_COMPOSANTS)
  .filter((t) => !(t in BALISES_REFUSEES))
  .sort();

/**
 * Composants qui lisent un `<template>` enfant. Le manifeste ne le declare pas
 * (ce n'est pas un slot) : la liste est tenue ici et verifiee par un test-garde
 * contre le code des composants (`tests/apps/studio/composant-libre.test.ts`).
 */
export const BALISES_A_GABARIT: readonly string[] = [
  'dsfr-data-display',
  'dsfr-data-map-popup',
  'dsfr-data-repeat',
];

/** Attributs globaux HTML permis en plus de ceux du composant. */
const ATTRIBUTS_GLOBAUX: readonly string[] = ['id', 'class'];

/** Plafond de composants par bloc : une petite chaine, pas une page. */
export const MAX_COMPOSANTS = 12;

/**
 * Elements a texte brut : dans un `<template>`, ils avaleraient la fermeture
 * `</template>` et le reste de la page. Refuses dans un gabarit.
 */
const ELEMENTS_TEXTE_BRUT = ['textarea', 'title', 'plaintext', 'xmp', 'noembed', 'noframes'];

/**
 * Regles du lint qui REFUSENT le bloc meme quand le lint n'en fait qu'un
 * avertissement : un attribut retire (le Studio ecrit la forme courante), une
 * couche ou une popup hors carte (le lint ne sait pas qu'il lit la page
 * entiere du bloc, et la couche n'y dessinerait rien).
 */
const REGLES_BLOQUANTES: ReadonlySet<string> = new Set([
  'balisage/attribut-retire',
  'carte/couche-hors-carte',
  'carte/popup-mal-placee',
]);

// ---------------------------------------------------------------------------
// Schema de l'outil
// ---------------------------------------------------------------------------

const ATTRIBUTE_SCHEMA = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      description: 'Nom HTML exact de l’attribut, en kebab-case (row, label-field, mode…)',
    },
    value: { type: 'string', description: 'Valeur ; "" pour un attribut booléen' },
  },
  required: ['name', 'value'],
  additionalProperties: false,
} as const;

/** Un composant d'un bloc libre — la liste des balises vient du manifeste. */
export const FREE_COMPONENT_SCHEMA = {
  type: 'object',
  properties: {
    tag: {
      type: 'string',
      enum: [...BALISES_LIBRES],
      description:
        'Composant dsfr-data ; ses attributs se lisent dans sa fiche (get_skill, ex. dsfrDataPivot ; compagnons de carte : dsfrDataMap)',
    },
    attributes: {
      type: 'array',
      items: ATTRIBUTE_SCHEMA,
      description:
        'Attributs du composant. Un composant qui réémet (pivot, search, facets, normalize…) porte un id ; source= cite l’id de la source chargée ou d’un composant précédent',
    },
    inside: {
      type: 'string',
      description:
        'Id d’un composant PRÉCÉDENT de ce bloc qui contient celui-ci (couche, volet ou légende dans sa carte ; KPI dans son groupe)',
    },
    template: {
      type: 'string',
      description: `Gabarit HTML du <template> enfant, champs entre doubles accolades {{champ}} — seulement pour ${BALISES_A_GABARIT.join(', ')}`,
    },
  },
  required: ['tag', 'attributes'],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Ids que les composants du bloc peuvent viser, hors du bloc lui-meme. */
export interface ContexteLibre {
  /** Sources du document et ids declares par les AUTRES blocs libres. */
  idsExternes: readonly string[];
}

export interface ResultatLibre {
  components?: FreeComponentSpec[];
  error?: string;
  /** Avertissements du lint, rendus au modele sans refuser le bloc. */
  avertissements?: string[];
}

/** Ids connus d'un document : ses sources, et les ids declares par ses blocs libres. */
export function idsDuDocument(doc: DashboardData, sauf?: string): string[] {
  const ids = doc.sources.map((s) => s.id);
  for (const w of doc.widgets) {
    if (w.type !== 'component' || w.id === sauf) continue;
    for (const c of w.config.components) {
      const id = c.attributes.find((a) => a.name === 'id')?.value;
      if (id) ids.push(id);
    }
  }
  return ids;
}

/** Valeur d'attribut venue du modele : texte, ou nombre / booleen convertis. */
function texte(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'boolean') return v ? '' : null;
  return null;
}

/** Lecture d'un composant brut ; message d'erreur sinon. */
function lireComposant(
  raw: unknown,
  rang: number,
  idsPrecedents: readonly string[]
): { composant?: FreeComponentSpec; error?: string } {
  const ou = `composant ${rang + 1}`;
  if (!raw || typeof raw !== 'object') return { error: `${ou} : objet attendu.` };
  const c = raw as Record<string, unknown>;
  const tag = typeof c.tag === 'string' ? c.tag.trim().toLowerCase() : '';
  if (tag in BALISES_REFUSEES) {
    return { error: `${ou} : <${tag}> n'est pas permis ici — ${BALISES_REFUSEES[tag]}.` };
  }
  if (!BALISES_LIBRES.includes(tag)) {
    return {
      error: `${ou} : balise "${String(c.tag ?? '')}" inconnue. Balises permises : ${BALISES_LIBRES.join(', ')}.`,
    };
  }
  const ici = `${ou} <${tag}>`;
  const contrat = CONTRAT_COMPOSANTS[tag];

  const attributes: ComponentAttribute[] = [];
  const bruts = c.attributes ?? [];
  if (!Array.isArray(bruts)) return { error: `${ici} : "attributes" doit être une liste.` };
  for (const a of bruts) {
    if (!a || typeof a !== 'object') return { error: `${ici} : attribut sans nom.` };
    const nomBrut = (a as Record<string, unknown>).name;
    const nom = typeof nomBrut === 'string' ? nomBrut.trim() : '';
    const valeur = texte((a as Record<string, unknown>).value);
    if (!nom) return { error: `${ici} : attribut sans nom.` };
    if (valeur === null) continue; // booleen false : attribut absent
    const declare =
      ATTRIBUTS_GLOBAUX.includes(nom) ||
      contrat.attributes.includes(nom) ||
      (contrat.deprecated !== undefined && nom in contrat.deprecated);
    if (!declare) {
      const proches = contrat.attributes.filter(
        (x) => x.startsWith(nom.slice(0, 3)) || nom.startsWith(x.slice(0, 3))
      );
      return {
        error:
          `${ici} : attribut "${nom}" inconnu du composant.` +
          (proches.length > 0 ? ` Vouliez-vous ${proches.slice(0, 3).join(', ')} ?` : '') +
          ` Attributs déclarés : ${contrat.attributes.join(', ')}.`,
      };
    }
    if (attributes.some((x) => x.name === nom)) {
      return { error: `${ici} : attribut "${nom}" donné deux fois.` };
    }
    if (urlInterdite(valeur)) {
      return {
        error: `${ici} : valeur de "${nom}" refusée (schéma javascript:, data: ou vbscript:).`,
      };
    }
    if (nettoyerGabarit(valeur) !== valeur) {
      return {
        error: `${ici} : valeur de "${nom}" refusée — elle contient du contenu actif (script, style, iframe, attribut on*, commentaire).`,
      };
    }
    attributes.push({ name: nom, value: valeur });
  }

  const composant: FreeComponentSpec = { tag, attributes };

  if (c.inside !== undefined && c.inside !== null && c.inside !== '') {
    const inside = typeof c.inside === 'string' ? c.inside.trim() : '';
    if (!idsPrecedents.includes(inside)) {
      return {
        error: `${ici} : inside="${String(c.inside)}" ne désigne aucun composant PRÉCÉDENT de ce bloc${
          idsPrecedents.length > 0
            ? ` (ids : ${idsPrecedents.join(', ')})`
            : ' (aucun ne porte d’id)'
        }. Le conteneur (ex. dsfr-data-map) vient avant, avec un id.`,
      };
    }
    composant.inside = inside;
  }

  if (c.template !== undefined && c.template !== null && c.template !== '') {
    if (typeof c.template !== 'string') return { error: `${ici} : "template" doit être un texte.` };
    if (!BALISES_A_GABARIT.includes(tag)) {
      return {
        error: `${ici} : ce composant ne lit pas de <template>. Seuls ${BALISES_A_GABARIT.join(', ')} en lisent un.`,
      };
    }
    if (nettoyerGabarit(c.template) !== c.template) {
      return {
        error: `${ici} : gabarit refusé — il contient du contenu actif (script, style, iframe, template imbriqué, attribut on*, lien javascript:, commentaire). Garde un HTML simple avec des {{champ}}.`,
      };
    }
    const bas = c.template.toLowerCase();
    const brut = ELEMENTS_TEXTE_BRUT.find((e) => bas.includes(`<${e}`));
    if (brut) return { error: `${ici} : gabarit refusé — élément <${brut}> non permis.` };
    composant.template = c.template;
  }

  return { composant };
}

/** « tag#id : message » pour un constat du lint. */
function decrireConstat(f: LintFinding): string {
  const ou = f.id ? `${f.tag}#${f.id}` : f.tag;
  return `${ou} : ${f.message}`;
}

/** Balise de remplacement d'un id externe, pour que le lint le sache present. */
function balisesExternes(ids: readonly string[]): string {
  return ids.map((id) => `<dsfr-data-source id="${escapeHtml(id)}"></dsfr-data-source>`).join('\n');
}

/**
 * Valide les composants d'un bloc libre. Refus au premier defaut de forme ;
 * puis le lint de balisage sur le HTML QUE L'EXPORT EMETTRA, precede d'une
 * balise par id externe connu : toutes ses erreurs refusent le bloc.
 */
export function validerComposantsLibres(raw: unknown, ctx: ContexteLibre): ResultatLibre {
  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      error: 'Bloc component invalide : "components" doit lister au moins un composant.',
    };
  }
  if (raw.length > MAX_COMPOSANTS) {
    return {
      error: `Bloc component invalide : ${raw.length} composants, ${MAX_COMPOSANTS} au plus par bloc.`,
    };
  }
  const components: FreeComponentSpec[] = [];
  const ids: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const { composant, error } = lireComposant(raw[i], i, ids);
    if (error || !composant) return { error };
    components.push(composant);
    const id = composant.attributes.find((a) => a.name === 'id')?.value;
    if (id) ids.push(id);
  }

  // Le HTML reel de l'export, pas une reconstruction.
  const widget: Widget = {
    id: 'bloc-libre',
    type: 'component',
    title: '',
    position: { row: 0, col: 0 },
    config: { components },
  };
  const doc: DashboardData = {
    id: null,
    name: '',
    description: '',
    createdAt: null,
    updatedAt: null,
    layout: { columns: 1, gap: '' },
    widgets: [widget],
    sources: [],
  };
  const html = `${balisesExternes(ctx.idsExternes)}\n${generateWidgetHTML(widget, doc)}`;
  const constats = lintMarkup(html, CONTRAT_COMPOSANTS);
  const bloquants = constats.filter(
    (f) => f.severity === 'erreur' || (f.regle !== undefined && REGLES_BLOQUANTES.has(f.regle))
  );
  if (bloquants.length > 0) {
    const amontAbsent = bloquants.some((f) => f.regle === 'balisage/amont-absent');
    const connus = [...ctx.idsExternes, ...ids];
    return {
      error:
        `Bloc component refusé : ${bloquants.map(decrireConstat).join(' ')}` +
        (amontAbsent
          ? ` Ids disponibles : ${connus.length > 0 ? connus.join(', ') : 'aucun (charge une source)'}.`
          : ''),
    };
  }
  const avertissements = constats.filter((f) => f.severity === 'avertissement');
  return {
    components,
    avertissements: avertissements.length > 0 ? avertissements.map(decrireConstat) : undefined,
  };
}
