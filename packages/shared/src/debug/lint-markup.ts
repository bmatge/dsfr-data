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
  /**
   * Code stable de la regle, ex. `carte/couche-hors-carte` (#995). Pose par
   * les regles cartographiques ; sert au moteur de constats (#996) a relier
   * un constat a sa regle sans analyser le texte du message, qui peut changer.
   */
  regle?: string;
}

/** Balises qui doivent porter un `id` : elles reemettent sous ce nom. */
const REEMETTEURS = [
  'dsfr-data-source',
  'dsfr-data-query',
  'dsfr-data-normalize',
  'dsfr-data-join',
  'dsfr-data-concat',
  'dsfr-data-unpivot',
  'dsfr-data-pivot',
  'dsfr-data-facets',
  'dsfr-data-search',
];

/** Balises dont l'amont se declare par `left` + `right` et non par `source`. */
const DEUX_AMONTS = ['dsfr-data-join'];

interface BaliseLue {
  tag: string;
  attrs: Record<string, string>;
  /**
   * Balises `dsfr-data-*` ouvertes autour de celle-ci, de la plus externe a
   * la plus proche. Seules les balises dsfr-data sont suivies : un `<div>`
   * intermediaire n'y figure pas.
   */
  parents: string[];
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
  const prefixeFermant = '</dsfr-data-';
  /** Balises dsfr-data ouvertes et pas encore fermees. */
  const pile: string[] = [];
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

    // Balise fermante `</dsfr-data-...>` : on depile jusqu'a la balise
    // ouverte du meme nom. Une fermante sans ouvrante est ignoree — un
    // fragment partiel ne doit pas decaler l'imbrication du reste.
    if (html.slice(debut, debut + prefixeFermant.length).toLowerCase() === prefixeFermant) {
      let j = debut + 2;
      while (j < html.length && !/[\s/>]/.test(html[j])) j++;
      const nom = html.slice(debut + 2, j).toLowerCase();
      const pos = pile.lastIndexOf(nom);
      if (pos !== -1) pile.length = pos;
      const fin = html.indexOf('>', j);
      i = fin === -1 ? html.length : fin + 1;
      continue;
    }

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

    const corps = html.slice(j, k);
    out.push({ tag, attrs: lireAttributs(corps), parents: [...pile] });
    // Une balise auto-fermante (`<dsfr-data-x />`, ecrite dans certains
    // gabarits) n'ouvre rien.
    if (!corps.trimEnd().endsWith('/')) pile.push(tag);
    i = k + 1;
  }
  return out;
}

/** Modes d'affichage acceptes par `dsfr-data-map-popup` (`PopupMode`). */
const MODES_POPUP = ['popup', 'modal', 'panel-right', 'panel-left'];

/**
 * Types de couche qui ne branchent ni popup ni infobulle en `no-interactive`.
 * `marker` les branche quand meme ; `heatmap` n'en branche jamais.
 */
const TYPES_SENSIBLES_NO_INTERACTIVE = ['geoshape', 'circle'];

/** Champs geographiques que la couche devine seule, sans `geo-field`. */
const CHAMPS_GEO_DEVINES = ['geo_point_2d', 'geopoint', 'geo_point'];

/**
 * Colonnes geometriques qu'une couche `geoshape` devine seule, sans
 * `geo-field` (#1053) — `CHAMPS_FORME_DEVINES` de dsfr-data-map-layer.ts.
 */
const CHAMPS_FORME_DEVINES = ['geo_shape', 'geometry', 'geom'];

type Situer = (message: string, severity: LintSeverity, regle: string) => LintFinding;

/** Un attribut present ET renseigne. */
function renseigne(attrs: Record<string, string>, nom: string): boolean {
  return nom in attrs && attrs[nom] !== '';
}

/**
 * Regles cartographiques (#995) : ce qui se voit dans le balisage d'une carte
 * sans l'executer. Chaque regle decrit un comportement VERIFIE dans
 * `dsfr-data-map-layer.ts` et `dsfr-data-map-popup.ts` — une carte vide ou
 * une popup qui ne s'ouvre jamais, sans la moindre erreur en console.
 *
 * Chaque constat porte un code `regle` stable (`carte/...`) : le moteur de
 * constats (#996) s'appuie dessus, pas sur le texte du message.
 */
