/**
 * Évaluation d'expressions de l'ORACLE — une SECONDE implémentation de la
 * grammaire des colonnes calculées (ADR-105), écrite à part.
 *
 * `dsfr-data-normalize` compile `compute="cible = expression"` avec son propre
 * tokenizer / parseur / évaluateur, dans `packages/shared`. Ce fichier en écrit
 * un autre, ici, à partir de la grammaire ÉNONCÉE (le JSDoc de l'attribut
 * `compute` et le guide des colonnes calculées) et non du code de la
 * bibliothèque : le test-garde `tests/oracle/guard.test.ts` refuserait de
 * toute façon l'import. Deux parseurs écrits séparément ne se trompent pas de
 * la même façon — c'est tout l'intérêt.
 *
 * Ce qui est couvert, et rien de plus (une construction non gérée lève, elle
 * ne rend jamais un `null` plausible) :
 *   - arithmétique `+ - * /`, parenthèses, moins unaire ;
 *   - littéraux : nombres, texte entre quotes simples, `null`, `true`, `false` ;
 *   - fonctions en liste blanche (dates, nombres, texte, absence, tableaux) ;
 *   - `when COND then EXPR … else EXPR` ;
 *   - comparaisons `= != < <= > >=`, `and`, `or`, `not`.
 *
 * Doctrine, reprise mot pour mot de la grammaire :
 *   - `- * /` et le moins unaire : un opérande absent ou non numérique rend
 *     `null`, jamais un 0 plausible ; une division par zéro rend `null`,
 *     jamais `Infinity` ;
 *   - `+` additionne quand LES DEUX côtés sont numériques, sinon concatène ;
 *   - l'égalité est lâche (nombre ↔ chaîne numérique) mais une cellule VIDE
 *     n'égale jamais un nombre — c'est `egal()` de `compute.ts` ;
 *   - les comparaisons d'ordre ne matchent jamais une valeur absente ;
 *   - la véracité d'une condition suit la règle écrite : `false`, `null`,
 *     `undefined`, `''`, `0` et `NaN` sont faux, tout le reste est vrai.
 */
import type { Row } from './manifest.js';
import { absent, egal, toNum } from './compute.js';

// ---------------------------------------------------------------------------
// Lexique
// ---------------------------------------------------------------------------

type Genre = 'nombre' | 'texte' | 'nom' | 'symbole' | 'fin';

interface Jeton {
  genre: Genre;
  texte: string;
  /** Valeur portée par un littéral numérique ou textuel. */
  valeur?: number | string;
  position: number;
}

const SYMBOLES = ['!=', '<=', '>=', '=', '<', '>', '+', '-', '*', '/', '(', ')', ',', ';'];

/** Découpe une source en jetons. Un caractère inattendu est une erreur, pas un silence. */
export function decouper(source: string): Jeton[] {
  const jetons: Jeton[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      let texte = '';
      while (j < source.length && source[j] !== "'") {
        texte += source[j];
        j++;
      }
      if (j >= source.length) throw new Error(`texte non terminé à la position ${i}`);
      jetons.push({ genre: 'texte', texte, valeur: texte, position: i });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < source.length && /[0-9.]/.test(source[j])) j++;
      const brut = source.slice(i, j);
      const n = Number(brut);
      if (!Number.isFinite(n)) throw new Error(`nombre illisible « ${brut} »`);
      jetons.push({ genre: 'nombre', texte: brut, valeur: n, position: i });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < source.length && /[A-Za-z0-9_]/.test(source[j])) j++;
      jetons.push({ genre: 'nom', texte: source.slice(i, j), position: i });
      i = j;
      continue;
    }
    const symbole = SYMBOLES.find((s) => source.startsWith(s, i));
    if (!symbole) throw new Error(`caractère inattendu « ${c} » à la position ${i}`);
    jetons.push({ genre: 'symbole', texte: symbole, position: i });
    i += symbole.length;
  }
  jetons.push({ genre: 'fin', texte: '', position: source.length });
  return jetons;
}

// ---------------------------------------------------------------------------
// Arbre
// ---------------------------------------------------------------------------

