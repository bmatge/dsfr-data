/* eslint-disable */
/**
 * FICHIER GENERE — NE PAS EDITER A LA MAIN.
 *
 * Copie conforme de packages/shared/src/debug/lint-markup.ts.
 * Regenerer : npm run build:lint-markup
 *
 * Le serveur MCP est hors workspace npm et publie separement : il ne peut pas
 * importer le module d'origine. Toute correction se fait dans la source,
 * jamais ici — tests/mcp/lint-markup.test.ts echoue si les deux divergent.
 */

/**
 * Analyse STATIQUE d'un balisage dsfr-data (#608).
 *
 * Complementaire du collecteur : celui-ci observe une page qui tourne, celle-la
 * lit du code sans rien executer. Moins riche — elle ne verra jamais qu'une
 * source renvoie zero ligne — mais utilisable la ou le code vit, dans un
 * editeur, via le serveur MCP.
 *
 * CONTRAINTE STRUCTURELLE : ce fichier ne doit contenir AUCUN import.
 * Il est copie tel quel dans `mcp-server/`, qui est hors des workspaces npm
 * et ne peut donc importer aucun module du monorepo — meme regle que
 * `ia/skill-matching.ts`, et pour la meme raison. Le contrat des composants
 * est donc passe en PARAMETRE, jamais importe.
 *
 * L'autorite est `packages/core/custom-elements.json`, genere depuis le code :
 * la liste des attributs ne peut pas deriver du reel.
 */

/** Ce qu'une balise accepte, extrait du manifeste genere. */
export interface TagContract {
  attributes: string[];
  /** Attributs retires, avec la conduite a tenir. */
  deprecated?: Record<string, string>;
}

export type ComponentContract = Record<string, TagContract>;

export type LintSeverity = 'erreur' | 'avertissement';

export interface LintFinding {
  severity: LintSeverity;
  /** Balise concernee, ex. `dsfr-data-query`. */
  tag: string;
  /** Id declare, si present — pour situer dans un long fichier. */
  id?: string;
  message: string;
}

/** Balises qui doivent porter un `id` : elles reemettent sous ce nom. */
const REEMETTEURS = [
  'dsfr-data-source',
  'dsfr-data-query',
  'dsfr-data-normalize',
  'dsfr-data-join',
  'dsfr-data-unpivot',
  'dsfr-data-facets',
  'dsfr-data-search',
];

/** Balises dont l'amont se declare par `left` + `right` et non par `source`. */
const DEUX_AMONTS = ['dsfr-data-join'];

interface BaliseLue {
  tag: string;
  attrs: Record<string, string>;
}

/**
 * Lit les attributs d'une balise, caractere par caractere.
 *
 * Un analyseur plutot qu'une expression reguliere : le motif naturel
 * (`nom(="valeur")?` repete) melange quantificateur et alternative optionnelle,
 * ce que les linters de securite signalent a juste titre comme un risque de
 * retour arriere exponentiel. Ce parcours est LINEAIRE par construction —
 * chaque caractere est lu une fois — et se lit plus facilement.
 */
function lireAttributs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let i = 0;
  const estEspace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

  while (i < source.length) {
    while (i < source.length && (estEspace(source[i]) || source[i] === '/')) i++;
    if (i >= source.length) break;

    const debutNom = i;
    while (i < source.length && !estEspace(source[i]) && source[i] !== '=' && source[i] !== '/')
      i++;
    const nom = source.slice(debutNom, i).toLowerCase();
    if (!nom) {
      i++;
      continue;
    }

    while (i < source.length && estEspace(source[i])) i++;
    if (source[i] !== '=') {
      // Attribut booleen : present, sans valeur.
      attrs[nom] = '';
      continue;
    }
    i++;
    while (i < source.length && estEspace(source[i])) i++;

    const guillemet = source[i];
    if (guillemet === '"' || guillemet === "'") {
      i++;
      const debut = i;
      while (i < source.length && source[i] !== guillemet) i++;
      attrs[nom] = source.slice(debut, i);
      i++;
    } else {
      const debut = i;
      while (i < source.length && !estEspace(source[i]) && source[i] !== '>') i++;
      attrs[nom] = source.slice(debut, i);
    }
  }
  return attrs;
}

