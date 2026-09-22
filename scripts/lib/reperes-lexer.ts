/**
 * Lecture du balisage des apps pour le registre de reperes (#997) — sans
 * dependance : un lecteur de gabarits TS et un lecteur de balises HTML,
 * volontairement petits et tolerants.
 *
 * Pourquoi pas un vrai parseur ? Le depot n'embarque ni parseur HTML ni AST TS
 * utilisable a la generation (et la consigne est de n'en ajouter aucun). Le
 * balisage des apps est regulier : des gabarits `...` et quelques chaines
 * '<...>' dans les expressions. Deux automates a etats suffisent, sans aucune
 * expression reguliere a quantificateurs imbriques (ReDoS, cf. le signalement
 * CodeQL sur build-specs-tables.ts).
 *
 * Point cle : un gabarit imbrique dans un `${…}` est INLINE dans son parent.
 * Les deux branches d'un ternaire se retrouvent donc cote a cote dans le
 * fragment ; c'est ce qu'on veut pour une analyse lexicale (« ce controle est
 * dans cette zone »), pas pour un rendu. Toute autre expression devient le
 * marqueur DYN : une valeur d'attribut qui le contient est dynamique.
 */

import { escapeHtml } from '../../packages/shared/src/utils/escape-html';

/** Marqueur d'une expression `${…}` non litterale. */
export const DYN = '\u0001';

// ---------------------------------------------------------------------------
// Gabarits TS -> fragments HTML
// ---------------------------------------------------------------------------

/**
 * Caracteres apres lesquels un `/` ouvre une expression reguliere (et non une
 * division). Heuristique classique, suffisante pour le code des apps.
 */
const REGEX_PRECEDENT = new Set([...'(,=:[!&|?{};+-*%<>~^']);
const REGEX_MOTS = /(?:^|[^\w$])(?:return|typeof|case|do|else|in|of|void|yield|await)$/;

interface Curseur {
  src: string;
  i: number;
}

function sauterChaine(c: Curseur, quote: string): string {
  // c.i est sur la quote ouvrante
  let out = '';
  c.i++;
  while (c.i < c.src.length) {
    const ch = c.src[c.i];
    if (ch === '\\') {
      out += c.src[c.i + 1] ?? '';
      c.i += 2;
      continue;
    }
    if (ch === quote || ch === '\n') {
      c.i++;
      return out;
    }
    out += ch;
    c.i++;
  }
  return out;
}

function sauterRegex(c: Curseur): void {
  c.i++;
  let classe = false;
  while (c.i < c.src.length) {
    const ch = c.src[c.i];
    if (ch === '\\') {
      c.i += 2;
      continue;
    }
    if (ch === '\n') return;
    if (classe) {
      if (ch === ']') classe = false;
    } else if (ch === '[') classe = true;
    else if (ch === '/') {
      c.i++;
      while (c.i < c.src.length && /[a-z]/i.test(c.src[c.i])) c.i++;
      return;
    }
    c.i++;
  }
}

/** Dernier caractere significatif avant `i` (hors blancs). */
function precedent(src: string, i: number): { ch: string; avant: string } {
  let j = i - 1;
  while (j >= 0 && /\s/.test(src[j])) j--;
  return { ch: j >= 0 ? src[j] : '', avant: src.slice(Math.max(0, j - 10), j + 1) };
}

/** Balise synthetique emise a la place d'un appel de helper (voir `lireAppel`). */
export const BALISE_APPEL = 'x-repere-appel';

/** Proprietes lues sur l'objet passe a un helper, et l'attribut emis pour chacune. */
const PROPS_APPEL: Record<string, string> = {
  label: 'data-appel-libelle',
  attribut: 'data-attribut',
  prerequis: 'data-prerequis',
};

export interface HelperLexer {
  fonction: string;
  parametre: string;
}

interface Contexte {
  helpers: readonly HelperLexer[];
  fragments: FragmentTs[];
}

export interface FragmentTs {
  html: string;
  /** Position du debut du fragment dans le source (pour situer un fragment dans un helper). */
  debut: number;
}

