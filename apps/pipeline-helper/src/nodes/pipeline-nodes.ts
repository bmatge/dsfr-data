import { ClassicPreset } from 'rete';
import { PipelineNode } from './base-node.js';
import { DataSocket, CommandSocket } from './sockets.js';
import { NODE_CONFIGS } from './node-configs.js';

/**
 * Create a Source node.
 * Outputs: data
 * Inputs: command (from facets/search)
 */
export function createSourceNode(): PipelineNode {
  const node = new PipelineNode(NODE_CONFIGS.source);
  node.addOutput('data', new ClassicPreset.Output(DataSocket, 'Donnees'));
  node.addInput('command', new ClassicPreset.Input(CommandSocket, 'Commandes', true));
  return node;
}

/**
 * Create a Query node.
 * Inputs: data
 * Outputs: data
 */
export function createQueryNode(): PipelineNode {
  const node = new PipelineNode(NODE_CONFIGS.query);
  node.addInput('data', new ClassicPreset.Input(DataSocket, 'Donnees'));
  node.addOutput('data', new ClassicPreset.Output(DataSocket, 'Donnees'));
  return node;
}

/**
 * Create a Normalize node.
 * Inputs: data
 * Outputs: data
 */
export function createNormalizeNode(): PipelineNode {
  const node = new PipelineNode(NODE_CONFIGS.normalize);
  node.addInput('data', new ClassicPreset.Input(DataSocket, 'Donnees'));
  node.addOutput('data', new ClassicPreset.Output(DataSocket, 'Donnees'));
  return node;
}

/**
 * Create a Join node.
 * Inputs: left (data), right (data)
 * Outputs: data
 */
export function createJoinNode(): PipelineNode {
  const node = new PipelineNode(NODE_CONFIGS.join);
  node.addInput('left', new ClassicPreset.Input(DataSocket, 'Gauche'));
  node.addInput('right', new ClassicPreset.Input(DataSocket, 'Droite'));
  node.addOutput('data', new ClassicPreset.Output(DataSocket, 'Donnees'));
  return node;
}

/**
 * Create a Search node.
 * Inputs: data (to know which source)
 * Outputs: command (sends where clauses upstream)
 */
export function createSearchNode(): PipelineNode {
  const node = new PipelineNode(NODE_CONFIGS.search);
  node.addInput('data', new ClassicPreset.Input(DataSocket, 'Donnees'));
  node.addOutput('command', new ClassicPreset.Output(CommandSocket, 'Commande'));
  return node;
}

/**
 * Create a Facets node.
 * Inputs: data
 * Outputs: command (sends where clauses upstream)
 */
export function createFacetsNode(): PipelineNode {
  const node = new PipelineNode(NODE_CONFIGS.facets);
  node.addInput('data', new ClassicPreset.Input(DataSocket, 'Donnees'));
  node.addOutput('command', new ClassicPreset.Output(CommandSocket, 'Commande'));
  return node;
}

/**
 * Create a Chart node.
 * Inputs: data
 */
export function createChartNode(): PipelineNode {
  const node = new PipelineNode(NODE_CONFIGS.chart);
  node.addInput('data', new ClassicPreset.Input(DataSocket, 'Donnees'));
  return node;
}

/**
 * Create a List node.
 * Inputs: data
 */
export function createListNode(): PipelineNode {
  const node = new PipelineNode(NODE_CONFIGS.list);
  node.addInput('data', new ClassicPreset.Input(DataSocket, 'Donnees'));
  return node;
}

/**
 * Create a KPI node.
 * Inputs: data
 */
export function createKpiNode(): PipelineNode {
  const node = new PipelineNode(NODE_CONFIGS.kpi);
  node.addInput('data', new ClassicPreset.Input(DataSocket, 'Donnees'));
  return node;
}

/**
 * Create a Display node.
 * Inputs: data
 */
export function createDisplayNode(): PipelineNode {
  const node = new PipelineNode(NODE_CONFIGS.display);
  node.addInput('data', new ClassicPreset.Input(DataSocket, 'Donnees'));
  return node;
}

/**
 * Create a Podium node.
 * Inputs: data
 */
export function createPodiumNode(): PipelineNode {
  const node = new PipelineNode(NODE_CONFIGS.podium);
  node.addInput('data', new ClassicPreset.Input(DataSocket, 'Donnees'));
  return node;
}

/**
 * Create an A11y node.
 * Inputs: data (the display component it describes)
 */
export function createA11yNode(): PipelineNode {
  const node = new PipelineNode(NODE_CONFIGS.a11y);
  node.addInput('data', new ClassicPreset.Input(DataSocket, 'Donnees'));
  return node;
}

/** Factory map for toolbar buttons */
export const NODE_FACTORIES: Record<string, () => PipelineNode> = {
  source: createSourceNode,
  normalize: createNormalizeNode,
  query: createQueryNode,
  join: createJoinNode,
  search: createSearchNode,
  facets: createFacetsNode,
  chart: createChartNode,
  list: createListNode,
  kpi: createKpiNode,
  display: createDisplayNode,
  podium: createPodiumNode,
  a11y: createA11yNode,
};
