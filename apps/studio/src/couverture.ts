/**
 * Garde-fou de couverture du Studio (#1109) — ce que le Studio sait ECRIRE,
 * compare a ce que la bibliotheque DECLARE.
 *
 * Constat : les skills sont engendrees depuis le manifeste (le Studio SAIT
 * tout de la lib), mais son modele de blocs n'en ecrit qu'une partie — 11
 * composants sur 28, 14 attributs sur 41 pour `dsfr-data-map-layer` le
 * 2026-09-24. L'ecart etait invisible : il se decouvrait en conversation,
 * quand le modele promettait un volet qu'aucun outil ne savait poser.
 *
 * Principe (meme doctrine que `check:specs-tables`) : chaque composant et
 * chaque attribut du manifeste est soit ECRIT par le Studio, soit EXCLU avec
 * une raison declaree (`couverture-exclusions.ts`). Rien n'est tenu a la main
 * du cote « ecrit » : on le MESURE.
 *
 *   schema des outils (BLOCK_SPEC_SCHEMA)
 *     -> specs de blocs engendrees (une par valeur d'enumeration)
 *     -> validation reelle (`addBlocks`, celle des appels du modele)
 *     -> export reel (`generateDashboardHTML`, celui de l'apercu et du code)
 *     -> balises et attributs `dsfr-data-*` relus dans le HTML produit.
 *
 * Une option ajoutee au schema, a la validation ET a l'export est donc
 * comptee sans autre geste ; il suffit que l'une des trois manque pour
 * qu'elle ne le soit pas.
 *
 * Bloc « composant libre » (#1111) : ses options ne se deduisent pas du schema
 * (une balise et des paires nom/valeur). On part donc du CONTRAT des composants
 * (le manifeste) : pour chaque balise permise, un bloc portant tous ses
 * attributs — ou, s'il est refuse, un attribut a la fois — passe par la meme
 * validation (`addBlocks`) et le meme export. Un attribut que la validation
 * refuse n'est pas compte.
 */

import { createEmptyDashboard, generateDashboardHTML } from '@dsfr-data/shared';
import type { DashboardData, DashboardSource } from '@dsfr-data/shared';
import { BLOCK_SPEC_SCHEMA, addBlocks, type BlockSpec, type DocumentContext } from './document.js';
import { BALISES_A_GABARIT, BALISES_LIBRES, CONTRAT_COMPOSANTS } from './composant-libre.js';
import type { ExclusionDeclaree } from './couverture-exclusions.js';

// ---------------------------------------------------------------------------
// Specs engendrees depuis le schema
// ---------------------------------------------------------------------------

interface NoeudSchema {
  type?: string;
  enum?: readonly string[];
  properties?: Readonly<Record<string, NoeudSchema>>;
  items?: NoeudSchema;
  required?: readonly string[];
}

type Objet = Record<string, unknown>;

/**
 * Proprietes laissees a leur defaut : `sourceId` d'une couche designe une
 * source du document — une valeur inventee viserait une source absente.
 */
const PROPRIETES_A_DEFAUT: ReadonlySet<string> = new Set(['sourceId']);

/** Une valeur plausible pour une propriete, d'apres son seul schema. */
function valeurExemple(nom: string, noeud: NoeudSchema): unknown {
  if (noeud.enum) return noeud.enum[0];
  switch (noeud.type) {
    case 'integer':
    case 'number':
      return 5;
    case 'boolean':
      return true;
    case 'array':
      if (noeud.items?.type === 'object') return [objetComplet(noeud.items)];
      return [`${nom}_a`, `${nom}_b`];
    case 'object':
      return objetComplet(noeud);
    default:
      return EXEMPLES_PAR_NOM[nom] ?? `champ_${nom}`;
  }
}

/**
 * Chaines a grammaire : un gabarit cite ses champs entre accolades, un filtre
 * suit « champ:op:valeur ». Une chaine quelconque y serait lue comme vide.
 */
const EXEMPLES_PAR_NOM: Readonly<Record<string, string>> = {
  popupTemplate: '{champ_a} ({champ_b})',
  where: 'champ_a:eq:x',
};

/** Objet dont TOUTES les proprietes sont remplies. */
function objetComplet(noeud: NoeudSchema): Objet {
  const out: Objet = {};
  for (const [nom, enfant] of Object.entries(noeud.properties ?? {})) {
    if (PROPRIETES_A_DEFAUT.has(nom)) continue;
    out[nom] = valeurExemple(nom, enfant);
  }
  return out;
}

