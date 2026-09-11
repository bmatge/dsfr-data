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
import { fieldIssuesByNode, type FieldIssue } from './field-check.js';
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
  /** Horloge injectable — les tests figent le temps. */
  now?: () => number;
}

/** Accord en nombre — « 1 ligne » et non « 1 lignes ». */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n > 1 ? 's' : ''}`;
}

function humanizeDelay(ms: number | null): string {
  if (ms === null) return 'aucune exécution observée';
  if (ms < 1500) return "à l'instant";
  const s = Math.round(ms / 1000);
  if (s < 60) return `il y a ${s} s`;
  return `il y a ${Math.round(s / 60)} min`;
}

/**
 * Valeur d'attribut bornée : depuis #727 la collecte retient aussi tous les
 * attributs qui nomment un champ, et un `columns="a:A, b:B, …"` de trois
 * lignes noierait l'en-tête de l'étape.
 */
function borner(value: string, max = 60): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function formatAttrs(node: StageNode): string {
  const pairs = Object.entries(node.attrs);
  if (pairs.length === 0) return '';
  return pairs.map(([k, v]) => (v === '' ? k : `${k}="${borner(v)}"`)).join('  ');
}

/**
 * Un champ nommé par un attribut et introuvable dans ce que l'étape reçoit
 * (#727) — la panne la plus fréquente et la plus muette : le graphique se
 * rend, vide, sans un mot.
 */
function formatFieldIssues(issues: FieldIssue[] | undefined): string[] {
  if (!issues || issues.length === 0) return [];
  return issues.map(
    (issue) => `     ${issue.reason === 'absent' ? '✗ CHAMP' : '⚠ champ'} — ${issue.message}`
  );
}

/**
 * Attributs que le bundle CHARGÉ ne connaît pas (#727) : une page juste,
 * écrite contre une documentation juste, qui ne fait rien parce que la
 * bibliothèque servie est plus ancienne que l'attribut.
 */
function formatUnknownAttrs(node: StageNode): string[] {
  const attrs = node.unknownAttrs;
  if (!attrs || attrs.length === 0) return [];
  return [
    `     ⚠ ${plural(attrs.length, 'attribut')} inconnu${attrs.length > 1 ? 's' : ''} de la version chargée : ${attrs.join(', ')}`,
    "       Ignoré en silence — vérifiez l'orthographe, ou mettez la bibliothèque à jour.",
  ];
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

/** Milliers séparés par une espace — « 1 065 », lisible et collable tel quel. */
export function formatInt(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Ce qui a tronqué les lignes (#658), lu sur les attributs du nœud : un
 * `limit` explicite est une troncature voulue, un plafond `max-records`
 * (défaut 1000 sur ODS) est presque toujours subi. Nommer la cause dit à
 * l'utilisateur quel attribut relever.
 */
function truncationCause(node: StageNode): string {
  if (node.tag === 'dsfr-data-query') return 'attribut limit';
  if (node.attrs.limit) return 'attribut limit';
  return node.attrs['max-records']
    ? `plafond max-records="${node.attrs['max-records']}"`
    : 'plafond max-records (défaut 1000, relevable)';
}

/**
 * Taux d'appariement d'une jointure (#660) — le seul signal contre une
 * jointure sur des clés homonymes qui ne se rencontrent jamais. Sous 50 %
 * de lignes gauche appariées, c'est une alerte : en `left`, le compte de
 * lignes en sortie ne bouge pas et rien d'autre ne le dirait.
 */
export const JOIN_MATCH_ALERT_RATIO = 0.5;

/**
 * La jointure mérite-t-elle une alerte ? Sous 50 % d'appariement (#660), ou
 * dès qu'un écart de GRAPHIE des clés est détecté (#792) — `1` face à `01` :
 * c'est une panne certaine, quel que soit le taux (98 / 101 chez le banc
 * d'essai, un total faux de 1,5 % que 97 % d'appariement ne signalait pas).
 */
export function isJoinAlert(join: NonNullable<NonNullable<StageState['meta']>['join']>): boolean {
  if (join.keyFormatMismatch) return true;
  // Jointure-filtre (#816) : contre une source d'UNE ligne (valeur calculee
  // par l'API, `max(annee)`), ecarter les autres lignes est le but — un faible
  // taux d'appariement n'est pas une panne.
  if (isFilterJoin(join)) return false;
  return join.leftTotal > 0 && join.leftMatched / join.leftTotal < JOIN_MATCH_ALERT_RATIO;
}

/** Le cote droit n'a qu'une ligne : la jointure filtre plus qu'elle n'enrichit (#816). */
function isFilterJoin(join: NonNullable<NonNullable<StageState['meta']>['join']>): boolean {
  return join.rightTotal === 1;
}

function formatJoinStats(meta: NonNullable<StageState['meta']>): string[] {
  const join = meta.join;
  if (!join) return [];
  const ratio = join.leftTotal > 0 ? join.leftMatched / join.leftTotal : 1;
  const pct = Math.round(ratio * 100);
  const alert = isJoinAlert(join);
  const lines = [
    `     ${alert ? '⚠' : 'appariement :'} ${formatInt(join.leftMatched)} / ${formatInt(join.leftTotal)} lignes gauche appariées (${pct} %)` +
      `, ${formatInt(join.rightMatched)} / ${formatInt(join.rightTotal)} lignes droite`,
  ];
  // Exemples de clés orphelines (#792) : ce sont eux qui font trouver la cause.
  const samples = (keys: string[] | undefined) => (keys ?? []).map((k) => `"${k}"`).join(', ');
  if (join.leftOrphans?.length) {
    lines.push(`       clés gauche sans correspondance : ${samples(join.leftOrphans)}`);
  }
  if (join.keyFormatMismatch && join.rightOrphans?.length) {
    lines.push(`       clés droite sans correspondance : ${samples(join.rightOrphans)}`);
  }
  if (isFilterJoin(join) && !join.keyFormatMismatch && join.leftMatched < join.leftTotal) {
    lines.push(
      "       jointure-filtre : le côté droit n'a qu'une ligne, les lignes sans correspondance sont écartées volontairement."
    );
  }
  if (join.keyFormatMismatch) {
    lines.push(
      '       Les mêmes clés existent des deux côtés à la graphie près (zéro de tête, espaces) : harmonisez-les avant la jointure.'
    );
  } else if (alert) {
    lines.push(
      '       Clés comparées en chaîne, sans trim ni complétion (201 = "201", "0201" ≠ "201") : vérifiez le référentiel des deux côtés.'
    );
  }
  return lines;
}

/**
 * Ce qu'un pivot long → wide a produit (#255) : le schéma aval dépend des
 * données, c'est ici qu'on lit combien de colonnes sont sorties et combien de
 * cellules sont restées vides (null, jamais un 0 silencieux).
 */
function formatPivotStats(meta: NonNullable<StageState['meta']>): string[] {
  const pivot = meta.pivot;
  if (!pivot) return [];
  const shown = pivot.columnNames.slice(0, 8).join(', ');
  const more = pivot.columnNames.length > 8 ? `, … (+${pivot.columnNames.length - 8})` : '';
  const lines = [
    `     pivot : ${formatInt(pivot.columns)} colonne${pivot.columns > 1 ? 's' : ''} générée${pivot.columns > 1 ? 's' : ''}` +
      (pivot.columns > 0 ? ` (${shown}${more})` : '') +
      `, ${formatInt(pivot.emptyCells)} cellule${pivot.emptyCells > 1 ? 's' : ''} vide${pivot.emptyCells > 1 ? 's' : ''}`,
  ];
  if (pivot.skippedRows > 0) {
    lines.push(
      `       ${formatInt(pivot.skippedRows)} ligne${pivot.skippedRows > 1 ? 's' : ''} ignorée${pivot.skippedRows > 1 ? 's' : ''} (champ de colonne vide).`
    );
  }
  return lines;
}

function formatMeta(node: StageNode, state: StageState): string[] {
  const meta = state.meta;
  if (!meta) return [];
  const bits = [`page ${meta.page}`];
  if (meta.pageSize) bits.push(`taille ${meta.pageSize}`);
  bits.push(`total ${meta.total ?? 'inconnu'}`);
  bits.push(`serveur=${meta.serverSide ? 'oui' : 'non'}`);
  const lines = [`     meta : ${bits.join(', ')}`];
  if (meta.truncated) {
    // Le total peut être inconnu (group_by ODS, #641) : la troncature se
    // déduit alors d'une page pleine au plafond, sans dénominateur.
    const delivered = formatInt(state.rows ?? 0);
    const outOf = meta.total !== undefined ? ` / ${formatInt(meta.total)}` : ' (total inconnu)';
    lines.push(
      `     ⚠ tronqué à ${delivered}${outOf} lignes (${truncationCause(node)}) — l'aval ne voit qu'un sous-ensemble du jeu.`
    );
  }
  if (meta.needsClientProcessing) {
    lines.push(
      "     ⚠ la source n'a pas pu traiter group-by/aggregate côté serveur.",
      `       Repli client : tout l'aval travaille sur ${state.rows ?? '?'} lignes rapatriées, pas sur le jeu complet.`
    );
  }
  lines.push(...formatJoinStats(meta));
  lines.push(...formatPivotStats(meta));
  return lines;
}

