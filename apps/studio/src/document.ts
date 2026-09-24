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
  LISTE_LIBRE_JEU_ENTIER,
  MAP_LAYER_TYPES,
  MAP_POPUP_MODES,
  diagnoseConfig,
  serverPaginatedSources,
} from '@dsfr-data/shared';
import {
  FREE_COMPONENT_SCHEMA,
  MAX_COMPOSANTS,
  composantsDuDocument,
  idsDuDocument,
  observationsDeTrace,
  validerComposantsLibres,
} from './composant-libre.js';
import type {
  ChartConfig,
  DashboardData,
  DashboardFilterSpec,
  Field,
  MapLayerSpec,
  MapPopupMode,
  Row,
  Source,
  TextStyle,
  Trace,
  Widget,
} from '@dsfr-data/shared';

// ---------------------------------------------------------------------------
// Vocabulaire
// ---------------------------------------------------------------------------

export const BLOCK_KINDS = ['text', 'chart', 'filters', 'map', 'component'] as const;
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
  /**
   * kind=component : composants `dsfr-data-*` et leurs attributs (#1111),
   * valides contre le manifeste (`composant-libre.ts`). Forme brute du modele.
   */
  components?: unknown[];
}

/** Contexte d'application des actions (donnees chargees, pour validation/options). */
export interface DocumentContext {
  data: Row[];
  fields: Field[];
  /** Id de la source du dashboard a associer aux blocs data. */
  sourceId: string;
  /**
   * Derniere trace de l'apercu (volet Diagnostic, #1141) : les champs de
   * sortie des etapes deja calculees, pour controler un bloc libre qui lit un
   * pivot ou une agregation. Absente : seule la source chargee est connue.
   */
  trace?: () => Trace | null;
}

/** Chaines contenues dans une valeur, a toute profondeur. */
function chainesDe(valeur: unknown, acc: Set<string>): Set<string> {
  if (typeof valeur === 'string') acc.add(valeur);
  else if (Array.isArray(valeur)) for (const v of valeur) chainesDe(v, acc);
  else if (valeur && typeof valeur === 'object') {
    for (const v of Object.values(valeur as Record<string, unknown>)) chainesDe(v, acc);
  }
  return acc;
}

/**
 * La source devient LA source du document (en tete : id stable pour l'export,
 * cible des nouveaux blocs). Le Studio compose sur une source a la fois ; une
 * source precedente n'est gardee que si un bloc la lit encore (config.sourceId,
 * couche de carte, `source=` d'un composant libre) — sinon ces blocs perdraient
 * leur balise `<dsfr-data-source>` a l'export. Rend les sources gardees.
 *
 * Chemin UNIQUE du selecteur de source et de l'outil `charger_source_url`
 * (#1140).
 */
