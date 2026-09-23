/**
 * Le moteur de constats (#996, epic #991, ADR-143 §3).
 *
 * UNE seule sortie pour tout ce que le volet Diagnostic, l'assistant
 * contextuel et le studio doivent signaler : `Constat[]`. Les règles sont des
 * fonctions PURES `(trace, contexte) → Constat[]`, sans DOM ni réseau,
 * testées une à une (`tests/debug/constats.test.ts`) : le serveur MCP peut
 * les servir telles quelles.
 *
 * Le compte d'alertes du rail replié (`summarizeTrace`) est calculé ICI,
 * depuis les constats : il n'existe plus de seconde liste de pannes à tenir
 * d'accord avec la première.
 *
 * Invariants :
 *
 * 1. **Lib-safe.** Ce module n'importe que le collecteur (`recorder`, `graph`,
 *    `field-check`, `format`, `journal`) : jamais `../ia/`, `../ui/` ni
 *    `../api/` (test-garde). Il est publié par les deux barrels via
 *    `debug/index.ts`.
 * 2. **Aucun chiffre nouveau** (ADR-122 non applicable) : une règle ne cite
 *    que des comptes déjà présents dans la trace. Ni pourcentage, ni
 *    différence, ni seuil, ni valeur par défaut chiffrée : le test « aucun
 *    nombre absent de la trace » refuse toute règle qui en inventerait un.
 * 3. **Des repères, pas des sélecteurs.** `reperes` porte des identifiants du
 *    registre (`carto.couches.geo-field`), vérifiés par `check:reperes` (#997)
 *    dans les fichiers de constats que l'app déclare, pas ici. Les règles
 *    génériques ne connaissent aucune app : elles n'en citent aucun.
 * 4. **Aucune expression régulière sur du texte externe** (message d'erreur,
 *    URL) : `startsWith`, `includes`, `===` et `new URL()` sous `try`.
 * 5. **Pas de registre mutable.** Une app compose :
 *    `evaluerConstats(trace, ctx, [...REGLES_GENERIQUES, ...REGLES_CARTO])`.
 *    Une règle d'app qui dit mieux une générique la déclare dans `remplace`
 *    (avec ses `tags`) : le moteur retire les constats génériques sur les
 *    nœuds visés, et nulle part ailleurs. Chaque app n'a pas à refaire son
 *    filtrage.
 */

import type { StageNode } from './graph.js';
import { topoOrder } from './graph.js';
import { fieldIssuesByNode } from './field-check.js';
import type { StageState, Trace } from './recorder.js';
import { formatInt, isJoinAlert, plural } from './format.js';
import { masquerUrl, type EntreeConsole, type EntreeReseau } from './journal.js';

/** Gravité d'un constat. `info` ne compte pas dans les alertes du rail. */
export type GraviteConstat = 'erreur' | 'avertissement' | 'info';

/** Une panne (ou un fait utile) relevée par une règle. */
export interface Constat {
  /** Unique par occurrence : `${regle}`, ou `${regle}@${etape}` quand la règle vise une étape. */
  id: string;
  /** Id de la règle : `<domaine>/<regle>` en kebab (`pipeline/etape-en-erreur`). */
  regle: string;
  gravite: GraviteConstat;
  /** Une ligne, sans point final, lisible sur une pastille. */
  titre: string;
  /** Cause, une à trois phrases. */
  explication: string;
  /** Geste proposé, rendu sous l'explication. */
  action?: string;
  /** Repères cités, ids `<app>.<zone>.<controle>` du registre (#997) ; vide pour une règle générique. */
  reperes: readonly string[];
  /** Ce qu'on a vu : comptes et noms DÉJÀ dans la trace, jamais un nombre calculé (ADR-122). */
  preuve: string;
  /** Id du nœud (`trace.graph.nodes[].id`) quand le constat vise une étape. */
  etape?: string;
}

/** Ce que l'appelant sait en plus de la trace. */
export interface ContexteConstats {
  /** App consommatrice : `builder-carto`, `studio`… ; `'*'` hors app (MCP, tests). */
  app: string;
  /** État de l'app, lu par les règles propres à une app (#1000). */
  etat?: unknown;
  /** `window.location.origin` : une requête de même origine n'est pas un CORS. */
  origine?: string;
}

