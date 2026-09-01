/**
 * Couche document du studio (#515) : le LLM n'ecrit jamais de HTML — il
 * produit des actions JSON incrementales (add_blocks / update_block /
 * remove_block / move_block / set_page / reset_document) que ce module
 * applique de facon DETERMINISTE sur la `DashboardData` partagee.
 *
 * Principes herites du builder-IA (action-schema.ts) :
 *   - schemas PLATS, sans oneOf (robustesse guided-decoding vLLM) ;
 *   - `add_blocks` est BATCHABLE (plusieurs blocs par tour) pour tenir dans le
 *     budget de rounds — Albert est partage et rate-limite ;
 *   - les options des filtres partages sont remplies par l'app (valeurs
 *     distinctes des donnees), jamais par le LLM.
 */

import {
  CHART_CONFIG_SCHEMA,
  CHART_CONFIG_TYPES,
  MAP_LAYER_TYPES,
  diagnoseConfig,
} from '@dsfr-data/shared';
import type {
  ChartConfig,
  DashboardData,
  DashboardFilterSpec,
  Field,
  MapLayerSpec,
  Row,
  TextStyle,
  Widget,
} from '@dsfr-data/shared';

// ---------------------------------------------------------------------------
// Vocabulaire
// ---------------------------------------------------------------------------

export const BLOCK_KINDS = ['text', 'chart', 'filters', 'map'] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

export const BLOCK_WIDTHS = ['full', 'half', 'third'] as const;
export type BlockWidth = (typeof BLOCK_WIDTHS)[number];

export const TEXT_STYLES = ['paragraph', 'title', 'callout'] as const;

/** Specification d'un bloc telle que produite par le LLM (forme PLATE). */
export interface BlockSpec {
  kind: BlockKind;
  title?: string;
  width?: BlockWidth;
  /** kind=text : contenu (texte brut ou HTML simple <p>/<ul>). */
  content?: string;
  style?: TextStyle;
  /** kind=chart : ChartConfig complete du builder-IA. */
  config?: Partial<ChartConfig>;
  /** kind=filters : champs a proposer en filtres partages. */
  fields?: string[];
  /** kind=map : couches de la carte Leaflet (#531). */
  layers?: Array<Partial<MapLayerSpec>>;
}

/** Contexte d'application des actions (donnees chargees, pour validation/options). */
export interface DocumentContext {
  data: Row[];
  fields: Field[];
  /** Id de la source du dashboard a associer aux blocs data. */
  sourceId: string;
}

/** Resultat d'une action : texte a remettre au modele (succes OU erreur actionnable). */
export interface ActionOutcome {
  ok: boolean;
  summary: string;
}

// ---------------------------------------------------------------------------
// Placement dans la grille
// ---------------------------------------------------------------------------

/** Largeur par defaut d'un bloc selon sa nature. */
export function defaultWidth(spec: BlockSpec): BlockWidth {
  if (spec.kind === 'text' || spec.kind === 'filters' || spec.kind === 'map') return 'full';
  if (spec.config?.type === 'kpi') return 'third';
  if (spec.config?.type === 'datalist') return 'full';
  return 'half';
}

const WIDTH_COLUMNS: Record<BlockWidth, number> = { full: 1, half: 2, third: 3 };

/**
 * Place un widget dans la grille : complete la derniere ligne si elle a la
 * meme largeur et de la place, sinon ouvre une nouvelle ligne.
 */
export function placeWidget(doc: DashboardData, widget: Widget, width: BlockWidth): void {
  const columns = WIDTH_COLUMNS[width];
  const rows = doc.widgets.map((w) => w.position.row);
  const lastRow = rows.length ? Math.max(...rows) : -1;

  if (lastRow >= 0) {
    const rowWidgets = doc.widgets.filter((w) => w.position.row === lastRow);
    const rowColumns = doc.layout.rowColumns?.[lastRow] ?? doc.layout.columns;
    if (rowColumns === columns && columns > 1 && rowWidgets.length < columns) {
      widget.position = { row: lastRow, col: rowWidgets.length };
      doc.widgets.push(widget);
      return;
    }
  }

  const row = lastRow + 1;
  widget.position = { row, col: 0 };
  if (!doc.layout.rowColumns) doc.layout.rowColumns = {};
  doc.layout.rowColumns[row] = columns;
  doc.widgets.push(widget);
}