export function definirSourceDuDocument(
  doc: DashboardData,
  source: Source
): { id: string; name: string }[] {
  const lues = chainesDe(
    doc.widgets.map((w) => w.config),
    new Set<string>()
  );
  const conservees = doc.sources.filter((s) => s.id !== source.id && lues.has(s.id));
  doc.sources = [source as unknown as DashboardData['sources'][number], ...conservees];
  return conservees.map((s) => ({ id: s.id, name: s.name }));
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
  if (
    spec.kind === 'text' ||
    spec.kind === 'filters' ||
    spec.kind === 'map' ||
    spec.kind === 'component'
  ) {
    return 'full';
  }
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

/**
 * Champs qu'un type de graphique EXIGE vraiment (#1123) — source unique de la
 * validation, de la description de `valueField` dans le schema des outils et
 * donc du vocabulaire engendre pour le prompt.
 *
 * Constat du banc (#1123, `tableau-pagine` 0/2) : `valueField` etait requis
 * pour TOUS les types, datalist compris. Un tableau liste des colonnes
 * (`colonnes`) : il n'a rien a mesurer. Le modele omettait a juste titre
 * valueField, l'appel etait refuse, et il payait un tour pour en inventer un.
 */
export const TYPES_SANS_VALUE_FIELD: readonly string[] = ['datalist'];

/** Messages d'erreur des champs requis manquants (liste vide = conforme). */
export function champsRequisManquants(config: Partial<ChartConfig>): string[] {
  const type = String(config.type ?? '');
  const aValeur = typeof config.valueField === 'string' && config.valueField !== '';
  if (!TYPES_SANS_VALUE_FIELD.includes(type)) {
    return aValeur ? [] : [`"valueField" est obligatoire pour le type ${type}.`];
  }
  // Datalist : valueField n'est requis que pour trier ou agreger (il porte
  // l'order-by et l'aggregate de la requete exportee).
  if (aValeur) return [];
  const exigeants = (['sortOrder', 'aggregation'] as const).filter((k) => {
    // Valeur venue du modele : on ne suppose pas qu'elle respecte le type.
    const v: unknown = config[k];
    return v !== undefined && v !== null && v !== '';
  });
  return exigeants.length > 0
    ? [
        `${exigeants.join(' et ')} d'un datalist porte sur "valueField" : fournis-le, ou retire ${exigeants.join(' et ')}.`,
      ]
    : [];
}

function buildChartWidget(
  id: string,
  spec: BlockSpec,
  ctx: DocumentContext
): { widget?: Widget; error?: string } {
  // Sans source, le bloc s'exporterait vide (« aucune source associée ») : le
  // refuser dit au modele quoi faire d'abord (#1140).
  if (!ctx.sourceId) {
    return {
      error:
        "aucune source chargée. Si l'usager a donné l'URL d'un jeu, appelle charger_source_url ; sinon demande-lui de choisir une source.",
    };
  }
  const raw = spec.config;
  if (!raw || typeof raw.type !== 'string') {
    return { error: 'Bloc chart invalide : "config" doit contenir au minimum un "type" connu.' };
  }
  if (!(CHART_CONFIG_TYPES as readonly string[]).includes(raw.type)) {
    return { error: `Type "${raw.type}" inconnu. Types : ${CHART_CONFIG_TYPES.join(', ')}.` };
  }
  const manquants = champsRequisManquants(raw);
  if (manquants.length > 0) {
    return { error: `Bloc chart ${raw.type} invalide : ${manquants.join(' ')}` };
  }
  // Un datalist sans valueField est stocke avec une chaine vide : le modele du
  // dashboard (normalisation au chargement) exige une chaine, et l'export
  // d'une liste ne lit valueField que pour trier ou agreger — refuses plus haut.
  const config: Partial<ChartConfig> =
    typeof raw.valueField === 'string' ? raw : { ...raw, valueField: '' };
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

  // Geoshape sans geoField : accepte (#1060). Depuis #1053, la couche detecte
  // seule sa colonne geometrique (geo_shape, geometry puis geom) et dit
  // explicitement quand aucune ne convient ; le lint `carte/geoshape-sans-geo-field`
  // n'est plus qu'un avertissement, qu'on laisse au volet Diagnostic.
  if (type !== 'geoshape' && (!raw.latField || !raw.lonField)) {
    return { error: `Couche ${type} sans latField/lonField.` };
  }

  // Affichage du clic (#1109) : une valeur hors vocabulaire est REFUSEE, pas
  // ramenee au defaut — le modele doit savoir que son volet n'existe pas.
  if (
    raw.popupMode !== undefined &&
    !(MAP_POPUP_MODES as readonly string[]).includes(raw.popupMode)
  ) {
    return {
      error: `popupMode "${String(raw.popupMode)}" inconnu (${MAP_POPUP_MODES.join(' | ')}).`,
    };
  }
  // Le regroupement (clustering) rassemble des marqueurs PROCHES A L'ECRAN : il
  // n'existe que pour les couches marker, et ne regroupe jamais par entite.
  if ((raw.cluster === true || raw.clusterRadius !== undefined) && type !== 'marker') {
    return {
      error: `cluster ne s'applique qu'aux couches marker (couche ${type}).`,
    };
  }
  // Un element par entite (#1108) : la lib l'ignore sur heatmap (chaque ligne
  // reste un point de chaleur) — on refuse plutot que d'ecrire un attribut sans effet.
  if (raw.groupField && type === 'heatmap') {
    return {
      error: "groupField ne s'applique pas aux couches heatmap (marker, circle ou geoshape).",
    };
  }
  if (
    raw.clusterRadius !== undefined &&
    (typeof raw.clusterRadius !== 'number' || !(raw.clusterRadius > 0))
  ) {
    return { error: 'clusterRadius doit etre un nombre de pixels positif.' };
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
      raw.popupTitleField,
      raw.groupField,
      ...splitFieldList(raw.popupFields),
      ...templateFields(raw.popupTemplate),
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
      popupTemplate: raw.popupTemplate || undefined,
      popupMode: raw.popupMode as MapPopupMode | undefined,
      popupTitleField: raw.popupTitleField || undefined,
      cluster: raw.cluster === true ? true : undefined,
      groupField: raw.groupField || undefined,
      clusterRadius: raw.clusterRadius,
    },
  };
}