/** Une règle du registre. */
export interface RegleConstat {
  /** `<domaine>/<regle>` ; chaque constat rendu porte `regle === id`. */
  id: string;
  /** Apps concernées ; `['*']` = toutes. Une liste, pas un prédicat : sérialisable et listable. */
  appliesTo: readonly string[];
  /** Balises des nœuds visés (`dsfr-data-map-layer`) ; absent = tous. */
  tags?: readonly string[];
  /**
   * Ids de règles génériques que celle-ci dit mieux, et dont les constats
   * sont retirés sur les nœuds de ses `tags` — le nœud lui-même, ou une
   * étape dont il consomme directement la sortie (le « zéro ligne » d'une
   * source est dit par le « aucune donnée » de la couche qui la lit). Sans
   * `tags`, partout. Une règle non applicable à l'app ne remplace rien.
   */
  remplace?: readonly string[];
  evaluer(trace: Trace, contexte: ContexteConstats): Constat[];
}

// ---------------------------------------------------------------------------
// Aides
// ---------------------------------------------------------------------------

interface ChampsConstat {
  titre: string;
  explication: string;
  action?: string;
  reperes?: readonly string[];
  preuve: string;
  etape?: string;
}

function constat(regle: string, gravite: GraviteConstat, c: ChampsConstat): Constat {
  const out: Constat = {
    id: c.etape !== undefined ? `${regle}@${c.etape}` : regle,
    regle,
    gravite,
    titre: c.titre,
    explication: c.explication,
    reperes: c.reperes ?? [],
    preuve: c.preuve,
  };
  if (c.action !== undefined) out.action = c.action;
  if (c.etape !== undefined) out.etape = c.etape;
  return out;
}

/** Parcourt les étapes en ordre topologique. */
function parEtape(
  trace: Trace,
  fn: (node: StageNode, state: StageState | undefined) => Constat[]
): Constat[] {
  return topoOrder(trace.graph).flatMap((node) => fn(node, trace.states[node.id]));
}

/** Hôte et chemin seulement, jetons masqués : ni requête ni fragment, où logent données et secrets. */
function urlSure(url: string): string {
  const masquee = masquerUrl(url);
  let fin = masquee.length;
  const q = masquee.indexOf('?');
  if (q >= 0) fin = q;
  const h = masquee.indexOf('#');
  if (h >= 0 && h < fin) fin = h;
  return masquee.slice(0, fin);
}

/** Texte externe borné, pour une preuve sur une ligne. */
function bornerTexte(texte: string, max = 200): string {
  return texte.length > max ? `${texte.slice(0, max - 1)}…` : texte;
}

/**
 * La requête du journal est-elle celle qu'une étape a tentée ? Comparaison de
 * chaînes après masquage des jetons, sans expression régulière.
 */
function memeRequete(entree: EntreeReseau, attemptedUrl: string): boolean {
  return masquerUrl(entree.url) === masquerUrl(attemptedUrl);
}

/** Échec réseau : pas de réponse, ou un statut HTTP d'erreur. */
function enEchec(e: EntreeReseau): boolean {
  return e.statut === null || e.statut >= 400;
}

/** Étape en échec dont `attemptedUrl` désigne cette requête. */
function etapeDeLaRequete(trace: Trace, entree: EntreeReseau): string | undefined {
  for (const node of topoOrder(trace.graph)) {
    const state = trace.states[node.id];
    if (
      state?.status === 'error' &&
      state.attemptedUrl &&
      memeRequete(entree, state.attemptedUrl)
    ) {
      return node.id;
    }
  }
  return undefined;
}

/** L'échec réseau journalisé qui explique celui de l'étape, le plus récent d'abord. */
function echecReseauDeLEtape(trace: Trace, state: StageState): EntreeReseau | undefined {
  const url = state.attemptedUrl;
  if (!url) return undefined;
  const reseau = trace.reseau ?? [];
  for (let i = reseau.length - 1; i >= 0; i--) {
    if (enEchec(reseau[i]) && memeRequete(reseau[i], url)) return reseau[i];
  }
  return undefined;
}

