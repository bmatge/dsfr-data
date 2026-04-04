import { ClassicPreset } from 'rete';
import { PipelineNode, AttributeControl } from './nodes/base-node.js';

interface GraphNode {
  node: PipelineNode;
  id: string;
  htmlId: string;
  sourceId?: string; // html id of the source= attribute target
  forId?: string; // html id of the for= attribute target (a11y)
}

/**
 * Generate HTML code from the node graph.
 */
export function generateCode(
  nodes: PipelineNode[],
  connections: ClassicPreset.Connection<PipelineNode, PipelineNode>[]
): string {
  if (nodes.length === 0) return '<!-- Ajoutez des composants pour generer du code -->';

  // Build graph info
  const graphNodes: Map<string, GraphNode> = new Map();
  let idCounter = 0;

  for (const node of nodes) {
    const prefix = node.component.replace('dsfr-data-', '');
    const htmlId = `${prefix}-${++idCounter}`;
    graphNodes.set(node.id, { node, id: node.id, htmlId });
  }

  // Resolve connections: data flows source→target, commands flow target→source
  for (const conn of connections) {
    const sourceGraphNode = graphNodes.get(conn.source);
    const targetGraphNode = graphNodes.get(conn.target);
    if (!sourceGraphNode || !targetGraphNode) continue;

    const sourceKey = (conn as any).sourceOutput as string;
    const targetKey = (conn as any).targetInput as string;

    if (sourceKey === 'data' && targetKey === 'data') {
      // Data connection: target reads from source
      targetGraphNode.sourceId = sourceGraphNode.htmlId;
    } else if (sourceKey === 'command' && targetKey === 'command') {
      // Command connection: source sends commands to target
      sourceGraphNode.sourceId = targetGraphNode.htmlId;
    }

    // A11y special case: for= attribute
    if (targetGraphNode.node.component === 'dsfr-data-a11y' && sourceKey === 'data') {
      // a11y receives data but also needs for= pointing to a display component
      // Use sourceId for data, but try to find a display component in the chain
      const srcNode = sourceGraphNode.node;
      if (['dsfr-data-chart', 'dsfr-data-list', 'dsfr-data-kpi'].includes(srcNode.component)) {
        targetGraphNode.forId = sourceGraphNode.htmlId;
      }
    }
  }

  // Sort nodes by dependency order (sources first, then transforms, then display)
  const categoryOrder: Record<string, number> = {
    source: 0,
    transform: 1,
    interact: 2,
    display: 3,
    a11y: 4,
  };
  const sorted = [...graphNodes.values()]
    .filter((gn) => gn.node.component !== '__output__') // Skip virtual output nodes
    .sort((a, b) => (categoryOrder[a.node.category] ?? 5) - (categoryOrder[b.node.category] ?? 5));

  // Generate HTML
  const lines: string[] = [];
  lines.push('<!-- Pipeline genere par Pipeline Helper -->');
  lines.push('');

  let lastCategory = '';

  for (const gn of sorted) {
    const cat = gn.node.category;
    if (cat !== lastCategory) {
      if (lastCategory) lines.push('');
      lines.push(`<!-- ${getCategoryComment(cat)} -->`);
      lastCategory = cat;
    }

    const attrs: string[] = [];
    attrs.push(`id="${gn.htmlId}"`);

    // source= attribute for data consumers
    if (gn.sourceId) {
      attrs.push(`source="${gn.sourceId}"`);
    }

    // for= attribute for a11y
    if (gn.forId) {
      attrs.push(`for="${gn.forId}"`);
    }

    // Component-specific attributes
    const nodeAttrs = gn.node.getAttributes();
    for (const [key, val] of Object.entries(nodeAttrs)) {
      if (val === 'true' && isBooleanAttr(gn.node, key)) {
        attrs.push(key);
      } else {
        attrs.push(`${key}="${escapeAttr(val)}"`);
      }
    }

    const tag = gn.node.component;
    const attrStr = attrs.join('\n  ');

    lines.push(`<${tag}`);
    lines.push(`  ${attrStr}>`);
    lines.push(`</${tag}>`);
  }

  return lines.join('\n');
}

function getCategoryComment(cat: string): string {
  switch (cat) {
    case 'source':
      return 'Source de donnees (fetch)';
    case 'transform':
      return 'Transformation (filter, group, sort)';
    case 'interact':
      return 'Interaction (recherche, facettes)';
    case 'display':
      return 'Affichage (graphique, liste, KPI)';
    case 'a11y':
      return 'Accessibilite';
    default:
      return cat;
  }
}

function isBooleanAttr(node: PipelineNode, key: string): boolean {
  const ctrl = node.controls[key];
  if (ctrl instanceof AttributeControl) {
    return ctrl.def.type === 'boolean';
  }
  return false;
}

function escapeAttr(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