/** « a, b ,c » -> ['a', 'b', 'c'] (champs de popupFields). */
function splitFieldList(list: string | undefined): string[] {
  if (typeof list !== 'string') return [];
  return list
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);
}

/** Champs cites dans un gabarit « {nom} — {montant} € » (#1109). */
function templateFields(template: string | undefined): string[] {
  if (typeof template !== 'string') return [];
  // `[^{}]` : ni imbrication ni retour arriere couteux.
  return [...template.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1].trim());
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

/**
 * Bloc « composant libre » (#1111) : composants valides contre le manifeste
 * par le moteur du lint de balisage. Les avertissements du lint accompagnent
 * le compte-rendu sans refuser le bloc.
 */
function buildComponentWidget(
  id: string,
  spec: BlockSpec,
  doc: DashboardData,
  ctx: DocumentContext
): { widget?: Widget; error?: string; notes?: string[] } {
  const champs = champsDeLaSource(ctx);
  const { components, error, avertissements, nonVerifies } = validerComposantsLibres(
    spec.components,
    {
      idsExternes: idsDuDocument(doc, id),
      champsDesSources: ctx.sourceId && champs.length > 0 ? { [ctx.sourceId]: champs } : {},
      composantsExternes: composantsDuDocument(doc, id),
      observations: ctx.trace ? observationsDeTrace(ctx.trace()) : undefined,
      peutTracer: ctx.trace !== undefined,
    }
  );
  if (error || !components) return { error };
  return {
    widget: {
      id,
      type: 'component',
      title: spec.title ?? 'Composant libre',
      position: { row: 0, col: 0 },
      config: { components },
    },
    notes: [...(avertissements ?? []), ...(nonVerifies ? [nonVerifies] : [])],
  };
}

/**
 * Champs de la source chargee : les cles de TOUTES ses lignes (un jeu creux
 * n'a pas toutes ses cles sur la premiere), plus les champs analyses.
 */
function champsDeLaSource(ctx: DocumentContext): string[] {
  const vus = new Set(ctx.fields.map((f) => f.name));
  for (const ligne of ctx.data) {
    if (ligne && typeof ligne === 'object') for (const cle of Object.keys(ligne)) vus.add(cle);
  }
  return [...vus];
}

/**
 * Strategie de chargement des listes d'un bloc libre, dite au modele (#1141,
 * ADR-109) : la regle est celle de l'export (`serverPaginatedSources`), calculee
 * sur le document tel qu'il est apres l'action.
 */