/**
 * Releve les balises `dsfr-data-*` d'un fragment HTML.
 *
 * Parcours caractere par caractere plutot qu'expression reguliere, pour deux
 * raisons cumulees :
 *
 * 1. Ce module tourne aussi cote serveur MCP, ou il n'y a pas de `DOMParser`.
 * 2. Un motif `[^>]*` s'arreterait au premier `>`, **y compris entre
 *    guillemets** — or `where="population > 5000"` est la syntaxe OFFICIELLE
 *    (`skills/dsfr-data/references/dsfr-data-query.md`). La balise serait
 *    tronquee, ses attributs suivants perdus, et le linter signalerait un
 *    `id` manquant sur du code parfaitement valide. Un faux diagnostic est
 *    pire que pas de diagnostic : il envoie chercher une panne inexistante.
 *
 * Le parcours est LINEAIRE par construction — chaque caractere est lu une
 * fois — donc sans risque de retour arriere exponentiel.
 */
export function lireBalises(html: string): BaliseLue[] {
  const out: BaliseLue[] = [];
  const prefixe = '<dsfr-data-';
  let i = 0;

  while (i < html.length) {
    // On cherche `<` dans la chaine D'ORIGINE puis on compare le prefixe en
    // minuscules sur une TRANCHE. Deux bugs evites d'un coup :
    //   - `html.toLowerCase()` n'a pas la meme longueur que `html` des qu'un
    //     caractere change de taille en minuscule (le turc « I » avec point,
    //     par exemple) : les index se decalent et on tronque des balises,
    //     produisant de faux « Balise inconnue » sur du code valide ;
    //   - recalculer `toLowerCase()` de tout le document a chaque tour rend
    //     le parcours quadratique — 8000 balises passaient de quelques ms a
    //     plus de deux secondes, alors que ce module tourne cote serveur MCP
    //     sur du HTML recu de l'exterieur.
    const debut = html.indexOf('<', i);
    if (debut === -1) break;
    if (html.slice(debut, debut + prefixe.length).toLowerCase() !== prefixe) {
      i = debut + 1;
      continue;
    }

    // Nom de la balise : jusqu'a un espace, un `/` ou le `>` fermant.
    let j = debut + 1;
    while (j < html.length && !/[\s/>]/.test(html[j])) j++;
    const tag = html.slice(debut + 1, j).toLowerCase();

    // Corps de la balise : on avance jusqu'au `>` fermant en IGNORANT ceux
    // qui sont entre guillemets.
    let k = j;
    let guillemet: string | null = null;
    while (k < html.length) {
      const c = html[k];
      if (guillemet) {
        if (c === guillemet) guillemet = null;
      } else if (c === '"' || c === "'") {
        guillemet = c;
      } else if (c === '>') {
        break;
      }
      k++;
    }

    out.push({ tag, attrs: lireAttributs(html.slice(j, k)) });
    i = k + 1;
  }
  return out;
}

/**
 * Diagnostique un balisage sans l'executer.
 *
 * Ne rend QUE ce qui est certain. Un doute — attribut inconnu sur une balise
 * absente du contrat, par exemple — ne produit rien : un linter qui crie au
 * loup apprend a etre ignore, et celui-ci s'adresse autant a un agent qu'a
 * un humain.
 */