/**
 * Decoupe le corps d'un objet litteral (c.i juste apres `{`) en entrees de
 * premier niveau, et avance c.i apres le `}` fermant.
 */
function lireEntreesObjet(src: string, debut: number): { entrees: string[]; fin: number } {
  const entrees: string[] = [];
  let i = debut;
  let profondeur = 0;
  let courant = debut;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i);
      i = nl === -1 ? src.length : nl;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const fin = src.indexOf('*/', i + 2);
      i = fin === -1 ? src.length : fin + 2;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const c = { src, i };
      sauterChaine(c, ch);
      i = c.i;
      continue;
    }
    if (ch === '`') {
      const c = { src, i };
      lireGabarit(c, { helpers: [], fragments: [] });
      i = c.i;
      continue;
    }
    if (ch === '{' || ch === '(' || ch === '[') profondeur++;
    else if (ch === ')' || ch === ']') profondeur--;
    else if (ch === '}') {
      if (profondeur === 0) {
        entrees.push(src.slice(courant, i));
        return { entrees, fin: i + 1 };
      }
      profondeur--;
    } else if (ch === ',' && profondeur === 0) {
      entrees.push(src.slice(courant, i));
      courant = i + 1;
    }
    i++;
  }
  entrees.push(src.slice(courant));
  return { entrees, fin: src.length };
}

/**
 * Appel de helper `nom({ … })` a la position `i` : renvoie la balise
 * synthetique qui le represente, ou null si ce n'est pas un appel de helper.
 *
 * La balise porte `data-repere` (propriete `parametre`), `data-appel-libelle`
 * (`label`), `data-attribut`, `data-prerequis` ; une propriete non litterale
 * donne une valeur dynamique (refusee ensuite comme un `${…}`). Elle est emise
 * meme sans repere : c'est alors un controle NON balise, que la regle 1 voit.
 */
