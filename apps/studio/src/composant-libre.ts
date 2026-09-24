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
  FIELD_ATTRS,
  SHAPE_ATTRS,
  escapeHtml,
  fieldsInAttr,
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
  Trace,
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

/**
 * Transformateurs PURS : ils reemettent des donnees sans rien afficher
 * (`TransformerMixin`, hors recherche et facettes qui rendent un champ). Un
 * bloc dont un transformateur n'est lu par personne n'affiche rien — le banc
 * l'a vu (`tableau-croise` : un pivot seul, accepte, page vide). Liste verifiee
 * par un test-garde contre le code des composants.
 */
export const TRANSFORMATEURS_PURS: readonly string[] = [
  'dsfr-data-concat',
  'dsfr-data-join',
  'dsfr-data-normalize',
  'dsfr-data-pivot',
  'dsfr-data-query',
  'dsfr-data-unpivot',
];

/** Ids amont cites par un composant (`source`, `left`, `right`, `sources`). */
function amontsDe(c: FreeComponentSpec): string[] {
  const out: string[] = [];
  for (const { name, value } of c.attributes) {
    if (name === 'source' || name === 'left' || name === 'right') out.push(value.trim());
    else if (name === 'sources') out.push(...value.split(',').map((v) => v.trim()));
  }
  return out;
}

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

/**
 * Une etape telle que la derniere trace de l'apercu l'a observee (#1141) :
 * ses attributs de forme, ses amonts et les champs de sa SORTIE.
 */
export interface ObservationEtape {
  tag: string;
  attrs: Readonly<Record<string, string>>;
  upstream: readonly string[];
  fields: readonly string[];
}

/** Ids que les composants du bloc peuvent viser, hors du bloc lui-meme. */
export interface ContexteLibre {
  /** Sources du document et ids declares par les AUTRES blocs libres. */
  idsExternes: readonly string[];
  /**
   * Champs des sources dont les lignes sont connues (la source chargee), par
   * id de source (#1141). Une source absente d'ici a une sortie inconnue.
   */
  champsDesSources?: Readonly<Record<string, readonly string[]>>;
  /** Composants des AUTRES blocs libres, par id — pour relire leur sortie observee. */
  composantsExternes?: ReadonlyMap<string, FreeComponentSpec>;
  /**
   * Derniere trace de l'apercu, par id d'etape (volet Diagnostic). Absente
   * (banc, pas d'apercu) : seules les sources chargees sont connues.
   */
  observations?: ReadonlyMap<string, ObservationEtape>;
  /** `run_and_trace` est disponible : le compte-rendu y renvoie pour ce qui reste a verifier. */
  peutTracer?: boolean;
}

export interface ResultatLibre {
  components?: FreeComponentSpec[];
  error?: string;
  /** Avertissements du lint, rendus au modele sans refuser le bloc. */
  avertissements?: string[];
  /** Champs lus sur une sortie encore inconnue (#1141), rendus au modele. */
  nonVerifies?: string;
}

/**
 * Etapes observees par la derniere trace de l'apercu, par id (#1141). Seules
 * celles dont la sortie porte des champs sont retenues.
 */
export function observationsDeTrace(trace: Trace | null): Map<string, ObservationEtape> {
  const out = new Map<string, ObservationEtape>();
  if (!trace) return out;
  for (const node of trace.graph.nodes) {
    if (node.synthetic || node.ambiguous) continue;
    const fields = (trace.states[node.id]?.fields ?? []).map((f) => f.name);
    if (fields.length === 0) continue;
    out.set(node.id, { tag: node.tag, attrs: node.attrs, upstream: node.upstream, fields });
  }
  return out;
}

