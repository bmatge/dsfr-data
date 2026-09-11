import { getByPath } from './json-path.js';
import { escapeHtml, formatDate } from '@dsfr-data/shared/lib';

/**
 * Moteur de templates `{{...}}` partagé entre dsfr-data-display et
 * dsfr-data-map-popup (#426, épic #694).
 *
 * Grammaire d'une expression : `chemin[:format[:arg]][|défaut]`
 * - `chemin` / `chemin.sous.clé` : accès (imbriqué) à la valeur
 * - `:format`                    : `number`, `date`, `datetime`, `join`, `url`
 * - `:format:arg`                : argument du format, séparé par un second `:`
 *                                  (`number:2` décimales, `join: / ` séparateur)
 * - `|défaut`                    : fallback si null/undefined
 *
 * Limite documentée : `|` est interdit dans l'argument (il ouvre le défaut),
 * `}` est interdit partout (il ferme le placeholder).
 *
 * Blocs, non imbriqués : `{{#if chemin}}…{{/if}}`, `{{#unless chemin}}…{{/unless}}`
 * et `{{#each chemin}}…{{/each}}` (répétition sur un champ tableau, #737).
 * Ils sont résolus par une pré-passe sur le texte du template, AVANT la
 * substitution des placeholders : une valeur substituée n'est jamais
 * rescannée (pas d'injection de template en cascade).
 *
 * Les variables spéciales (`$index`, `$uid`...) sont fournies par l'appelant
 * via `vars` — résolues avant toute autre interprétation. La pré-passe
 * `{{#each}}` en ajoute une par élément rendu : les valeurs d'élément
 * n'entrent JAMAIS dans le texte du template, elles restent des variables
 * résolues (et échappées) à la substitution.
 */

/** Expression décomposée selon la grammaire `chemin[:format[:arg]][|défaut]`. */
export interface ParsedTemplateExpression {
  /** Chemin (éventuellement imbriqué) de la valeur, trimé. */
  path: string;
  /** Nom du format, trimé (chaîne vide si absent). */
  format: string;
  /** Argument du format, tel quel (espaces conservés) ; undefined si absent. */
  arg: string | undefined;
  /** Valeur de repli si la donnée est null/undefined, trimée. */
  defaultValue: string;
}

/**
 * Découpe une expression selon la grammaire commune. L'argument n'est pas
 * trimé : `tags:join: / ` conserve les espaces de son séparateur.
 */
export function parseTemplateExpression(expr: string): ParsedTemplateExpression {
  let head = expr;
  let defaultValue = '';
  const pipeIndex = expr.indexOf('|');
  if (pipeIndex !== -1) {
    head = expr.substring(0, pipeIndex);
    defaultValue = expr.substring(pipeIndex + 1).trim();
  }

  let path = head;
  let format = '';
  let arg: string | undefined;
  const colonIndex = head.indexOf(':');
  if (colonIndex !== -1) {
    path = head.substring(0, colonIndex);
    const formatPart = head.substring(colonIndex + 1);
    const argIndex = formatPart.indexOf(':');
    if (argIndex !== -1) {
      format = formatPart.substring(0, argIndex).trim();
      arg = formatPart.substring(argIndex + 1);
    } else {
      format = formatPart.trim();
    }
  }

  return { path: path.trim(), format, arg, defaultValue };
}

/**
 * Résout une expression `{{...}}` pour un enregistrement donné. Un tableau
 * sans format est joint par `, ` (#663).
 */
export function resolveTemplateExpression(
  item: Record<string, unknown>,
  expr: string,
  vars?: Record<string, () => string>
): string {
  const trimmed = expr.trim();
  if (vars && Object.prototype.hasOwnProperty.call(vars, trimmed)) {
    return vars[trimmed]();
  }

  const { path, format, arg, defaultValue } = parseTemplateExpression(expr);

  const value = getByPath(item, path);
  if (value === null || value === undefined) return defaultValue;

  return formatTemplateValue(value, format, arg);
}

/** Schémas d'URL autorisés par le pipe `:url` (comparaison insensible à la casse). */
const SAFE_URL_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:'];

/**
 * Pipe `:url` (#664, sécurité) : ne laisse passer qu'une URL dont le schéma
 * est `http:`, `https:`, `mailto:` ou `tel:`, ou une URL relative sans schéma
 * (`/page`, `#ancre`, `?q=`, `fiche.html`). Tout autre schéma
 * (`javascript:`, `data:`, `vbscript:`…) rend une chaîne vide.
 *
 * Les caractères de contrôle et espaces ASCII sont ignorés pour détecter le
 * schéma (les navigateurs les retirent : `java\nscript:` serait exécuté).
 */
export function sanitizeTemplateUrl(value: unknown): string {
  const url = String(value).trim();
  if (!url) return '';
  // eslint-disable-next-line no-control-regex -- retrait volontaire des caractères de contrôle
  const probe = url.replace(/[\u0000-\u0020\u007f]/g, '');
  const schemeMatch = /^([a-z][a-z0-9+.-]*:)/i.exec(probe);
  if (!schemeMatch) return url;
  return SAFE_URL_SCHEMES.includes(schemeMatch[1].toLowerCase()) ? url : '';
}