type Noeud =
  | { type: 'litteral'; valeur: unknown }
  | { type: 'champ'; nom: string }
  | { type: 'binaire'; op: string; gauche: Noeud; droite: Noeud }
  | { type: 'unaire'; op: 'moins' | 'not'; operande: Noeud }
  | { type: 'appel'; nom: string; arguments: Noeud[] }
  | { type: 'quand'; branches: Array<{ si: Noeud; alors: Noeud }>; sinon: Noeud };

/** Une assignation compilée : une colonne cible et son arbre. */
export interface Assignation {
  cible: string;
  noeud: Noeud;
}

const MOTS_CLES = new Set(['when', 'then', 'else', 'and', 'or', 'not', 'null', 'true', 'false']);

class Analyseur {
  private i = 0;

  constructor(private readonly jetons: Jeton[]) {}

  private courant(): Jeton {
    return this.jetons[this.i];
  }

  private estSymbole(texte: string): boolean {
    const j = this.courant();
    return j.genre === 'symbole' && j.texte === texte;
  }

  private estMot(mot: string): boolean {
    const j = this.courant();
    return j.genre === 'nom' && j.texte === mot;
  }

  private avaler(texte: string): void {
    if (!this.estSymbole(texte) && !this.estMot(texte)) {
      throw new Error(`« ${texte} » attendu, « ${this.courant().texte || 'fin'} » trouvé`);
    }
    this.i++;
  }

  fini(): boolean {
    return this.courant().genre === 'fin';
  }

  /** `cible = expression`, le `=` de tête étant l'assignation et non une comparaison. */
  assignation(): Assignation {
    const nom = this.courant();
    if (nom.genre !== 'nom' || MOTS_CLES.has(nom.texte)) {
      throw new Error(`nom de colonne attendu, « ${nom.texte} » trouvé`);
    }
    this.i++;
    this.avaler('=');
    return { cible: nom.texte, noeud: this.expression() };
  }

  /** Fin d'une assignation : un `;` ou la fin de la source. */
  finAssignation(): boolean {
    if (this.estSymbole(';')) {
      this.i++;
      return true;
    }
    return this.fini();
  }

  expression(): Noeud {
    return this.ou();
  }

  private ou(): Noeud {
    let gauche = this.et();
    while (this.estMot('or')) {
      this.i++;
      gauche = { type: 'binaire', op: 'or', gauche, droite: this.et() };
    }
    return gauche;
  }

  private et(): Noeud {
    let gauche = this.negation();
    while (this.estMot('and')) {
      this.i++;
      gauche = { type: 'binaire', op: 'and', gauche, droite: this.negation() };
    }
    return gauche;
  }

  private negation(): Noeud {
    if (this.estMot('not')) {
      this.i++;
      return { type: 'unaire', op: 'not', operande: this.negation() };
    }
    return this.comparaison();
  }

  private comparaison(): Noeud {
    const gauche = this.somme();
    for (const op of ['!=', '<=', '>=', '=', '<', '>']) {
      if (this.estSymbole(op)) {
        this.i++;
        return { type: 'binaire', op, gauche, droite: this.somme() };
      }
    }
    return gauche;
  }

  private somme(): Noeud {
    let gauche = this.produit();
    while (this.estSymbole('+') || this.estSymbole('-')) {
      const op = this.courant().texte;
      this.i++;
      gauche = { type: 'binaire', op, gauche, droite: this.produit() };
    }
    return gauche;
  }

  private produit(): Noeud {
    let gauche = this.unaire();
    while (this.estSymbole('*') || this.estSymbole('/')) {
      const op = this.courant().texte;
      this.i++;
      gauche = { type: 'binaire', op, gauche, droite: this.unaire() };
    }
    return gauche;
  }

  private unaire(): Noeud {
    if (this.estSymbole('-')) {
      this.i++;
      return { type: 'unaire', op: 'moins', operande: this.unaire() };
    }
    return this.primaire();
  }

