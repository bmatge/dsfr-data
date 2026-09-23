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
 * autres critères de #924, laissés ouverts). Ici on se contente de rompre
 * le silence.
 *
 * D'OÙ VIENT LE TYPE. D'aucun schéma : rien dans `packages/core` ne lit
 * `/datasets/<id>` pour les types de champs — l'adaptateur Opendatasoft ne
 * le fait que dans `discoverFacets`, pour les seules facettes déclarées, et
 * seulement pour savoir si un champ est une date. Le type utilisé ici est
 * donc celui des lignes DÉJÀ ÉMISES par la source (`getDataCache`), même
 * source de vérité que le garde-fou « champ absent » (#805/#938). C'est un
 * fait observé, pas une heuristique : une valeur JSON numérique vient d'un
 * champ numérique. Quand la source n'a rien émis, ou que le champ est absent
 * de ses lignes, ou qu'il y porte une chaîne, ON SE TAIT — un avertissement
 * qui crie à tort est pire que pas d'avertissement.
 */

import { splitColonFields, unescapeColonValue } from '@dsfr-data/shared/lib';
import { getDataCache } from './data-bridge.js';

/** Situations déjà signalées : un message par champ et par source. */
const warned = new Set<string>();

/** Remet à zéro la mémoire des avertissements (tests). */
export function resetNumericFieldMismatchWarnings(): void {
  warned.clear();
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

/**
 * Le champ est-il publié en NOMBRE par cette source, à coup sûr ?
 *
 * `true` seulement si au moins une ligne y porte un nombre et qu'aucune n'y
 * porte une chaîne : un champ hétérogène (JSON générique, données inline)
 * ne dit rien de sûr, et le doute se résout par le silence.
 */
function fieldIsNumericOn(sourceId: string, field: string): number | null {
  const data = getDataCache(sourceId);
  if (!Array.isArray(data)) return null;
  const rows = data as Record<string, unknown>[];
  let sample: number | null = null;
  for (const row of rows) {
    if (!row || typeof row !== 'object' || !(field in row)) continue;
    const v = row[field];
    if (v === null || v === undefined) continue;
    if (typeof v === 'string') return null;
    if (typeof v === 'number' && Number.isFinite(v)) {
      if (sample === null) sample = v;
      continue;
    }
    return null;
  }
  return sample;
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

/**
 * Signale, une fois par champ et par source, une comparaison texte sur un
 * champ que la source publie en nombre. Nomme le champ, la valeur émise, le
 * type observé (avec un exemple de la donnée) et le geste qui sort du piège.
 */
export function checkNumericFieldMismatch(sourceId: string, colonWhere: string): void {
  if (!colonWhere) return;
  for (const [field, values] of equalityValues(colonWhere)) {
    const culprit = values.find(looksLikeLostLeadingZero);
    if (culprit === undefined) continue;
    const key = `${field}@${sourceId}`;
    if (warned.has(key)) continue;
    const sample = fieldIsNumericOn(sourceId, field);
    if (sample === null) continue;
    warned.add(key);
    console.warn(
      `dsfr-data-context-filter (${field}) : la valeur "${culprit}" est comparée en TEXTE, ` +
        `alors que la source "${sourceId}" publie "${field}" en NOMBRE (ex. ${sample}) — ` +
        `aucune ligne ne correspondra, sans erreur, là où le refine du portail trouvait. ` +
        `Seuls les codes à zéro de tête sont touchés ("75" passe, "01" non), ce qui cache ` +
        `le défaut. Alimenter ce filtre avec la valeur sans zéro de tête ("${Number(culprit)}"), ` +
        `ou réserver ce filtre aux sources qui publient le code en texte avec apply-to.`
    );
  }
}