/**
 * L'URL passe-t-elle déjà par un proxy de l'application ? Tous ses points de
 * sortie finissent en `-proxy` (`/tabular-proxy`, `/cors-proxy`… :
 * `DEFAULT_ENDPOINTS` de `api/proxy-config.ts`, qu'on n'importe pas ici).
 */
export function urlDejaProxifiee(url: string): boolean {
  return url.includes('-proxy/') || url.endsWith('-proxy');
}

/** Requête vers une autre origine que la page. Sans origine connue, on la suppose croisée. */
function autreOrigine(url: string, origine: string | undefined): boolean {
  if (!origine) return true;
  try {
    return new URL(url, origine).origin !== origine;
  } catch {
    return true;
  }
}

/**
 * CORS déduit (ADR-143 §3) : le navigateur ne distingue pas un blocage CORS
 * d'un hôte injoignable, les deux rendent un `TypeError` sans réponse. On le
 * suppose quand la requête est croisée ET ne passe pas déjà par le proxy.
 */
function corsProbable(e: EntreeReseau, contexte: ContexteConstats): boolean {
  return (
    e.statut === null &&
    (e.erreur ?? '').startsWith('TypeError') &&
    autreOrigine(e.url, contexte.origine) &&
    !urlDejaProxifiee(e.url)
  );
}

/** Cause d'une troncature, lue sur les attributs (#658), sans chiffre inventé. */
function causeTroncature(node: StageNode): { cause: string; action: string } {
  if (node.tag === 'dsfr-data-query' || node.attrs.limit) {
    return {
      cause: node.attrs.limit ? `limit="${node.attrs.limit}"` : 'attribut limit',
      action: 'Relever ou retirer limit si le calcul doit porter sur tout le jeu',
    };
  }
  return {
    cause: node.attrs['max-records']
      ? `max-records="${node.attrs['max-records']}"`
      : 'plafond max-records par défaut',
    action: 'Relever max-records, ou déléguer le calcul au serveur (group-by, aggregate)',
  };
}

// ---------------------------------------------------------------------------
// Règles génériques : pipeline
// ---------------------------------------------------------------------------

const TOUTES: readonly string[] = ['*'];

const amontManquant: RegleConstat = {
  id: 'pipeline/amont-manquant',
  appliesTo: TOUTES,
  evaluer: (trace) =>
    trace.graph.dangling.map((d) =>
      constat('pipeline/amont-manquant', 'erreur', {
        titre: `${d.node} attend « ${d.missing} », absent de la page`,
        explication:
          'Le composant attend un signal qui ne viendra jamais : aucun élément ne porte cet id.',
        action: "Corriger l'attribut source, ou ajouter l'étape manquante",
        preuve: `${d.node} déclare source="${d.missing}"`,
        etape: d.node,
      })
    ),
};

const configuration: RegleConstat = {
  id: 'pipeline/configuration',
  appliesTo: TOUTES,
  evaluer: (trace) =>
    parEtape(trace, (node) =>
      node.configError
        ? [
            constat('pipeline/configuration', 'erreur', {
              titre: `${node.id} : configuration invalide`,
              explication: "Le composant a refusé sa configuration et n'a rien produit.",
              preuve: bornerTexte(node.configError),
              etape: node.id,
            }),
          ]
        : []
    ),
};

const attributInconnu: RegleConstat = {
  id: 'pipeline/attribut-inconnu',
  appliesTo: TOUTES,
  evaluer: (trace) =>
    parEtape(trace, (node) => {
      const attrs = node.unknownAttrs ?? [];
      if (attrs.length === 0) return [];
      const s = attrs.length > 1 ? 's' : '';
      return [
        constat('pipeline/attribut-inconnu', 'avertissement', {
          titre: `${node.id} : attribut${s} inconnu${s} de la version chargée`,
          explication:
            'La bibliothèque chargée les ignore en silence : faute de frappe, ou attribut plus récent que la version servie.',
          action: "Vérifier l'orthographe, ou mettre la bibliothèque à jour",
          preuve: `${node.tag}#${node.id} : ${attrs.join(', ')}`,
          etape: node.id,
        }),
      ];
    }),
};

