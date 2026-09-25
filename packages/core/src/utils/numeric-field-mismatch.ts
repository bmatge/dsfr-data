/**
 * Un filtre de contexte compare une CHAÎNE à un champ que la source publie
 * en NOMBRE (#924, PG-030).
 *
 * Un `dsfr-data-context-filter` lit une valeur de formulaire — toujours du
 * texte — et l'émet telle quelle : `reg = "01"`. Le portail Opendatasoft
 * compare alors en texte, et « 01 » ne rencontre jamais l'entier 1 : le
 * KPI affiche « — », sans erreur ni ligne de console. Le `refine` du portail,
 * lui, suit le type déclaré du champ et trouvait la ligne.
 *
 * Seules les valeurs dont la forme TEXTE diffère de leur forme NUMÉRIQUE
 * sont touchées : « 01 », « 007 ». « 75 » passe — ce qui cache le défaut,
 * puisque toutes les régions métropolitaines et les départements 10 à 95
 * fonctionnent. Ne restent muettes que la Guadeloupe (01), la Martinique
 * (02), la Guyane (03), La Réunion (04), Mayotte (06) et les neuf premiers
 * départements.
 *
 * CE QUI NE CHANGE PAS. La clause émise est exactement celle d'avant :
 * émettre un littéral numérique, ou basculer l'égalité sur `refine`,
 * changerait la requête de pages qui fonctionnent aujourd'hui (les deux
 * autres critères de #924, écartés). Ici on se contente de rompre le silence.
 *
 * D'OÙ VIENT LE TYPE. D'abord des lignes DÉJÀ ÉMISES par la source
 * (`getDataCache`), même source de vérité que le garde-fou « champ absent »
 * (#805/#938) : une valeur JSON numérique vient d'un champ numérique. Quand
 * une ligne porte une chaîne, ou que le champ est hétérogène, ON SE TAIT —
 * un avertissement qui crie à tort est pire que pas d'avertissement.
 *
 * Mais les lignes ne portent pas toujours le champ (#980, PG-030) : une
 * source agrégée côté serveur (`select=sum(nb_missions) as m`) ne ramène que
 * `m`, et le filtre est DÉLÉGUÉ au serveur sans aucune comparaison locale. Le
 * montage le plus courant — un KPI agrégé filtré par région — restait donc
 * muet. Dans ce cas, et dans ce cas seulement, on lit le type DÉCLARÉ par le
 * jeu (`describeFieldTypes` de l'adaptateur), une fois par jeu, après
 * l'émission de la clause. L'adaptateur rend un type NORMALISÉ (#1138) :
 * ce module ne connaît aucun type de fournisseur.
 */

import { splitColonFields, unescapeColonValue } from '@dsfr-data/shared/lib';
import { getDataCache } from './data-bridge.js';
import type { AdapterParams, ApiAdapter, FieldKind } from '../adapters/api-adapter.js';

/** Situations déjà signalées : un message par champ et par source. */
const warned = new Set<string>();

/** Lectures de type déclaré en cours : pas deux pour la même situation. */
const pending = new Set<string>();

/** Remet à zéro la mémoire des avertissements (tests). */
export function resetNumericFieldMismatchWarnings(): void {
  warned.clear();
  pending.clear();
}

/**
 * La valeur comparée ne survivrait pas à l'aller-retour texte ↔ nombre.
 *
 * `String(Number(v)) !== v` est le test exact du piège : « 01 » → 1 → « 1 »
 * (le portail ne trouve rien), là où « 75 » → 75 → « 75 » (il trouve). On
 * s'en tient aux entiers écrits en chiffres, pour ne rien dire sur une
 * valeur dont le sens numérique serait discutable.
 */
function looksLikeLostLeadingZero(value: string): boolean {
  if (!/^[+-]?\d+$/.test(value)) return false;
  const n = Number(value);
  return Number.isFinite(n) && String(n) !== value;
}

/** Ce que les lignes déjà émises disent du champ. */
type Observed =
  /** Au moins un nombre, aucune chaîne : publié en NOMBRE, à coup sûr. */
  | { kind: 'number'; sample: number }
  /** Une chaîne, ou un mélange : on sait qu'il ne faut rien dire. */
  | { kind: 'other' }
  /** Aucune ligne ne porte le champ : les lignes ne disent rien (#980). */
  | { kind: 'unknown' };

/**
 * Le champ est-il publié en NOMBRE par cette source, à coup sûr ?
 *
 * `number` seulement si au moins une ligne y porte un nombre et qu'aucune
 * n'y porte une chaîne : un champ hétérogène (JSON générique, données
 * inline) ne dit rien de sûr, et le doute se résout par le silence.
 * `unknown` quand aucune ligne ne porte le champ — source agrégée côté
 * serveur, ou qui n'a encore rien rendu : c'est là seulement qu'on consulte
 * le type déclaré du jeu (#980).
 */
function observeField(sourceId: string, field: string): Observed {
  const data = getDataCache(sourceId);
  if (!Array.isArray(data)) return { kind: 'unknown' };
  const rows = data as Record<string, unknown>[];
  let sample: number | null = null;
  for (const row of rows) {
    if (!row || typeof row !== 'object' || !(field in row)) continue;
    const v = row[field];
    if (v === null || v === undefined) continue;
    if (typeof v === 'string') return { kind: 'other' };
    if (typeof v === 'number' && Number.isFinite(v)) {
      if (sample === null) sample = v;
      continue;
    }
    return { kind: 'other' };
  }
  return sample === null ? { kind: 'unknown' } : { kind: 'number', sample };
}

