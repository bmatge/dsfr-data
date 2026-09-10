/**
 * Outils de diagnostic de la boucle agentique (#607).
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

import {
  fieldMatrix,
  formatTrace,
  topoOrder,
  type FrameAttachment,
  type StageState,
  type Trace,
} from '@dsfr-data/shared';

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
] as const;

export const DIAGNOSTIC_TOOL_NAMES: ReadonlySet<string> = new Set([
  'run_and_trace',
  'trace_pipeline',
  'inspect_stage',
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
    default:
      return null;
  }
}