/** Id de bloc court et stable (b1, b2…) — plus maniable pour le LLM qu'un UUID. */
export function nextBlockId(doc: DashboardData): string {
  let n = doc.widgets.length + 1;
  const ids = new Set(doc.widgets.map((w) => w.id));
  while (ids.has(`b${n}`)) n++;
  return `b${n}`;
}

// ---------------------------------------------------------------------------
// Construction des widgets depuis une BlockSpec
// ---------------------------------------------------------------------------

/** Options d'un filtre : valeurs distinctes reelles (jamais fournies par le LLM). */
function distinctOptions(data: Row[], field: string, limit = 30): string[] {
  const seen = new Set<string>();
  for (const row of data) {
    const v = row[field];
    if (v === null || v === undefined || v === '') continue;
    seen.add(String(v));
    if (seen.size > limit) break;
  }
  return Array.from(seen).slice(0, limit).sort();
}

function buildTextWidget(id: string, spec: BlockSpec): Widget {
  const style: TextStyle = TEXT_STYLES.includes((spec.style ?? '') as TextStyle)
    ? (spec.style as TextStyle)
    : 'paragraph';
  const raw = spec.content ?? '';
  // Texte brut sans balise -> paragraphe(s) ; HTML simple laisse tel quel.
  const content = /<[a-z][\s\S]*>/i.test(raw)
    ? raw
    : raw
        .split(/\n{2,}/)
        .map((p) => `<p>${p.trim()}</p>`)
        .join('\n');
  return {
    id,
    type: 'text',
    title: spec.title ?? 'Texte',
    position: { row: 0, col: 0 },
    config: { content, style },
  };
}

function buildChartWidget(
  id: string,
  spec: BlockSpec,
  ctx: DocumentContext
): { widget?: Widget; error?: string } {
  const config = spec.config;
  if (!config || typeof config.type !== 'string' || typeof config.valueField !== 'string') {
    return {
      error:
        'Bloc chart invalide : "config" doit contenir au minimum un "type" connu et un "valueField".',
    };
  }
  if (!(CHART_CONFIG_TYPES as readonly string[]).includes(config.type)) {
    return { error: `Type "${config.type}" inconnu. Types : ${CHART_CONFIG_TYPES.join(', ')}.` };
  }
  if (ctx.data.length > 0) {
    const diag = diagnoseConfig(config, ctx.data);
    if (!diag.ok) return { error: diag.text };
  }
  return {
    widget: {
      id,
      type: 'chart',
      title: spec.title ?? config.title ?? 'Graphique',
      position: { row: 0, col: 0 },
      config: {
        fromBuilder: true,
        chart: config as ChartConfig,
        sourceId: ctx.sourceId || undefined,
      },
    },
  };
}

function buildFiltersWidget(
  id: string,
  spec: BlockSpec,
  ctx: DocumentContext
): { widget?: Widget; error?: string } {
  const fields = (spec.fields ?? []).filter((f) => typeof f === 'string' && f !== '');
  if (fields.length === 0) {
    return { error: 'Bloc filters invalide : "fields" doit lister au moins un champ.' };
  }
  const known = new Set(ctx.fields.map((f) => f.name));
  const unknown = fields.filter((f) => known.size > 0 && !known.has(f));
  if (unknown.length > 0) {
    return {
      error: `Champ(s) de filtre inexistant(s) : ${unknown.join(', ')}. Champs : ${[...known].join(', ')}.`,
    };
  }
  const filters: DashboardFilterSpec[] = fields.map((field) => {
    const options = distinctOptions(ctx.data, field);
    return { field, label: field, operator: 'eq', options };
  });
  return {
    widget: {
      id,
      type: 'filters',
      title: spec.title ?? 'Filtres',
      position: { row: 0, col: 0 },
      config: { filters },
    },
  };
}