const champIntrouvable: RegleConstat = {
  id: 'pipeline/champ-introuvable',
  appliesTo: TOUTES,
  evaluer: (trace) => {
    const parNoeud = fieldIssuesByNode(trace.graph, trace.states);
    return parEtape(trace, (node) => {
      const issues = parNoeud[node.id] ?? [];
      if (issues.length === 0) return [];
      const absents = issues.filter((i) => i.reason === 'absent');
      return [
        constat('pipeline/champ-introuvable', absents.length > 0 ? 'erreur' : 'avertissement', {
          titre:
            absents.length > 0
              ? `${node.id} : champ introuvable dans les données reçues`
              : `${node.id} : champ sans valeur dans les données reçues`,
          explication: issues.map((i) => i.message).join(' '),
          preuve: issues.map((i) => `${i.attr}="${i.field}"`).join(', '),
          etape: node.id,
        }),
      ];
    });
  },
};

const etapeEnErreur: RegleConstat = {
  id: 'pipeline/etape-en-erreur',
  appliesTo: TOUTES,
  evaluer: (trace, contexte) =>
    parEtape(trace, (node, state) => {
      if (state?.status !== 'error') return [];
      // Un échec expliqué par le journal réseau est dit, plus précisément, par
      // `reseau/http-erreur` ou `reseau/cors-deduit` : le redire compterait
      // deux alertes pour une panne.
      const echec = echecReseauDeLEtape(trace, state);
      if (echec && (echec.statut !== null || corsProbable(echec, contexte))) return [];
      return [
        constat('pipeline/etape-en-erreur', 'erreur', {
          titre: `${node.id} : échec du chargement`,
          explication: "L'étape n'a rien livré : tout l'aval reste vide.",
          action: "Lire le message d'erreur, puis vérifier l'URL appelée",
          preuve:
            bornerTexte(state.message ?? 'erreur sans message') +
            (state.attemptedUrl ? ` — ${urlSure(state.attemptedUrl)}` : ''),
          etape: node.id,
        }),
      ];
    }),
};

const zeroLigne: RegleConstat = {
  id: 'pipeline/zero-ligne',
  appliesTo: TOUTES,
  evaluer: (trace) =>
    parEtape(trace, (node, state) =>
      state?.status === 'loaded' && state.rows === 0
        ? [
            constat('pipeline/zero-ligne', 'avertissement', {
              titre: `${node.id} : aucune ligne`,
              explication: "L'étape a répondu sans ligne : l'aval ne rendra rien.",
              action: 'Vérifier le filtre, ou le nom des champs en amont',
              preuve: `${node.id} → ${plural(state.rows, 'ligne')}`,
              etape: node.id,
            }),
          ]
        : []
    ),
};

/** Un afficheur inerte sous un amont qui n'a rien livré — hors attente voulue (#690). */
function afficheurInerte(trace: Trace, node: StageNode, state: StageState | undefined): boolean {
  if (!state || node.role !== 'display' || state.status !== 'idle') return false;
  if (node.upstream.some((up) => trace.states[up]?.status === 'waiting')) return false;
  return !node.upstream.some((up) => {
    const amont = trace.states[up];
    return !!amont && amont.status !== 'error' && (amont.rows ?? 0) > 0;
  });
}

const afficheurInerteRegle: RegleConstat = {
  id: 'pipeline/afficheur-inerte',
  appliesTo: TOUTES,
  evaluer: (trace) =>
    parEtape(trace, (node, state) =>
      afficheurInerte(trace, node, state)
        ? [
            constat('pipeline/afficheur-inerte', 'avertissement', {
              titre: `${node.id} : aucune donnée reçue`,
              explication:
                "L'afficheur n'a rien à rendre : son amont n'a rien livré, ou est en échec.",
              preuve:
                node.upstream.length > 0
                  ? `amont : ${node.upstream.join(', ')}`
                  : 'aucun amont déclaré',
              etape: node.id,
            }),
          ]
        : []
    ),
};

