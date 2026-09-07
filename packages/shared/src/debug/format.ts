/**
 * `formatTrace()` — la fonction pivot du chantier (#604).
 *
 * UNE seule implémentation du rendu textuel, consommée à l'identique par :
 *   - le bouton « Copier le diagnostic » du volet ;
 *   - le bouton « Envoyer à l'assistant » des apps conversationnelles ;
 *   - l'outil `trace_pipeline` de la boucle agentique (#607).
 *
 * Conséquence voulue : **ce que l'utilisateur voit et ce que l'assistant
 * reçoit sont le même objet**. Quand quelqu'un dit « l'assistant n'a rien
 * compris », on peut lire mot pour mot ce qu'il avait sous les yeux.
 *
 * Le format suit la doctrine déjà établie par `inspectData` : du texte
 * français structuré, pas du JSON. C'est le seul format que le modèle lit
 * bien, et c'est aussi celui qui se colle tel quel dans une issue.
 */

import type { StageNode } from './graph.js';
import { diffFields } from './summarize.js';
import type { DelegationState, StageState, Trace } from './recorder.js';
import { topoOrder } from './graph.js';
import type { Field } from '../ia/data-tools.js';

export interface FormatOptions {
  /**
   * Masque les VALEURS des échantillons, garde noms de champs et comptes.
   *
   * Une trace part vers un service externe quand on l'envoie à l'assistant :
   * pour des sources ministérielles, on veut le diagnostic sans les données.
   */
  redactValues?: boolean;
  /** Lignes d'échantillon rendues par étape (0 = aucune). */
  sampleRows?: number;
}

/** Accord en nombre — « 1 ligne » et non « 1 lignes ». */
function plural(n: number, word: string): string {
  return `${n} ${word}${n > 1 ? 's' : ''}`;
}

function humanizeDelay(ms: number | null): string {
  if (ms === null) return 'aucune exécution observée';
  if (ms < 1500) return "à l'instant";
  const s = Math.round(ms / 1000);
  if (s < 60) return `il y a ${s} s`;
  return `il y a ${Math.round(s / 60)} min`;
}

function formatAttrs(node: StageNode): string {
  const pairs = Object.entries(node.attrs);
  if (pairs.length === 0) return '';
  return pairs.map(([k, v]) => (v === '' ? k : `${k}="${v}"`)).join('  ');
}

function formatFieldList(fields: Field[], max = 12): string {
  if (fields.length === 0) return 'aucun';
  const shown = fields.slice(0, max).map((f) => `${f.name} (${f.type})`);
  const more = fields.length > max ? `, … (+${fields.length - max})` : '';
  return shown.join(', ') + more;
}

function formatSample(state: StageState, opts: FormatOptions): string[] {
  const limit = opts.sampleRows ?? 0;
  if (limit <= 0 || !state.sample || state.sample.length === 0) return [];
  if (opts.redactValues) return [];
  return state.sample.slice(0, limit).map((row) => `     ${JSON.stringify(row)}`);
}

function formatMeta(state: StageState): string[] {
  const meta = state.meta;
  if (!meta) return [];
  const bits = [`page ${meta.page}`];
  if (meta.pageSize) bits.push(`taille ${meta.pageSize}`);
  bits.push(`total ${meta.total ?? 'inconnu'}`);
  bits.push(`serveur=${meta.serverSide ? 'oui' : 'non'}`);
  const lines = [`     meta : ${bits.join(', ')}`];
  if (meta.needsClientProcessing) {
    lines.push(
      "     ⚠ la source n'a pas pu traiter group-by/aggregate côté serveur.",
      `       Repli client : tout l'aval travaille sur ${state.rows ?? '?'} lignes rapatriées, pas sur le jeu complet.`
    );
  }
  return lines;
}

