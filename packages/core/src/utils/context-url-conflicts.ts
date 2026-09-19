/**
 * Conflits de paramètres d'URL entre DEUX `dsfr-data-context url-sync` (#922).
 *
 * `facets-url.ts` signale déjà le conflit entre une facette AUTONOME et un
 * contexte (#773). Rien ne disait le cas symétrique : deux contextes à
 * `url-sync` qui portent un filtre sur le MÊME champ écrivent le même
 * paramètre, et le second écrase celui du premier — l'URL ne garde alors
 * qu'une valeur pour deux contextes. Rechargée, elle fait relire cette
 * unique valeur aux deux : un comparateur de territoires se compare à
 * lui-même, sans un mot.
 *
 * Cet avertissement est PUREMENT ADDITIF : aucune URL écrite, aucun ordre
 * d'application, aucun comportement ne change. Désambiguïser les paramètres
 * casserait les liens déjà partagés ; ici on se contente de rompre le
 * silence.
 *
 * Vue STRUCTURELLE sur le contexte (`getUrlParamNames`, attribut
 * `url-param-map`), sans importer son module — même précaution que #681.
 */

interface ContextUrlView extends HTMLElement {
  getUrlParamNames?: () => string[];
}

/** Situations déjà signalées : un message par paramètre et par jeu de contextes. */
const warned = new Set<string>();

/** Un seul balayage par tour de microtâche, quel que soit le nombre de filtres. */
let scheduled = false;

/** Remet à zéro la mémoire des avertissements (tests). */
export function resetContextUrlConflictWarnings(): void {
  warned.clear();
  scheduled = false;
}

/** Étiquette lisible d'un contexte : son id, sinon sa place dans le document. */
function labelOf(el: Element, index: number): string {
  return el.id ? `"${el.id}"` : `sans id (${index + 1}${index === 0 ? 'er' : 'e'} du document)`;
}

/** Champ d'origine d'un paramètre, en relisant `url-param-map` ("param:champ | ...") */
function fieldBehind(el: Element, param: string): string {
  const raw = el.getAttribute('url-param-map') ?? '';
  for (const pair of raw.split('|')) {
    const [name, field] = pair.split(':').map((s) => s.trim());
    if (name === param && field) return field;
  }
  return param;
}

/**
 * Balaie la page : un paramètre d'URL réclamé par deux contextes `url-sync`
 * est signalé une fois, en nommant les deux contextes, le paramètre, et le
 * geste qui sort du piège.
 */
export function scanContextUrlParamConflicts(): void {
  const contexts = [...document.querySelectorAll('dsfr-data-context')] as ContextUrlView[];
  if (contexts.length < 2) return;

  const owners = new Map<string, number[]>();
  contexts.forEach((el, index) => {
    for (const name of el.getUrlParamNames?.() ?? []) {
      const list = owners.get(name);
      if (list) list.push(index);
      else owners.set(name, [index]);
    }
  });

  for (const [param, indexes] of owners) {
    if (indexes.length < 2) continue;
    const key = `${param}|${indexes.map((i) => contexts[i].id || `#${i}`).join('|')}`;
    if (warned.has(key)) continue;
    warned.add(key);
    const labels = indexes.map((i) => labelOf(contexts[i], i));
    const field = fieldBehind(contexts[indexes[1]], param);
    console.warn(
      `dsfr-data-context : le paramètre d'URL "${param}" est écrit par ${indexes.length} contextes ` +
        `url-sync (${labels.join(', ')}) — le dernier écrase les autres, et au rechargement ils ` +
        `relisent tous la même valeur (un comparateur se compare alors à lui-même). ` +
        `Un seul contexte dans l'URL : retirer url-sync des autres, ou renommer leur paramètre ` +
        `avec url-param-map="cmp_${field}:${field}".`
    );
  }
}

/** Programme un balayage, coalescé sur le tour de microtâche courant. */
export function scheduleContextUrlParamConflictScan(): void {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    scanContextUrlParamConflicts();
  });
}

/**
 * Couples (filtre pré-rempli, filtre déjà lié au même contrôle) déjà
 * signalés (#923) — un message par situation, pas un par montage ni un par
 * événement.
 */
const staleWarned = new Set<string>();

/** Remet à zéro la mémoire des avertissements d'ordre de déclaration (tests). */
export function resetStaleSiblingWarnings(): void {
  staleWarned.clear();
}

/**
 * Deux contextes sur un même contrôle : le pré-remplissage est arrivé trop
 * tard pour l'un d'eux (#923).
 *
 * Un filtre lit la valeur de son contrôle À SON MONTAGE, et le
 * pré-remplissage depuis l'URL (ou `default`) écrit `el.value` SANS émettre
 * d'événement. Un filtre lié au même contrôle AVANT ce pré-remplissage reste
 * donc sur la valeur initiale : deux pages identiques à l'ordre de
 * déclaration près répondent deux choses différentes sur la même URL, avec
 * le même affichage.
 *
 * Émettre un `change` corrigerait le fond, mais changerait l'ordre
 * d'application de toutes les pages qui marchent : hors périmètre. On nomme
 * le contrôle, les deux filtres et le geste qui sort du piège.
 */
export function warnStaleSiblingFilter(info: {
  field: string;
  controlId: string;
  otherField: string;
  otherContextId: string;
  origin: 'URL' | 'default';
}): void {
  const key = `${info.field}@${info.controlId || '?'}>${info.otherField}@${info.otherContextId}`;
  if (staleWarned.has(key)) return;
  staleWarned.add(key);
  const source = info.origin === 'URL' ? "l'URL" : 'l\'attribut "default"';
  const other = info.otherContextId ? `contexte "${info.otherContextId}"` : 'contexte sans id';
  console.warn(
    `dsfr-data-context-filter (${info.field}) : le contrôle "#${info.controlId}" a été ` +
      `pré-rempli depuis ${source} APRÈS avoir déjà été lu par le filtre "${info.otherField}" ` +
      `(${other}) — ce filtre-là reste sur la valeur initiale du contrôle, alors que ` +
      `l'interface affiche la nouvelle. Déclarer le contexte à url-sync EN PREMIER dans ` +
      `le document.`
  );
}