const lignesIgnorees: RegleConstat = {
  id: 'pipeline/lignes-ignorees',
  appliesTo: TOUTES,
  evaluer: (trace) =>
    parEtape(trace, (node) => {
      const n = node.skippedRows;
      if (!n) return [];
      const cause =
        node.tag === 'dsfr-data-map-layer'
          ? 'coordonnées ou géométrie absentes ou invalides'
          : 'code géographique absent ou invalide';
      const s = n > 1 ? 's' : '';
      return [
        constat('pipeline/lignes-ignorees', 'avertissement', {
          titre: `${node.id} : lignes reçues mais non dessinées`,
          explication: `Ces lignes sont écartées du rendu (${cause}) : le total affiché ne correspond plus à celui de la source.`,
          preuve: `${plural(n, 'ligne')} ignorée${s}`,
          etape: node.id,
        }),
      ];
    }),
};

const pointsEmpiles: RegleConstat = {
  id: 'pipeline/points-empiles',
  appliesTo: TOUTES,
  evaluer: (trace) =>
    parEtape(trace, (node) => {
      const p = node.stackedPositions;
      if (!p) return [];
      const s = p.positions > 1 ? 's' : '';
      return [
        constat('pipeline/points-empiles', 'avertissement', {
          titre: `${node.id} : points empilés`,
          explication:
            'Des points distincts tombent à la même position : coordonnées constantes, ou mal jointes.',
          preuve: `${plural(p.items, 'point')} sur ${plural(p.positions, 'position')} distincte${s}`,
          etape: node.id,
        }),
      ];
    }),
};

const traitementClient: RegleConstat = {
  id: 'pipeline/traitement-client',
  appliesTo: TOUTES,
  evaluer: (trace) =>
    parEtape(trace, (node, state) => {
      if (!state?.meta?.needsClientProcessing) return [];
      const n = state.rows;
      return [
        constat('pipeline/traitement-client', 'info', {
          titre: `${node.id} : regroupement calculé dans le navigateur`,
          explication:
            "La source n'a pas pu traiter group-by ou aggregate côté serveur : l'aval travaille sur les lignes rapatriées, pas sur le jeu complet.",
          preuve:
            n !== undefined
              ? `${plural(n, 'ligne')} rapatriée${n > 1 ? 's' : ''}`
              : 'lignes rapatriées',
          etape: node.id,
        }),
      ];
    }),
};

/**
 * Une étape demande-t-elle un regroupement que le serveur n'a pas fait ?
 * MÊME garde que `formatDelegation` (`format.ts`) : sans `group-by` ni
 * `aggregate` sur l'étape, il n'y a rien à déléguer — un query qui ne fait que
 * filtrer, le cas majoritaire, ne doit pas porter cette note.
 */
function regroupementCoteClient(node: StageNode, trace: Trace): boolean {
  const delegation = trace.delegation[node.id];
  if (!delegation) return false;
  const demande = !!(node.attrs['group-by'] || node.attrs.aggregate);
  return demande && !delegation.groupBy && !delegation.aggregate;
}

const delegationClient: RegleConstat = {
  id: 'pipeline/delegation-client',
  appliesTo: TOUTES,
  evaluer: (trace) =>
    parEtape(trace, (node, state) => {
      if (!regroupementCoteClient(node, trace)) return [];
      const demande = [
        node.attrs['group-by'] ? `group-by="${node.attrs['group-by']}"` : '',
        node.attrs.aggregate ? `aggregate="${node.attrs.aggregate}"` : '',
      ]
        .filter(Boolean)
        .join(', ');
      const n = state?.rows;
      return [
        constat('pipeline/delegation-client', 'info', {
          titre: `${node.id} : agrégation exécutée côté client`,
          explication:
            "Le serveur n'a pris en charge ni le regroupement ni l'agrégation : ils portent sur les lignes reçues, pas sur tout le jeu si la source en détient davantage.",
          preuve:
            `${demande} ; délégation serveur : groupBy=non, aggregate=non` +
            (n !== undefined ? ` ; ${plural(n, 'ligne')} en sortie` : ''),
          etape: node.id,
        }),
      ];
    }),
};

/**
 * Au-delà de ce nombre d'émissions d'une même étape dans une trace, on
 * suspecte des rechargements en boucle. Une étape émet une fois par
 * chargement, puis une fois par interaction (filtre, page) : trois couvrent le
 * chargement et deux interactions. C'est le seuil du diagnostic texte
 * (`formatTrace`, ligne « ⚠ N émissions ») ; un test les garde égaux. Il
 * n'apparaît dans aucun texte de constat : la preuve ne cite que le compte de
 * la trace (ADR-122).
 */