/**
 * Valide une couche de carte contre les donnees connues (#531) — meme doctrine
 * observe→corrige que diagnoseConfig : une couche cassee est REFUSEE avec un
 * message actionnable, jamais appliquee. Les champs d'une source autre que
 * celle chargee dans le studio ne sont pas verifiables : on exige seulement la
 * structure (type + champs requis presents).
 */
function validateMapLayer(
  raw: Partial<MapLayerSpec>,
  ctx: DocumentContext
): { layer?: MapLayerSpec; error?: string } {
  const type = raw.type;
  if (!type || !(MAP_LAYER_TYPES as readonly string[]).includes(type)) {
    return { error: `Couche sans type valide (${MAP_LAYER_TYPES.join(' | ')}).` };
  }
  const sourceId = raw.sourceId || ctx.sourceId;
  if (!sourceId) {
    return { error: 'Couche sans source : charge une source ou fournis sourceId.' };
  }

  if (type === 'geoshape') {
    if (!raw.geoField) return { error: `Couche geoshape sans geoField (champ GeoJSON).` };
  } else if (!raw.latField || !raw.lonField) {
    return { error: `Couche ${type} sans latField/lonField.` };
  }

  // Verification des champs uniquement contre la source chargee ici.
  if (sourceId === ctx.sourceId && ctx.fields.length > 0) {
    const known = new Map(ctx.fields.map((f) => [f.name, f.type]));
    const missing = [
      raw.latField,
      raw.lonField,
      raw.geoField,
      raw.valueField,
      raw.colorField,
      raw.tooltipField,
    ]
      .filter((f): f is string => typeof f === 'string' && f !== '')
      .filter((f) => !known.has(f));
    if (missing.length > 0) {
      return {
        error: `Champ(s) inexistant(s) dans la source : ${missing.join(', ')}. Champs : ${[...known.keys()].join(', ')}.`,
      };
    }
    for (const coord of [raw.latField, raw.lonField]) {
      if (coord && known.get(coord) !== 'numérique') {
        return {
          error: `Le champ de coordonnee "${coord}" n'est pas numerique (vois inspect_data).`,
        };
      }
    }
  }

  return {
    layer: {
      sourceId,
      type,
      label: raw.label,
      latField: raw.latField,
      lonField: raw.lonField,
      geoField: raw.geoField,
      valueField: raw.valueField,
      colorField: raw.colorField,
      popupFields: raw.popupFields,
      tooltipField: raw.tooltipField,
      selectedPalette: raw.selectedPalette,
    },
  };
}