function toDate(value: unknown): Date | string {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  return String(value);
}

/**
 * Applique un format à une valeur. Formats supportés :
 * - `number[:décimales]` : fr-FR, séparateur de milliers (non-numérique inchangé)
 * - `date`               : JJ/MM/AAAA, « — » si invalide
 * - `datetime`           : JJ/MM/AAAA HH:MM, « — » si invalide
 * - `join[:séparateur]`  : jonction d'un tableau (défaut `, `)
 * - `url`                : liste blanche de schémas, sinon chaîne vide
 * Sans format, un tableau est joint par `, ` ; sinon `String(value)`.
 */
export function formatTemplateValue(value: unknown, format: string, arg?: string): string {
  switch (format) {
    case 'number': {
      const num = typeof value === 'number' ? value : parseFloat(String(value));
      if (!isNaN(num)) {
        const decimals = arg !== undefined ? parseInt(arg, 10) : NaN;
        return Number.isInteger(decimals) && decimals >= 0
          ? num.toLocaleString('fr-FR', {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            })
          : num.toLocaleString('fr-FR');
      }
      break;
    }
    case 'date':
      return formatDate(toDate(value));
    case 'datetime': {
      const raw = toDate(value);
      const date = typeof raw === 'string' ? new Date(raw) : raw;
      if (isNaN(date.getTime())) return '—';
      return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    }
    case 'join':
      if (Array.isArray(value)) return value.join(arg || ', ');
      break;
    case 'url':
      return sanitizeTemplateUrl(value);
  }
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

/**
 * Vérité d'un bloc `{{#if}}` : faux pour null, undefined, `''`, `[]` et `false`
 * (un booléen faux ne doit pas ouvrir un bloc « si »).
 */
export function isTemplateTruthy(value: unknown): boolean {
  if (value === null || value === undefined || value === '' || value === false) return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

const BLOCK_RE = /\{\{#(if|unless|each)\s+([^}]+?)\s*\}\}([\s\S]*?)\{\{\/\1\s*\}\}/g;

const PLACEHOLDER_RE = /\{\{\{([^}]+)\}\}\}|\{\{([^}]+)\}\}/g;

/**
 * Éléments parcourus par un bloc `{{#each}}` (#737). Mêmes règles que les
 * facettes et que l'éclatement de `dsfr-data-query` : les éléments vides sont
 * ignorés, une cellule vide ne rend rien, un scalaire vaut un élément unique.
 */
function eachValuesOf(value: unknown): unknown[] {
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value)) {
    return value.filter((v) => v !== null && v !== undefined && v !== '');
  }
  return [value];
}

/**
 * Développe UNE itération d'un bloc `{{#each}}` (#737) : les placeholders qui
 * désignent l'élément courant (`{{.}}`, `{{.:format}}`, `{{$index}}`) sont
 * remplacés dans le TEXTE par une variable unique, et la valeur elle-même est
 * déposée dans `vars`. La donnée n'entre donc jamais dans le template — elle
 * est résolue, et échappée, par la passe de substitution. Les autres
 * placeholders (champs de l'enregistrement) sont laissés tels quels.
 */
function expandEachIteration(
  body: string,
  value: unknown,
  index: number,
  vars: Record<string, () => string>
): string {
  return body.replace(
    PLACEHOLDER_RE,
    (match, rawExpr: string | undefined, escExpr: string | undefined) => {
      const expr = (rawExpr ?? escExpr) as string;
      let resolve: (() => string) | null = null;

      if (expr.trim() === '$index') {
        resolve = () => String(index);
      } else {
        const parsed = parseTemplateExpression(expr);
        if (parsed.path === '.') {
          resolve = () =>
            value === null || value === undefined
              ? parsed.defaultValue
              : formatTemplateValue(value, parsed.format, parsed.arg);
        }
      }
      if (!resolve) return match;

      const name = `$each${Object.keys(vars).length}`;
      vars[name] = resolve;
      return rawExpr !== undefined ? `{{{${name}}}}` : `{{${name}}}`;
    }
  );
}

/**
 * Pré-passe des blocs `{{#if chemin}}…{{/if}}`, `{{#unless chemin}}…{{/unless}}`
 * et `{{#each chemin}}…{{/each}}` sur le TEXTE du template (jamais sur une
 * valeur). Blocs non imbriqués : un bloc ouvert dans un autre est fermé par la
 * première balise de fin du même type, et le corps d'un bloc n'est pas
 * rescanné — un `{{#each}}` placé dans un `{{#if}}` n'est donc pas développé.
 * Une ouverture sans fermeture n'est pas un bloc (elle sera vidée par la substitution).
 *
 * `vars` reçoit les variables d'élément créées par `{{#each}}` : appelée sans
 * lui, la fonction développe quand même le bloc, mais les valeurs d'élément ne
 * pourront pas être résolues. Le point d'entrée à utiliser est `renderTemplate`.
 */