export const SEUIL_EMISSIONS_REPETEES = 3;

const emissionsRepetees: RegleConstat = {
  id: 'pipeline/emissions-repetees',
  appliesTo: TOUTES,
  evaluer: (trace) =>
    parEtape(trace, (node, state) => {
      if (!state || state.emissions <= SEUIL_EMISSIONS_REPETEES) return [];
      return [
        constat('pipeline/emissions-repetees', 'info', {
          titre: `${node.id} : émissions répétées`,
          explication:
            "L'étape a émis plus souvent qu'un chargement suivi de quelques interactions ne le demande : rechargements en boucle possibles (attribut réécrit à chaque rendu, source rechargée par son aval).",
          action: "Vérifier qu'aucun script ne réécrit ses attributs en continu",
          preuve: plural(state.emissions, 'émission'),
          etape: node.id,
        }),
      ];
    }),
};

const tronque: RegleConstat = {
  id: 'pipeline/tronque',
  appliesTo: TOUTES,
  evaluer: (trace) =>
    parEtape(trace, (node, state) => {
      if (!state?.meta?.truncated) return [];
      const { cause, action } = causeTroncature(node);
      const livrees = formatInt(state.rows ?? 0);
      const total =
        state.meta.total !== undefined ? ` / ${formatInt(state.meta.total)}` : ' (total inconnu)';
      return [
        constat('pipeline/tronque', 'avertissement', {
          titre: `${node.id} : données tronquées (${cause})`,
          explication: "L'aval ne voit qu'un sous-ensemble du jeu.",
          action,
          preuve: `${livrees}${total} lignes`,
          etape: node.id,
        }),
      ];
    }),
};

const jointureFaible: RegleConstat = {
  id: 'pipeline/jointure-faible',
  appliesTo: TOUTES,
  evaluer: (trace) =>
    parEtape(trace, (node, state) => {
      const join = state?.meta?.join;
      if (!join || !isJoinAlert(join)) return [];
      const graphie = !!join.keyFormatMismatch;
      return [
        constat('pipeline/jointure-faible', 'avertissement', {
          titre: graphie
            ? `${node.id} : clés de jointure de graphies différentes`
            : `${node.id} : moins de la moitié des lignes appariées`,
          explication: graphie
            ? 'Les mêmes clés existent des deux côtés à la graphie près (zéro de tête, espaces).'
            : 'Les clés sont comparées en chaîne, sans trim ni complétion : elles ne se rencontrent presque pas.',
          action: graphie
            ? 'Harmoniser les clés avant la jointure'
            : 'Vérifier le référentiel des deux côtés',
          preuve: `${formatInt(join.leftMatched)} / ${formatInt(join.leftTotal)} lignes gauche appariées`,
          etape: node.id,
        }),
      ];
    }),
};

// ---------------------------------------------------------------------------
// Règles génériques : réseau et console (#994)
// ---------------------------------------------------------------------------

/**
 * Regroupe des échecs par étape : un constat par étape rattachée (le plus
 * récent fait foi), un seul pour ceux qu'aucune étape ne revendique.
 */
function parEtapeRattachee(
  trace: Trace,
  echecs: readonly EntreeReseau[]
): Array<{ etape?: string; entrees: EntreeReseau[] }> {
  const groupes = new Map<string, EntreeReseau[]>();
  for (const e of echecs) {
    const cle = etapeDeLaRequete(trace, e) ?? '';
    const g = groupes.get(cle);
    if (g) g.push(e);
    else groupes.set(cle, [e]);
  }
  return [...groupes].map(([cle, entrees]) => (cle ? { etape: cle, entrees } : { entrees }));
}

function ligneRequete(e: EntreeReseau): string {
  return `${e.methode} ${e.statut ?? 'sans réponse'} ${urlSure(e.url)}`;
}