  private primaire(): Noeud {
    const j = this.courant();
    if (j.genre === 'nombre' || j.genre === 'texte') {
      this.i++;
      return { type: 'litteral', valeur: j.valeur };
    }
    if (this.estSymbole('(')) {
      this.i++;
      const interne = this.expression();
      this.avaler(')');
      return interne;
    }
    if (j.genre === 'nom') {
      if (j.texte === 'null') {
        this.i++;
        return { type: 'litteral', valeur: null };
      }
      if (j.texte === 'true' || j.texte === 'false') {
        this.i++;
        return { type: 'litteral', valeur: j.texte === 'true' };
      }
      if (j.texte === 'when') return this.quand();
      this.i++;
      if (this.estSymbole('(')) {
        this.i++;
        const args: Noeud[] = [];
        if (!this.estSymbole(')')) {
          args.push(this.expression());
          while (this.estSymbole(',')) {
            this.i++;
            args.push(this.expression());
          }
        }
        this.avaler(')');
        return { type: 'appel', nom: j.texte, arguments: args };
      }
      return { type: 'champ', nom: j.texte };
    }
    throw new Error(`expression attendue, « ${j.texte || 'fin'} » trouvé`);
  }

  /** `when COND then EXPR [when …]… else EXPR` — le `else` est obligatoire. */
  private quand(): Noeud {
    const branches: Array<{ si: Noeud; alors: Noeud }> = [];
    while (this.estMot('when')) {
      this.i++;
      const si = this.expression();
      this.avaler('then');
      branches.push({ si, alors: this.expression() });
    }
    if (!this.estMot('else')) throw new Error('« when » sans « else »');
    this.i++;
    return { type: 'quand', branches, sinon: this.expression() };
  }
}

/** Compile `cible = expr; cible2 = expr2` en une suite d'assignations. */
export function compiler(source: string): Assignation[] {
  const analyseur = new Analyseur(decouper(source));
  const out: Assignation[] = [];
  while (!analyseur.fini()) {
    out.push(analyseur.assignation());
    if (!analyseur.finAssignation()) throw new Error('« ; » attendu entre deux assignations');
  }
  return out;
}

// ---------------------------------------------------------------------------
// Évaluation
// ---------------------------------------------------------------------------

/** Arithmétique stricte : un opérande non numérique rend null, jamais 0. */
function arithmetique(op: string, a: unknown, b: unknown): number | null {
  const na = toNum(a);
  const nb = toNum(b);
  if (na === null || nb === null) return null;
  if (op === '-') return na - nb;
  if (op === '*') return na * nb;
  return nb === 0 ? null : na / nb;
}

/** Ordre : jamais de match sur une valeur absente ; nombre si les deux le sont. */
function ordre(op: string, a: unknown, b: unknown): boolean {
  if (absent(a) || absent(b)) return false;
  const na = toNum(a);
  const nb = toNum(b);
  const c =
    na !== null && nb !== null
      ? na - nb
      : String(a) < String(b)
        ? -1
        : String(a) > String(b)
          ? 1
          : 0;
  if (op === '<') return c < 0;
  if (op === '<=') return c <= 0;
  if (op === '>') return c > 0;
  return c >= 0;
}

/**
 * Véracité d'une valeur, sur la règle DOCUMENTÉE de la grammaire : `false`,
 * `null`, `undefined`, la chaîne vide, `0` et `NaN` sont faux ; tout le reste
 * est vrai. Un `when actif then …` sur une colonne à 1 / 0 doit donc marcher,
 * et pas seulement sur un booléen produit par une comparaison.
 */
export function vrai(v: unknown): boolean {
  if (v === false || v === null || v === undefined || v === '' || v === 0) return false;
  return !(typeof v === 'number' && Number.isNaN(v));
}