function formatDelegation(delegation: DelegationState | undefined, rows?: number): string[] {
  if (!delegation) return [];
  const flags = (['groupBy', 'aggregate', 'orderBy', 'where'] as const)
    .map((k) => `${k}=${delegation[k] ? 'oui' : 'non'}`)
    .join('  ');
  const lines = [`     délégation serveur : ${flags}`];
  const anyClientSide = !delegation.groupBy && !delegation.aggregate;
  if (anyClientSide && rows !== undefined) {
    lines.push(
      `     → traitement CLIENT, sur les ${rows} lignes reçues — un total calculé ici ne`,
      '       porte que sur cet échantillon si la source en détient davantage.'
    );
  }
  return lines;
}

/** Ce que l'étape reçoit, et de qui. */
function formatInputs(node: StageNode, states: Record<string, StageState>): string[] {
  if (node.upstream.length === 0) return [];
  return node.upstream.map((up) => {
    const upstream = states[up];
    return upstream?.rows === undefined
      ? `     reçoit — ← ${up} (aucune donnée observée en amont)`
      : `     reçoit ${plural(upstream.rows, 'ligne')} ← ${up}`;
  });
}

/**
 * L'écart de champs entre l'entrée et la sortie — l'unité du diagnostic.
 *
 * Rendu APRÈS le résultat : on lit d'abord ce qui sort, puis ce que l'étape a
 * changé pour y arriver.
 */
function formatFieldDelta(
  node: StageNode,
  state: StageState,
  states: Record<string, StageState>
): string[] {
  if (node.upstream.length === 0 || state.rows === undefined) return [];
  const lines: string[] = [];
  for (const up of node.upstream) {
    const upstream = states[up];
    if (!upstream || upstream.fields === undefined) continue;
    const diff = diffFields(upstream.fields, state.fields ?? []);
    const changes: string[] = [];
    if (diff.removed.length > 0)
      changes.push(`−${diff.removed.length} (${diff.removed.join(', ')})`);
    if (diff.added.length > 0) changes.push(`+${diff.added.length} (${diff.added.join(', ')})`);
    if (changes.length > 0) {
      const from = node.upstream.length > 1 ? ` depuis ${up}` : '';
      lines.push(`     Δ champs${from} : ${changes.join('  ')}`);
    }
  }
  return lines;
}

/**
 * Statut de l'étape.
 *
 * Les afficheurs ne réémettent pas : ils n'ont donc jamais d'état « loaded »
 * sur le bus. Les déclarer « sans données » alors que leur amont vient de
 * livrer serait un faux négatif — c'est l'amont qui fait foi.
 */
function statusLine(node: StageNode, state: StageState, upstreamHasData: boolean): string {
  switch (state.status) {
    case 'loaded':
      return `     → ${plural(state.rows ?? 0, 'ligne')}, ${plural(state.fields?.length ?? 0, 'champ')}`;
    case 'error':
      return `     ✗ ÉCHEC — ${state.message}`;
    case 'loading':
      return '     … chargement en cours';
    default:
      if (node.role === 'display') {
        return upstreamHasData
          ? '     ✓ alimenté (un afficheur consomme sans réémettre)'
          : '     ⚠ aucune donnée reçue — rien à afficher';
      }
      return "     (inerte — n'a rien émis)";
  }
}

/**
 * Rend la trace en texte français.
 *
 * Structure : un bloc par étape en ordre topologique, puis les commandes
 * remontantes, puis les anomalies structurelles. Un lecteur pressé s'arrête
 * à la première ligne `✗` ou `⚠`.
 */