function buildMapWidget(
  id: string,
  spec: BlockSpec,
  ctx: DocumentContext
): { widget?: Widget; error?: string } {
  const rawLayers = spec.layers ?? [];
  if (rawLayers.length === 0) {
    return { error: 'Bloc map invalide : "layers" doit contenir au moins une couche.' };
  }
  const layers: MapLayerSpec[] = [];
  for (const raw of rawLayers) {
    const { layer, error } = validateMapLayer(raw ?? {}, ctx);
    if (error) return { error };
    if (layer) layers.push(layer);
  }
  return {
    widget: {
      id,
      type: 'map',
      title: spec.title ?? 'Carte',
      position: { row: 0, col: 0 },
      config: { layers, fitBounds: true, insets: 'drom' },
    },
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Ajoute une liste de blocs (batch). Renvoie un compte-rendu par bloc. */
export function addBlocks(
  doc: DashboardData,
  specs: BlockSpec[],
  ctx: DocumentContext
): ActionOutcome {
  if (!Array.isArray(specs) || specs.length === 0) {
    return { ok: false, summary: 'add_blocks : aucun bloc fourni.' };
  }
  const lines: string[] = [];
  let ok = false;
  for (const spec of specs) {
    const id = nextBlockId(doc);
    let built: { widget?: Widget; error?: string };
    switch (spec.kind) {
      case 'text':
        built = { widget: buildTextWidget(id, spec) };
        break;
      case 'chart':
        built = buildChartWidget(id, spec, ctx);
        break;
      case 'filters':
        built = buildFiltersWidget(id, spec, ctx);
        break;
      case 'map':
        built = buildMapWidget(id, spec, ctx);
        break;
      default:
        built = { error: `kind "${String(spec.kind)}" inconnu (text | chart | filters | map).` };
    }
    if (built.widget) {
      placeWidget(doc, built.widget, spec.width ?? defaultWidth(spec));
      lines.push(`+ ${id} (${spec.kind}) « ${built.widget.title} » ajouté.`);
      ok = true;
    } else {
      lines.push(`✗ bloc ${spec.kind} refusé : ${built.error}`);
    }
  }
  lines.push(describeDocument(doc));
  return { ok, summary: lines.join('\n') };
}

/** Met a jour un bloc existant (patch partiel selon sa nature). */
export function updateBlock(
  doc: DashboardData,
  blockId: string,
  patch: BlockSpec,
  ctx: DocumentContext
): ActionOutcome {
  const idx = doc.widgets.findIndex((w) => w.id === blockId);
  if (idx === -1) {
    return { ok: false, summary: `Bloc "${blockId}" introuvable.\n${describeDocument(doc)}` };
  }
  const widget = doc.widgets[idx];
  if (patch.title) widget.title = patch.title;

  switch (widget.type) {
    case 'text': {
      const rebuilt = buildTextWidget(widget.id, {
        kind: 'text',
        title: widget.title,
        content: patch.content ?? widget.config.content,
        style: patch.style ?? widget.config.style,
      });
      widget.config = rebuilt.type === 'text' ? rebuilt.config : widget.config;
      break;
    }
    case 'chart': {
      if (patch.config) {
        const base = 'chart' in widget.config ? widget.config.chart : undefined;
        const merged = { ...base, ...patch.config } as Partial<ChartConfig>;
        const built = buildChartWidget(widget.id, { kind: 'chart', config: merged }, ctx);
        if (!built.widget) return { ok: false, summary: `✗ update refusé : ${built.error}` };
        widget.config = built.widget.type === 'chart' ? built.widget.config : widget.config;
      }
      break;
    }
    case 'filters': {
      if (patch.fields) {
        const built = buildFiltersWidget(widget.id, { kind: 'filters', fields: patch.fields }, ctx);
        if (!built.widget) return { ok: false, summary: `✗ update refusé : ${built.error}` };
        widget.config = built.widget.type === 'filters' ? built.widget.config : widget.config;
      }
      break;
    }
    case 'map': {
      if (patch.layers) {
        const built = buildMapWidget(widget.id, { kind: 'map', layers: patch.layers }, ctx);
        if (!built.widget) return { ok: false, summary: `✗ update refusé : ${built.error}` };
        widget.config = built.widget.type === 'map' ? built.widget.config : widget.config;
      }
      break;
    }
    default:
      break;
  }
  return { ok: true, summary: `~ ${blockId} mis à jour.\n${describeDocument(doc)}` };
}

/** Supprime un bloc et compacte les lignes vides. */
export function removeBlock(doc: DashboardData, blockId: string): ActionOutcome {
  const idx = doc.widgets.findIndex((w) => w.id === blockId);
  if (idx === -1) {
    return { ok: false, summary: `Bloc "${blockId}" introuvable.\n${describeDocument(doc)}` };
  }
  doc.widgets.splice(idx, 1);
  compactRows(doc);
  return { ok: true, summary: `- ${blockId} supprimé.\n${describeDocument(doc)}` };
}

/** Deplace un bloc d'une ligne vers le haut ou le bas (echange de lignes). */
export function moveBlock(
  doc: DashboardData,
  blockId: string,
  direction: 'up' | 'down'
): ActionOutcome {
  const widget = doc.widgets.find((w) => w.id === blockId);
  if (!widget) {
    return { ok: false, summary: `Bloc "${blockId}" introuvable.\n${describeDocument(doc)}` };
  }
  const rows = [...new Set(doc.widgets.map((w) => w.position.row))].sort((a, b) => a - b);
  const pos = rows.indexOf(widget.position.row);
  const targetPos = direction === 'up' ? pos - 1 : pos + 1;
  if (targetPos < 0 || targetPos >= rows.length) {
    return {
      ok: false,
      summary: `Impossible de déplacer ${blockId} vers ${direction === 'up' ? 'le haut' : 'le bas'}.`,
    };
  }
  const from = rows[pos];
  const to = rows[targetPos];
  for (const w of doc.widgets) {
    if (w.position.row === from) w.position.row = to;
    else if (w.position.row === to) w.position.row = from;
  }
  const rc = doc.layout.rowColumns;
  if (rc) {
    const tmp = rc[from];
    if (rc[to] !== undefined) rc[from] = rc[to];
    else delete rc[from];
    if (tmp !== undefined) rc[to] = tmp;
    else delete rc[to];
  }
  return { ok: true, summary: `↕ ${blockId} déplacé.\n${describeDocument(doc)}` };
}

/** Titre / chapo de la page. */
export function setPage(
  doc: DashboardData,
  patch: { name?: string; description?: string }
): ActionOutcome {
  if (typeof patch.name === 'string' && patch.name) doc.name = patch.name;
  if (typeof patch.description === 'string') doc.description = patch.description;
  return { ok: true, summary: `Page : « ${doc.name} ».` };
}

/** Re-indexe les lignes apres suppression pour ne pas laisser de trous. */
function compactRows(doc: DashboardData): void {
  const rows = [...new Set(doc.widgets.map((w) => w.position.row))].sort((a, b) => a - b);
  const mapping = new Map(rows.map((r, i) => [r, i]));
  const rc: Record<number, number> = {};
  for (const w of doc.widgets) {
    const to = mapping.get(w.position.row)!;
    if (doc.layout.rowColumns?.[w.position.row] !== undefined) {
      rc[to] = doc.layout.rowColumns[w.position.row];
    }
    w.position.row = to;
  }
  doc.layout.rowColumns = Object.keys(rc).length ? rc : undefined;
}

/** Etat courant du document, resume pour le modele (ids + natures + titres). */
export function describeDocument(doc: DashboardData): string {
  if (doc.widgets.length === 0) return 'Document vide.';
  const rows = [...new Set(doc.widgets.map((w) => w.position.row))].sort((a, b) => a - b);
  const lines = rows.map((r) => {
    const inRow = doc.widgets
      .filter((w) => w.position.row === r)
      .sort((a, b) => a.position.col - b.position.col)
      .map((w) => `${w.id}:${w.type}« ${w.title} »`);
    return `  ligne ${r} : ${inRow.join(' | ')}`;
  });
  return `Document « ${doc.name} » (${doc.widgets.length} blocs) :\n${lines.join('\n')}`;
}

// ---------------------------------------------------------------------------
// Schemas des outils (function-calling) — forme plate, pas de oneOf
// ---------------------------------------------------------------------------

const MAP_LAYER_SCHEMA = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: [...MAP_LAYER_TYPES],
      description:
        'marker (points), circle (cercles proportionnels via valueField), heatmap (densité via valueField), geoshape (contours GeoJSON via geoField, choroplèthe via valueField)',
    },
    sourceId: {
      type: 'string',
      description: 'Id de la source de la couche — défaut : la source chargée',
    },
    label: { type: 'string' },
    latField: { type: 'string', description: 'Champ latitude (marker/circle/heatmap)' },
    lonField: { type: 'string', description: 'Champ longitude (marker/circle/heatmap)' },
    geoField: { type: 'string', description: 'Champ GeoJSON (geoshape)' },
    valueField: {
      type: 'string',
      description: 'Champ de valeur (rayon / intensité / remplissage)',
    },
    colorField: { type: 'string', description: 'Champ de couleur catégorielle' },
    popupFields: {
      type: 'string',
      description: 'Champs de la popup au clic, séparés par des virgules',
    },
    tooltipField: { type: 'string', description: 'Champ affiché au survol' },
    selectedPalette: { type: 'string' },
  },
  required: ['type'],
  additionalProperties: false,
} as const;

