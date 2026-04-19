import { ClassicPreset } from 'rete';
import {
  PipelineNode,
  AttributeControl,
  AggregateControl,
  ExecutionResult,
} from './nodes/base-node.js';

interface GraphNode {
  node: PipelineNode;
  dataSource?: GraphNode;
  commandTargets?: GraphNode[];
  htmlId: string;
}

/**
 * Executes the pipeline by creating REAL dsfr-data-* elements chained together,
 * exactly as they would run in production. Each node produces its own data
 * so the user can see what flows through each step of the pipeline.
 */
export class PipelineExecutor {
  private container: HTMLDivElement;
  private unsubscribers: (() => void)[] = [];
  private graphNodes: Map<string, GraphNode> = new Map();

  constructor() {
    let existing = document.getElementById('__pipeline-exec__') as HTMLDivElement;
    if (!existing) {
      existing = document.createElement('div');
      existing.id = '__pipeline-exec__';
      existing.style.display = 'none';
      document.body.appendChild(existing);
    }
    this.container = existing;
  }

  async execute(
    nodes: PipelineNode[],
    connections: ClassicPreset.Connection<PipelineNode, PipelineNode>[]
  ): Promise<void> {
    this.cleanup();
    if (nodes.length === 0) return;

    this.buildGraph(nodes, connections);
    this.validateGraph();

    // Create ALL elements in dependency order, chained via source= attributes
    // exactly like they would be in a real HTML page.
    const sorted = this.topologicalSort();
    for (const gn of sorted) {
      this.createElementForNode(gn);
    }
  }

  private buildGraph(
    nodes: PipelineNode[],
    connections: ClassicPreset.Connection<PipelineNode, PipelineNode>[]
  ): void {
    let counter = 0;
    for (const node of nodes) {
      const prefix = node.component.replace('dsfr-data-', '');
      counter++;
      const htmlId = `__exec-${prefix}-${counter}`;
      node.runtimeId = htmlId;
      this.graphNodes.set(node.id, { node, htmlId });
    }

    for (const conn of connections) {
      const source = this.graphNodes.get(conn.source);
      const target = this.graphNodes.get(conn.target);
      if (!source || !target) continue;

      // Les champs `sourceOutput` / `targetInput` sont attachés par Rete au
      // runtime mais pas exposés dans les types de Connection.
      const { sourceOutput: sourceKey, targetInput: targetKey } = conn as typeof conn & {
        sourceOutput: string;
        targetInput: string;
      };

      if (sourceKey === 'data' && targetKey === 'data') {
        target.dataSource = source;
      } else if (sourceKey === 'data' && targetKey === 'left') {
        // Join left input
        target.dataSource = source;
      } else if (sourceKey === 'command' && targetKey === 'command') {
        if (!source.commandTargets) source.commandTargets = [];
        source.commandTargets.push(target);
      }
    }
  }

  private validateGraph(): void {
    for (const gn of this.graphNodes.values()) {
      const node = gn.node;

      if (node.component === 'dsfr-data-source') {
        const attrs = node.getAttributes();
        if (!attrs['api-type'] && !attrs['url']) {
          node.statusControl.update({
            status: 'warning',
            message: 'Configurez le type API ou une URL',
          });
        } else if (attrs['api-type'] !== 'generic' && !attrs['base-url'] && !attrs['dataset-id']) {
          node.statusControl.update({
            status: 'warning',
            message: 'Base URL et/ou Dataset ID manquant',
          });
        } else if (attrs['api-type'] && attrs['api-type'] !== 'generic' && !attrs['dataset-id']) {
          node.statusControl.update({
            status: 'warning',
            message: 'Dataset ID manquant',
          });
        }
      }

      if (node.category !== 'source' && !gn.dataSource) {
        node.statusControl.update({
          status: 'warning',
          message: 'Non connecte a une source de donnees',
        });
      }
    }
  }

  private topologicalSort(): GraphNode[] {
    // True topological sort based on data dependencies
    const visited = new Set<string>();
    const result: GraphNode[] = [];

    const visit = (gn: GraphNode) => {
      if (visited.has(gn.htmlId)) return;
      visited.add(gn.htmlId);
      // Visit upstream first
      if (gn.dataSource) visit(gn.dataSource);
      result.push(gn);
    };

    for (const gn of this.graphNodes.values()) {
      visit(gn);
    }
    return result;
  }

  private createElementForNode(gn: GraphNode): void {
    const node = gn.node;

    // Skip nodes that failed validation
    if (node.statusControl.result.status === 'warning') return;

    // Virtual output node — just listen to upstream, don't create a DOM element
    if (node.component === '__output__') {
      if (gn.dataSource) {
        node.statusControl.update({ status: 'loading', message: 'En attente des donnees...' });
        this.subscribeToUpstreamEvents(gn);
      } else {
        node.statusControl.update({
          status: 'warning',
          message: 'Non connecte a une source de donnees',
        });
      }
      return;
    }

    node.statusControl.update({ status: 'loading' });

    // Create the REAL component element
    const el = document.createElement(node.component);
    el.id = gn.htmlId;

    // Link to upstream via source= attribute (same as production HTML)
    if (gn.dataSource) {
      el.setAttribute('source', gn.dataSource.htmlId);
    }

    // Set all configured attributes
    const attrs = node.getAttributes();
    for (const [key, val] of Object.entries(attrs)) {
      const ctrl = node.controls[key];
      if (ctrl instanceof AttributeControl && ctrl.def.type === 'boolean') {
        if (val === 'true') el.setAttribute(key, '');
      } else {
        el.setAttribute(key, val);
      }
    }

    this.container.appendChild(el);

    // Components that emit dsfr-data-loaded (source, query, normalize, join)
    // get a direct event subscription.
    // Display components (chart, list, kpi, display, podium, a11y) don't emit
    // data events — they consume data. For those, we listen to their upstream.
    const emitsData = ['source', 'transform'].includes(node.category);

    if (emitsData) {
      this.subscribeToNodeEvents(gn);
    } else {
      this.subscribeToUpstreamEvents(gn);
    }
  }