/** Composants des blocs libres d'un document par id, sauf ceux du bloc `sauf`. */
export function composantsDuDocument(
  doc: DashboardData,
  sauf?: string
): Map<string, FreeComponentSpec> {
  const out = new Map<string, FreeComponentSpec>();
  for (const w of doc.widgets) {
    if (w.type !== 'component' || w.id === sauf) continue;
    for (const c of w.config.components) {
      const id = c.attributes.find((a) => a.name === 'id')?.value;
      if (id) out.set(id, c);
    }
  }
  return out;
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

// ---------------------------------------------------------------------------
// Noms de champs, etape par etape (#1141)
// ---------------------------------------------------------------------------

/** Valeur d'un attribut d'un composant, ou undefined. */
function attr(c: FreeComponentSpec, nom: string): string | undefined {
  return c.attributes.find((a) => a.name === nom)?.value;
}

/**
 * Transformateurs qui FILTRENT ou trient sans toucher au schema : leur sortie
 * a les champs de leur entree. Seule connaissance de la semantique des
 * composants ecrite ici — tout le reste (pivot, agregation, jointure,
 * normalisation…) se lit dans la trace, jamais recalcule.
 */
function conserveLeSchema(c: FreeComponentSpec): boolean {
  switch (c.tag) {
    case 'dsfr-data-facets':
      return true;
    // `highlight` ajoute `_highlight` a chaque ligne.
    case 'dsfr-data-search':
      return attr(c, 'highlight') === undefined;
    // Sans regroupement ni agregat, une requete filtre, trie, limite.
    case 'dsfr-data-query':
      return attr(c, 'group-by') === undefined && attr(c, 'aggregate') === undefined;
    default:
      return false;
  }
}

/**
 * Attributs qui decrivent la forme d'une etape dans la trace (`snapshotGraph`) :
 * le cadrage de `SHAPE_ATTRS` plus les attributs-champs. Une observation n'est
 * reprise que si ces attributs sont ceux du composant tel qu'il est ECRIT
 * maintenant — sinon l'apercu montre une version precedente.
 */
function attrsDeForme(tag: string): string[] {
  return [...new Set([...(SHAPE_ATTRS[tag] ?? []), ...Object.keys(FIELD_ATTRS[tag] ?? {})])];
}

function observationConforme(c: FreeComponentSpec, obs: ObservationEtape): boolean {
  if (obs.tag !== c.tag || obs.fields.length === 0) return false;
  for (const nom of attrsDeForme(c.tag)) {
    if (attr(c, nom) !== obs.attrs[nom]) return false;
  }
  const amonts = amontsDe(c);
  return amonts.length === obs.upstream.length && amonts.every((a, i) => a === obs.upstream[i]);
}

/** Racine d'un chemin imbrique (`a.b`, `items[0]`) : seule cle contredite sans risque. */
function racine(champ: string): string {
  const fin = Math.min(
    ...[champ.indexOf('.'), champ.indexOf('['), champ.length].filter((i) => i >= 0)
  );
  return champ.slice(0, fin);
}

/** Liste de champs bornee pour un message. */
function listerChamps(champs: readonly string[], max = 25): string {
  return champs.length <= max
    ? champs.join(', ')
    : `${champs.slice(0, max).join(', ')}, … (+${champs.length - max})`;
}

export interface ResultatChamps {
  error?: string;
  /** Lectures non verifiees faute de sortie connue, pour le compte-rendu. */
  nonVerifies?: string[];
}

/**
 * Verifie les noms de champs du bloc, ETAPE PAR ETAPE : un attribut marque
 * `@champ` (FIELD_ATTRS, genere depuis le JSDoc) doit nommer un champ de ce que
 * le composant RECOIT — la source chargee, ou la sortie de l'etape qui
 * l'alimente.
 *
 * Sortie d'une etape : la source chargee (lignes connues) ; un filtre qui
 * conserve le schema (`conserveLeSchema`) ; sinon la derniere TRACE de
 * l'apercu, si elle a observe cette etape ecrite a l'identique et que ses
 * amonts sont eux-memes connus. Un pivot tout juste ecrit n'a pas encore ete
 * calcule : sa sortie est INCONNUE, et un champ lu dessus n'est pas refuse —
 * il est rendu au modele comme « non verifie » (verification par
 * `run_and_trace` une fois l'apercu rendu). Jamais de refus sur une supposition.
 */
export function verifierChampsLibres(
  components: readonly FreeComponentSpec[],
  ctx: ContexteLibre
): ResultatChamps {
  const sources = ctx.champsDesSources ?? {};
  const internes = new Map<string, FreeComponentSpec>();
  for (const c of components) {
    const id = attr(c, 'id');
    if (id) internes.set(id, c);
  }
  const memo = new Map<string, readonly string[] | null>();

  const sortieDe = (
    id: string,
    pile: ReadonlySet<string> = new Set()
  ): readonly string[] | null => {
    if (memo.has(id)) return memo.get(id) ?? null;
    if (pile.has(id)) return null; // cycle : le lint le dira
    const suite = new Set(pile).add(id);
    let out: readonly string[] | null = null;
    const spec = internes.get(id) ?? ctx.composantsExternes?.get(id);
    if (!spec && Object.prototype.hasOwnProperty.call(sources, id)) {
      out = sources[id].length > 0 ? sources[id] : null;
    } else if (spec) {
      const amonts = amontsDe(spec);
      const entrees = amonts.map((a) => sortieDe(a, suite));
      const amontsConnus = amonts.length > 0 && entrees.every((e) => e !== null);
      if (amontsConnus && conserveLeSchema(spec) && amonts.length === 1) {
        out = entrees[0];
      } else {
        const obs = ctx.observations?.get(id);
        if (amontsConnus && obs && observationConforme(spec, obs)) out = obs.fields;
      }
    }
    memo.set(id, out);
    return out;
  };

  const nonVerifies: string[] = [];
  for (const c of components) {
    const table = FIELD_ATTRS[c.tag];
    if (!table) continue;
    const lus = c.attributes.filter((a) => a.name in table);
    if (lus.length === 0) continue;
    const amonts = amontsDe(c).filter(Boolean);
    // Popup, legende : alimentes par leur carte, pas par un `source=` — hors controle.
    if (amonts.length === 0) continue;
    const entrees = amonts.map((a) => sortieDe(a));
    const inconnus = amonts.filter((_, i) => entrees[i] === null);
    if (inconnus.length > 0) {
      nonVerifies.push(
        `<${c.tag}> ${lus.map((a) => a.name).join(', ')} (lit ${inconnus.map((i) => `#${i}`).join(', ')})`
      );
      continue;
    }
    // Union des entrees (jointure) : ne peut que sous-signaler, jamais inventer.
    const connus = [...new Set(entrees.flatMap((e) => e ?? []))];
    for (const { name, value } of lus) {
      for (const champ of fieldsInAttr(value, table[name])) {
        if (connus.includes(racine(champ))) continue;
        const ou =
          amonts.length > 1
            ? `des entrées ${amonts.map((a) => `#${a}`).join(' et ')}`
            : internes.has(amonts[0]) || ctx.composantsExternes?.has(amonts[0])
              ? `de la sortie de #${amonts[0]}`
              : `de la source #${amonts[0]}`;
        return {
          error:
            `Bloc component refusé : <${c.tag}> ${name}="${value}" : champ "${champ}" absent ${ou}` +
            ` (champs disponibles : ${listerChamps(connus)}).`,
        };
      }
    }
  }
  return nonVerifies.length > 0 ? { nonVerifies } : {};
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
  // Un transformateur que rien ne lit : la page n'afficherait rien.
  const lus = new Set(components.flatMap(amontsDe));
  for (const c of components) {
    const id = c.attributes.find((x) => x.name === 'id')?.value;
    if (TRANSFORMATEURS_PURS.includes(c.tag) && id && !lus.has(id)) {
      return {
        error: `Bloc component refusé : <${c.tag} id="${id}"> transforme les données mais rien ne les lit — rien ne s'affichera. Ajoute après lui un composant d'affichage (ex. dsfr-data-list) avec source="${id}".`,
      };
    }
  }
  // Les noms de champs, etape par etape (#1141).
  const champs = verifierChampsLibres(components, ctx);
  if (champs.error) return { error: champs.error };
  const avertissements = constats.filter((f) => f.severity === 'avertissement');
  return {
    components,
    avertissements: avertissements.length > 0 ? avertissements.map(decrireConstat) : undefined,
    nonVerifies: champs.nonVerifies
      ? `champs non vérifiés, la sortie lue n'est pas encore calculée : ${champs.nonVerifies.join(' ; ')}. ` +
        (ctx.peutTracer
          ? 'Appelle run_and_trace une fois l’aperçu rendu pour les vérifier.'
          : 'Ils ne seront vérifiés qu’au rendu de la page : relis la fiche du composant amont pour les noms qu’il produit.')
      : undefined,
  };
}
