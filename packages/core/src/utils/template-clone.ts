import { renderTemplate, isTemplateTruthy } from './template-expression.js';
import { getByPath } from './json-path.js';

/**
 * Rendu d'un gabarit par CLONAGE DOM (#889, #890) — le moteur de sortie de
 * `dsfr-data-repeat`, à côté du rendu par chaîne de `dsfr-data-display` et
 * `dsfr-data-map-popup`.
 *
 * Même grammaire, même `renderTemplate` : la différence est la SORTIE. Ici le
 * contenu du `<template>` est cloné en `DocumentFragment` et les placeholders
 * sont résolus nœud par nœud — dans `Text.data` et dans chaque valeur
 * d'attribut, jamais sur une chaîne sérialisée. Trois propriétés en découlent,
 * toutes vérifiées en vrai navigateur par le spike #889 :
 *
 * - **un `<template>` intérieur n'est pas parcouru** : son `.content` n'est
 *   pas un enfant, le `TreeWalker` ne le voit pas — l'imbrication vient du
 *   mécanisme, sans échappement de `{{` ;
 * - **les attributs sont résolus AVANT l'insertion** : le clone est rehaussé
 *   dès `importNode` (constructeur exécuté) mais aucun composant dsfr-data ne
 *   s'abonne avant `connectedCallback` (#281) — une `dsfr-data-query
 *   id="q-{{code}}"` n'existe jamais dans le document sous son placeholder ;
 * - **les liaisons survivent au rendu** : une ligne dont la clé subsiste est
 *   mise à jour EN PLACE (`applyRowBindings`), ses nœuds — et les instances
 *   qu'ils portent — restent les mêmes objets.
 *
 * Ce que ce rendu ne sait pas faire, et dit : `{{{brut}}}` n'a pas de sens
 * sur un nœud texte (rendu échappé, avertissement une fois par gabarit,
 * côté composant) ; un bloc `{{#if}}` dont l'ouverture et la fermeture ne
 * sont pas dans le MÊME nœud texte ne peut pas englober des éléments —
 * chaque balise serait un placeholder ordinaire, vidé sans erreur :
 * `hasSplitBlock` le détecte, le composant en fait une erreur de configuration.
 *
 * Attributs booléens conditionnels : `data-if-<attr>="chemin"` pose `<attr>`
 * quand la valeur est vraie (`isTemplateTruthy`) et le retire sinon ;
 * `data-unless-<attr>` l'inverse. L'attribut de convention est retiré du
 * clone. Le préfixe `data-` est ignoré par `checkUnknownAttributes` et valide
 * sur tout élément.
 */

export type TemplateVars = Record<string, () => string>;

interface TextBinding {
  kind: 'text';
  node: Text;
  tpl: string;
}
interface AttrBinding {
  kind: 'attr';
  el: Element;
  name: string;
  tpl: string;
}
interface BoolBinding {
  kind: 'bool';
  el: Element;
  name: string;
  path: string;
  negate: boolean;
}
export type RowBinding = TextBinding | AttrBinding | BoolBinding;

export interface RowRenderOptions {
  /** Nommé dans les diagnostics (ex. `dsfr-data-repeat[questions]`). */
  origin?: string;
}

export interface RenderedRow {
  fragment: DocumentFragment;
  bindings: RowBinding[];
}

const IF_PREFIX = 'data-if-';
const UNLESS_PREFIX = 'data-unless-';

const BLOCK_TAG_RE = /\{\{[#/](if|unless|each)\b/;
const BALANCED_BLOCKS_RE = /\{\{#(if|unless|each)\s[^}]*\}\}[\s\S]*?\{\{\/\1\s*\}\}/g;

/** Un nœud texte a-t-il une balise de bloc sans son pendant dans le même nœud ? */
export function hasSplitBlock(text: string): boolean {
  if (!BLOCK_TAG_RE.test(text)) return false;
  // Retirer les blocs complets ; s'il reste une balise, elle est orpheline.
  return BLOCK_TAG_RE.test(text.replace(BALANCED_BLOCKS_RE, ''));
}

/**
 * Collecte les liaisons d'un sous-arbre SANS entrer dans les `<template>`
 * qu'il contient. Les attributs `data-if-*` / `data-unless-*` sont consommés.
 */
export function collectRowBindings(root: Node): RowBinding[] {
  const out: RowBinding[] = [];
  const doc = root.ownerDocument ?? document;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let n: Node | null = walker.nextNode();
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) {
      const text = n as Text;
      if (text.data.includes('{{')) out.push({ kind: 'text', node: text, tpl: text.data });
    } else {
      const el = n as Element;
      for (const attr of Array.from(el.attributes)) {
        if (attr.name.startsWith(IF_PREFIX) || attr.name.startsWith(UNLESS_PREFIX)) {
          const negate = attr.name.startsWith(UNLESS_PREFIX);
          out.push({
            kind: 'bool',
            el,
            name: attr.name.slice(negate ? UNLESS_PREFIX.length : IF_PREFIX.length),
            path: attr.value.trim(),
            negate,
          });
          el.removeAttribute(attr.name);
        } else if (attr.value.includes('{{')) {
          out.push({ kind: 'attr', el, name: attr.name, tpl: attr.value });
        }
      }
    }
    n = walker.nextNode();
  }
  return out;
}

/**
 * Applique — ou ré-applique — les liaisons d'une ligne pour un enregistrement.
 * N'écrit que ce qui change : une ligne inchangée ne touche pas le DOM.
 * Retourne le nombre d'écritures.
 */
export function applyRowBindings(
  bindings: RowBinding[],
  item: Record<string, unknown>,
  vars: TemplateVars,
  origin?: string
): number {
  let writes = 0;
  const render = (tpl: string): string =>
    renderTemplate(tpl, item, { escape: false, vars, origin });
  for (const b of bindings) {
    if (b.kind === 'text') {
      const value = render(b.tpl);
      if (b.node.data !== value) {
        b.node.data = value;
        writes++;
      }
    } else if (b.kind === 'attr') {
      const value = render(b.tpl);
      if (b.el.getAttribute(b.name) !== value) {
        b.el.setAttribute(b.name, value);
        writes++;
      }
    } else {
      const truthy = isTemplateTruthy(getByPath(item, b.path)) !== b.negate;
      const has = b.el.hasAttribute(b.name);
      if (truthy && !has) {
        b.el.setAttribute(b.name, '');
        writes++;
      } else if (!truthy && has) {
        b.el.removeAttribute(b.name);
        writes++;
      }
    }
  }
  return writes;
}

/**
 * Rend une ligne : clone du `<template>` HORS document, liaisons collectées,
 * valeurs résolues, puis fragment prêt à insérer. Rien ne touche le document
 * avant que tous les attributs soient résolus.
 */
export function renderTemplateRow(
  template: HTMLTemplateElement,
  item: Record<string, unknown>,
  vars: TemplateVars,
  options: RowRenderOptions = {}
): RenderedRow {
  const doc = template.ownerDocument ?? document;
  const fragment = doc.importNode(template.content, true);
  const bindings = collectRowBindings(fragment);
  applyRowBindings(bindings, item, vars, options.origin);
  return { fragment, bindings };
}