/** Objet reduit a ses proprietes obligatoires. */
function objetMinimal(noeud: NoeudSchema): Objet {
  const requis = new Set(noeud.required ?? []);
  const complet = objetComplet(noeud);
  return Object.fromEntries(Object.entries(complet).filter(([nom]) => requis.has(nom)));
}

/** Valeurs a essayer pour une option facultative. */
function valeursAEssayer(nom: string, p: NoeudSchema): unknown[] {
  if (p.enum) return [...p.enum];
  if (p.type === 'object' && p.properties) return variantes(p);
  if (p.type === 'array' && p.items?.type === 'object' && p.items.properties) {
    return variantes(p.items).map((v) => [v]);
  }
  return [valeurExemple(nom, p)];
}

/**
 * Variantes d'un objet : produit des valeurs de ses enumerations OBLIGATOIRES
 * (les discriminants : `kind`, `type`), chacune en deux bases — COMPLETE (toutes
 * les options) et MINIMALE (les seules obligatoires : certaines formes ne
 * s'ecrivent qu'en l'ABSENCE d'une option, comme la pagination serveur d'une
 * liste sans agregation) — puis une option facultative changee a la fois
 * (chaque valeur d'enumeration, chaque variante d'un objet imbrique).
 */
export function variantes(noeud: NoeudSchema): Objet[] {
  const props = Object.entries(noeud.properties ?? {}).filter(
    ([nom]) => !PROPRIETES_A_DEFAUT.has(nom)
  );
  const requis = new Set(noeud.required ?? []);
  const discriminants = props.filter(([nom, p]) => requis.has(nom) && p.enum);

  let bases: Objet[] = [objetComplet(noeud), objetMinimal(noeud)];
  for (const [nom, p] of discriminants) {
    bases = bases.flatMap((b) => (p.enum ?? []).map((v) => ({ ...b, [nom]: v })));
  }

  const out: Objet[] = [...bases];
  for (const base of bases) {
    for (const [nom, p] of props) {
      if (requis.has(nom) && p.enum) continue;
      for (const v of valeursAEssayer(nom, p)) out.push({ ...base, [nom]: v });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sources representatives
// ---------------------------------------------------------------------------

const LIGNES = [{ champ_a: 'x', champ_b: 1 }];

/**
 * Une source par branche de `generateSourceHTML` : c'est la forme de la
 * connexion, pas le schema, qui decide des attributs de `dsfr-data-source`.
 * Toutes portent des lignes, comme toute source proposee par le Studio.
 */
export const SOURCES_REPRESENTATIVES: readonly DashboardSource[] = [
  { id: 'src', name: 'Saisie', type: 'manual', data: LIGNES },
  {
    id: 'src',
    name: 'Opendatasoft',
    provider: 'opendatasoft',
    apiUrl: 'https://data.example.fr/api/explore/v2.1/catalog/datasets/jeu/records',
    resourceIds: { datasetId: 'jeu' },
    data: LIGNES,
  },
  {
    id: 'src',
    name: 'Tabular',
    provider: 'tabular',
    resourceIds: { resourceId: 'ressource' },
    data: LIGNES,
  },
  {
    id: 'src',
    name: 'API',
    apiUrl: 'https://api.example.fr/jeu',
    dataPath: 'results',
    data: LIGNES,
  },
];

// ---------------------------------------------------------------------------
// Lecture du HTML produit
// ---------------------------------------------------------------------------

/** Balises `dsfr-data-*` du HTML et leurs attributs, par un balayage lineaire. */
export function balisesEcrites(html: string, into = new Map<string, Set<string>>()) {
  const PREFIXE = '<dsfr-data-';
  let i = html.indexOf(PREFIXE);
  while (i !== -1) {
    let j = i + 1;
    while (j < html.length && /[a-z0-9-]/.test(html[j])) j++;
    const tag = html.slice(i + 1, j);
    const attrs = into.get(tag) ?? new Set<string>();
    into.set(tag, attrs);
    // Attributs jusqu'au `>` qui ferme la balise, en sautant les valeurs
    // entre guillemets (un `data='[…]'` peut contenir `>`).
    while (j < html.length && html[j] !== '>') {
      const c = html[j];
      if (/\s|\//.test(c)) {
        j++;
        continue;
      }
      let k = j;
      while (k < html.length && !/[\s=>/]/.test(html[k])) k++;
      attrs.add(html.slice(j, k));
      j = k;
      if (html[j] === '=') {
        j++;
        const q = html[j];
        if (q === '"' || q === "'") {
          const fin = html.indexOf(q, j + 1);
          j = fin === -1 ? html.length : fin + 1;
        } else {
          while (j < html.length && !/[\s>]/.test(html[j])) j++;
        }
      }
    }
    i = html.indexOf(PREFIXE, j);
  }
  return into;
}

// ---------------------------------------------------------------------------
// Mesure : ce que le Studio ecrit
// ---------------------------------------------------------------------------

/** Objet prive d'une a trois de ses options (hors discriminant). */
function sansOptions(objet: Objet, garder: string): Objet[] {
  // Jusqu'a TROIS options retirees : une couche heatmap complete porte
  // cluster, clusterRadius et groupField, tous trois refuses sur ce type.
  const noms = Object.keys(objet).filter((n) => n !== garder);
  const out: Objet[] = [];
  const retirer = (base: Objet, depuis: number, reste: number): void => {
    for (let i = depuis; i < noms.length; i++) {
      const sans = { ...base };
      delete sans[noms[i]];
      out.push(sans);
      if (reste > 1) retirer(sans, i + 1, reste - 1);
    }
  };
  retirer(objet, 0, 3);
  return out;
}

/**
 * Plus grande spec acceptee par la validation. Une combinaison peut etre
 * refusee a juste titre (`cluster` + `clusterRadius` sur une couche circle) :
 * on retire alors une ou deux options, au niveau du bloc ou de sa couche,
 * pour garder tout le reste.
 */
function specAcceptee(spec: Objet, ctx: DocumentContext): BlockSpec | null {
  const essai = (s: Objet): boolean =>
    addBlocks(createEmptyDashboard(), [s as unknown as BlockSpec], ctx).ok;
  const candidats: Objet[] = [spec, ...sansOptions(spec, 'kind')];
  const layers = spec.layers;
  if (Array.isArray(layers) && layers.length === 1) {
    for (const couche of sansOptions(layers[0] as Objet, 'type')) {
      candidats.push({ ...spec, layers: [couche] });
    }
  }
  const retenu = candidats.find(essai);
  return retenu ? (retenu as unknown as BlockSpec) : null;
}

/** Document d'une seule source, avec les blocs donnes. */
function documentAvec(source: DashboardSource, specs: BlockSpec[]): DashboardData {
  const doc = createEmptyDashboard();
  doc.sources = [source];
  addBlocks(doc, specs, { data: [], fields: [], sourceId: source.id });
  return doc;
}

// ---------------------------------------------------------------------------
// Mesure du bloc « composant libre » (#1111)
// ---------------------------------------------------------------------------

/** Attributs qui visent un amont : poses d'office, vers la source `src`. */
const ATTRIBUTS_AMONT = ['source', 'left', 'right', 'sources'];

/** Valeur plausible d'un attribut, d'apres le seul contrat. */
function valeurLibre(tag: string, nom: string): string {
  const permises = CONTRAT_COMPOSANTS[tag]?.enums?.[nom];
  if (permises) return permises.find((v) => v !== '') ?? '';
  if (ATTRIBUTS_AMONT.includes(nom)) return 'src';
  // La popup vise la couche posee a cote d'elle (voir `specLibre`).
  if (tag === 'dsfr-data-map-popup' && nom === 'for') return 'couche';
  if (nom === 'max-items') return '5';
  return 'x';
}

type Attr = { name: string; value: string };

/**
 * Bloc libre qui pose `tag` avec les attributs `noms`, dans son contexte :
 * un compagnon de carte dans une carte (et une couche a viser pour la popup),
 * un id, ses amonts vers la source du document, un gabarit s'il en lit un.
 */
function specLibre(tag: string, noms: readonly string[]): BlockSpec {
  const declares = CONTRAT_COMPOSANTS[tag]?.attributes ?? [];
  const attrs: Attr[] = [{ name: 'id', value: 'c' }];
  for (const n of ATTRIBUTS_AMONT) {
    if (declares.includes(n)) attrs.push({ name: n, value: 'src' });
  }
  if (tag === 'dsfr-data-map-layer') {
    attrs.push({ name: 'lat-field', value: 'lat' }, { name: 'lon-field', value: 'lon' });
  }
  for (const n of noms) {
    if (!attrs.some((a) => a.name === n)) attrs.push({ name: n, value: valeurLibre(tag, n) });
  }
  const components: Array<Record<string, unknown>> = [];
  const dansCarte = tag.startsWith('dsfr-data-map-');
  if (dansCarte)
    components.push({ tag: 'dsfr-data-map', attributes: [{ name: 'id', value: 'carte' }] });
  if (tag === 'dsfr-data-map-popup') {
    components.push({
      tag: 'dsfr-data-map-layer',
      attributes: [
        { name: 'id', value: 'couche' },
        { name: 'source', value: 'src' },
        { name: 'lat-field', value: 'lat' },
        { name: 'lon-field', value: 'lon' },
      ],
      inside: 'carte',
    });
  }
  const composant: Record<string, unknown> = { tag, attributes: attrs };
  if (dansCarte) composant.inside = 'carte';
  if (BALISES_A_GABARIT.includes(tag)) composant.template = '<p>{{champ_a}}</p>';
  components.push(composant);
  return { kind: 'component', components };
}

/**
 * Blocs libres acceptes par la validation : pour chaque balise permise, un
 * bloc qui porte tous ses attributs, sinon un bloc par attribut accepte.
 */
export function specsDuBlocLibre(): BlockSpec[] {
  const ctx: DocumentContext = { data: [], fields: [], sourceId: 'src' };
  const accepte = (spec: BlockSpec): boolean => {
    const doc = createEmptyDashboard();
    doc.sources = [SOURCES_REPRESENTATIVES[0]];
    return addBlocks(doc, [spec], ctx).ok;
  };
  const specs: BlockSpec[] = [];
  for (const tag of BALISES_LIBRES) {
    const noms = CONTRAT_COMPOSANTS[tag].attributes;
    const complet = specLibre(tag, noms);
    if (accepte(complet)) {
      specs.push(complet);
      continue;
    }
    for (const n of noms) {
      const seul = specLibre(tag, [n]);
      if (accepte(seul)) specs.push(seul);
    }
  }
  return specs;
}

/**
 * Balises et attributs que le Studio sait ecrire : chaque spec engendree,
 * seule puis avec un voisin qui lit la meme source (source dediee d'un
 * agregat, pagination serveur d'une liste seule : l'export depend des
 * voisins), sur chaque forme de source.
 */
export function attributsEcritsParLeStudio(): Map<string, Set<string>> {
  const ecrits = new Map<string, Set<string>>();
  const ctx: DocumentContext = { data: [], fields: [], sourceId: 'src' };
  const vues = new Set<string>();
  const specs: BlockSpec[] = [];
  for (const brute of variantes(BLOCK_SPEC_SCHEMA as unknown as NoeudSchema)) {
    const spec = specAcceptee(brute, ctx);
    const cle = JSON.stringify(spec);
    if (spec && !vues.has(cle)) {
      vues.add(cle);
      specs.push(spec);
    }
  }
  // Le bloc libre (#1111), mesure sur la source embarquee : la forme de la
  // source ne change rien a ses balises.
  for (const spec of specsDuBlocLibre()) {
    balisesEcrites(generateDashboardHTML(documentAvec(SOURCES_REPRESENTATIVES[0], [spec])), ecrits);
  }
  const voisin = specs.find((s) => s.kind === 'chart');
  for (const source of SOURCES_REPRESENTATIVES) {
    for (const spec of specs) {
      balisesEcrites(generateDashboardHTML(documentAvec(source, [spec])), ecrits);
      if (voisin) {
        balisesEcrites(generateDashboardHTML(documentAvec(source, [spec, voisin])), ecrits);
      }
    }
  }
  return ecrits;
}

// ---------------------------------------------------------------------------
// Confrontation au manifeste
// ---------------------------------------------------------------------------

/** Sous-ensemble du custom-elements manifest lu ici. */
export interface ManifesteCem {
  modules: Array<{
    declarations?: Array<{ tagName?: string; attributes?: Array<{ name: string }> }>;
  }>;
}

/** Attributs globaux HTML, jamais declares par un composant. */
const ATTRIBUTS_GLOBAUX: ReadonlySet<string> = new Set(['id', 'class', 'style', 'hidden']);

export interface BilanCouverture {
  erreurs: string[];
  composants: { total: number; ecrits: number };
  /** Par composant ecrit : attributs ecrits / declares. */
  attributs: Map<string, { ecrits: number; total: number }>;
}

/** Composants et attributs du manifeste. */
export function indexerManifeste(manifeste: ManifesteCem): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const mod of manifeste.modules) {
    for (const decl of mod.declarations ?? []) {
      if (!decl.tagName) continue;
      out.set(decl.tagName, new Set((decl.attributes ?? []).map((a) => a.name)));
    }
  }
  return out;
}

/**
 * Chaque composant et attribut du manifeste doit etre ECRIT ou EXCLU — pas
 * les deux, pas aucun. Une exclusion qui ne vise rien de declare est une
 * erreur, sauf si elle attend une evolution nommee (`enAttente`).
 */
export function verifierCouverture(
  manifeste: ManifesteCem,
  ecrits: Map<string, Set<string>>,
  exclusions: readonly ExclusionDeclaree[]
): BilanCouverture {
  const declares = indexerManifeste(manifeste);
  const erreurs: string[] = [];

  const composantsExclus = new Map<string, string>();
  const attributsExclus = new Map<string, Map<string, string>>();
  for (const ex of exclusions) {
    if (!ex.raison.trim()) erreurs.push(`Exclusion sans raison : ${ex.composant}.`);
    if (!ex.attributs) {
      composantsExclus.set(ex.composant, ex.raison);
      continue;
    }
    const parAttr = attributsExclus.get(ex.composant) ?? new Map<string, string>();
    for (const a of ex.attributs) {
      if (parAttr.has(a)) erreurs.push(`Exclusion en double : ${ex.composant} ${a}.`);
      parAttr.set(a, ex.raison);
    }
    attributsExclus.set(ex.composant, parAttr);
  }

  // Exclusions qui ne visent rien de declare.
  for (const ex of exclusions) {
    const attrs = declares.get(ex.composant);
    const cibles = ex.attributs ?? [];
    const absents = attrs ? cibles.filter((a) => !attrs.has(a)) : cibles;
    if ((!attrs || absents.length > 0) && !ex.enAttente) {
      erreurs.push(
        attrs
          ? `Exclusion d'attribut(s) non declare(s) par ${ex.composant} : ${absents.join(', ')}.`
          : `Exclusion d'un composant absent du manifeste : ${ex.composant}.`
      );
    }
  }

  const attributs = new Map<string, { ecrits: number; total: number }>();
  let composantsEcrits = 0;
  for (const [tag, attrs] of declares) {
    const ecritsTag = ecrits.get(tag);
    if (!ecritsTag) {
      if (!composantsExclus.has(tag)) {
        erreurs.push(
          `${tag} : composant ni ecrit par le Studio ni exclu — l'exposer dans le modele de blocs, ou le declarer dans apps/studio/src/couverture-exclusions.ts avec sa raison.`
        );
      }
      continue;
    }
    composantsEcrits++;
    if (composantsExclus.has(tag)) {
      erreurs.push(`${tag} : exclu, mais le Studio l'ecrit — retirer l'exclusion devenue fausse.`);
    }
    const exclus = attributsExclus.get(tag) ?? new Map<string, string>();
    let n = 0;
    for (const a of attrs) {
      const estEcrit = ecritsTag.has(a);
      if (estEcrit) n++;
      if (estEcrit && exclus.has(a)) {
        erreurs.push(
          `${tag} ${a} : exclu, mais le Studio l'ecrit — retirer l'exclusion devenue fausse.`
        );
      } else if (!estEcrit && !exclus.has(a)) {
        erreurs.push(
          `${tag} ${a} : attribut ni ecrit par le Studio ni exclu — l'exposer, ou le declarer dans apps/studio/src/couverture-exclusions.ts avec sa raison.`
        );
      }
    }
    for (const a of ecritsTag) {
      if (!attrs.has(a) && !ATTRIBUTS_GLOBAUX.has(a)) {
        erreurs.push(`${tag} ${a} : ecrit par le Studio, mais absent du manifeste.`);
      }
    }
    attributs.set(tag, { ecrits: n, total: attrs.size });
  }

  return {
    erreurs,
    composants: { total: declares.size, ecrits: composantsEcrits },
    attributs,
  };
}
