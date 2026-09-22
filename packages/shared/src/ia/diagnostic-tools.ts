/**
 * Outils de diagnostic de la boucle agentique (#607, partagés depuis #1010).
 *
 * Nés dans le studio, ils vivent ici pour servir tous les assistants du socle
 * IA commun (ADR-143) : le studio, l'assistant contextuel (#1011, #1014), le
 * builder IA (#1015). App-side (frontière lib/app #319) : exportés par
 * `index.ts`, JAMAIS par `lib.ts`.
 *
 * L'assistant compose un document ; il doit aussi pouvoir REGARDER ce que
 * ce document produit une fois rendu — sans quoi il corrige à l'aveugle.
 *
 * Trois contraintes dictent la forme de ces outils, et elles viennent du
 * code, pas d'une préférence :
 *
 * 1. **Albert est partagé et limité** : `MAX_ROUNDS` plafonne la boucle,
 *    chaque tour est un appel. Les outils doivent donc être peu nombreux et
 *    rendre beaucoup en une fois.
 * 2. **Décodage guidé vLLM** : schémas PLATS, pas de `oneOf` — même
 *    contrainte que `document.ts`.
 * 3. **Les outils rendent du TEXTE FRANÇAIS, pas du JSON.** `inspectData`
 *    rend une phrase et des puces ; c'est le seul format que le modèle lit
 *    bien, et c'est celui que l'utilisateur lit aussi. `formatTrace()` est
 *    donc la même fonction des deux côtés.
 *
 * La trace n'est JAMAIS poussée dans le prompt système : elle est non bornée
 * et change à chaque tour. Le prompt ne porte qu'une ligne par étape ; le
 * détail se tire à la demande. Exactement le partage qui fonctionne déjà
 * entre le contexte de données et `inspect_data`.
 */

import { fieldMatrix } from '../debug/summarize.js';
import { formatTrace, plural } from '../debug/format.js';
import { topoOrder } from '../debug/graph.js';
import { evaluerConstats, type Constat } from '../debug/constats.js';
import type { FrameAttachment } from '../debug/frame.js';
import type { StageState, Trace } from '../debug/recorder.js';

/** Ce que la boucle doit savoir faire pour servir ces outils. */
export interface DiagnosticContext {
  /** Rattachement au collecteur de l'aperçu, ou null si indisponible. */
  attachment: () => FrameAttachment | null;
  /** Relance le rendu de l'aperçu (le document a pu changer). */
  rerender: () => void;
  /**
   * Masque les valeurs d'échantillon envoyées au modèle.
   *
   * La trace part vers un service externe : pour une source ministérielle,
   * on veut le diagnostic sans les données. Comptes et noms de champs
   * suffisent à diagnostiquer une chaîne cassée.
   */
  redactValues: () => boolean;
  /**
   * Constats de l'app sur l'aperçu courant (#1010), ou null sans aperçu
   * observable.
   *
   * L'app compose ses règles (`[...REGLES_GENERIQUES, ...REGLES_CARTO]`) et son
   * contexte (`app`, `etat`, `origine`) : c'est la MÊME liste que son volet
   * Diagnostic, pour que l'assistant et l'usager lisent la même chose.
   * Absente, `lister_constats` évalue les règles génériques sur la trace.
   */
  constats?: () => readonly Constat[] | null;
}

/**
 * Outils NON terminaux : la boucle continue après chacun.
 *
 * Schémas plats et minimaux — `inspect_stage` ne prend qu'un id, parce que
 * demander au modèle de choisir parmi cinq sections ne ferait qu'ajouter une
 * occasion de se tromper.
 */
