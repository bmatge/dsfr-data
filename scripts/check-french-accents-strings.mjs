#!/usr/bin/env node
// Volet « chaînes » du lint des accents (#1158), appelé par
// scripts/check-french-accents.sh — ne pas lancer seul.
//
// Le volet bash ne lit que le texte « >…< » d'UNE ligne. Trois trous en
// découlaient, tous repérés à l'image dans la démo vidéo de #1158 :
//
//  1. littéraux JS : `Connecte (${n} elements)`, 'Aucun champ configure' —
//     du texte posé par script, sans balise autour ;
//  2. contenu de balise sur plusieurs lignes (`<label>\n  Libelle\n  <span>`) ;
//  3. commentaires `<!-- … -->` ÉMIS dans le code exporté (« Dependances CSS »),
//     que l'usager lit dans l'onglet Code puis copie chez lui.
//
// Les .ts sont lus par l'AST TypeScript, pas par expression régulière : les
// commentaires du code (très souvent en français sans accent, et pleins de
// backticks) sont ainsi exclus mécaniquement. Dans un littéral, on retire les
// balises ENTIÈRES (attributs compris : `data-repere="builder.donnees"` n'est
// pas un libellé) et les `${…}`, puis on cherche les motifs dans le texte qui
// reste — et dans le corps des commentaires HTML qu'il émet.
//
// Exclus : littéraux sans espace (clés, identifiants, URL), arguments de
// `console.*` (journal développeur), clés d'objet, `import`/`export … from`,
// et un motif collé à `-` `.` `/` `:` `_` `=` (identifiant, chemin, clause).
//
// Entrées : ACCENT_PATTERNS (motifs séparés par `|`) et la liste des fichiers
// sur stdin (un par ligne). Sortie : une ligne `fichier:ligne: [motif] extrait`
// par constat ; code 1 s'il y en a.

import { readFileSync } from 'node:fs';
import process from 'node:process';
import ts from 'typescript';

const patterns = (process.env.ACCENT_PATTERNS || '').split('|').filter(Boolean);
if (patterns.length === 0) {
  process.stderr.write('ACCENT_PATTERNS vide\n');
  process.exit(2);
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Bornes : ni lettre (accentuée comprise), ni chiffre, ni caractère d'identifiant.
// Motifs échappés un à un (`esc`), issus de la liste du script bash.
// eslint-disable-next-line security/detect-non-literal-regexp
const WORD = new RegExp(
  `(?<![\\p{L}\\p{N}_\\-./:=#@$])(${patterns.map(esc).join('|')})(?![\\p{L}\\p{N}_\\-./:=(])`,
  'gu'
);

const files = readFileSync(0, 'utf8').split('\n').filter(Boolean);
const hits = [];

/** Un constat par motif trouvé ; `line` est la ligne du début de `text`. */
function report(file, line, text) {
  for (const m of text.matchAll(WORD)) {
    const i = m.index;
    const ligne = line + (text.slice(0, i).match(/\n/g)?.length ?? 0);
    const extrait = text
      .slice(Math.max(0, i - 40), i + 40)
      .replace(/\s+/g, ' ')
      .trim();
    hits.push(`${file}:${ligne}: [${m[1]}] ${extrait}`);
  }
}

/** Ligne (1-based) d'un décalage dans le texte. */
function lineAt(text, offset) {
  let n = 1;
  for (let k = 0; k < offset; k++) if (text.charCodeAt(k) === 10) n++;
  return n;
}

/** Efface un passage en gardant ses sauts de ligne (numéros de ligne justes). */
const blank = (m) => m.replace(/[^\n]/g, ' ');

// Un `<code>` / `<pre>` EST du code, un <script>/<style> aussi (même règle que le volet bash).
const stripCode = (s) => s.replace(/<(code|pre|script|style)\b[^>]*>[\s\S]*?<\/\1>/g, blank);

// --------------------------------------------------------------------------
// HTML : contenu de balise qui s'étend sur plusieurs lignes (le cas mono-ligne
// est déjà couvert par le volet bash — on ne le redouble pas).
function scanHtml(file, src) {
  const text = stripCode(src.replace(/<!--[\s\S]*?-->/g, blank));
  const re = />([^<>]+)</g;
  let m;
  while ((m = re.exec(text))) {
    const seg = m[1];
    if (!seg.includes('\n')) continue;
    report(file, lineAt(text, m.index + 1), stripTokens(seg));
  }
}

// --------------------------------------------------------------------------
// TS : littéraux de chaîne et gabarits.
const HOLE = '\u0000';

function isInConsoleCall(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isCallExpression(p)) {
      const e = p.expression;
      if (
        ts.isPropertyAccessExpression(e) &&
        ts.isIdentifier(e.expression) &&
        e.expression.text === 'console'
      )
        return true;
    }
    if (ts.isBlock(p) || ts.isSourceFile(p)) return false;
  }
  return false;
}