function reglesCarte(b: BaliseLue, balises: BaliseLue[], situer: Situer): LintFinding[] {
  const out: LintFinding[] = [];
  const dansCarte = b.parents.includes('dsfr-data-map');
  // Sans aucune <dsfr-data-map> dans le code, on lit peut-etre un EXTRAIT
  // (une couche montree seule, comme dans la documentation) : le placement
  // n'est certain que si une carte est presente ailleurs. Sinon, simple
  // avertissement.
  const codeAvecCarte = balises.some((x) => x.tag === 'dsfr-data-map');
  const graviteHorsCarte: LintSeverity = codeAvecCarte ? 'erreur' : 'avertissement';
  const siExtrait = codeAvecCarte ? '' : ' (si ce code est la page complete)';

  if (b.tag === 'dsfr-data-map-layer') {
    const a = b.attrs;
    const type = a.type || 'marker';

    // `closest('dsfr-data-map')` ne trouve rien (dsfr-data-map-layer.ts
    // l.707-708) : la couche s'arrete a sa connexion, sans rien dessiner.
    if (!dansCarte) {
      out.push(
        situer(
          `Couche hors de toute <dsfr-data-map>${siExtrait} : elle ne trouve pas de carte et ne dessine rien. La placer entre <dsfr-data-map> et </dsfr-data-map>.`,
          graviteHorsCarte,
          'carte/couche-hors-carte'
        )
      );
    }

    // Coordonnees separees : il faut les DEUX, sinon celui qui est pose est
    // ignore sans rien dire (`_extractCoords` exige lat-field ET lon-field).
    const lat = renseigne(a, 'lat-field');
    const lon = renseigne(a, 'lon-field');
    const geo = renseigne(a, 'geo-field');
    if (type !== 'geoshape' && lat !== lon) {
      const present = lat ? 'lat-field' : 'lon-field';
      const manquant = lat ? 'lon-field' : 'lat-field';
      out.push(
        situer(
          `"${present}" sans "${manquant}" : les coordonnees separees exigent les deux, "${present}" est ignore en silence.`,
          'erreur',
          'carte/lat-sans-lon'
        )
      );
    }

    // geoshape : sans `geo-field`, `_autoDetectShapeField` (dsfr-data-map-layer.ts)
    // cherche le GeoJSON dans geo_shape, geometry puis geom (#1053) — et le
    // dit en console s'il ne trouve rien. Pas une erreur certaine : un simple
    // avertissement, qui explicite la colonne.
    // Autres types : `_extractCoords` enchaine lat/lon, puis geo-field, puis
    // devine geo_point_2d / geopoint / geo_point — avertissement aussi.
    if (type === 'geoshape' && !geo) {
      out.push(
        situer(
          `Couche "geoshape" sans "geo-field" : la couche cherche la geometrie dans ${CHAMPS_FORME_DEVINES.join(', ')}, dans cet ordre. Si les donnees la portent sous un autre nom, aucune forme n'est dessinee ; indiquer le champ qui porte le GeoJSON rend la page explicite.`,
          'avertissement',
          'carte/geoshape-sans-geo-field'
        )
      );
    } else if (type !== 'geoshape' && !geo && !lat && !lon) {
      // Pas une erreur certaine : la couche devine quelques noms de champs.
      out.push(
        situer(
          `Ni "lat-field"/"lon-field" ni "geo-field" : la couche ne trouvera des positions que si les donnees ont un champ ${CHAMPS_GEO_DEVINES.join(', ')}. Sinon la carte reste vide.`,
          'avertissement',
          'carte/sans-coordonnees'
        )
      );
    }

    // `max-items` est un Number : "abc" donne NaN, "" donne 0 — et le plafond
    // ne s'applique que s'il est strictement positif (`maxItems > 0`,
    // dsfr-data-map-layer.ts l.910).
    if ('max-items' in a) {
      const brut = a['max-items'].trim();
      const n = Number(brut);
      if (brut === '' || Number.isNaN(n)) {
        out.push(
          situer(
            `"max-items" n'est pas un nombre ("${a['max-items']}") : le plafond est desactive en silence et la couche tente de tout dessiner.`,
            'erreur',
            'carte/max-items-invalide'
          )
        );
      } else if (n <= 0) {
        out.push(
          situer(
            `"max-items" vaut ${brut} : le plafond est desactive, la couche dessine toutes les lignes recues. Sur un gros jeu la page peut ramer ; preferer un nombre positif (defaut 5000).`,
            'avertissement',
            'carte/max-items-nul'
          )
        );
      }
    }

    // Popup ou infobulle demandee sur une couche qui n'en branche pas :
    // geoshape et circle sautent `_bindPopup`/`_bindTooltip` en
    // no-interactive (l.1211, l.1263), le marqueur les branche toujours
    // (l.1157), la heatmap jamais.
    const idCouche = a.id || a.source;
    const demandes = ['popup-template', 'popup-fields', 'tooltip-field'].filter((n) =>
      renseigne(a, n)
    );
    const popupCiblee = balises.some(
      (p) =>
        p.tag === 'dsfr-data-map-popup' &&
        !p.parents.includes('dsfr-data-map-layer') &&
        !!p.attrs.for &&
        p.attrs.for === idCouche
    );
    if (popupCiblee) demandes.push('<dsfr-data-map-popup for>');
    const raison =
      type === 'heatmap'
        ? 'une couche "heatmap" ne branche ni popup ni infobulle'
        : 'no-interactive' in a && TYPES_SENSIBLES_NO_INTERACTIVE.includes(type)
          ? `"no-interactive" retire popup et infobulle d'une couche "${type}"`
          : '';
    if (demandes.length > 0 && raison) {
      out.push(
        situer(
          `${demandes.join(', ')} sans effet : ${raison}.`,
          'avertissement',
          'carte/popup-sans-effet'
        )
      );
    }
  }

  if (b.tag === 'dsfr-data-map-popup') {
    // La couche cherche sa popup en elle-meme, puis parmi les enfants directs
    // de sa carte (dsfr-data-map-layer.ts l.1491-1503).
    if (!dansCarte) {
      out.push(
        situer(
          `Popup hors de toute <dsfr-data-map>${siExtrait} : aucune couche ne la trouve, elle ne s'ouvrira jamais. La placer comme enfant direct de la carte, ou dans la couche.`,
          graviteHorsCarte,
          'carte/popup-mal-placee'
        )
      );
    }

    // Mode inconnu : le clic appelle `showForRecord`, dont le switch ne
    // reconnait rien — rien ne s'affiche.
    if ('mode' in b.attrs && !MODES_POPUP.includes(b.attrs.mode)) {
      out.push(
        situer(
          `Mode "${b.attrs.mode}" inconnu : rien ne s'affiche au clic. Modes acceptes : ${MODES_POPUP.join(', ')}.`,
          'erreur',
          'carte/popup-mode-invalide'
        )
      );
    }

    // `for` designe une couche par son id (ou, sans id, par sa source). Une
    // popup placee DANS une couche n'utilise pas `for`.
    const cible = b.attrs.for;
    if (cible && dansCarte && !b.parents.includes('dsfr-data-map-layer')) {
      const existe = balises.some(
        (l) => l.tag === 'dsfr-data-map-layer' && (l.attrs.id || l.attrs.source) === cible
      );
      if (!existe) {
        out.push(
          situer(
            `for="${cible}" ne designe aucune couche de ce code (id, ou source d'une couche sans id) : la popup ne s'ouvrira jamais.`,
            'erreur',
            'carte/popup-cible-absente'
          )
        );
      }
    }
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
    const situer = (
      message: string,
      severity: LintSeverity = 'erreur',
      regle?: string
    ): LintFinding => {
      const f: LintFinding = id
        ? { severity, tag: b.tag, id, message }
        : { severity, tag: b.tag, message };
      if (regle) f.regle = regle;
      return f;
    };

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
      : b.tag === 'dsfr-data-concat'
        ? (b.attrs.sources ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
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

    findings.push(...reglesCarte(b, balises, situer));
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