export const DIAGNOSTIC_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'run_and_trace',
      description:
        "Relance l'aperçu, attend que le pipeline se stabilise, et rend le flux complet : lignes à chaque étape, champs apparus et disparus, erreurs, URL réellement appelées. À appeler AVANT de proposer un correctif quand quelque chose ne s'affiche pas.",
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'trace_pipeline',
      description:
        "Le flux tel qu'observé au dernier rendu, sans relancer. Moins coûteux que run_and_trace quand rien n'a changé depuis.",
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'inspect_stage',
      description:
        "Détail d'une étape du flux : champs et types, échantillon, pagination, requête effective. Utiliser après trace_pipeline pour creuser l'étape qui pose problème.",
      parameters: {
        type: 'object',
        properties: {
          node_id: { type: 'string', description: "Id de l'étape, ex: src, q1, c1" },
        },
        required: ['node_id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'lister_constats',
      description:
        "Les pannes et alertes relevées sur l'aperçu, classées par gravité : pour chacune, le constat, sa preuve et les repères de l'interface qui la corrigent. Le plus court chemin vers la cause ; compléter avec trace_pipeline ou inspect_stage.",
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
] as const;

export const DIAGNOSTIC_TOOL_NAMES: ReadonlySet<string> = new Set([
  'run_and_trace',
  'trace_pipeline',
  'inspect_stage',
  'lister_constats',
]);

/**
 * Outils que l'anti-boucle ne doit PAS déduplíquer.
 *
 * La boucle refuse de re-payer un lookup identique (« Déjà fourni
 * ci-dessus ») — protection légitime pour la documentation et les données,
 * qui ne bougent pas pendant un tour.
 *
 * Les outils de diagnostic, eux, observent un état MUTABLE : le document
 * change entre deux appels, donc la même question a une réponse différente.
 * Et `run_and_trace` est le cas critique — vérifier qu'un correctif a
 * fonctionné, c'est précisément relancer la MÊME observation. Le dédupliquer
 * reviendrait à refuser au modèle sa vérification, au moment exact où il en
 * a besoin, et à le laisser conclure sur du vide.
 */
export const REPEATABLE_TOOLS: ReadonlySet<string> = new Set([
  'run_and_trace',
  'trace_pipeline',
  'inspect_stage',
  'lister_constats',
]);

const NO_TRACE =
  "Aucun aperçu observable : le document est peut-être vide, ou le rendu n'a pas encore eu lieu. Ajoute des blocs, puis rappelle run_and_trace.";

function describeStage(trace: Trace, nodeId: string, redact: boolean): string {
  const node = trace.graph.nodes.find((n) => n.id === nodeId);
  if (!node) {
    const known = trace.graph.nodes.map((n) => n.id).join(', ') || 'aucune';
    return `L'étape "${nodeId}" n'existe pas. Étapes du flux : ${known}.`;
  }
  const state: StageState = trace.states[nodeId] ?? { status: 'idle', emissions: 0 };
  const lines: string[] = [`Étape ${node.id} — ${node.tag}`];

  const attrs = Object.entries(node.attrs);
  if (attrs.length > 0) {
    lines.push(
      `Configuration : ${attrs.map(([k, v]) => (v === '' ? k : `${k}="${v}"`)).join('  ')}`
    );
  }
  if (node.upstream.length > 0) lines.push(`Amont : ${node.upstream.join(', ')}`);
  if (node.configError) lines.push(`ERREUR DE CONFIGURATION : ${node.configError}`);
  if (node.skippedRows) {
    lines.push(
      `LIGNES IGNORÉES : ${node.skippedRows} (code ou coordonnées géographiques absents ou invalides)`
    );
  }
  if (node.computedColumns && node.computedColumns.length > 0) {
    lines.push(
      `Colonnes calculées (compute) : ${node.computedColumns
        .map((c) => (redact ? c.name : `${c.name} = ${JSON.stringify(c.sample) ?? 'undefined'}`))
        .join(', ')}`
    );
  }

  switch (state.status) {
    case 'loaded':
      lines.push(`Sortie : ${state.rows} ligne(s), ${state.fields?.length ?? 0} champ(s).`);
      lines.push(
        `Champs : ${(state.fields ?? []).map((f) => `${f.name} (${f.type})`).join(', ') || 'aucun'}`
      );
      if (state.meta) {
        lines.push(
          `Pagination : page ${state.meta.page}, total ${state.meta.total ?? 'inconnu'}, serveur=${
            state.meta.serverSide ? 'oui' : 'non'
          }${state.meta.needsClientProcessing ? ', REPLI CLIENT' : ''}${
            state.meta.truncated ? ', TRONQUÉ (max-records ou limit)' : ''
          }`
        );
        const join = state.meta.join;
        if (join) {
          const pct =
            join.leftTotal > 0 ? Math.round((join.leftMatched / join.leftTotal) * 100) : 100;
          lines.push(
            `Appariement : ${join.leftMatched} / ${join.leftTotal} lignes gauche appariées (${pct} %), ` +
              `${join.rightMatched} / ${join.rightTotal} lignes droite${pct < 50 ? ' — ALERTE, clés probablement hétérogènes' : ''}`
          );
        }
      }
      if (!redact && state.sample && state.sample.length > 0) {
        lines.push('Échantillon :');
        for (const row of state.sample.slice(0, 3)) lines.push(`  ${JSON.stringify(row)}`);
      }
      break;
    case 'error':
      lines.push(`ÉCHEC : ${state.message}`);
      if (state.attemptedUrl) lines.push(`URL réellement appelée : ${state.attemptedUrl}`);
      break;
    case 'loading':
      lines.push('Chargement en cours au moment du relevé.');
      break;
    case 'waiting':
      lines.push(
        "En attente d'un filtre (require-where) : aucune requête n'a été lancée, c'est voulu."
      );
      break;
    default:
      lines.push(
        node.role === 'display'
          ? "Aucune donnée reçue — vérifie l'étape amont."
          : "Cette étape n'a rien émis."
      );
  }

  const delegation = trace.delegation[nodeId];
  if (delegation) {
    const flags = (['groupBy', 'aggregate', 'orderBy', 'where'] as const)
      .map((k) => `${k}=${delegation[k] ? 'serveur' : 'client'}`)
      .join('  ');
    lines.push(`Délégation : ${flags}`);
  }

  return lines.join('\n');
}

/**
 * Rend la trace courante en texte.
 *
 * Ajoute la matrice champ × étape : c'est la lecture qui explique le mode de
 * panne le plus fréquent — un champ renommé en amont qui vide tout l'aval
 * sans lever la moindre erreur.
 */
function describeTrace(trace: Trace, redact: boolean): string {
  const base = formatTrace(trace, { redactValues: redact, sampleRows: redact ? 0 : 2 });

  const stages = topoOrder(trace.graph)
    .map((node) => ({ id: node.id, fields: trace.states[node.id]?.fields ?? [] }))
    .filter((s) => s.fields.length > 0);
  if (stages.length < 2) return base;

  const matrix = fieldMatrix(stages);
  const disparus = matrix.filter(
    (row) => row.byStage[0] !== null && row.byStage[row.byStage.length - 1] === null
  );
  if (disparus.length === 0) return base;

  return `${base}

Champs présents en entrée mais absents en sortie — cause fréquente d'un affichage vide :
${disparus.map((r) => `  ${r.field} : ${r.byStage.map((t) => t ?? '—').join(' → ')}`).join('\n')}`;
}

// ---------------------------------------------------------------------------
// lister_constats (#1010)
// ---------------------------------------------------------------------------

/** Remplace la preuve d'un constat masqué sous `redactValues`. */
export const PREUVE_MASQUEE = '(masquée : valeurs de données)';

/** Options de rendu des constats. */
export interface FormaterConstatsOptions {
  /**
   * Masque la preuve de chaque constat (réglage du volet Diagnostic) : elle
   * peut citer un message d'erreur, une URL ou une valeur d'échantillon.
   * Titre, cause et geste restent : ce sont des textes de règles, qui ne
   * citent que des métadonnées (noms de champs, ids d'étapes), comme
   * `inspectData` sous `redactValues`.
   */
  redactValues?: boolean;
}

/**
 * Rend des constats en texte français, lisible par le modèle comme par
 * l'usager. Forme (contrat avec #1014) :
 *
 * ```
 * 2 constats : 1 erreur, 1 avertissement.
 *
 * 1. reseau/http-erreur@src — [erreur] src : réponse HTTP 404
 *    Cause : …
 *    À faire : …            (omise sans geste)
 *    Preuve : …             (« (masquée : valeurs de données) » sous redactValues)
 *    Repères : carto.x.y    (« aucun » si vide)
 * ```
 *
 * Les ids de repères sont rendus tels quels : c'est ce que l'assistant passe
 * à `montrer(id)` (#1014). Aucun nombre n'est calculé ici hors des comptes
 * de constats : les chiffres de la preuve viennent de la trace (ADR-122).
 */
export function formaterConstats(
  constats: readonly Constat[],
  options: FormaterConstatsOptions = {}
): string {
  if (constats.length === 0) {
    return 'Aucun constat : le pipeline ne signale ni erreur ni avertissement.';
  }
  const compte = (g: Constat['gravite']) => constats.filter((c) => c.gravite === g).length;
  const erreurs = compte('erreur');
  const avertissements = compte('avertissement');
  const infos = compte('info');
  const repartition = [
    erreurs > 0 ? plural(erreurs, 'erreur') : '',
    avertissements > 0 ? plural(avertissements, 'avertissement') : '',
    infos > 0 ? `${infos} info` : '',
  ]
    .filter(Boolean)
    .join(', ');
  const lignes: string[] = [`${plural(constats.length, 'constat')} : ${repartition}.`];

  constats.forEach((c, i) => {
    lignes.push('');
    // L'id en tête : c'est la clé que l'assistant relie aux repères (#1014).
    lignes.push(`${i + 1}. ${c.id} — [${c.gravite}] ${c.titre}`);
    lignes.push(`   Cause : ${c.explication}`);
    if (c.action) lignes.push(`   À faire : ${c.action}`);
    lignes.push(`   Preuve : ${options.redactValues ? PREUVE_MASQUEE : c.preuve}`);
    // Toujours rendue : « aucun » dit au modèle qu'il n'y a rien à montrer.
    lignes.push(`   Repères : ${c.reperes.length > 0 ? c.reperes.join(', ') : 'aucun'}`);
  });
  return lignes.join('\n');
}

/** Les constats de l'app, ou à défaut ceux des règles génériques sur la trace. */
function lireConstats(ctx: DiagnosticContext): readonly Constat[] | null {
  if (ctx.constats) return ctx.constats();
  const trace = ctx.attachment()?.snapshot();
  return trace ? evaluerConstats(trace, { app: '*' }) : null;
}

/**
 * Exécute un outil de diagnostic. Rend toujours du texte, jamais une erreur :
 * un diagnostic indisponible est lui-même une information exploitable.
 */
export async function runDiagnosticTool(
  name: string,
  args: Record<string, unknown>,
  ctx: DiagnosticContext
): Promise<string> {
  const redact = ctx.redactValues();

  if (name === 'run_and_trace') {
    ctx.rerender();
    const attachment = ctx.attachment();
    if (!attachment) return NO_TRACE;
    // Un état intermédiaire présenté comme final est pire que pas
    // d'information : on le dit au modèle plutôt que de le laisser conclure.
    const settled = await attachment.waitForQuiescence();
    const trace = attachment.snapshot();
    if (!trace) return NO_TRACE;
    const prefix = settled
      ? ''
      : 'ATTENTION : le pipeline tournait encore au moment du relevé, ces chiffres peuvent être provisoires.\n\n';
    return prefix + describeTrace(trace, redact);
  }

  if (name === 'trace_pipeline') {
    const trace = ctx.attachment()?.snapshot();
    return trace ? describeTrace(trace, redact) : NO_TRACE;
  }

  if (name === 'inspect_stage') {
    const trace = ctx.attachment()?.snapshot();
    if (!trace) return NO_TRACE;
    return describeStage(trace, typeof args.node_id === 'string' ? args.node_id : '', redact);
  }

  if (name === 'lister_constats') {
    const constats = lireConstats(ctx);
    return constats ? formaterConstats(constats, { redactValues: redact }) : NO_TRACE;
  }

  return `Outil de diagnostic inconnu : ${name}`;
}

/** Libellé lisible d'une étape, pour le fil « en train de… » de l'UI. */
export function humanizeDiagnosticStep(name: string, args: Record<string, unknown>): string | null {
  switch (name) {
    case 'run_and_trace':
      return 'Je relance l’aperçu et j’observe le flux…';
    case 'trace_pipeline':
      return 'J’examine le flux du document…';
    case 'inspect_stage':
      return `J’inspecte l’étape « ${String(args.node_id ?? '')} »…`;
    case 'lister_constats':
      return 'Je relis les constats…';
    default:
      return null;
  }
}