/** Ce dont la lecture du type déclaré a besoin sur l'élément source. */
interface SourceWithDeclaredTypes extends HTMLElement {
  getAdapter?: () => Pick<ApiAdapter, 'describeFieldTypes'> | null;
  getAdapterParams?: () => AdapterParams | null;
}

/**
 * Type déclaré du champ par le jeu de la source (#980), ou null si
 * l'adaptateur ne sait pas le dire. Les paramètres viennent de
 * `getAdapterParams()` (headers et api-key-ref résolus, #274), jamais des
 * attributs DOM.
 */
async function declaredType(sourceId: string, field: string): Promise<FieldKind | null> {
  const el = document.getElementById(sourceId) as SourceWithDeclaredTypes | null;
  const adapter = el?.getAdapter?.();
  if (!adapter?.describeFieldTypes) return null;
  const params = el?.getAdapterParams?.();
  if (!params?.datasetId) return null;
  const types = (await adapter.describeFieldTypes?.(params)) ?? {};
  return types[field] ?? null;
}

/** Les valeurs comparées par une clause colon, par champ, pour `eq`/`neq`/`in`. */
function equalityValues(colonWhere: string): Map<string, string[]> {
  const byField = new Map<string, string[]>();
  for (const clause of colonWhere.split(',')) {
    const part = clause.trim();
    if (!part) continue;
    const [field, op, raw] = part.split(':');
    if (!field || !op || raw === undefined) continue;
    if (op !== 'eq' && op !== 'neq' && op !== 'in') continue;
    const values = (op === 'in' ? raw.split('|') : [raw]).map(unescapeColonValue).filter(Boolean);
    // Champs multiples (#1026) : `a|b:eq:v` compare v a chacun des champs
    for (const one of splitColonFields(field)) {
      const list = byField.get(one);
      if (list) list.push(...values);
      else byField.set(one, [...values]);
    }
  }
  return byField;
}

/** Le message, identique sur les deux chemins ; seule la preuve du type change. */
function warnMismatch(field: string, culprit: string, sourceId: string, evidence: string): void {
  console.warn(
    `dsfr-data-context-filter (${field}) : la valeur "${culprit}" est comparée en TEXTE, ` +
      `alors que la source "${sourceId}" publie "${field}" en NOMBRE (${evidence}) — ` +
      `aucune ligne ne correspondra, sans erreur, là où une comparaison en nombre trouvait. ` +
      `Seuls les codes à zéro de tête sont touchés ("75" passe, "01" non), ce qui cache ` +
      `le défaut. Alimenter ce filtre avec la valeur sans zéro de tête ("${Number(culprit)}"), ` +
      `ou réserver ce filtre aux sources qui publient le code en texte avec apply-to.`
  );
}

/**
 * Signale, une fois par champ et par source, une comparaison texte sur un
 * champ que la source publie en nombre. Nomme le champ, la valeur émise, le
 * type (un exemple de la donnée, ou le type déclaré par le jeu) et le geste
 * qui sort du piège.
 *
 * DEUX PREUVES DU TYPE, UN SEUL MESSAGE (#980, PG-030).
 * 1. Les lignes déjà émises par la source, quand elles portent le champ
 *    (chemin synchrone de #948) : elles décident seules, y compris pour se
 *    taire (champ en texte, hétérogène) — aucune requête dans ce cas.
 * 2. Sinon, le type DÉCLARÉ par le jeu (`describeFieldTypes`) : filtre
 *    délégué à une source agrégée côté serveur, dont la réponse ne ramène
 *    jamais la colonne, ou tout premier chargement, avant toute ligne.
 * La clause est émise par l'appelant sans attendre : la lecture du type n'en
 * change rien. La promesse rendue se résout quand les lectures de type sont
 * terminées (tests) ; l'appelant n'a pas à l'attendre.
 */
export function checkNumericFieldMismatch(sourceId: string, colonWhere: string): Promise<void> {
  if (!colonWhere) return Promise.resolve();
  const lookups: Promise<void>[] = [];
  for (const [field, values] of equalityValues(colonWhere)) {
    const culprit = values.find(looksLikeLostLeadingZero);
    if (culprit === undefined) continue;
    const key = `${field}@${sourceId}`;
    if (warned.has(key) || pending.has(key)) continue;
    const observed = observeField(sourceId, field);
    if (observed.kind === 'number') {
      warned.add(key);
      warnMismatch(field, culprit, sourceId, `ex. ${observed.sample}`);
      continue;
    }
    if (observed.kind === 'other') continue;
    pending.add(key);
    // Différé d'une microtâche : la commande de l'appelant part AVANT la
    // lecture du type, l'observation des lignes, elle, a eu lieu avant.
    lookups.push(
      Promise.resolve()
        .then(() => declaredType(sourceId, field))
        .then((type) => {
          // Seul un type NOMBRE parle ; date, booléen, texte : on se tait
          if (type !== 'number' || warned.has(key)) return;
          warned.add(key);
          warnMismatch(field, culprit, sourceId, 'type nombre déclaré par le jeu');
        })
        .catch(() => undefined)
        .finally(() => pending.delete(key))
    );
  }
  return Promise.all(lookups).then(() => undefined);
}
