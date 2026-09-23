/**
 * Rendu Markdown minimal et SUR pour les messages du chat.
 *
 * Le chat affichait du texte brut : les reponses de l'IA (tableaux GFM, listes,
 * gras, code) apparaissaient avec leurs `|`, `**`, `-`… Ce module convertit le
 * sous-ensemble Markdown reellement produit par l'assistant en HTML, en
 * echappant TOUJOURS le contenu d'abord (pas d'injection HTML depuis la reponse
 * modele). Pas de dependance externe : on couvre tableaux, listes, gras, code
 * inline, blocs de code et sauts de ligne — suffisant pour ce chat.
 */

import { escapeHtml } from '../utils/escape-html.js';

/** Marqueur ASCII pour proteger les blocs de code pendant le formatage. */
const BLOCK_MARK = (i: number) => `@@DSFRBLOCK${i}@@`;

/** Formatage inline (sur texte DEJA echappe) : gras puis code inline. */
function inline(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

/** Decoupe une ligne de tableau GFM en cellules (retire les | de bord). */
function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());
}

/** Vrai si la ligne est un separateur de tableau GFM (|---|:--:|…). */
function isTableSeparator(line: string): boolean {
  return /^[\s|:-]+$/.test(line) && line.includes('-') && line.includes('|');
}

function buildTable(header: string[], rows: string[][]): string {
  const th = header.map((c) => `<th>${inline(c)}</th>`).join('');
  const body = rows
    .map((r) => `<tr>${header.map((_h, i) => `<td>${inline(r[i] ?? '')}</td>`).join('')}</tr>`)
    .join('');
  return `<table class="chat-table"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}

/**
 * Convertit du Markdown (sous-ensemble) en HTML sur. Echappe le contenu d'abord,
 * sort les blocs de code, puis traite tableaux / listes / inline ligne a ligne.
 */
export function renderMarkdown(src: string): string {
  // 1) Extraire les blocs de code (leur contenu ne doit pas etre reformate).
  const blocks: string[] = [];
  const withPlaceholders = src.replace(/```(?:json)?\n?([\s\S]*?)```/g, (_m, code) => {
    blocks.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
    return BLOCK_MARK(blocks.length - 1);
  });

  // 2) Echapper tout le reste.
  const text = escapeHtml(withPlaceholders);

  // 3) Traiter tableaux et listes ligne a ligne.
  const lines = text.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Tableau GFM : ligne d'en-tete avec |, suivie d'une ligne separatrice.
    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      out.push(buildTable(header, rows));
      continue;
    }
    // Liste a puces.
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ''))}</li>`);
        i += 1;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }
    out.push(inline(line));
    i += 1;
  }

  // 4) Recoller : les sauts de ligne hors blocs deviennent des <br>, puis on
  // restaure les blocs de code. On evite un <br> juste apres/avant un bloc HTML.
  let html = out.join('\n').replace(/\n/g, '<br>');
  html = html.replace(/<br>(?=\s*<(?:table|ul|pre))/g, '');
  html = html.replace(/(<\/(?:table|ul|pre)>)<br>/g, '$1');
  html = html.replace(/@@DSFRBLOCK(\d+)@@/g, (_m, n) => blocks[Number(n)]);
  return html;
}