const httpErreur: RegleConstat = {
  id: 'reseau/http-erreur',
  appliesTo: TOUTES,
  evaluer: (trace) => {
    const echecs = (trace.reseau ?? []).filter((e) => e.statut !== null && e.statut >= 400);
    return parEtapeRattachee(trace, echecs).map(({ etape, entrees }) => {
      const derniere = entrees[entrees.length - 1];
      const statut = derniere.statut as number;
      const serveur = statut >= 500;
      return constat('reseau/http-erreur', 'erreur', {
        titre: `${etape ? `${etape} : ` : ''}réponse HTTP ${statut}`,
        explication: serveur
          ? 'Le serveur de données a échoué en répondant.'
          : 'La requête est refusée, ou vise une ressource absente.',
        action: serveur
          ? "Réessayer plus tard, ou vérifier que l'API est en service"
          : "Vérifier l'URL, l'identifiant du jeu et la clé d'accès",
        preuve: entrees.map(ligneRequete).join(' ; '),
        ...(etape ? { etape } : {}),
      });
    });
  },
};

const corsDeduit: RegleConstat = {
  id: 'reseau/cors-deduit',
  appliesTo: TOUTES,
  evaluer: (trace, contexte) => {
    const echecs = (trace.reseau ?? []).filter((e) => corsProbable(e, contexte));
    return parEtapeRattachee(trace, echecs).map(({ etape, entrees }) =>
      constat('reseau/cors-deduit', 'erreur', {
        titre: `${etape ? `${etape} : ` : ''}requête bloquée, CORS probable`,
        explication:
          'Requête vers une autre origine, sans réponse et hors proxy : le plus souvent un blocage CORS, sinon un hôte injoignable. Le navigateur ne dit pas lequel.',
        action: "Passer l'URL par getProxiedUrl() (attribut use-proxy sur la source)",
        preuve: entrees
          .map((e) => `${e.methode} ${urlSure(e.url)} — ${bornerTexte(e.erreur ?? '', 120)}`)
          .join(' ; '),
        ...(etape ? { etape } : {}),
      })
    );
  },
};

/**
 * Une erreur de console est rattachée quand elle nomme une étape
 * (`dsfr-data-source[src]`) ou l'URL tentée par une étape : l'étape en dit
 * déjà plus. Les autres sont des pannes que rien d'autre ne signale.
 */
function consoleRattachee(trace: Trace, e: EntreeConsole): boolean {
  for (const node of trace.graph.nodes) {
    if (e.message.includes(`[${node.id}]`)) return true;
    const url = trace.states[node.id]?.attemptedUrl;
    if (url && e.message.includes(url)) return true;
  }
  return false;
}

const consoleNonRattachee: RegleConstat = {
  id: 'console/erreur-non-rattachee',
  appliesTo: TOUTES,
  evaluer: (trace) => {
    const erreurs = (trace.console ?? []).filter(
      (e) => e.niveau === 'error' && !consoleRattachee(trace, e)
    );
    if (erreurs.length === 0) return [];
    const derniere = erreurs[erreurs.length - 1];
    return [
      constat('console/erreur-non-rattachee', 'avertissement', {
        titre: 'Erreur en console, hors pipeline',
        explication:
          'Aucune étape du pipeline ne la revendique : script de la page, extension, ou composant mal chargé. Elle peut suffire à expliquer un rendu vide.',
        preuve:
          (erreurs.length > 1 ? 'plusieurs erreurs, dont la dernière : ' : '') +
          bornerTexte(masquerUrl(derniere.message)),
      }),
    ];
  },
};

/**
 * Le premier lot, générique (#996) : les alertes que `summarizeTrace`
 * comptait déjà, plus le journal réseau et console (#994).
 */
export const REGLES_GENERIQUES: readonly RegleConstat[] = [
  amontManquant,
  configuration,
  attributInconnu,
  champIntrouvable,
  etapeEnErreur,
  zeroLigne,
  afficheurInerteRegle,
  lignesIgnorees,
  pointsEmpiles,
  traitementClient,
  delegationClient,
  emissionsRepetees,
  tronque,
  jointureFaible,
  httpErreur,
  corsDeduit,
  consoleNonRattachee,
];

const RANG_GRAVITE: Record<GraviteConstat, number> = { erreur: 0, avertissement: 1, info: 2 };

