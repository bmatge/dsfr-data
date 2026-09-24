/**
 * Nettoyage d'un gabarit de popup ecrit par le modele (#1109).
 *
 * `popupTemplate` est redige par l'assistant du Studio, qui peut etre
 * influence par les DONNEES qu'il lit (une cellule qui contient des
 * instructions). Le gabarit finit en HTML dans la page exportee — attribut
 * `popup-template` de la couche, ou `<template>` du compagnon — : on retire
 * donc a l'export ce qui execute du code ou charge un contenu actif :
 *   - les elements script, iframe, object, embed, style, template (avec leur
 *     contenu ; `template` fermerait aussi celui du compagnon) ;
 *   - tout attribut `on*` ;
 *   - les URL `javascript:`, `vbscript:` et `data:` dans href, src,
 *     xlink:href, action, formaction ;
 *   - les commentaires et declarations (`<!…>`, `<?…>`).
 * Le reste est rendu TEL QUEL, octet pour octet : texte, placeholders
 * `{champ}`, balises et attributs sains.
 *
 * POURQUOI un analyseur maison et pas DOMParser : l'export tourne aussi hors
 * navigateur (garde-fou `check:studio-couverture` sous vite-node, tests), et
 * une sortie qui dependrait de l'environnement ferait mentir l'apercu. C'est
 * un balayage LINEAIRE caractere par caractere, sans expression reguliere sur
 * le texte (pas de retour arriere) : a chaque `<`, on lit une balise complete
 * ou on laisse le caractere comme texte. Choix conservateur : un element
 * dangereux non ferme emporte tout ce qui suit.
 */

/** Elements retires avec tout leur contenu. */
const ELEMENTS_RETIRES: ReadonlySet<string> = new Set([
  'script',
  'iframe',
  'object',
  'style',
  'template',
]);

/** Elements retires sans contenu (vides par nature). */
const ELEMENTS_VIDES_RETIRES: ReadonlySet<string> = new Set(['embed']);

/** Attributs portant une URL. */
const ATTRIBUTS_URL: ReadonlySet<string> = new Set([
  'href',
  'src',
  'xlink:href',
  'action',
  'formaction',
]);

const SCHEMAS_INTERDITS = ['javascript:', 'vbscript:', 'data:'];

function estLettre(c: string | undefined): boolean {
  return c !== undefined && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'));
}

function estEspace(c: string | undefined): boolean {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
}

/**
 * Decode les entites qui servent a masquer un schema (`&#106;avascript:`,
 * `java&Tab;script&colon;`) — numeriques et quelques nommees. Suffisant pour
 * lire le SCHEMA : la valeur emise, elle, reste l'originale.
 */
function decoderEntites(v: string): string {
  const nommees: Record<string, string> = { colon: ':', tab: '\t', newline: '\n' };
  let out = '';
  let i = 0;
  while (i < v.length) {
    if (v[i] !== '&') {
      out += v[i++];
      continue;
    }
    const fin = v.indexOf(';', i);
    const corps = fin === -1 ? '' : v.slice(i + 1, fin);
    let car: string | undefined;
    if (corps.startsWith('#x') || corps.startsWith('#X')) {
      const n = parseInt(corps.slice(2), 16);
      if (Number.isFinite(n)) car = String.fromCodePoint(n);
    } else if (corps.startsWith('#')) {
      const n = parseInt(corps.slice(1), 10);
      if (Number.isFinite(n)) car = String.fromCodePoint(n);
    } else {
      car = nommees[corps.toLowerCase()];
    }
    if (car !== undefined && fin !== -1) {
      out += car;
      i = fin + 1;
    } else {
      out += v[i++];
    }
  }
  return out;
}

/** L'URL ouvre-t-elle un schema interdit, espaces et caracteres de controle ignores ? */
export function urlInterdite(valeur: string): boolean {
  let net = '';
  for (const c of decoderEntites(valeur)) {
    // Le navigateur ignore les espaces de tete et retire tab/CR/LF partout.
    if (c.charCodeAt(0) <= 0x20) continue;
    net += c.toLowerCase();
  }
  return SCHEMAS_INTERDITS.some((s) => net.startsWith(s));
}

interface Attribut {
  nom: string;
  /** Texte source de l'attribut, espace de tete compris. */
  brut: string;
  valeur: string | null;
}

interface Balise {
  nom: string;
  fermante: boolean;
  attributs: Attribut[];
  /** Index juste apres le `>` (ou fin du texte). */
  fin: number;
  /** Texte entre le dernier attribut et le `>` (`/` d'auto-fermeture…). */
  queue: string;
}