function texteDe(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

const JOUR_ISO = /^(\d{4})-(\d{2})-(\d{2})/;

function partieDate(v: unknown, rang: 1 | 2 | 3): number | null {
  if (v instanceof Date) {
    const parties = [v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate()];
    return parties[rang - 1];
  }
  if (typeof v !== 'string') return null;
  const m = JOUR_ISO.exec(v.trim());
  return m ? Number(m[rang]) : null;
}

function nombreOuNull(v: unknown, f: (n: number) => number): number | null {
  const n = toNum(v);
  return n === null ? null : f(n);
}

/** Les fonctions de la liste blanche, réécrites ici. Hors liste : une erreur. */
function appliquerFonction(nom: string, args: unknown[]): unknown {
  switch (nom) {
    case 'year':
      return partieDate(args[0], 1);
    case 'month':
      return partieDate(args[0], 2);
    case 'day':
      return partieDate(args[0], 3);
    case 'round': {
      const n = toNum(args[0]);
      if (n === null) return null;
      const d = args.length > 1 ? (toNum(args[1]) ?? 0) : 0;
      const f = 10 ** d;
      return Math.round(n * f) / f;
    }
    case 'abs':
      return nombreOuNull(args[0], Math.abs);
    case 'floor':
      return nombreOuNull(args[0], Math.floor);
    case 'ceil':
      return nombreOuNull(args[0], Math.ceil);
    case 'lower':
      return texteDe(args[0]).toLowerCase();
    case 'upper':
      return texteDe(args[0]).toUpperCase();
    case 'trim':
      return texteDe(args[0]).trim();
    case 'len':
      return Array.isArray(args[0]) ? args[0].length : texteDe(args[0]).length;
    case 'concat':
      return args.map(texteDe).join('');
    case 'replace':
      return texteDe(args[0]).split(texteDe(args[1])).join(texteDe(args[2]));
    case 'coalesce':
      return args.find((v) => v !== null && v !== undefined) ?? null;
    case 'is_null':
      return args[0] === null || args[0] === undefined;
    case 'is_empty':
      return (
        args[0] === null ||
        args[0] === undefined ||
        args[0] === '' ||
        (Array.isArray(args[0]) && args[0].length === 0)
      );
    case 'join':
      return Array.isArray(args[0]) ? args[0].map(texteDe).join(texteDe(args[1])) : null;
    case 'contains':
      return Array.isArray(args[0])
        ? args[0].some((el) => egal(el, args[1]))
        : texteDe(args[0]).includes(texteDe(args[1]));
    default:
      throw new Error(`fonction « ${nom} » hors liste blanche`);
  }
}

function evaluer(noeud: Noeud, row: Row): unknown {
  switch (noeud.type) {
    case 'litteral':
      return noeud.valeur;
    case 'champ':
      return row[noeud.nom] ?? null;
    case 'unaire': {
      const v = evaluer(noeud.operande, row);
      if (noeud.op === 'not') return !vrai(v);
      const n = toNum(v);
      return n === null ? null : -n;
    }
    case 'appel':
      return appliquerFonction(
        noeud.nom,
        noeud.arguments.map((a) => evaluer(a, row))
      );
    case 'quand': {
      for (const branche of noeud.branches) {
        if (vrai(evaluer(branche.si, row))) return evaluer(branche.alors, row);
      }
      return evaluer(noeud.sinon, row);
    }
    case 'binaire': {
      if (noeud.op === 'and') {
        return vrai(evaluer(noeud.gauche, row)) && vrai(evaluer(noeud.droite, row));
      }
      if (noeud.op === 'or') {
        return vrai(evaluer(noeud.gauche, row)) || vrai(evaluer(noeud.droite, row));
      }
      const a = evaluer(noeud.gauche, row);
      const b = evaluer(noeud.droite, row);
      if (noeud.op === '=') return egal(a, b);
      if (noeud.op === '!=') return !egal(a, b);
      if (noeud.op === '<' || noeud.op === '<=' || noeud.op === '>' || noeud.op === '>=') {
        return ordre(noeud.op, a, b);
      }
      if (noeud.op === '+') {
        const na = toNum(a);
        const nb = toNum(b);
        return na !== null && nb !== null ? na + nb : texteDe(a) + texteDe(b);
      }
      return arithmetique(noeud.op, a, b);
    }
  }
}

/**
 * Applique une suite d'assignations à chaque ligne, dans l'ordre déclaré : une
 * assignation suivante relit une colonne calculée avant elle.
 */
export function deriver(rows: Row[], source: string): Row[] {
  const programme = compiler(source);
  return rows.map((row) => {
    const out: Row = { ...row };
    for (const { cible, noeud } of programme) out[cible] = evaluer(noeud, out);
    return out;
  });
}
