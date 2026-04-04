import { NodeEditor, ClassicPreset } from 'rete';
import { AreaPlugin, AreaExtensions } from 'rete-area-plugin';
import { ConnectionPlugin, Presets as ConnectionPresets } from 'rete-connection-plugin';
import { LitPlugin, Presets as LitPresets } from '@retejs/lit-plugin';
import { AutoArrangePlugin, Presets as ArrangePresets } from 'rete-auto-arrange-plugin';
import { PipelineNode, AttributeControl, StatusControl } from './nodes/base-node.js';
import { NODE_FACTORIES } from './nodes/pipeline-nodes.js';
import { html } from 'lit';
import './ui/attribute-control-element.js';
import './ui/status-control-element.js';

// Use 'any' for Rete schemes — Rete v2's generics are very strict
// about Node subclass inference and fight with custom node types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S = any;

export class PipelineEditor {
  editor: NodeEditor<S>;
  area: AreaPlugin<S, S>;
  private arrange: AutoArrangePlugin<S>;
  private nodeCounter = 0;

  constructor(container: HTMLElement) {
    this.editor = new NodeEditor<S>();
    this.area = new AreaPlugin<S, S>(container);
    const connection = new ConnectionPlugin<S, S>();
    const render = new LitPlugin<S, S>();
    this.arrange = new AutoArrangePlugin<S>();

    // Use default node rendering (handles sockets correctly)
    // but customize controls for our AttributeControl fields
    render.addPreset(LitPresets.classic.setup({
      customize: {
        control(context: any) {
          if (context.payload instanceof StatusControl) {
            const ctrl = context.payload as StatusControl;
            return () => html`<status-control-element .ctrl=${ctrl}></status-control-element>`;
          }
          if (context.payload instanceof AttributeControl) {
            const ctrl = context.payload as AttributeControl;
            return () => html`<attribute-control-element .ctrl=${ctrl}></attribute-control-element>`;
          }
          return null as any;
        },
      },
    }) as any);

    connection.addPreset(ConnectionPresets.classic.setup() as any);
    this.arrange.addPreset(ArrangePresets.classic.setup());

    // Wire plugins
    this.editor.use(this.area);
    this.area.use(connection);
    this.area.use(render);
    this.area.use(this.arrange);

    // Enable selection
    AreaExtensions.selectableNodes(this.area, AreaExtensions.selector(), {
      accumulating: AreaExtensions.accumulateOnCtrl(),
    });

    // Listen for node picks (clicks)
    this.area.addPipe((context: any) => {
      if (context.type === 'nodepicked') {
        const nodeId = context.data?.id;
        if (nodeId && this.onNodeSelected) {
          const node = this.editor.getNodes().find((n: any) => n.id === nodeId) as PipelineNode | undefined;
          if (node) this.onNodeSelected(node);
        }
      }
      return context;
    });
  }

  /** Callback when a node is clicked */
  onNodeSelected?: (node: PipelineNode) => void;

  /** Add a node of a given type at a position */
  async addNode(type: string, x?: number, y?: number): Promise<PipelineNode | null> {
    const factory = NODE_FACTORIES[type];
    if (!factory) return null;

    const node = factory();
    this.nodeCounter++;
    node.label = `${node.component} #${this.nodeCounter}`;

    await this.editor.addNode(node);
    await this.area.translate(node.id, {
      x: x ?? 100 + (this.nodeCounter % 4) * 300,
      y: y ?? 80 + Math.floor(this.nodeCounter / 4) * 250,
    });

    return node;
  }

  /** Remove selected nodes */
  async removeSelected(): Promise<void> {
    const nodes = this.editor.getNodes();
    for (const node of nodes) {
      if ((node as any).selected) {
        const connections = this.editor.getConnections().filter(
          (c: any) => c.source === node.id || c.target === node.id
        );
        for (const conn of connections) {
          await this.editor.removeConnection(conn.id);
        }
        await this.editor.removeNode(node.id);
      }
    }
  }

  /** Auto-arrange all nodes */
  async autoArrange(): Promise<void> {
    await this.arrange.layout();
    await AreaExtensions.zoomAt(this.area, this.editor.getNodes());
  }

  /** Fit viewport to show all nodes */
  async zoomToFit(): Promise<void> {
    await AreaExtensions.zoomAt(this.area, this.editor.getNodes());
  }

  /** Get all nodes */
  getNodes(): PipelineNode[] {
    return this.editor.getNodes();
  }

  /** Get all connections */
  getConnections(): ClassicPreset.Connection<PipelineNode, PipelineNode>[] {
    return this.editor.getConnections();
  }

  /** Create a default example pipeline: Source -> Query -> Chart + A11y */
  async createExamplePipeline(): Promise<void> {
    const source = await this.addNode('source', 50, 150);
    const query = await this.addNode('query', 400, 150);
    const chart = await this.addNode('chart', 750, 50);
    const a11y = await this.addNode('a11y', 750, 350);

    if (source && query && chart && a11y) {
      await this.editor.addConnection(
        new ClassicPreset.Connection(source, 'data', query, 'data')
      );
      await this.editor.addConnection(
        new ClassicPreset.Connection(query, 'data', chart, 'data')
      );
      await this.editor.addConnection(
        new ClassicPreset.Connection(query, 'data', a11y, 'data')
      );
    }

    setTimeout(() => this.zoomToFit(), 200);
  }

  destroy(): void {
    this.area.destroy();
  }
}
