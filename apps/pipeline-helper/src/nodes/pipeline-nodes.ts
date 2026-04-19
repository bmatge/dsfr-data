import { ClassicPreset } from 'rete';
import {
  PipelineNode,
  AttributeControl,
  SavedSourceSelector,
  AggregateControl,
  type SavedSourcePayload,
} from './base-node.js';
import { DataSocket, CommandSocket } from './sockets.js';
import { NODE_CONFIGS } from './node-configs.js';

declare global {
  interface Window {
    DSFR_DATA_KEYS?: Record<string, string>;
  }
}

/** Map Source.provider to dsfr-data-source api-type */
const PROVIDER_TO_API_TYPE: Record<string, string> = {
  opendatasoft: 'opendatasoft',
  tabular: 'tabular',
  grist: 'grist',
  generic: 'generic',
  insee: 'insee',
};

/**
 * Create a Source node with saved-source selector.
 * Outputs: data
 * Inputs: command (from facets/search)
 */
export function createSourceNode(): PipelineNode {
  const node = new PipelineNode(NODE_CONFIGS.source);
  node.addOutput('data', new ClassicPreset.Output(DataSocket, 'Donnees'));
  node.addInput('command', new ClassicPreset.Input(CommandSocket, 'Commandes', true));

  // Add saved-source selector as the FIRST control (inserted before attributes)
  const selector = new SavedSourceSelector();
  selector.onSourceSelected = (source: SavedSourcePayload | null) => {
    if (!source) return;

    // Connection selected (from saved-source-control)
    if (source._isConnection) {
      const apiType = PROVIDER_TO_API_TYPE[source.provider ?? ''] || 'generic';
      setCtrl(node, 'api-type', apiType);

      if (source.type === 'grist') {
        // Grist adapter expects base-url = full records endpoint URL
        // e.g. https://grist.numerique.gouv.fr/api/docs/{docId}/tables/{tableId}/records
        if (source.apiUrl && source.documentId && source.tableId) {
          const recordsUrl = `${source.apiUrl}/api/docs/${source.documentId}/tables/${source.tableId}/records`;
          setCtrl(node, 'base-url', recordsUrl);
          setCtrl(node, 'dataset-id', `${source.documentId}/${source.tableId}`);
        } else if (source.apiUrl) {
          setCtrl(node, 'base-url', source.apiUrl);
        }
        // Register API key in window.DSFR_DATA_KEYS for dsfr-data-source
        if (source.apiKey) {
          const keyRef = `__conn_grist_${Date.now()}`;
          if (!window.DSFR_DATA_KEYS) window.DSFR_DATA_KEYS = {};
          window.DSFR_DATA_KEYS[keyRef] = source.apiKey;
          setCtrl(node, 'api-key-ref', keyRef);
        }
      } else {
        // API connection: extract base-url and dataset-id
        if (source.baseUrl) {
          setCtrl(node, 'base-url', source.baseUrl);
        }
        if (source.resourceIds?.datasetId) {
          setCtrl(node, 'dataset-id', source.resourceIds.datasetId);
        } else if (source.resourceIds?.resourceId) {
          setCtrl(node, 'dataset-id', source.resourceIds.resourceId);
        }
      }
      return;
    }

    // Regular saved source
    const apiType = PROVIDER_TO_API_TYPE[source.provider ?? ''] || 'generic';
    setCtrl(node, 'api-type', apiType);

    if (source.apiUrl) {
      // Extract base-url (origin) from apiUrl
      try {
        const url = new URL(source.apiUrl);
        setCtrl(node, 'base-url', url.origin);
      } catch {
        setCtrl(node, 'base-url', source.apiUrl);
      }
    }

    // dataset-id from resourceIds
    if (source.resourceIds?.datasetId) {
      setCtrl(node, 'dataset-id', source.resourceIds.datasetId);
    } else if (source.resourceIds?.resourceId) {
      // Tabular uses resource instead of dataset
      setCtrl(node, 'dataset-id', source.resourceIds.resourceId);
    } else if (source.documentId && source.tableId) {
      // Grist
      setCtrl(node, 'dataset-id', `${source.documentId}/${source.tableId}`);
    }
  };

  // Insert selector before other controls by removing and re-adding
  // Controls are rendered in insertion order, so add selector first
  const existingControls = { ...node.controls };
  // Clear and re-add in order
  for (const key of Object.keys(existingControls)) {
    node.removeControl(key);
  }
  node.addControl('__saved-source__', selector);
  for (const [key, ctrl] of Object.entries(existingControls)) {
    node.addControl(key, ctrl);
  }

  return node;
}

function setCtrl(node: PipelineNode, key: string, value: string) {
  const ctrl = node.controls[key];
  if (ctrl instanceof AttributeControl) {
    ctrl.setValue(value);
  }
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

  // Insert AggregateControl after group-by, before order-by
  const existingControls = { ...node.controls };
  for (const key of Object.keys(existingControls)) {
    node.removeControl(key);
  }

  // Re-add in order: group-by, aggregate builder, order-by, filter, __status__
  if (existingControls['group-by']) node.addControl('group-by', existingControls['group-by']);
  node.addControl('aggregate', new AggregateControl());
  if (existingControls['order-by']) node.addControl('order-by', existingControls['order-by']);
  if (existingControls['filter']) node.addControl('filter', existingControls['filter']);
  if (existingControls['__status__']) node.addControl('__status__', existingControls['__status__']);

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
 * Create an Output node (virtual terminal — shows received data).
 * Inputs: data
 */
export function createOutputNode(): PipelineNode {
  const node = new PipelineNode(NODE_CONFIGS.output);
  node.addInput('data', new ClassicPreset.Input(DataSocket, 'Donnees'));
  return node;
}

/**
 * Create an A11y node.
 * Inputs: data
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
  output: createOutputNode,
  a11y: createA11yNode,
};
