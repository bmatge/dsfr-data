/**
 * Lecture du code réellement généré par la boucle agentique (#787).
 *
 * L'assistant compose un document, et l'application en génère la page. Il
 * lui arrivait pourtant de décrire cette page DE MÉMOIRE, en affirmant avec
 * assurance des choses fausses : « aucune donnée n'est en dur », « un extrait
 * de 20 lignes », « l'attribut data est ignoré en présence de base-url ». Les
 * trois étaient faux, et l'utilisateur a dû coller le code lui-même pour faire
 * céder l'assistant. Face à un utilisateur moins insistant, la conversation se
 * terminait sur « tout va bien » pendant que le tableau de bord agrégeait un
 * jeu partiel.
 *
 * L'outil rend ce que l'utilisateur copierait — l'`exportHtml` de l'aperçu —
 * précédé d'un résumé par source : requête déclarative à l'API, ou données
 * EMBARQUÉES, avec leur nombre de lignes. Les lignes embarquées elles-mêmes
 * ne partent jamais vers le modèle : elles sont remplacées par leur décompte,
 * qui est le fait utile, et c'est aussi ce qui respecte le masquage des
 * valeurs du volet Diagnostic.
 */

import { lireBalises } from '@dsfr-data/shared';

/** Taille maximale du code rendu au modèle (le budget d'Albert est partagé). */
const MAX_CODE_CHARS = 12_000;

export const CODE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_generated_code',
      description:
        "Rend le code HTML RÉELLEMENT généré pour la page (celui que l'utilisateur copie), précédé d'un résumé de chaque source : requête à l'API ou données embarquées, et combien de lignes. À appeler AVANT toute affirmation sur le code produit — données en dur ou non, attributs émis, API appelée — et dès que l'utilisateur conteste ce que tu en dis.",
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
] as const;

export const CODE_TOOL_NAMES: ReadonlySet<string> = new Set(['read_generated_code']);

/** Défait l'échappement de `singleQuoteAttr` (shared/utils/escape-html). */
function unescapeSingleQuoteAttr(value: string): string {
  return value
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

/** Nombre de lignes d'un attribut `data='[…]'`, ou null s'il ne se lit pas. */
function countEmbeddedRows(raw: string): number | null {
  try {
    const parsed: unknown = JSON.parse(unescapeSingleQuoteAttr(raw));
    if (Array.isArray(parsed)) return parsed.length;
    return parsed && typeof parsed === 'object' ? 1 : null;
  } catch {
    return null;
  }
}

/**
 * Une ligne de résumé par `<dsfr-data-source>` du code. Les attributs sont
 * lus par l'analyseur LINÉAIRE du lint de balisage (`lireBalises`), jamais
 * par une expression régulière construite à partir d'un nom d'attribut.
 */
function describeSources(html: string): string[] {
  const lines: string[] = [];
  for (const balise of lireBalises(html)) {
    if (balise.tag !== 'dsfr-data-source') continue;
    const attr = (name: string): string | null => balise.attrs[name] ?? null;
    const id = attr('id') ?? '(sans id)';
    const data = attr('data');
    if (data !== null) {
      const rows = countEmbeddedRows(data);
      lines.push(
        `- source « ${id} » : données EMBARQUÉES dans la page (attribut data, ${
          rows === null ? 'contenu illisible' : `${rows} ligne(s)`
        }) — aucune requête, la page ne se met pas à jour.`
      );
      continue;
    }
    const apiType = attr('api-type');
    const target = attr('dataset-id') ?? attr('resource') ?? attr('url') ?? attr('base-url');
    lines.push(
      `- source « ${id} » : requête ${apiType ? `${apiType} ` : ''}à l'API${
        target ? ` (${target})` : ''
      } — les données sont chargées à l'affichage, rien n'est figé dans la page.`
    );
  }
  return lines;
}

/** Remplace le contenu des attributs data='[…]' par leur décompte. */
function elideEmbeddedData(html: string): string {
  return html.replace(/\sdata='([^']*)'/g, (_m, raw: string) => {
    const rows = countEmbeddedRows(raw);
    return ` data='[… ${rows === null ? 'contenu' : `${rows} ligne(s)`} embarquée(s), omises ici …]'`;
  });
}

/**
 * Rend le code généré pour le modèle : résumé des sources, puis le HTML aux
 * données embarquées élidées, borné en taille. Toujours du texte.
 */
export function describeGeneratedCode(html: string): string {
  if (!html.trim()) {
    return 'Aucun code généré : le document est vide. Ajoute des blocs, puis relis le code.';
  }
  const sources = describeSources(html);
  const header =
    sources.length > 0
      ? `Sources du code généré (lu dans le code, pas supposé) :\n${sources.join('\n')}`
      : 'Le code généré ne contient aucune <dsfr-data-source> (blocs de texte seulement).';
  let code = elideEmbeddedData(html);
  if (code.length > MAX_CODE_CHARS) {
    code = `${code.slice(0, MAX_CODE_CHARS)}\n… (code tronqué à ${MAX_CODE_CHARS} caractères sur ${code.length})`;
  }
  return `${header}\n\nCode HTML généré :\n${code}`;
}
