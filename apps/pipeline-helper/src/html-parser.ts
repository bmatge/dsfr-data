import { ClassicPreset } from 'rete';
import { AttributeControl } from './nodes/base-node.js';
import { NODE_FACTORIES } from './nodes/pipeline-nodes.js';
import type { PipelineEditor } from './editor.js';
import type { PipelineNode } from './nodes/base-node.js';

/** Map component tag → node type key */
const TAG_TO_TYPE: Record<string, string> = {
  'dsfr-data-source': 'source',
  'dsfr-data-normalize': 'normalize',
  'dsfr-data-query': 'query',
  'dsfr-data-join': 'join',
  'dsfr-data-search': 'search',
  'dsfr-data-facets': 'facets',
  'dsfr-data-chart': 'chart',
  'dsfr-data-list': 'list',
  'dsfr-data-kpi': 'kpi',
  'dsfr-data-display': 'display',
  'dsfr-data-podium': 'podium',
  'dsfr-data-a11y': 'a11y',
};

interface ParsedComponent {
  tag: string;
  type: string;
  id: string;
  sourceId: string;
  forId: string;
  attributes: Record<string, string>;
}

/**
 * Parse HTML code to extract dsfr-data-* components and rebuild the pipeline graph.
 */
export async function importFromHtml(editor: PipelineEditor, htmlCode: string): Promise<void> {
  const parsed = parseHtml(htmlCode);
  console.log('[html-parser] Parsed components:', parsed.length, parsed.map(c => `${c.tag}#${c.id}`));

  if (parsed.length === 0) {
    console.warn('[html-parser] No dsfr-data-* components found in code');
    return;
  }

  // Create nodes
  const nodeMap = new Map<string, PipelineNode>();

  // Layout: columns by category, rows within category
  const colWidth = 320;
  const rowHeight = 280;
  const categoryColumns: Record<string, number> = {
    source: 0, transform: 1, interact: 2, display: 3, a11y: 4,
  };
  const categoryRowCounters: Record<string, number> = {};

  for (const comp of parsed) {
    const factory = NODE_FACTORIES[comp.type];
    if (!factory) {
      console.warn('[html-parser] No factory for type:', comp.type);
      continue;
    }

    const cat = factory().category;
    const col = categoryColumns[cat] ?? 0;
    const row = categoryRowCounters[cat] ?? 0;
    categoryRowCounters[cat] = row + 1;

    const node = await editor.addNode(
      comp.type,
      50 + col * colWidth,
      50 + row * rowHeight
    );
    if (!node) continue;

    // Set label from id if available
    if (comp.id) {
      node.label = comp.id;
    }

    // Pre-set attribute values on the control objects (before Lit renders)
    for (const [key, val] of Object.entries(comp.attributes)) {
      const ctrl = node.controls[key];
      if (ctrl instanceof AttributeControl) {
        // Set value directly first (for initial render)
        ctrl.value = val;
      }
    }

    // Store by original HTML id for connection resolution
    if (comp.id) {
      nodeMap.set(comp.id, node);
    }
    // Also store by index for components without id
    nodeMap.set(`__idx_${parsed.indexOf(comp)}`, node);
  }

  console.log('[html-parser] Created nodes:', nodeMap.size);

  // Create connections based on source= attributes
  for (const comp of parsed) {
    if (!comp.sourceId) continue;

    const targetNode = comp.id
      ? nodeMap.get(comp.id)
      : nodeMap.get(`__idx_${parsed.indexOf(comp)}`);
    const sourceNode = nodeMap.get(comp.sourceId);

    if (!targetNode || !sourceNode) {
      console.warn('[html-parser] Cannot resolve connection:', comp.sourceId, '->', comp.id);
      continue;
    }

    // source= always means "read data from" → data connection
    if (sourceNode.outputs['data'] && targetNode.inputs['data']) {
      try {
        await editor.editor.addConnection(
          new ClassicPreset.Connection(sourceNode, 'data', targetNode, 'data')
        );
        console.log('[html-parser] Connected:', comp.sourceId, '->', comp.id || comp.tag);
      } catch (err) {
        console.warn('[html-parser] Connection failed:', err);
      }
    }
  }

  // Wait for Lit components to mount, then re-apply values via setValue()
  // so the UI re-renders with the correct values
  await new Promise(r => setTimeout(r, 200));

  for (const comp of parsed) {
    const node = comp.id ? nodeMap.get(comp.id) : nodeMap.get(`__idx_${parsed.indexOf(comp)}`);
    if (!node) continue;

    for (const [key, val] of Object.entries(comp.attributes)) {
      const ctrl = node.controls[key];
      if (ctrl instanceof AttributeControl) {
        ctrl.setValue(val);
      }
    }
  }

  // Fit viewport
  setTimeout(() => editor.zoomToFit(), 100);
}

function parseHtml(html: string): ParsedComponent[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(wrapHtml(html), 'text/html');
  const components: ParsedComponent[] = [];

  for (const [tag, type] of Object.entries(TAG_TO_TYPE)) {
    const elements = doc.querySelectorAll(tag);
    for (const el of elements) {
      const attrs: Record<string, string> = {};

      // Collect all attributes except id, source, for
      for (const attr of el.attributes) {
        if (['id', 'source', 'for'].includes(attr.name)) continue;
        attrs[attr.name] = attr.value;
      }

      // Boolean attributes (present = true, value is empty string)
      for (const boolAttr of ['server-side', 'table', 'download']) {
        if (el.hasAttribute(boolAttr) && !attrs[boolAttr]) {
          attrs[boolAttr] = 'true';
        }
      }

      components.push({
        tag,
        type,
        id: el.getAttribute('id') || '',
        sourceId: el.getAttribute('source') || '',
        forId: el.getAttribute('for') || '',
        attributes: attrs,
      });
    }
  }

  return components;
}

/** Wrap HTML fragment so DOMParser can handle it */
function wrapHtml(html: string): string {
  if (html.includes('<html') || html.includes('<!DOCTYPE')) {
    return html;
  }
  return `<!DOCTYPE html><html><body>${html}</body></html>`;
}