/**
 * Où les opérations d'un `dsfr-data-query` se sont réellement exécutées.
 *
 * L'avertissement « traitement client » n'a de sens que si l'étape DEMANDE un
 * regroupement ou une agrégation : un query qui ne fait que filtrer ou trier
 * n'a rien à déléguer, et lui coller l'alerte apprendrait au lecteur — humain
 * comme modèle — à ignorer la ligne la plus importante du diagnostic.
 */
function formatDelegation(
  node: StageNode,
  delegation: DelegationState | undefined,
  rows?: number
): string[] {
  if (!delegation) return [];
  const flags = (['groupBy', 'aggregate', 'orderBy', 'where'] as const)
    .map((k) => `${k}=${delegation[k] ? 'oui' : 'non'}`)
    .join('  ');
  const lines = [`     délégation serveur : ${flags}`];

  const wantsAggregation = !!(node.attrs['group-by'] || node.attrs.aggregate);
  const ranOnClient = !delegation.groupBy && !delegation.aggregate;
  if (wantsAggregation && ranOnClient && rows !== undefined) {
    lines.push(
      `     → agrégation exécutée CÔTÉ CLIENT, sur ${plural(rows, 'ligne')} reçue${rows > 1 ? 's' : ''} —`,
      '       le total ne porte que sur cet échantillon si la source en détient davantage.'
    );
  }
  return lines;
}