function isSkippedPosition(node) {
  const p = node.parent;
  if (!p) return false;
  // css`…` (Lit) : du CSS, pas un libellé.
  if (ts.isTaggedTemplateExpression(p) && ts.isIdentifier(p.tag) && p.tag.text === 'css')
    return true;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true;
  if (ts.isExternalModuleReference(p) || ts.isImportTypeNode?.(p)) return true;
  if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p)) && p.name === node) return true;
  if (ts.isLiteralTypeNode(p)) return true;
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true;
  return false;
}

/**
 * Retire ce qui, dans un texte, est du code et non de la langue : gabarit
 * `{{champ}}`, extrait `code` (Markdown), affectation `attr="…"`, et valeur
 * entre guillemets SANS espace (`"annee"`, `'libelle'` : un nom de champ).
 */
function stripTokens(s) {
  return s
    .replace(/\{\{[^{}]*\}\}/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/[\w-]+=("[^"]*"|'[^']*')/g, ' ')
    .replace(/"[^"\s]*"|'[^'\s]*'/g, ' ');
}

/** Texte visible d'un littéral : balises et trous retirés, commentaires HTML à part. */
function visibleParts(raw) {
  const comments = [];
  let s = raw.replace(/<!--([\s\S]*?)-->/g, (_c, body) => {
    comments.push(body);
    return ' ';
  });
  s = stripCode(s)
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // commentaires CSS/JS d'une feuille ou d'un script émis
    .replace(/<\/?[a-zA-Z][^<>]*>/g, ' ') // balises entières, attributs compris
    .replace(/<\/?[a-zA-Z][\w-]*[^<>]*$/g, ' ') // balise ouverte en fin de littéral
    .replace(/^[^<>]*>/g, (m) => (/[="]/.test(m) ? ' ' : m)); // fin de balise en tête
  s = stripTokens(s);
  return { text: s, comments: comments.map(stripTokens) };
}

function scanTs(file, src) {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  function check(node, raw) {
    if (isSkippedPosition(node) || isInConsoleCall(node)) return;
    const { text, comments } = visibleParts(raw);
    const start = node.getStart(sf);
    const line = sf.getLineAndCharacterOfPosition(start).line + 1;
    // Un commentaire d'un gabarit Lit (html`…`) reste dans le DOM de l'app,
    // personne ne le lit : seuls comptent ceux d'une chaîne EMISE (code exporté).
    const lit = ts.isTaggedTemplateExpression(node.parent);
    if (!lit) for (const c of comments) report(file, line, c.replaceAll(HOLE, ' '));
    // Un littéral sans espace est une clé, un identifiant, une URL : pas un
    // libellé. Un trou `${…}` compte comme un mot (`${n} resultats`).
    if (!/\S\s+\S/.test(text.replaceAll(HOLE, 'X'))) return;
    report(file, line, text.replaceAll(HOLE, ' '));
  }

  function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      check(node, node.text);
    } else if (ts.isTemplateExpression(node)) {
      const raw = node.head.text + node.templateSpans.map((sp) => HOLE + sp.literal.text).join('');
      check(node, raw);
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}

for (const file of files) {
  let src;
  try {
    src = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (file.endsWith('.html')) scanHtml(file, src);
  else if (file.endsWith('.ts')) scanTs(file, src);
}

if (hits.length) {
  process.stdout.write(hits.join('\n') + '\n');
  process.exit(1);
}