function lireAppel(src: string, i: number, helpers: readonly HelperLexer[]): string | null {
  if (i > 0 && /[\w$.]/.test(src[i - 1])) return null;
  const h = helpers.find((x) => src.startsWith(x.fonction, i));
  if (!h) return null;
  const m = /^\s*\(\s*\{/.exec(src.slice(i + h.fonction.length, i + h.fonction.length + 40));
  if (!m) return null;
  const { entrees } = lireEntreesObjet(src, i + h.fonction.length + m[0].length);
  const attrs: string[] = [`data-appel-fonction="${h.fonction}"`];
  const noms: Record<string, string> = { [h.parametre]: 'data-repere', ...PROPS_APPEL };
  for (const e of entrees) {
    const kv = /^\s*(?:\/\/[^\n]*\n\s*)*([\w$]+)\s*(:\s*([\s\S]*?))?\s*$/.exec(e);
    if (!kv) continue;
    const attr = noms[kv[1]];
    if (!attr) continue;
    const lit = kv[3] !== undefined ? /^(['"])((?:(?!\1)[^\\\n])*)\1$/.exec(kv[3]) : null;
    attrs.push(`${attr}="${lit ? escapeHtml(lit[2]) : DYN}"`);
  }
  return `<${BALISE_APPEL} ${attrs.join(' ')}></${BALISE_APPEL}>`;
}

/**
 * Parcourt du CODE (hors gabarit) jusqu'a la `}` qui ferme un `${…}` ou la fin
 * du source. Collecte le HTML des gabarits, des chaines '<…>' et des appels de
 * helpers rencontres.
 *
 * - `enExpression` : on est dans un `${…}` ; le HTML collecte est renvoye pour
 *   etre inline dans le gabarit parent.
 * - sinon (niveau fichier) : chaque gabarit / chaine HTML / appel devient un fragment.
 */
function parcourirCode(c: Curseur, enExpression: boolean, ctx: Contexte): string {
  let profondeur = 0;
  const morceaux: string[] = [];
  const src = c.src;
  const emettre = (html: string, debut: number) => {
    if (enExpression) morceaux.push(html);
    else ctx.fragments.push({ html, debut });
  };
  while (c.i < src.length) {
    const ch = src[c.i];
    const suivant = src[c.i + 1];
    if (ch === '/' && suivant === '/') {
      const nl = src.indexOf('\n', c.i);
      c.i = nl === -1 ? src.length : nl;
      continue;
    }
    if (ch === '/' && suivant === '*') {
      const fin = src.indexOf('*/', c.i + 2);
      c.i = fin === -1 ? src.length : fin + 2;
      continue;
    }
    if (ch === '/') {
      const { ch: p, avant } = precedent(src, c.i);
      if (p === '' || REGEX_PRECEDENT.has(p) || REGEX_MOTS.test(avant)) {
        sauterRegex(c);
        continue;
      }
      c.i++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const debut = c.i;
      const s = sauterChaine(c, ch);
      if (s.includes('<')) emettre(s, debut);
      continue;
    }
    if (ch === '`') {
      const debut = c.i;
      emettre(lireGabarit(c, ctx), debut);
      continue;
    }
    if (ctx.helpers.length && /[A-Za-z_$]/.test(ch)) {
      const appel = lireAppel(src, c.i, ctx.helpers);
      if (appel) emettre(appel, c.i);
      // On continue le parcours normal : l'objet passe peut contenir des gabarits.
      let j = c.i;
      while (j < src.length && /[\w$]/.test(src[j])) j++;
      c.i = j;
      continue;
    }
    if (ch === '{') profondeur++;
    else if (ch === '}') {
      if (enExpression && profondeur === 0) {
        c.i++;
        return morceaux.length ? morceaux.join('') : DYN;
      }
      profondeur--;
    }
    c.i++;
  }
  return morceaux.length ? morceaux.join('') : DYN;
}

/** Lit un gabarit (c.i sur le backtick ouvrant) et renvoie son HTML aplati. */
function lireGabarit(c: Curseur, ctx: Contexte): string {
  const src = c.src;
  let out = '';
  c.i++;
  while (c.i < src.length) {
    const ch = src[c.i];
    if (ch === '\\') {
      out += src[c.i + 1] ?? '';
      c.i += 2;
      continue;
    }
    if (ch === '`') {
      c.i++;
      return out;
    }
    if (ch === '$' && src[c.i + 1] === '{') {
      c.i += 2;
      out += parcourirCode(c, true, ctx);
      continue;
    }
    out += ch;
    c.i++;
  }
  return out;
}

/**
 * Fragments HTML d'un fichier TS : chaque gabarit de niveau fichier (avec ses
 * gabarits imbriques inlines), chaque chaine litterale contenant `<`, et une
 * balise synthetique par appel de helper declare.
 */
export function fragmentsTs(src: string, helpers: readonly HelperLexer[] = []): FragmentTs[] {
  const ctx: Contexte = { helpers, fragments: [] };
  parcourirCode({ src, i: 0 }, false, ctx);
  return ctx.fragments;
}

/**
 * Plage [debut, fin[ du corps de la fonction `nom` (`function nom(…) {…}` ou
 * `const nom = (…) => {…}`), ou null. Sert a tolerer le `${…}` dans le
 * `data-repere` d'un helper, et la seulement.
 */
export function corpsDeFonction(src: string, nom: string): [number, number] | null {
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  const decl = new RegExp(`(?:function\\s+${nom}\\s*\\(|(?:const|let)\\s+${nom}\\s*=)`).exec(src);
  if (!decl) return null;
  let i = decl.index + decl[0].length;
  // Parametres : on saute jusqu'a la parenthese fermante de profondeur 0.
  let profondeur = decl[0].endsWith('(') ? 1 : 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "'" || ch === '"') {
      const c = { src, i };
      sauterChaine(c, ch);
      i = c.i;
      continue;
    }
    if (ch === '(') profondeur++;
    else if (ch === ')') {
      profondeur--;
      if (profondeur === 0) break;
    }
    i++;
  }
  const ouvrante = src.indexOf('{', i);
  if (ouvrante === -1) return null;
  const c = { src, i: ouvrante + 1 };
  // Le corps est du code : parcourirCode s'arrete sur la `}` fermante.
  parcourirCode(c, true, { helpers: [], fragments: [] });
  return [ouvrante, c.i];
}

// ---------------------------------------------------------------------------
// Balises HTML -> elements
// ---------------------------------------------------------------------------

export interface ValeurAttribut {
  /** Valeur, marqueurs DYN retires. */
  valeur: string;
  /** Vrai si la valeur contient une expression `${…}`. */
  dynamique: boolean;
}

export interface Element {
  index: number;
  tag: string;
  attrs: Map<string, ValeurAttribut>;
  parent: number | null;
  /** Texte des noeuds texte enfants directs. */
  texteDirect: string;
  /** Texte de tous les descendants. */
  texte: string;
}

const VIDES = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);
const TEXTE_BRUT = new Set(['script', 'style', 'textarea', 'pre']);

function decoderEntites(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Normalise un texte : marqueurs retires, blancs replies. */
export function nettoyer(s: string): string {
  return decoderEntites(s.split(DYN).join(' ')).replace(/\s+/g, ' ').trim();
}

const estBlanc = (ch: string) => ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r';

/**
 * Lit les balises d'un fragment. Pile tolerante : une fermeture sans ouverture
 * correspondante est ignoree, une ouverture jamais fermee l'est en fin de
 * fragment. Suffisant pour du balisage d'app (et pour les deux branches
 * juxtaposees d'un ternaire, qui restent equilibrees chacune).
 */
export function lireElements(html: string): Element[] {
  const elements: Element[] = [];
  const pile: number[] = [];
  let i = 0;
  let texte = '';

  const pousserTexte = () => {
    if (!texte) return;
    if (pile.length) {
      elements[pile[pile.length - 1]].texteDirect += texte;
      for (const k of pile) elements[k].texte += texte;
    }
    texte = '';
  };

  while (i < html.length) {
    const ch = html[i];
    if (ch !== '<') {
      texte += ch;
      i++;
      continue;
    }
    if (html.startsWith('<!--', i)) {
      const fin = html.indexOf('-->', i + 4);
      i = fin === -1 ? html.length : fin + 3;
      continue;
    }
    const fermeture = html[i + 1] === '/';
    let j = i + (fermeture ? 2 : 1);
    if (!/[a-zA-Z]/.test(html[j] ?? '')) {
      texte += ch;
      i++;
      continue;
    }
    pousserTexte();
    let nom = '';
    while (j < html.length && /[\w-]/.test(html[j])) nom += html[j++];
    nom = nom.toLowerCase();

    if (fermeture) {
      const fin = html.indexOf('>', j);
      i = fin === -1 ? html.length : fin + 1;
      const pos = pile.map((k) => elements[k].tag).lastIndexOf(nom);
      if (pos !== -1) pile.length = pos;
      continue;
    }

    // Attributs
    const attrs = new Map<string, ValeurAttribut>();
    let autoFerme = false;
    while (j < html.length) {
      const c = html[j];
      if (estBlanc(c) || c === DYN) {
        j++;
        continue;
      }
      if (c === '>') {
        j++;
        break;
      }
      if (c === '/' && html[j + 1] === '>') {
        autoFerme = true;
        j += 2;
        break;
      }
      let an = '';
      while (j < html.length && html[j] !== DYN && !/[\s=>/]/.test(html[j])) an += html[j++];
      if (!an) {
        j++;
        continue;
      }
      while (estBlanc(html[j] ?? '')) j++;
      let brute = '';
      if (html[j] === '=') {
        j++;
        while (estBlanc(html[j] ?? '')) j++;
        const q = html[j];
        if (q === '"' || q === "'") {
          const fin = html.indexOf(q, j + 1);
          brute = html.slice(j + 1, fin === -1 ? html.length : fin);
          j = fin === -1 ? html.length : fin + 1;
        } else {
          while (j < html.length && !/[\s>]/.test(html[j])) brute += html[j++];
        }
      }
      attrs.set(an.toLowerCase(), {
        valeur: decoderEntites(brute.split(DYN).join('')).trim(),
        dynamique: brute.includes(DYN),
      });
    }
    i = j;

    const index = elements.length;
    elements.push({
      index,
      tag: nom,
      attrs,
      parent: pile.length ? pile[pile.length - 1] : null,
      texteDirect: '',
      texte: '',
    });
    if (autoFerme || VIDES.has(nom)) continue;
    if (TEXTE_BRUT.has(nom)) {
      // Contenu brut : on saute jusqu'a la fermeture, sans lire de balises.
      const fin = html.indexOf(`</${nom}`, i);
      const contenu = html.slice(i, fin === -1 ? html.length : fin);
      if (nom === 'pre') {
        elements[index].texte += contenu;
        elements[index].texteDirect += contenu;
      }
      const ferme = fin === -1 ? html.length : html.indexOf('>', fin);
      i = ferme === -1 ? html.length : ferme + 1;
      continue;
    }
    pile.push(index);
  }
  pousserTexte();
  return elements;
}

/** Ancetres d'un element, du plus proche au plus lointain. */
export function ancetres(elements: Element[], el: Element): Element[] {
  const out: Element[] = [];
  let p = el.parent;
  while (p !== null) {
    out.push(elements[p]);
    p = elements[p].parent;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Selecteurs simples (exceptions, zones de reglage)
// ---------------------------------------------------------------------------

/**
 * Selecteur simple : `tag`, `#id`, `.classe`, `[attr]`, `[attr="v"]`, et leurs
 * combinaisons sans espace (`button[data-del-id]`, `input.carto-swatch-custom`).
 * Pas de combinateur : une exception designe un controle, pas un chemin.
 */
export function correspond(el: Element, selecteur: string): boolean {
  let reste = selecteur.trim();
  const tag = /^[a-z][\w-]*/i.exec(reste);
  if (tag) {
    if (el.tag !== tag[0].toLowerCase()) return false;
    reste = reste.slice(tag[0].length);
  }
  while (reste) {
    let m: RegExpExecArray | null;
    if ((m = /^#([\w-]+)/.exec(reste))) {
      if (el.attrs.get('id')?.valeur !== m[1]) return false;
    } else if ((m = /^\.([\w-]+)/.exec(reste))) {
      const classes = (el.attrs.get('class')?.valeur ?? '').split(/\s+/);
      if (!classes.includes(m[1])) return false;
    } else if ((m = /^\[([\w-]+)(?:="([^"]*)")?\]/.exec(reste))) {
      const a = el.attrs.get(m[1].toLowerCase());
      if (!a) return false;
      if (m[2] !== undefined && a.valeur !== m[2]) return false;
    } else {
      throw new Error(`Selecteur non pris en charge : « ${selecteur} »`);
    }
    reste = reste.slice(m[0].length);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Lecture statique d'un objet exporte (prerequis.ts)
// ---------------------------------------------------------------------------

/**
 * Cles de premier niveau d'un `export const NOM = { … }` et, pour chacune, la
 * valeur litterale de sa propriete `repereQuiLeve` si elle existe. Lecture
 * statique : le module n'est pas importe (il touche a l'etat de l'app).
 */
export function lireObjetExporte(
  src: string,
  nom: string
): Map<string, { repereQuiLeve?: string }> | null {
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  const m = new RegExp(`export\\s+const\\s+${nom}\\b[^=]*=\\s*\\{`).exec(src);
  if (!m) return null;
  const out = new Map<string, { repereQuiLeve?: string }>();
  const { entrees } = lireEntreesObjet(src, m.index + m[0].length);
  for (const e of entrees) {
    const k = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*(['"]?)([\w-]+)\1\s*:/.exec(e);
    if (!k) continue;
    const leve = /\brepereQuiLeve\s*:\s*(['"])([^'"\n]+)\1/.exec(e);
    out.set(k[2], leve ? { repereQuiLeve: leve[2] } : {});
  }
  return out;
}