/**
 * Ce que l'étape reçoit, et de qui.
 *
 * Un amont EN ÉCHEC n'alimente personne, même s'il détient encore le compte
 * de son dernier succès. Le taire produirait exactement le « faux calme » que
 * ce module existe pour empêcher : une source en erreur et un graphique
 * déclaré alimenté juste en dessous.
 */
function formatInputs(node: StageNode, states: Record<string, StageState>): string[] {
  if (node.upstream.length === 0) return [];
  return node.upstream.map((up) => {
    const upstream = states[up];
    if (upstream?.status === 'error') {
      return `     reçoit — ← ${up} (en échec : plus rien ne descend)`;
    }
    if (upstream?.status === 'waiting') {
      return `     reçoit — ← ${up} (en attente d'un filtre)`;
    }
    if (!upstream || upstream.rows === undefined) {
      return `     reçoit — ← ${up} (aucune donnée observée en amont)`;
    }
    return `     reçoit ${plural(upstream.rows, 'ligne')} ← ${up}`;
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
function statusLine(
  node: StageNode,
  state: StageState,
  upstreamHasData: boolean,
  upstreamWaiting: boolean
): string {
  switch (state.status) {
    case 'waiting':
      return "     ⏳ en attente d'un filtre (require-where) — aucune requête lancée";
    case 'loaded':
      return `     → ${plural(state.rows ?? 0, 'ligne')}, ${plural(state.fields?.length ?? 0, 'champ')}`;
    case 'error':
      return `     ✗ ÉCHEC — ${state.message}`;
    case 'loading':
      return '     … chargement en cours';
    default:
      if (node.role === 'display') {
        // Un afficheur n'émet rien : son propre état reste `idle`. C'est
        // l'amont qui dit s'il attend un filtre — le déclarer « rien reçu »
        // signalerait une panne là où la page fait exactement ce qu'on lui
        // a demandé (#690).
        if (upstreamWaiting) return "     ⏳ en attente d'un filtre (require-where)";
        return upstreamHasData
          ? '     ✓ alimenté (un afficheur consomme sans réémettre)'
          : '     ⚠ aucune donnée reçue — rien à afficher';
      }
      return "     (inerte — n'a rien émis)";
  }
}

/**
 * Lignes reçues mais écartées du rendu par un afficheur cartographique (#648).
 *
 * C'est la panne que « ✓ alimenté » masque le mieux : l'amont livre bien
 * N lignes, le graphique en dessine N − k, et le total ne colle plus au KPI
 * voisin. La cause dépend du composant : code de département/région/pays
 * pour les cartes DSFR Chart, coordonnées ou géométrie pour une couche
 * Leaflet.
 */
function formatSkippedRows(node: StageNode): string[] {
  const n = node.skippedRows;
  if (!n) return [];
  const cause =
    node.tag === 'dsfr-data-map-layer'
      ? 'coordonnées ou géométrie absentes ou invalides'
      : 'code géographique absent ou invalide';
  return [`     ⚠ ${plural(n, 'ligne')} ignorée${n > 1 ? 's' : ''} (${cause})`];
}

/**
 * Points empilés d'une couche (#770) : la couche se déclare complète — rien
 * n'est ignoré — et la carte montre un point pour des milliers de lignes.
 */
function formatStackedPositions(node: StageNode): string[] {
  const stacked = node.stackedPositions;
  if (!stacked) return [];
  return [
    `     ⚠ ${plural(stacked.items, 'point')} sur ${plural(stacked.positions, 'position')} ` +
      `distincte${stacked.positions > 1 ? 's' : ''} (coordonnées constantes ou mal jointes ?)`,
  ];
}

/** Valeur d'exemple compacte : JSON tronqué, pour tenir sur la ligne. */
function formatSampleValue(value: unknown, max = 40): string {
  let text: string;
  if (value === undefined) text = 'undefined';
  else {
    try {
      text = JSON.stringify(value) ?? String(value);
    } catch {
      text = String(value);
    }
  }
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

/**
 * Colonnes dérivées par `compute` sur un normalize (#671). Un recodage est
 * la « boîte noire » type du pipeline : nommer les colonnes produites et
 * montrer une valeur dit tout de suite si l'expression a fait ce qu'on
 * croit. Les valeurs sont masquées avec `redactValues`.
 */
function formatComputedColumns(node: StageNode, opts: FormatOptions): string[] {
  const columns = node.computedColumns;
  if (!columns || columns.length === 0) return [];
  const items = columns.map((c) =>
    opts.redactValues ? c.name : `${c.name} = ${formatSampleValue(c.sample)}`
  );
  return [`     calculées (compute) : ${items.join(', ')}`];
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

  // On recalcule l'ecart DEPUIS l'horodatage absolu plutot que de reprendre
  // `sinceLastEventMs`, fige a la prise de l'instantane : un diagnostic copie
  // dix minutes plus tard annoncerait sinon « a l'instant ».
  const maintenant = (opts.now ?? (() => Date.now()))();
  const ecoule =
    trace.lastEventAt !== null && trace.lastEventAt !== undefined
      ? maintenant - trace.lastEventAt
      : trace.sinceLastEventMs;
  const header = `Flux — ${plural(stageCount, 'étape')}, dernier passage ${humanizeDelay(ecoule)}.`;
  out.push(header);
  if (!trace.quiescent) {
    out.push('… Le pipeline tourne encore : cet instantané peut être incomplet.');
  }
  out.push('');

  const champsIntrouvables = fieldIssuesByNode(trace.graph, trace.states);

  for (const node of ordered) {
    const state = trace.states[node.id] ?? { status: 'idle' as const, emissions: 0 };
    const attrs = formatAttrs(node);
    out.push(`${node.id}  ${node.tag}${attrs ? '  ' + attrs : ''}`);

    if (node.configError) {
      out.push(`     ✗ CONFIGURATION — ${node.configError}`);
    }
    out.push(...formatUnknownAttrs(node));

    out.push(...formatInputs(node, trace.states));
    // Un amont en échec ne compte pas comme alimentant : sinon un afficheur
    // se dirait « alimenté » sous une source qui vient de tomber.
    const upstreamHasData = node.upstream.some((up) => {
      const upstream = trace.states[up];
      return !!upstream && upstream.status !== 'error' && (upstream.rows ?? 0) > 0;
    });
    const upstreamWaiting = node.upstream.some((up) => trace.states[up]?.status === 'waiting');
    out.push(statusLine(node, state, upstreamHasData, upstreamWaiting));
    out.push(...formatSkippedRows(node));
    out.push(...formatStackedPositions(node));
    out.push(...formatFieldIssues(champsIntrouvables[node.id]));
    out.push(...formatComputedColumns(node, opts));

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
      out.push(...formatMeta(node, state));
    }

    if (state.status === 'error' && state.attemptedUrl) {
      out.push(`     URL appelée : ${state.attemptedUrl}`);
    }

    if (node.tag === 'dsfr-data-query') {
      out.push(...formatDelegation(node, trace.delegation[node.id], state.rows));
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
  // Une etape en echec garde le compte de son dernier succes : l'inclure
  // afficherait « 100 -> 8 lignes » sur un pipeline qui vient de tomber.
  const withRows = ordered
    .map((n) => trace.states[n.id])
    .filter((s): s is StageState => !!s && s.status !== 'error' && s.rows !== undefined);

  const champsIntrouvables = fieldIssuesByNode(trace.graph, trace.states);

  let alerts = trace.graph.dangling.length;
  for (const node of ordered) {
    const state = trace.states[node.id];
    if (node.configError) alerts += 1;
    if (node.skippedRows) alerts += 1;
    if (node.stackedPositions) alerts += 1;
    // Un champ nommé pour rien et un attribut que le bundle ignore sont deux
    // pannes muettes : elles doivent peser sur le compte du rail replié,
    // sinon « aucune alerte » s'affiche au-dessus d'un graphique vide (#727).
    alerts += champsIntrouvables[node.id]?.length ?? 0;
    alerts += node.unknownAttrs?.length ?? 0;
    if (!state) continue;
    if (state.status === 'error') alerts += 1;
    if (state.status === 'loaded' && state.rows === 0) alerts += 1;
    // Un afficheur sous une étape en attente d'un filtre n'est pas une
    // alerte : la page fait ce qu'on lui a demandé (#690).
    if (
      node.role === 'display' &&
      state.status === 'idle' &&
      !node.upstream.some((up) => trace.states[up]?.status === 'waiting') &&
      !node.upstream.some((up) => {
        const upstream = trace.states[up];
        return !!upstream && upstream.status !== 'error' && (upstream.rows ?? 0) > 0;
      })
    ) {
      alerts += 1;
    }
    if (state.meta?.needsClientProcessing) alerts += 1;
    if (state.meta?.truncated) alerts += 1;
    const join = state.meta?.join;
    if (join && isJoinAlert(join)) alerts += 1;
  }

  return {
    stages: ordered.length,
    firstRows: withRows.length > 0 ? (withRows[0].rows ?? null) : null,
    lastRows: withRows.length > 0 ? (withRows[withRows.length - 1].rows ?? null) : null,
    alerts,
  };
}
