/**
 * SPIKE #889 — module JETABLE, rien ici n'est destiné à `packages/`.
 *
 * Rendu d'une ligne de gabarit par CLONAGE DOM (`template.content`) au lieu
 * d'une substitution sur la chaîne `innerHTML` :
 * - `renderRow` clone le contenu du `<template>` en DocumentFragment, parcourt
 *   ses nœuds texte et ses attributs avec un TreeWalker, et applique le
 *   `renderTemplate` PARTAGÉ (template-expression.ts) à CHAQUE valeur — jamais
 *   à une chaîne sérialisée ;
 * - un `<template>` intérieur n'est pas parcouru : son `.content` n'est pas un
 *   enfant, le TreeWalker ne le voit pas ;
 * - `data-if-<attr>="champ"` / `data-unless-<attr>="champ"` posent ou retirent
 *   l'attribut booléen `<attr>` selon la vérité du champ (convention d'essai) ;
 * - les liaisons (`bindings`) sont conservées pour une mise à jour EN PLACE
 *   (`patchRow`) : même nœuds, seules les valeurs qui changent sont réécrites.
 */
import {
  renderTemplate,
  isTemplateTruthy,
  hasNestedTemplateBlocks,
} from '../../packages/core/src/utils/template-expression.ts';
import { getByPath } from '../../packages/core/src/utils/json-path.ts';

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
export type Binding = TextBinding | AttrBinding | BoolBinding;

export interface RenderedRow {
  fragment: DocumentFragment;
  /** Nœuds de premier niveau du fragment (le fragment se vide à l'insertion). */
  nodes: Node[];
  bindings: Binding[];
}

export interface RowRenderOptions {
  /** Autorise `{{{brut}}}` (valeur non échappée) — voir « Pertes » du spike. */
  raw?: boolean;
  origin?: string;
  /** Avertir quand un nœud texte porte une balise de bloc sans sa fermeture. */
  warnSplitBlocks?: boolean;
}

const IF_PREFIX = 'data-if-';
const UNLESS_PREFIX = 'data-unless-';

/**
 * `renderTemplate` produit du HTML (les `{{}}` sont échappés par `escapeHtml`).
 * Sur un nœud texte ou une valeur d'attribut, on veut du TEXTE : on ne
 * réencode que les cinq entités que `escapeHtml` produit. Dans un composant
 * réel, ce serait une option `escape: false` de `renderTemplate` (un seul
 * ajout dans template-expression.ts), pas un décodage a posteriori.
 */
function decodeEscaped(html: string): string {
  if (!html.includes('&')) return html;
  return html
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

const SPLIT_BLOCK_RE = /\{\{[#/](if|unless|each)\b/;
const BALANCED_BLOCK_RE = /\{\{#(if|unless|each)\s[^}]*\}\}[\s\S]*?\{\{\/\1\s*\}\}/;

function renderValue(
  tpl: string,
  item: Record<string, unknown>,
  vars: TemplateVars,
  opts: RowRenderOptions
): string {
  const html = renderTemplate(tpl, item, { raw: opts.raw ?? false, vars, origin: opts.origin });
  return decodeEscaped(html);
}

/** Collecte les liaisons d'un sous-arbre SANS entrer dans les `<template>`. */
export function collectBindings(root: Node): Binding[] {
  const out: Binding[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let n: Node | null = walker.nextNode();
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) {
      const text = n as Text;
      if (text.data.includes('{{')) out.push({ kind: 'text', node: text, tpl: text.data });
    } else {
      const el = n as Element;
      for (const attr of [...el.attributes]) {
        if (attr.name.startsWith(IF_PREFIX)) {
          out.push({
            kind: 'bool',
            el,
            name: attr.name.slice(IF_PREFIX.length),
            path: attr.value,
            negate: false,
          });
          el.removeAttribute(attr.name);
        } else if (attr.name.startsWith(UNLESS_PREFIX)) {
          out.push({
            kind: 'bool',
            el,
            name: attr.name.slice(UNLESS_PREFIX.length),
            path: attr.value,
            negate: true,
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

/** Applique (ou ré-applique) les liaisons : n'écrit que ce qui change. */
export function applyBindings(
  bindings: Binding[],
  item: Record<string, unknown>,
  vars: TemplateVars,
  opts: RowRenderOptions = {}
): number {
  let writes = 0;
  for (const b of bindings) {
    if (b.kind === 'text') {
      if (opts.warnSplitBlocks && SPLIT_BLOCK_RE.test(b.tpl) && !BALANCED_BLOCK_RE.test(b.tpl)) {
        console.warn(
          `${opts.origin ?? 'spike-repeat'}: balise de bloc sans fermeture dans le même nœud texte ` +
            `(« ${b.tpl.trim().slice(0, 60)} ») — un bloc qui englobe des éléments frères n'est pas ` +
            `une pré-passe textuelle ; la balise sera vidée et le contenu toujours rendu.`
        );
      }
      const value = renderValue(b.tpl, item, vars, opts);
      if (b.node.data !== value) {
        b.node.data = value;
        writes++;
      }
    } else if (b.kind === 'attr') {
      const value = renderValue(b.tpl, item, vars, opts);
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
 * Rend une ligne : clone HORS document, interpole, puis rend le fragment.
 * Les attributs sont résolus AVANT toute insertion : une `dsfr-data-query`
 * dont l'`id` vaut encore `q-{{code}}` ne doit jamais se connecter.
 */
export function renderRow(
  template: HTMLTemplateElement,
  item: Record<string, unknown>,
  vars: TemplateVars,
  opts: RowRenderOptions = {}
): RenderedRow {
  const fragment = document.importNode(template.content, true);
  const bindings = collectBindings(fragment);
  applyBindings(bindings, item, vars, opts);
  return { fragment, nodes: [...fragment.childNodes], bindings };
}

/** Rendu de référence : substitution sur la chaîne, comme `dsfr-data-display`. */
export function renderRowHtml(
  templateHtml: string,
  item: Record<string, unknown>,
  vars: TemplateVars,
  opts: RowRenderOptions = {}
): string {
  return renderTemplate(templateHtml, item, { raw: opts.raw ?? true, vars, origin: opts.origin });
}

export { hasNestedTemplateBlocks };
