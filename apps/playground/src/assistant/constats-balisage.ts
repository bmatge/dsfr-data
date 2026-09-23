/**
 * Constats STATIQUES du Playground (#1009, ADR-143 §3) : l'analyse du
 * balisage (`lintMarkup`, #608/#995) projetée en `Constat[]`, pour que le
 * volet Diagnostic montre, dans la même liste, ce que le code dit (attribut
 * inconnu, amont absent, couche hors carte…) et ce que l'exécution a vu
 * (règles génériques, #996).
 *
 * La règle lit le code dans `contexte.etat.code` : `main.ts` le lui passe à
 * chaque évaluation (`mountDiagnosticPanel({ constats: { contexte } })`), donc
 * à chaque trace de l'aperçu.
 *
 * Chaque constat désigne l'endroit du code en cause par un REPÈRE DE CODE
 * (`playground.ligne.<n>.<balise>[.<attribut>]`, `adaptateur.ts`) : « Me
 * montrer » pose le curseur et surligne la ligne ou l'attribut.
 *
 * Écart assumé au contrat de `RegleConstat` : une seule règle d'app porte
 * toutes les règles de l'analyseur, et chaque constat garde le code de SA
 * règle d'analyse (`balisage/attribut-inconnu`, `carte/…`) plutôt que l'id de
 * la règle d'app. Découper en une règle par code imposerait d'en tenir la
 * liste ici, en double de `lint-markup.ts` ; ces codes ne recoupent aucune
 * règle générique, rien n'est donc `remplace`-é à tort.
 *
 * ADR-122 : aucun nombre calculé. La preuve ne cite que ce qui est écrit dans
 * le code (balise, id, attribut) et la ligne où il est écrit.
 */
import type {
  ComponentContract,
  Constat,
  ContexteConstats,
  LintFinding,
  RegleConstat,
} from '@dsfr-data/shared';
import { lintMarkup } from '@dsfr-data/shared';
import { COMPONENT_CONTRACT } from '../../../../mcp-server/src/component-contract.generated';
import { repereCodeVersId } from './adaptateur.js';

/** Id de la règle d'app ; code des constats d'une analyse sans code propre. */
export const ID_REGLE_BALISAGE = 'balisage/analyse-statique';

/** Titre court (une ligne, sans point final) par code de règle d'analyse. */
const TITRES: Readonly<Record<string, string>> = {
  'balisage/balise-inconnue': 'Balise inconnue',
  'balisage/attribut-inconnu': 'Attribut inconnu, ignoré en silence',
  'balisage/attribut-retire': 'Attribut retiré',
  'balisage/id-manquant': 'Identifiant manquant : rien ne part vers l’aval',
  'balisage/amont-absent': 'Amont introuvable dans le code',
  'balisage/join-incomplet': 'Jointure incomplète',
  'balisage/id-duplique': 'Identifiant déclaré plusieurs fois',
  'balisage/aucune-balise': 'Aucune balise dsfr-data dans le code',
};

/** Geste proposé par code de règle d'analyse. */
const ACTIONS: Readonly<Record<string, string>> = {
  'balisage/attribut-inconnu': 'Corrigez le nom de l’attribut, ou retirez-le.',
  'balisage/attribut-retire': 'Remplacez l’attribut comme l’indique le message.',
  'balisage/id-manquant': 'Donnez un id à la balise et citez-le dans le source de l’aval.',
  'balisage/amont-absent': 'Citez l’id d’une balise présente dans le code, ou ajoutez-la.',
  'balisage/join-incomplet': 'Renseignez left ET right avec les id des deux sources.',
  'balisage/id-duplique': 'Donnez un id distinct à chaque balise.',
};

/**
 * Titre d'un constat carte (ou d'un code inconnu d'ici) : la première
 * proposition du message, sans point final.
 */
function titreDepuisMessage(message: string): string {
  let fin = message.length;
  for (const coupure of [' — ', ' : ', '. ']) {
    const i = message.indexOf(coupure);
    if (i > 0 && i < fin) fin = i;
  }
  const titre = message.slice(0, fin).trim();
  return titre.endsWith('.') ? titre.slice(0, -1) : titre;
}

function codeDans(etat: unknown): string | null {
  if (!etat || typeof etat !== 'object') return null;
  const code = (etat as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/** Ce qui est écrit dans le code, et où : la preuve d'un constat statique. */
function preuveDe(f: LintFinding): string {
  const balise = f.tag === 'id' || f.tag === '-' ? '' : `<${f.tag}${f.id ? ` id="${f.id}"` : ''}>`;
  const quoi = [
    balise,
    f.attribut ? `attribut ${f.attribut}` : '',
    f.tag === 'id' ? `id "${f.id}"` : '',
  ]
    .filter(Boolean)
    .join(', ');
  const ou = f.ligne !== undefined ? `Ligne ${f.ligne}` : 'Code entier';
  return quoi ? `${ou} : ${quoi}` : ou;
}

/** Projette un constat de l'analyseur en `Constat` du volet. */
export function constatDepuisLint(f: LintFinding): Constat {
  const regle = f.regle ?? ID_REGLE_BALISAGE;
  const position =
    f.ligne !== undefined
      ? `@${f.ligne}:${f.colonne ?? 1}${f.attribut ? `:${f.attribut}` : ''}`
      : '';
  const repere =
    f.ligne !== undefined
      ? repereCodeVersId({ ligne: f.ligne, tag: f.tag, attribut: f.attribut })
      : null;
  const c: Constat = {
    id: `${regle}${position}`,
    regle,
    gravite: f.severity === 'erreur' ? 'erreur' : 'avertissement',
    titre: TITRES[regle] ?? titreDepuisMessage(f.message),
    explication: f.message,
    reperes: repere ? [repere] : [],
    preuve: preuveDe(f),
  };
  const action = ACTIONS[regle];
  if (action) c.action = action;
  return c;
}

/** Constats statiques d'un code, dans l'ordre de l'analyseur. */
export function constatsDuBalisage(code: string, contrat: ComponentContract): Constat[] {
  if (!code.trim()) return [];
  return lintMarkup(code, contrat).map(constatDepuisLint);
}

/** Règle d'app : l'analyse statique du code courant du Playground. */
export function creerRegleBalisage(contrat: ComponentContract): RegleConstat {
  return {
    id: ID_REGLE_BALISAGE,
    appliesTo: ['playground'],
    evaluer(_trace, contexte: ContexteConstats): Constat[] {
      const code = codeDans(contexte.etat);
      return code === null ? [] : constatsDuBalisage(code, contrat);
    },
  };
}

/**
 * Contrat des composants : celui du serveur MCP, généré depuis
 * `packages/core/custom-elements.json` (`npm run build:component-contract`),
 * la même autorité que l'outil `lint_markup`.
 */
export const CONTRAT_COMPOSANTS = COMPONENT_CONTRACT as unknown as ComponentContract;

export const REGLE_BALISAGE: RegleConstat = creerRegleBalisage(CONTRAT_COMPOSANTS);