export function notesPagination(doc: DashboardData, widget: Widget): string[] {
  if (widget.type !== 'component') return [];
  const sources = new Set(doc.sources.map((s) => s.id));
  const paginees = serverPaginatedSources(doc);
  const notes: string[] = [];
  for (const c of widget.config.components) {
    if (c.tag !== 'dsfr-data-list') continue;
    const valeur = (nom: string): string | undefined =>
      c.attributes.find((a) => a.name === nom)?.value;
    const source = valeur('source') ?? '';
    if (!source) continue;
    if (!sources.has(source)) {
      notes.push(
        `<dsfr-data-list> lit #${source}, calculé dans le navigateur : pagination serveur impossible par nature, la source amont est chargée entièrement.`
      );
      continue;
    }
    const pagination = Number(valeur('pagination') ?? '0');
    if (!Number.isInteger(pagination) || pagination <= 0) continue;
    const bloquants = c.attributes
      .map((a) => a.name)
      .filter((n) => LISTE_LIBRE_JEU_ENTIER.includes(n));
    if (paginees.has(source)) {
      notes.push(
        `<dsfr-data-list> lit directement #${source} : pagination serveur (${paginees.get(source)} lignes par page), la source ne charge qu'une page à la fois.`
      );
    } else if (bloquants.length > 0) {
      notes.push(
        `<dsfr-data-list> sur #${source} : jeu entier chargé, ${bloquants.join(', ')} suppose toutes les lignes (sans eux, la pagination serait serveur).`
      );
    } else {
      notes.push(
        `<dsfr-data-list> sur #${source} : jeu entier chargé — la source est lue par d'autres blocs, ou n'a pas de pagination serveur (données embarquées).`
      );
    }
  }
  return notes;
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
    let built: { widget?: Widget; error?: string; notes?: string[] };
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
      case 'component':
        built = buildComponentWidget(id, spec, doc, ctx);
        break;
      default:
        built = { error: `kind "${String(spec.kind)}" inconnu (${BLOCK_KINDS.join(' | ')}).` };
    }
    if (built.widget) {
      placeWidget(doc, built.widget, spec.width ?? defaultWidth(spec));
      lines.push(`+ ${id} (${spec.kind}) « ${built.widget.title} » ajouté.`);
      for (const note of built.notes ?? []) lines.push(`  attention : ${note}`);
      for (const note of notesPagination(doc, built.widget)) lines.push(`  chargement : ${note}`);
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
  const notes: string[] = [];

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
    case 'component': {
      // `components` remplace TOUS les composants du bloc, comme `layers`.
      if (patch.components) {
        const built = buildComponentWidget(
          widget.id,
          { kind: 'component', components: patch.components },
          doc,
          ctx
        );
        if (!built.widget) return { ok: false, summary: `✗ update refusé : ${built.error}` };
        widget.config = built.widget.type === 'component' ? built.widget.config : widget.config;
        for (const note of built.notes ?? []) notes.push(`  attention : ${note}`);
        for (const note of notesPagination(doc, widget)) notes.push(`  chargement : ${note}`);
      }
      break;
    }
    default:
      break;
  }
  const suite = notes.length > 0 ? `\n${notes.join('\n')}` : '';
  return { ok: true, summary: `~ ${blockId} mis à jour.${suite}\n${describeDocument(doc)}` };
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

/**
 * Composants d'un bloc libre, avec leurs ids (#1111) : le modele peut les viser
 * depuis un autre bloc libre (`source=`), et les retrouver pour un update.
 */
function composantsDe(w: Widget): string {
  if (w.type !== 'component') return '';
  const noms = w.config.components.map((c) => {
    const id = c.attributes.find((a) => a.name === 'id')?.value;
    return id ? `${c.tag}#${id}` : c.tag;
  });
  return ` [${noms.join(', ')}]`;
}