export function formatTrace(trace: Trace, options: FormatOptions = {}): string {
  const opts: FormatOptions = { sampleRows: 0, redactValues: false, ...options };
  const ordered = topoOrder(trace.graph);
  const out: string[] = [];

  const stageCount = ordered.length;
  if (stageCount === 0) {
    return 'Aucun composant dsfr-data trouvé dans la page — rien à diagnostiquer.';
  }

  const header = `Flux — ${plural(stageCount, 'étape')}, dernier passage ${humanizeDelay(trace.sinceLastEventMs)}.`;
  out.push(header);
  if (!trace.quiescent) {
    out.push('⏳ Le pipeline tourne encore : cet instantané peut être incomplet.');
  }
  out.push('');

  for (const node of ordered) {
    const state = trace.states[node.id] ?? { status: 'idle' as const, emissions: 0 };
    const attrs = formatAttrs(node);
    out.push(`${node.id}  ${node.tag}${attrs ? '  ' + attrs : ''}`);

    if (node.configError) {
      out.push(`     ✗ CONFIGURATION — ${node.configError}`);
    }

    out.push(...formatInputs(node, trace.states));
    const upstreamHasData = node.upstream.some((up) => (trace.states[up]?.rows ?? 0) > 0);
    out.push(statusLine(node, state, upstreamHasData));

    if (state.status === 'loaded') {
      out.push(`     champs : ${formatFieldList(state.fields ?? [])}`);
      out.push(...formatFieldDelta(node, state, trace.states));
      if (state.rows === 0) {
        out.push(
          "     ⚠ zéro ligne : l'aval ne rendra rien. Vérifiez le filtre, ou le nom des champs en amont."
        );
      }
      if (state.shape === 'object') {
        out.push(
          '     ⚠ la charge reçue est un objet non déroulable — un attribut `transform` est peut-être requis.'
        );
      }
      out.push(...formatMeta(state));
    }

    if (state.status === 'error' && state.attemptedUrl) {
      out.push(`     URL appelée : ${state.attemptedUrl}`);
    }

    if (node.tag === 'dsfr-data-query') {
      out.push(...formatDelegation(trace.delegation[node.id], state.rows));
    }

    if (state.emissions > 3) {
      out.push(`     ⚠ ${state.emissions} émissions — rechargements en boucle ?`);
    }

    out.push(...formatSample(state, opts));
    out.push('');
  }

  const commands = trace.events.filter(
    (e): e is Extract<typeof e, { kind: 'command' }> => e.kind === 'command'
  );
  if (commands.length > 0) {
    out.push('Commandes remontées :');
    for (const cmd of commands.slice(-8)) {
      const from = cmd.from ? `${cmd.from} → ` : '';
      out.push(`  ${from}${cmd.node}  ${JSON.stringify(cmd.cmd)}`);
    }
    out.push('');
  }

  if (trace.graph.dangling.length > 0) {
    out.push(
      'Amonts introuvables (panne silencieuse — le composant attend un signal qui ne viendra jamais) :'
    );
    for (const d of trace.graph.dangling) {
      out.push(`  ✗ ${d.node} déclare source="${d.missing}", absent de la page`);
    }
    out.push('');
  }

  if (opts.redactValues) {
    out.push('(valeurs masquées — seuls les noms de champs et les comptes sont rendus)');
  }

  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

/** Résumé d'une ligne pour le rail replié du volet. */
export function summarizeTrace(trace: Trace): {
  stages: number;
  firstRows: number | null;
  lastRows: number | null;
  alerts: number;
} {
  const ordered = topoOrder(trace.graph);
  const withRows = ordered
    .map((n) => trace.states[n.id])
    .filter((s): s is StageState => !!s && s.rows !== undefined);

  let alerts = trace.graph.dangling.length;
  for (const node of ordered) {
    const state = trace.states[node.id];
    if (node.configError) alerts += 1;
    if (!state) continue;
    if (state.status === 'error') alerts += 1;
    if (state.status === 'loaded' && state.rows === 0) alerts += 1;
    if (
      node.role === 'display' &&
      state.status === 'idle' &&
      !node.upstream.some((up) => (trace.states[up]?.rows ?? 0) > 0)
    ) {
      alerts += 1;
    }
    if (state.meta?.needsClientProcessing) alerts += 1;
  }

  return {
    stages: ordered.length,
    firstRows: withRows.length > 0 ? (withRows[0].rows ?? null) : null,
    lastRows: withRows.length > 0 ? (withRows[withRows.length - 1].rows ?? null) : null,
    alerts,
  };
}
