/**
 * Nettoyage d'un fragment HTML qui n'est pas de confiance (#1109, #1289).
 *
 * Ne a l'export du Studio — `popupTemplate` et le bloc de texte sont rediges
 * par l'assistant, qui peut etre influence par les DONNEES qu'il lit (une
 * cellule qui contient des instructions) — il sert aussi a la bibliotheque :
 * `dsfr-data-chart` y passe ce que DSFR Chart pose par `innerHTML`
 * (`databox-modal-content`, `unit-tooltip`, #1289). On retire ce qui execute
 * du code ou charge un contenu actif :
 *   - les elements script, iframe, object, embed, style, template (avec leur
 *     contenu ; `template` fermerait aussi celui du compagnon) ;
 *   - les elements a TEXTE BRUT — textarea, title, xmp, noembed, noframes,
 *     noscript, plaintext — avec leur contenu : le navigateur n'y lit pas de
 *     balise, si bien qu'un `</textarea>` ecrit dans une valeur d'attribut y
 *     ferme l'element et libere la balise qui suit (#1289, mesure) ;
 *   - les elements meta, base et link, qui redirigent la page, deroutent ses
 *     URL relatives ou chargent une feuille de style (#1081) ;
 *   - les animations SVG `animate` et `set`, qui posent un `href` en
 *     `javascript:` sur le lien qui les contient (#1289, mesure) ;
 *   - tout attribut `on*` ;
 *   - les URL `javascript:`, `vbscript:` et `data:` dans href, src,
 *     xlink:href, action, formaction ;
 *   - les commentaires et declarations (`<!…>`, `<?…>`).
 * Le reste est rendu TEL QUEL, octet pour octet : texte, placeholders
 * `{champ}`, balises et attributs sains.
 *
 * CE QUE LE NETTOYAGE NE FAIT PAS : il retire ce qui s'EXECUTE, pas ce qui
 * trompe. Un formulaire qui poste vers un tiers, un lien, une image distante,
 * un attribut `style` ou `id` restent. Une donnee recopiee dans du HTML
 * s'echappe d'abord (`escapeHtml`) : le nettoyage est un filet, pas une
 * licence (docs/SECURITY.md).
 *
 * POURQUOI un analyseur maison et pas DOMParser : l'export tourne aussi hors
 * navigateur (garde-fou `check:studio-couverture` sous vite-node, tests), et
 * une sortie qui dependrait de l'environnement ferait mentir l'apercu. C'est
 * un balayage LINEAIRE caractere par caractere, sans expression reguliere sur
 * le texte (pas de retour arriere) : a chaque `<`, on lit une balise complete
 * ou on laisse le caractere comme texte. Choix conservateur : un element
 * dangereux non ferme emporte tout ce qui suit.
 *
 * Un analyseur maison n'est sur que s'il lit une balise COMME LE NAVIGATEUR.
 * Trois ecarts ont ete mesures dans Chromium et fermes (#1289) : le nom
 * d'attribut qui commence par `=` (`<a ="><img onerror=…>">` : le navigateur
 * ferme la balise au premier `>`), la reference numerique sans point-virgule
 * (`&#106avascript:`), et le RECOLLEMENT — ce qu'un retrait laisse se
 * rejoindre (`<<script></script>img onerror=…>`, ou deux attributs sains de
 * part et d'autre d'un attribut retire). Le recollement est ferme deux fois :
 * a la source, et par une relecture — le resultat est repasse au filtre
 * jusqu'a ce qu'il n'y trouve plus rien (`nettoyerGabarit`).
 */

/** Elements retires avec tout leur contenu. */
const ELEMENTS_RETIRES: ReadonlySet<string> = new Set([
  'script',
  'iframe',
  'object',
  'style',
  'template',
  // Texte brut (RCDATA / RAWTEXT / PLAINTEXT) : voir l'en-tete.
  'textarea',
  'title',
  'xmp',
  'noembed',
  'noframes',
  'noscript',
  'plaintext',
]);

/** Elements retires sans contenu (vides par nature, ou simples porteurs d'attributs). */
const ELEMENTS_VIDES_RETIRES: ReadonlySet<string> = new Set([
  'embed',
  'meta',
  'base',
  'link',
  'animate',
  'set',
]);

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