/** Etat courant du document, resume pour le modele (ids + natures + titres). */
export function describeDocument(doc: DashboardData): string {
  if (doc.widgets.length === 0) return 'Document vide.';
  const rows = [...new Set(doc.widgets.map((w) => w.position.row))].sort((a, b) => a - b);
  const lines = rows.map((r) => {
    const inRow = doc.widgets
      .filter((w) => w.position.row === r)
      .sort((a, b) => a.position.col - b.position.col)
      .map((w) => `${w.id}:${w.type}« ${w.title} »${composantsDe(w)}`);
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
    geoField: {
      type: 'string',
      description:
        'Champ GeoJSON (geoshape). Facultatif : sans lui, la couche detecte geo_shape, geometry ou geom.',
    },
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
    popupTemplate: {
      type: 'string',
      description:
        'Contenu du clic, champs entre accolades : "{nom} — {montant} €". Prime sur popupFields.',
    },
    popupMode: {
      type: 'string',
      enum: [...MAP_POPUP_MODES],
      description:
        "Affichage du clic : popup (bulle, défaut), panel-right / panel-left (volet latéral), modal. Le volet montre l'objet cliqué (toutes les lignes de son groupe avec groupField).",
    },
    popupTitleField: {
      type: 'string',
      description:
        'Champ de titre du volet ou de la modale (popupMode panel-right, panel-left, modal)',
    },
    cluster: {
      type: 'boolean',
      description:
        "marker seulement : regroupe les marqueurs PROCHES À L'ÉCRAN selon le zoom. Ne regroupe PAS par entité (ville, commune…).",
    },
    groupField: {
      type: 'string',
      description:
        'Un seul élément par valeur de ce champ (ex. un marqueur par ville) quand les données ont PLUSIEURS lignes par entité (format long). Au clic, la popup ou le volet liste TOUTES les lignes du groupe. marker, circle ou geoshape (pas heatmap).',
    },
    clusterRadius: {
      type: 'integer',
      description: 'Rayon de regroupement en pixels (défaut 80), avec cluster',
    },
  },
  required: ['type'],
  additionalProperties: false,
} as const;

/**
 * Configuration d'un bloc chart telle que le Studio la valide (#1123) : le
 * fragment commun de `@dsfr-data/shared`, sauf les champs requis. Seul `type`
 * l'est pour tous ; `valueField` l'est pour tous les types SAUF ceux de
 * `TYPES_SANS_VALUE_FIELD` — un schema plat (sans oneOf, decodage guide vLLM)
 * ne sait pas l'exprimer : la description le dit, `champsRequisManquants` le
 * verifie.
 */
const STUDIO_CHART_CONFIG_SCHEMA = {
  ...CHART_CONFIG_SCHEMA,
  properties: {
    ...CHART_CONFIG_SCHEMA.properties,
    valueField: {
      type: 'string',
      description: `Champ numérique à mesurer. Obligatoire pour tous les types SAUF ${TYPES_SANS_VALUE_FIELD.join(', ')} (un tableau liste des colonnes : colonnes ; valueField n'y sert qu'à trier ou agréger).`,
    },
  },
  required: ['type'],
  description: 'kind=chart : configuration complète',
} as const;

/**
 * Schema d'un bloc — la SOURCE UNIQUE du vocabulaire (#1109) : il valide les
 * appels d'outils ET engendre la liste des options donnee au modele dans le
 * prompt (`describeBlockVocabulary`). Une option absente d'ici n'existe pas
 * pour le Studio, quoi qu'en disent les skills.
 */
export const BLOCK_SPEC_SCHEMA = {
  type: 'object',
  properties: {
    kind: {
      type: 'string',
      enum: [...BLOCK_KINDS],
      description:
        'Nature du bloc : text (éditorial), chart (dataviz, y compris kpi/datalist/podium via config.type), filters (filtres partagés), map (carte Leaflet multi-couches via layers), component (composants dsfr-data libres via components, pour ce que les autres ne couvrent pas)',
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
    config: STUDIO_CHART_CONFIG_SCHEMA,
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
    components: {
      type: 'array',
      items: FREE_COMPONENT_SCHEMA,
      description: `kind=component : composants dsfr-data (${MAX_COMPOSANTS} au plus), dans l'ordre du flux — transformations puis affichage. SEULEMENT pour ce que text, chart, filters et map ne savent pas écrire. Validés contre le manifeste : balise, attributs, valeurs, ids visés.`,
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
        'Modifie un bloc existant (patch partiel : title, content/style, config, fields, layers, components — layers et components remplacent toutes les couches ou tous les composants).',
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