/** Lit une balise a partir d'un `<` suivi d'une lettre (ou de `/` + lettre). */
function lireBalise(html: string, debut: number): Balise {
  let j = debut + 1;
  const fermante = html[j] === '/';
  if (fermante) j++;
  const debutNom = j;
  while (j < html.length && !estEspace(html[j]) && html[j] !== '/' && html[j] !== '>') j++;
  const nom = html.slice(debutNom, j).toLowerCase();
  const attributs: Attribut[] = [];
  let queue = '';
  while (j < html.length && html[j] !== '>') {
    const debutAttr = j;
    while (j < html.length && (estEspace(html[j]) || html[j] === '/')) j++;
    if (j >= html.length || html[j] === '>') {
      queue = html.slice(debutAttr, j);
      break;
    }
    const debutNomAttr = j;
    while (
      j < html.length &&
      !estEspace(html[j]) &&
      html[j] !== '/' &&
      html[j] !== '>' &&
      html[j] !== '='
    ) {
      j++;
    }
    const nomAttr = html.slice(debutNomAttr, j).toLowerCase();
    let k = j;
    while (k < html.length && estEspace(html[k])) k++;
    let valeur: string | null = null;
    if (html[k] === '=') {
      k++;
      while (k < html.length && estEspace(html[k])) k++;
      const q = html[k];
      if (q === '"' || q === "'") {
        const fin = html.indexOf(q, k + 1);
        const stop = fin === -1 ? html.length : fin;
        valeur = html.slice(k + 1, stop);
        j = fin === -1 ? html.length : fin + 1;
      } else {
        const d = k;
        while (k < html.length && !estEspace(html[k]) && html[k] !== '>') k++;
        valeur = html.slice(d, k);
        j = k;
      }
    }
    attributs.push({ nom: nomAttr, brut: html.slice(debutAttr, j), valeur });
  }
  return { nom, fermante, attributs, fin: Math.min(j + 1, html.length), queue };
}

/** Index juste apres `</nom …>`, ou fin du texte si l'element n'est pas ferme. */
function apresFermeture(html: string, nom: string, depuis: number): number {
  // Comparaison sur une tranche, pas sur `html.toLowerCase()` : certaines
  // minuscules changent de longueur et decaleraient les index.
  let i = html.indexOf('</', depuis);
  while (i !== -1) {
    const suivant = html[i + 2 + nom.length];
    if (
      html.slice(i + 2, i + 2 + nom.length).toLowerCase() === nom &&
      (suivant === undefined || suivant === '>' || suivant === '/' || estEspace(suivant))
    ) {
      const fin = html.indexOf('>', i);
      return fin === -1 ? html.length : fin + 1;
    }
    i = html.indexOf('</', i + 2);
  }
  return html.length;
}

function attributDangereux(a: Attribut): boolean {
  if (a.nom.startsWith('on')) return true;
  return ATTRIBUTS_URL.has(a.nom) && a.valeur !== null && urlInterdite(a.valeur);
}

/** Gabarit nettoye (voir l'en-tete du module). Un gabarit sain est rendu a l'identique. */
export function nettoyerGabarit(html: string): string {
  let out = '';
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    const c1 = html[lt + 1];
    // Commentaire, declaration, instruction : retires.
    if (c1 === '!' || c1 === '?') {
      if (html.startsWith('<!--', lt)) {
        const fin = html.indexOf('-->', lt + 4);
        i = fin === -1 ? html.length : fin + 3;
      } else {
        const fin = html.indexOf('>', lt);
        i = fin === -1 ? html.length : fin + 1;
      }
      continue;
    }
    const estBalise = estLettre(c1) || (c1 === '/' && estLettre(html[lt + 2]));
    if (!estBalise) {
      out += '<';
      i = lt + 1;
      continue;
    }
    const b = lireBalise(html, lt);
    // `<scr<script>` : un nom de balise qui contient `<` est une tentative de
    // cacher une balise dans une autre. On en fait du texte, et le `<` suivant
    // est lu comme une balise a part entiere.
    if (b.nom.includes('<')) {
      out += '&lt;';
      i = lt + 1;
      continue;
    }
    if (ELEMENTS_RETIRES.has(b.nom)) {
      i = b.fermante ? b.fin : apresFermeture(html, b.nom, b.fin);
      continue;
    }
    if (ELEMENTS_VIDES_RETIRES.has(b.nom)) {
      i = b.fin;
      continue;
    }
    if (b.attributs.some(attributDangereux)) {
      const gardes = b.attributs.filter((a) => !attributDangereux(a));
      const debutNom = lt + 1 + (b.fermante ? 1 : 0);
      out +=
        html.slice(lt, debutNom) +
        html.slice(debutNom, debutNom + b.nom.length) +
        gardes.map((a) => a.brut).join('') +
        b.queue +
        '>';
    } else {
      out += html.slice(lt, b.fin);
    }
    i = b.fin;
  }
  return out;
}