function estChiffre(c: string | undefined, hexa: boolean): boolean {
  if (c === undefined) return false;
  if (c >= '0' && c <= '9') return true;
  return hexa && ((c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'));
}

/**
 * Decode les entites qui servent a masquer un schema (`&#106;avascript:`,
 * `java&Tab;script&colon;`) — numeriques et quelques nommees. Suffisant pour
 * lire le SCHEMA : la valeur emise, elle, reste l'originale.
 *
 * Une reference NUMERIQUE se lit comme le navigateur la lit : ses chiffres,
 * puis un point-virgule FACULTATIF. `&#106avascript:` vaut `javascript:` dans
 * un attribut (#1289) ; l'ancienne lecture cherchait le point-virgule et ne
 * decodait rien sans lui. Un code hors d'Unicode ne leve pas (U+FFFD).
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
    if (v[i + 1] === '#') {
      const hexa = v[i + 2] === 'x' || v[i + 2] === 'X';
      const debut = i + (hexa ? 3 : 2);
      let j = debut;
      while (estChiffre(v[j], hexa)) j++;
      if (j > debut) {
        // Au-dela de 8 chiffres le code est hors d'Unicode de toute facon.
        const n = j - debut > 8 ? NaN : parseInt(v.slice(debut, j), hexa ? 16 : 10);
        out += Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '�';
        i = v[j] === ';' ? j + 1 : j;
        continue;
      }
      out += v[i++];
      continue;
    }
    const fin = v.indexOf(';', i);
    const car = fin === -1 ? undefined : nommees[v.slice(i + 1, fin).toLowerCase()];
    if (car !== undefined) {
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
    // Un `=` en tete de nom FAIT PARTIE du nom, comme dans le navigateur
    // (« before attribute name ») : `<a ="><img onerror=…>">` est une balise
    // `a` fermee au premier `>`, suivie d'une balise `img`. Le lire comme une
    // valeur entre guillemets laissait passer la seconde (#1289).
    if (html[j] === '=') j++;
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

/**
 * Un `<` (ou `</`) laisse comme TEXTE en fin de sortie devient `&lt;` des
 * qu'un retrait le suit : sinon il se recolle a ce qui vient apres l'element
 * retire et forme une balise (`<<script></script>img onerror=…>`).
 */
function neutraliserChevronFinal(out: string): string {
  if (out.endsWith('</')) return `${out.slice(0, -2)}&lt;/`;
  if (out.endsWith('<')) return `${out.slice(0, -1)}&lt;`;
  return out;
}

/** Attribut garde, toujours SEPARE de ce qui le precede dans la balise reecrite. */
function attributSepare(a: Attribut): string {
  return estEspace(a.brut[0]) || a.brut[0] === '/' ? a.brut : ` ${a.brut}`;
}

/** Une passe du filtre. `nettoyerGabarit` la rejoue jusqu'au point fixe. */
function passe(html: string): string {
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
      out = neutraliserChevronFinal(out);
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
      out = neutraliserChevronFinal(out);
      i = b.fermante ? b.fin : apresFermeture(html, b.nom, b.fin);
      continue;
    }
    if (ELEMENTS_VIDES_RETIRES.has(b.nom)) {
      out = neutraliserChevronFinal(out);
      i = b.fin;
      continue;
    }
    if (b.attributs.some(attributDangereux)) {
      const gardes = b.attributs.filter((a) => !attributDangereux(a));
      const debutNom = lt + 1 + (b.fermante ? 1 : 0);
      // Chaque attribut garde reste SEPARE du precedent : sans cela `o` et
      // `nerror=…`, de part et d'autre d'un attribut retire, se recollent en
      // `onerror=…` (#1289).
      out +=
        html.slice(lt, debutNom) +
        html.slice(debutNom, debutNom + b.nom.length) +
        gardes.map(attributSepare).join('') +
        b.queue +
        '>';
    } else {
      out += html.slice(lt, b.fin);
    }
    i = b.fin;
  }
  return out;
}

/** Nombre de relectures avant de renoncer a garder du HTML. */
const RELECTURES_MAX = 8;

/**
 * Fragment nettoye (voir l'en-tete du module). Un fragment sain est rendu a
 * l'identique.
 *
 * Le resultat est RELU : il repasse au filtre jusqu'a ce que celui-ci n'y
 * trouve plus rien a retirer. Un retrait peut faire se rejoindre deux
 * morceaux inoffensifs ; la relecture garantit que ce qui sort n'est plus
 * retouche par le filtre, donc qu'aucune construction qu'il sait reconnaitre
 * n'y reste. Si le texte ne se stabilise pas en quelques passes — il a ete
 * construit pour cela —, plus aucune balise n'est gardee : tout `<` devient
 * `&lt;`. Fonction pure, sans DOM : elle rend la meme chose dans un
 * navigateur et sous Node.
 */
export function nettoyerGabarit(html: string): string {
  let courant = html;
  for (let n = 0; n < RELECTURES_MAX; n++) {
    const suivant = passe(courant);
    if (suivant === courant) return courant;
    courant = suivant;
  }
  return courant.split('<').join('&lt;');
}