const BLOCK_SPEC_SCHEMA = {
  type: 'object',
  properties: {
    kind: {
      type: 'string',
      enum: [...BLOCK_KINDS],
      description:
        'Nature du bloc : text (éditorial), chart (dataviz, y compris kpi/datalist/podium via config.type), filters (filtres partagés), map (carte Leaflet multi-couches via layers)',
    },
    title: { type: 'string', description: 'Titre du bloc' },
    width: {
      type: 'string',
      enum: [...BLOCK_WIDTHS],
      description: 'Largeur : full (pleine page), half (2 par ligne), third (3 par ligne)',
    },
    content: {
      type: 'string',
      description:
        "kind=text : le texte de l'utilisateur, repris FIDELEMENT (paragraphes séparés par des lignes vides, ou HTML simple <p>/<ul>)",
    },
    style: { type: 'string', enum: [...TEXT_STYLES], description: 'kind=text : style du bloc' },
    config: { ...CHART_CONFIG_SCHEMA, description: 'kind=chart : configuration complète' },
    fields: {
      type: 'array',
      items: { type: 'string' },
      description:
        'kind=filters : champs à proposer en filtres (les valeurs sont remplies automatiquement)',
    },
    layers: {
      type: 'array',
      items: MAP_LAYER_SCHEMA,
      description: 'kind=map : couches de la carte Leaflet (multi-sources possible)',
    },
  },
  required: ['kind'],
  additionalProperties: false,
} as const;