  /** Subscribe to dsfr-data-loaded/error events emitted BY this node */
  private subscribeToNodeEvents(gn: GraphNode): void {
    const nodeId = gn.htmlId;
    const node = gn.node;

    const onLoaded = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.sourceId !== nodeId) return;

      const result = this.extractResult(detail.data);
      node.statusControl.update(result);

      if (result.fields && result.fields.length > 0) {
        this.updateDownstreamFields(gn, result.fields);
      }
    };

    const onError = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.sourceId !== nodeId) return;
      node.statusControl.update({
        status: 'error',
        message: detail.error?.message || 'Erreur lors du chargement',
      });
    };

    document.addEventListener('dsfr-data-loaded', onLoaded);
    document.addEventListener('dsfr-data-error', onError);
    this.unsubscribers.push(() => {
      document.removeEventListener('dsfr-data-loaded', onLoaded);
      document.removeEventListener('dsfr-data-error', onError);
    });

    const timeout = setTimeout(() => {
      if (node.statusControl.result.status === 'loading') {
        node.statusControl.update({
          status: 'warning',
          message: 'Pas de reponse apres 15s — verifiez la configuration',
        });
      }
    }, 15000);
    this.unsubscribers.push(() => clearTimeout(timeout));
  }

  /** Subscribe to the upstream node's dsfr-data-loaded event (for display/a11y nodes) */
  private subscribeToUpstreamEvents(gn: GraphNode): void {
    if (!gn.dataSource) return;
    const upstreamId = gn.dataSource.htmlId;
    const node = gn.node;

    const onLoaded = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.sourceId !== upstreamId) return;

      const result = this.extractResult(detail.data);
      node.statusControl.update({
        status: 'success',
        message: `Recoit ${result.rowCount ?? 0} lignes, ${result.fields?.length ?? 0} champs`,
        fields: result.fields,
        rowCount: result.rowCount,
        sampleData: result.sampleData,
      });
    };

    const onError = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.sourceId !== upstreamId) return;
      node.statusControl.update({
        status: 'error',
        message: `Erreur en amont : ${detail.error?.message || 'Erreur'}`,
      });
    };

    document.addEventListener('dsfr-data-loaded', onLoaded);
    document.addEventListener('dsfr-data-error', onError);
    this.unsubscribers.push(() => {
      document.removeEventListener('dsfr-data-loaded', onLoaded);
      document.removeEventListener('dsfr-data-error', onError);
    });

    const timeout = setTimeout(() => {
      if (node.statusControl.result.status === 'loading') {
        node.statusControl.update({
          status: 'warning',
          message: 'Pas de reponse apres 15s — verifiez la configuration',
        });
      }
    }, 15000);
    this.unsubscribers.push(() => clearTimeout(timeout));
  }

  private extractResult(data: unknown): ExecutionResult {
    let rows: Record<string, unknown>[] = [];

    if (Array.isArray(data)) {
      rows = data as Record<string, unknown>[];
    } else if (data && typeof data === 'object') {
      const wrapped = data as { results?: unknown; records?: unknown };
      if (Array.isArray(wrapped.results)) {
        rows = wrapped.results as Record<string, unknown>[];
      } else if (Array.isArray(wrapped.records)) {
        rows = wrapped.records as Record<string, unknown>[];
      }
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return {
        status: 'success',
        message: 'Aucune donnee retournee',
        fields: [],
        rowCount: 0,
        sampleData: [],
      };
    }

    const fields = Object.keys(rows[0]).filter(
      (k) => !k.startsWith('_') && k !== 'datasetid' && k !== 'recordid'
    );

    return {
      status: 'success',
      fields,
      rowCount: rows.length,
      sampleData: rows.slice(0, 5),
    };
  }

  private updateDownstreamFields(gn: GraphNode, fields: string[]): void {
    for (const otherGn of this.graphNodes.values()) {
      if (otherGn.dataSource !== gn) continue;

      for (const [key, ctrl] of Object.entries(otherGn.node.controls)) {
        if (ctrl instanceof AggregateControl) {
          ctrl.setAvailableFields(fields);
        } else if (
          ctrl instanceof AttributeControl &&
          ctrl.def.type === 'text' &&
          this.isFieldSelector(key)
        ) {
          ctrl.setOptions(fields.map((f) => ({ value: f, label: f })));
        }
      }

      // Propagate recursively
      this.updateDownstreamFields(otherGn, fields);
    }
  }

  private isFieldSelector(attrName: string): boolean {
    return ['label-field', 'value-field', 'group-by', 'order-by', 'fields', 'colonnes'].includes(
      attrName
    );
  }

  cleanup(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
    this.container.innerHTML = '';
    this.graphNodes.clear();
  }

  resetStatuses(nodes: PipelineNode[]): void {
    for (const node of nodes) {
      node.statusControl.update({ status: 'idle' });
    }
  }

  destroy(): void {
    this.cleanup();
    this.container.remove();
  }
}