export function lintMarkup(html: string, contract: ComponentContract): LintFinding[] {
  const balises = lireBalises(html);
  const findings: LintFinding[] = [];
  const ids = new Set<string>();
  const doublons = new Set<string>();

  for (const b of balises) {
    if (b.attrs.id) {
      if (ids.has(b.attrs.id)) doublons.add(b.attrs.id);
      ids.add(b.attrs.id);
    }
  }

  for (const b of balises) {
    const contrat = contract[b.tag];
    const id = b.attrs.id;
    const situer = (message: string, severity: LintSeverity = 'erreur'): LintFinding =>
      id ? { severity, tag: b.tag, id, message } : { severity, tag: b.tag, message };

    if (!contrat) {
      findings.push(
        situer(
          `Balise inconnue. Composants disponibles : ${Object.keys(contract).sort().join(', ')}.`
        )
      );
      continue;
    }

    // Attributs inconnus — la faute de frappe la plus courante, et la plus
    // silencieuse : un attribut mal orthographie est simplement ignore.
    for (const nom of Object.keys(b.attrs)) {
      if (nom === 'id' || nom === 'class' || nom === 'style' || nom.startsWith('data-')) continue;
      if (nom.startsWith('@') || nom.startsWith(':') || nom.startsWith('.')) continue;
      const deprecie = contrat.deprecated?.[nom];
      if (deprecie) {
        findings.push(situer(`L'attribut "${nom}" a ete retire — ${deprecie}`, 'avertissement'));
        continue;
      }
      if (!contrat.attributes.includes(nom)) {
        const proches = contrat.attributes.filter(
          (a) => a.startsWith(nom.slice(0, 3)) || nom.startsWith(a.slice(0, 3))
        );
        findings.push(
          situer(
            `Attribut inconnu "${nom}" — il sera ignore en silence.` +
              (proches.length > 0 ? ` Vouliez-vous ${proches.slice(0, 3).join(', ')} ?` : '')
          )
        );
      }
    }

    // Un reemetteur sans id n'emet rien : tout l'aval reste inerte, sans la
    // moindre erreur.
    if (REEMETTEURS.includes(b.tag) && !id) {
      findings.push(
        situer(
          'Attribut "id" manquant : ce composant reemet sous son id, sans lui rien ne parvient a l\'aval.'
        )
      );
    }

    // Cablage : un amont declare mais absent est une panne parfaitement
    // muette — le composant attend un evenement qui ne viendra jamais.
    const amonts = DEUX_AMONTS.includes(b.tag)
      ? [b.attrs.left, b.attrs.right].filter(Boolean)
      : b.attrs.source
        ? [b.attrs.source]
        : [];
    for (const amont of amonts) {
      if (!ids.has(amont)) {
        findings.push(
          situer(
            `L'amont "${amont}" n'existe pas dans ce code — ce composant attend un signal qui ne viendra jamais.`
          )
        );
      }
    }
    if (DEUX_AMONTS.includes(b.tag) && (!b.attrs.left || !b.attrs.right)) {
      findings.push(situer('Un join exige "left" ET "right".'));
    }
  }

  for (const dup of doublons) {
    findings.push({
      severity: 'erreur',
      tag: 'id',
      id: dup,
      message: `L'id "${dup}" est declare plusieurs fois : ces composants ecrasent mutuellement leurs donnees.`,
    });
  }

  if (balises.length === 0) {
    findings.push({
      severity: 'avertissement',
      tag: '-',
      message: 'Aucune balise dsfr-data-* trouvee dans ce code.',
    });
  }

  return findings;
}

/** Rend le diagnostic en texte francais — meme doctrine que `formatTrace`. */
export function formatLintFindings(findings: LintFinding[]): string {
  if (findings.length === 0) {
    return 'Analyse statique : aucun probleme detecte. Cela ne garantit pas que les donnees arrivent — seule une execution le dira.';
  }
  const erreurs = findings.filter((f) => f.severity === 'erreur');
  const avertissements = findings.filter((f) => f.severity === 'avertissement');
  const lignes: string[] = [
    `Analyse statique : ${erreurs.length} erreur(s), ${avertissements.length} avertissement(s).`,
    '',
  ];
  for (const f of [...erreurs, ...avertissements]) {
    const ou = f.id ? `${f.tag}#${f.id}` : f.tag;
    lignes.push(`${f.severity === 'erreur' ? 'ERREUR' : 'ATTENTION'}  ${ou}`);
    lignes.push(`  ${f.message}`);
  }
  lignes.push('');
  lignes.push(
    "Cette analyse ne lit que le balisage. Pour savoir ce qui transite reellement entre les composants (lignes, champs, erreurs d'API), il faut executer la page — voir le volet Diagnostic des apps."
  );
  return lignes.join('\n');
}