export function resolveTemplateBlocks(
  templateHtml: string,
  item: Record<string, unknown>,
  vars: Record<string, () => string> = {}
): string {
  if (!templateHtml.includes('{{#')) return templateHtml;
  return templateHtml.replace(BLOCK_RE, (_match, kind: string, path: string, body: string) => {
    if (kind === 'each') {
      return eachValuesOf(getByPath(item, path))
        .map((value, index) => expandEachIteration(body, value, index, vars))
        .join('');
    }
    const truthy = isTemplateTruthy(getByPath(item, path));
    return (kind === 'if') === truthy ? body : '';
  });
}

export interface RenderTemplateOptions {
  /**
   * Autorise `{{{champ}}}` (valeur brute, non échappée). Sinon la forme à
   * triple accolade est traitée comme `{{champ}}` (toujours échappée).
   */
  raw?: boolean;
  /** Variables spéciales (`$index`, `$uid`...) résolues avant les champs. */
  vars?: Record<string, () => string>;
  /**
   * Qui rend ce gabarit (ex. `dsfr-data-display#fiches`) : nommé dans
   * l'avertissement d'imbrication (#769) pour que la page fautive se trouve.
   */
  origin?: string;
}

const BLOCK_TAG_RE = /\{\{([#/])(if|unless|each)\b[^}]*\}\}/g;

/** Gabarits déjà signalés comme imbriqués : un avertissement par gabarit (#769). */
const nestedBlocksWarned = new Set<string>();

/**
 * Le gabarit contient-il un bloc dans un bloc (#769) ? Analyse du TEXTE,
 * indépendante des données : un `{{#each}}` dans un `{{#if}}` dont la
 * condition est fausse n'en est pas moins cassé pour la ligne suivante.
 */
export function hasNestedTemplateBlocks(templateHtml: string): boolean {
  if (!templateHtml.includes('{{#')) return false;
  let depth = 0;
  for (const match of templateHtml.matchAll(BLOCK_TAG_RE)) {
    if (match[1] === '#') {
      depth++;
      if (depth > 1) return true;
    } else {
      depth = Math.max(0, depth - 1);
    }
  }
  return false;
}

/**
 * Avertit, une fois par gabarit, qu'un bloc est imbriqué (#769). La limite
 * est documentée et ASSUMÉE — `BLOCK_RE` étant paresseux, un bloc dans un bloc
 * de même type se fermerait sur la mauvaise balise, et une récursion naïve ne
 * marcherait que pour des types différents. Ce qui manquait est le signal :
 * les balises intérieures survivaient à la pré-passe, la substitution les
 * vidait, et le texte se refermait sur lui-même (`[DEBUTFIN]`) sans erreur.
 */
function warnNestedBlocks(templateHtml: string, origin: string | undefined): void {
  if (nestedBlocksWarned.has(templateHtml) || !hasNestedTemplateBlocks(templateHtml)) return;
  nestedBlocksWarned.add(templateHtml);
  const excerpt = templateHtml.trim().replace(/\s+/g, ' ').slice(0, 80);
  console.warn(
    `${origin ?? 'dsfr-data'}: gabarit à blocs imbriqués ({{#if}}, {{#unless}} ou {{#each}} ` +
      `placé dans un autre) — non pris en charge, le rendu sera tronqué. Écrire les blocs ` +
      `côte à côte : {{#each liste}}…{{/each}}{{#unless liste}}…{{/unless}}. Gabarit : « ${excerpt}… »`
  );
}

/**
 * Rend un template HTML pour un enregistrement : pré-passe des blocs, puis
 * UNE seule passe de substitution des placeholders. La valeur substituée
 * n'est jamais rescannée : une donnée qui contient elle-même `{{x}}` ou
 * `{{#if}}` est rendue littéralement.
 *
 * Les variables d'élément produites par `{{#each}}` (#737) s'ajoutent aux
 * `vars` de l'appelant : dans un bloc `each`, `{{$index}}` est le rang de
 * l'élément et masque le `$index` de la ligne fourni par l'appelant.
 */
export function renderTemplate(
  templateHtml: string,
  item: Record<string, unknown>,
  options: RenderTemplateOptions = {}
): string {
  const { raw = false, vars: callerVars, origin } = options;
  warnNestedBlocks(templateHtml, origin);
  const eachVars: Record<string, () => string> = {};
  const withBlocks = resolveTemplateBlocks(templateHtml, item, eachVars);
  const vars = { ...callerVars, ...eachVars };
  return withBlocks.replace(
    PLACEHOLDER_RE,
    (_match, rawExpr: string | undefined, escExpr: string | undefined) => {
      if (rawExpr !== undefined) {
        const resolved = resolveTemplateExpression(item, rawExpr, vars);
        return raw ? resolved : escapeHtml(resolved);
      }
      return escapeHtml(resolveTemplateExpression(item, escExpr as string, vars));
    }
  );
}