const MESSAGE_PROP = {
  message: { type: 'string', description: "Phrase courte en français à afficher à l'utilisateur" },
} as const;

/** Outils d'edition du document — NON terminaux : la boucle continue apres chacun. */
export const DOCUMENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'add_blocks',
      description:
        'Ajoute un ou PLUSIEURS blocs au document (batcher les ajouts en un seul appel). Chaque bloc est placé automatiquement dans la grille.',
      parameters: {
        type: 'object',
        properties: {
          blocks: {
            type: 'array',
            items: BLOCK_SPEC_SCHEMA,
            description: 'Blocs à ajouter, dans l’ordre',
          },
          ...MESSAGE_PROP,
        },
        required: ['blocks'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_block',
      description:
        'Modifie un bloc existant (patch partiel : title, content/style, config, fields).',
      parameters: {
        type: 'object',
        properties: {
          block_id: { type: 'string', description: 'Id du bloc (ex: b2)' },
          ...BLOCK_SPEC_SCHEMA.properties,
          ...MESSAGE_PROP,
        },
        required: ['block_id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_block',
      description: 'Supprime un bloc du document.',
      parameters: {
        type: 'object',
        properties: { block_id: { type: 'string' }, ...MESSAGE_PROP },
        required: ['block_id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_block',
      description: "Déplace la ligne d'un bloc vers le haut ou le bas.",
      parameters: {
        type: 'object',
        properties: {
          block_id: { type: 'string' },
          direction: { type: 'string', enum: ['up', 'down'] },
          ...MESSAGE_PROP,
        },
        required: ['block_id', 'direction'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_page',
      description: 'Définit le titre et/ou le chapô (description) de la page.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Titre de la page' },
          description: { type: 'string', description: 'Chapô sous le titre' },
          ...MESSAGE_PROP,
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reset_document',
      description: 'Vide le document pour repartir de zéro (à ne faire que sur demande explicite).',
      parameters: {
        type: 'object',
        properties: { ...MESSAGE_PROP },
        additionalProperties: false,
      },
    },
  },
] as const;

/** Outil TERMINAL : conclut le tour de conversation. */
export const FINISH_TOOL = {
  type: 'function',
  function: {
    name: 'finish',
    description:
      'Termine le tour : le document est dans l’état souhaité. Résume ce qui a été fait dans message.',
    parameters: {
      type: 'object',
      properties: { ...MESSAGE_PROP },
      required: ['message'],
      additionalProperties: false,
    },
  },
} as const;