function concerne(regle: RegleConstat, app: string): boolean {
  return regle.appliesTo.includes('*') || regle.appliesTo.includes(app);
}

/**
 * La règle remplaçante vise-t-elle l'étape du constat ? Sans `tags`, toujours.
 * Avec : l'étape est un nœud de ces balises, ou un tel nœud la consomme
 * DIRECTEMENT — un seul niveau, à dessein : la source lue par une couche perd
 * son « zéro ligne » au profit de `carte/aucune-donnee`, mais dans une chaîne
 * source → query → couche, `zero-ligne@query` reste dit par la générique.
 * Un constat sans étape n'est visé que par une règle sans `tags`.
 */
function vise(regle: RegleConstat, trace: Trace, etape: string | undefined): boolean {
  if (!regle.tags) return true;
  if (etape === undefined) return false;
  const tags = regle.tags;
  return trace.graph.nodes.some(
    (n) => tags.includes(n.tag) && (n.id === etape || n.upstream.includes(etape))
  );
}

/**
 * Évalue les règles qui concernent l'app.
 *
 * Les constats d'une règle qu'une autre règle applicable déclare `remplace`
 * sont retirés sur les nœuds que celle-ci vise (`tags`). Sortie dédoublonnée
 * par `id` (la première occurrence gagne), triée par gravité (erreur →
 * avertissement → info), puis par ordre topologique de l'étape ; les constats
 * sans étape viennent après, dans l'ordre des règles.
 */
export function evaluerConstats(
  trace: Trace,
  contexte: ContexteConstats,
  regles: readonly RegleConstat[] = REGLES_GENERIQUES
): Constat[] {
  const applicables = regles.filter((r) => concerne(r, contexte.app));
  const remplacants = applicables.filter((r) => (r.remplace ?? []).length > 0);
  const remplace = (c: Constat): boolean =>
    remplacants.some((r) => r.remplace!.includes(c.regle) && vise(r, trace, c.etape));
  const vus = new Set<string>();
  const constats: Constat[] = [];
  for (const regle of applicables) {
    for (const c of regle.evaluer(trace, contexte)) {
      if (vus.has(c.id) || remplace(c)) continue;
      vus.add(c.id);
      constats.push(c);
    }
  }
  const ordre = trace.order ?? topoOrder(trace.graph).map((n) => n.id);
  const rang = (c: Constat): number => {
    const i = c.etape !== undefined ? ordre.indexOf(c.etape) : -1;
    return i >= 0 ? i : ordre.length;
  };
  return constats
    .map((c, i) => ({ c, i }))
    .sort(
      (a, b) =>
        RANG_GRAVITE[a.c.gravite] - RANG_GRAVITE[b.c.gravite] || rang(a.c) - rang(b.c) || a.i - b.i
    )
    .map(({ c }) => c);
}

/** Alertes du rail : les constats qui ne sont pas `info`. */
export function compterAlertes(constats: readonly Constat[]): number {
  return constats.filter((c) => c.gravite !== 'info').length;
}

/**
 * Résumé d'une ligne pour le rail replié du volet.
 *
 * `alerts` est le nombre de constats non-info : ceux que l'appelant passe, ou
 * ceux des règles génériques hors app. Une seule source, celle que
 * l'assistant et le studio lisent aussi.
 */
export function summarizeTrace(
  trace: Trace,
  constats?: readonly Constat[]
): {
  stages: number;
  firstRows: number | null;
  lastRows: number | null;
  alerts: number;
} {
  const ordered = topoOrder(trace.graph);
  // Une étape en échec garde le compte de son dernier succès : l'inclure
  // afficherait « 100 → 8 lignes » sur un pipeline qui vient de tomber.
  const withRows = ordered
    .map((n) => trace.states[n.id])
    .filter((s): s is StageState => !!s && s.status !== 'error' && s.rows !== undefined);

  return {
    stages: ordered.length,
    firstRows: withRows.length > 0 ? (withRows[0].rows ?? null) : null,
    lastRows: withRows.length > 0 ? (withRows[withRows.length - 1].rows ?? null) : null,
    alerts: compterAlertes(constats ?? evaluerConstats(trace, { app: '*' })),
  };
}
