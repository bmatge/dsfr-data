/**
 * Réglages de lecture du graphique, dans la section « Apparence » (#1218) :
 * unité des infobulles, libellé des catégories vides, bornes des axes, lignes
 * de référence, cibles, couleur fixée par catégorie, chiffre de synthèse d'une
 * carte.
 *
 * La table « quel réglage pour quel type » et la traduction en attributs
 * vivent dans `../lecture.ts` (module pur). Ici : les contrôles, leurs
 * écouteurs, et les trois petits éditeurs de lignes (références, cibles,
 * couleurs), rendus depuis l'état à chaque ajout ou suppression.
 */

import { escapeHtml } from '@dsfr-data/shared';
import { state, activeSeriesField, tracedExtraSeries, type ChartType } from '../state.js';
import {
  COLOR_MAP_DEFAULT,
  LECTURE_KEYS,
  lectureApplicability,
  normalizeLecture,
  type LectureSettings,
  type MapSummaryMode,
} from '../lecture.js';
import { advancedAggregates, seriesNames } from './series-aggregates.js';

// ---------------------------------------------------------------------------
// Champs simples : identifiant du contrôle → clé d'état
// ---------------------------------------------------------------------------

type CleTexte =
  | 'unitTooltip'
  | 'unitTooltipBar'
  | 'emptyLabel'
  | 'axisMin'
  | 'axisMax'
  | 'xAxisMin'
  | 'xAxisMax'
  | 'mapSummaryValue';

const CHAMPS_TEXTE: readonly { id: string; cle: CleTexte }[] = [
  { id: 'chart-unit', cle: 'unitTooltip' },
  { id: 'chart-unit-bar', cle: 'unitTooltipBar' },
  { id: 'empty-label', cle: 'emptyLabel' },
  { id: 'axis-min', cle: 'axisMin' },
  { id: 'axis-max', cle: 'axisMax' },
  { id: 'x-axis-min', cle: 'xAxisMin' },
  { id: 'x-axis-max', cle: 'xAxisMax' },
  { id: 'map-summary-value', cle: 'mapSummaryValue' },
];

const CASES: readonly { id: string; cle: 'targetsZone' | 'targetsLegend' }[] = [
  { id: 'targets-zone', cle: 'targetsZone' },
  { id: 'targets-legend', cle: 'targetsLegend' },
];

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function afficher(id: string, visible: boolean): void {
  const node = el(id);
  if (node) node.style.display = visible ? '' : 'none';
}

// ---------------------------------------------------------------------------
// Éditeurs de lignes
// ---------------------------------------------------------------------------

const BOUTON_SUPPRIMER = 'fr-btn fr-btn--sm fr-btn--tertiary-no-outline lecture-row__remove';

/** Lignes de référence : position (valeur ou étiquette), valeur, libellé. */
function renderReferenceLines(): void {
  const container = el('reference-lines-container');
  if (!container) return;
  container.innerHTML = state.referenceLines
    .map(
      (ligne, i) => `
    <div class="lecture-row" data-index="${i}">
      <div class="fr-select-group fr-select-group--sm">
        <label class="fr-label" for="reference-kind-${i}">Position</label>
        <select class="fr-select" id="reference-kind-${i}" data-champ="kind" data-repere="builder.apparence.axes.reference.position" data-attribut="dsfr-data-chart:reference-lines" data-repere-libelle="Position de la ligne de référence">
          <option value="value"${ligne.kind === 'value' ? ' selected' : ''}>Sur une valeur (seuil)</option>
          <option value="label"${ligne.kind === 'label' ? ' selected' : ''}>Sur une étiquette (date, catégorie)</option>
        </select>
      </div>
      <div class="fr-input-group fr-input-group--sm">
        <label class="fr-label" for="reference-value-${i}">Valeur</label>
        <input class="fr-input fr-input--sm" type="text" id="reference-value-${i}" data-champ="value" data-repere="builder.apparence.axes.reference.valeur" data-attribut="dsfr-data-chart:reference-lines" data-repere-libelle="Valeur de la ligne de référence" value="${escapeHtml(ligne.value)}" placeholder="Ex : 50 ou 2024">
      </div>
      <div class="fr-input-group fr-input-group--sm">
        <label class="fr-label" for="reference-label-${i}">Libellé</label>
        <input class="fr-input fr-input--sm" type="text" id="reference-label-${i}" data-champ="label" data-repere="builder.apparence.axes.reference.libelle" data-attribut="dsfr-data-chart:reference-lines" data-repere-libelle="Libellé de la ligne de référence" value="${escapeHtml(ligne.label)}" placeholder="Ex : Seuil">
      </div>
      <button type="button" class="${BOUTON_SUPPRIMER}" data-action="remove" title="Supprimer cette ligne de référence" aria-label="Supprimer cette ligne de référence" data-repere="builder.apparence.axes.reference.supprimer" data-repere-libelle="Supprimer une ligne de référence">
        <i class="ri-delete-bin-line" aria-hidden="true"></i>
      </button>
    </div>`
    )
    .join('');
}

/** Cibles : échéance, valeur visée, libellé — et la mesure visée sur un barres + ligne. */
function renderTargets(): void {
  const container = el('targets-container');
  if (!container) return;
  const mesure = state.chartType === 'bar-line';
  container.innerHTML = state.targets
    .map(
      (cible, i) => `
    <div class="lecture-row" data-index="${i}">
      <div class="fr-input-group fr-input-group--sm">
        <label class="fr-label" for="target-x-${i}">Échéance</label>
        <input class="fr-input fr-input--sm" type="text" id="target-x-${i}" data-champ="x" data-repere="builder.apparence.axes.cibles.echeance" data-attribut="dsfr-data-chart:targets" data-repere-libelle="Échéance de la cible" value="${escapeHtml(cible.x)}" placeholder="Ex : 2030">
      </div>
      <div class="fr-input-group fr-input-group--sm">
        <label class="fr-label" for="target-value-${i}">Valeur visée</label>
        <input class="fr-input fr-input--sm" type="text" id="target-value-${i}" data-champ="value" data-repere="builder.apparence.axes.cibles.valeur" data-attribut="dsfr-data-chart:targets" data-repere-libelle="Valeur visée par la cible" value="${escapeHtml(cible.value)}" placeholder="Ex : 26">
      </div>
      <div class="fr-input-group fr-input-group--sm">
        <label class="fr-label" for="target-label-${i}">Libellé</label>
        <input class="fr-input fr-input--sm" type="text" id="target-label-${i}" data-champ="label" data-repere="builder.apparence.axes.cibles.libelle" data-attribut="dsfr-data-chart:targets" data-repere-libelle="Libellé de la cible" value="${escapeHtml(cible.label)}" placeholder="Ex : Cible 2030">
      </div>
      <div class="fr-select-group fr-select-group--sm"${mesure ? '' : ' style="display: none;"'}>
        <label class="fr-label" for="target-series-${i}">Mesure</label>
        <select class="fr-select" id="target-series-${i}" data-champ="series" data-repere="builder.apparence.axes.cibles.mesure" data-attribut="dsfr-data-chart:targets" data-repere-libelle="Mesure visée par la cible">
          <option value="line"${cible.series === 'line' ? ' selected' : ''}>La ligne</option>
          <option value="bar"${cible.series === 'bar' ? ' selected' : ''}>Les barres</option>
        </select>
      </div>
      <button type="button" class="${BOUTON_SUPPRIMER}" data-action="remove" title="Supprimer cette cible" aria-label="Supprimer cette cible" data-repere="builder.apparence.axes.cibles.supprimer" data-repere-libelle="Supprimer une cible">
        <i class="ri-delete-bin-line" aria-hidden="true"></i>
      </button>
    </div>`
    )
    .join('');
  // La zone grisée et la légende n'ont de sens qu'avec une cible.
  afficher('targets-options', state.targets.length > 0);
}

/** Couleurs fixées : une série ou une catégorie, et sa couleur. */
function renderColorMap(): void {
  const container = el('color-map-container');
  if (!container) return;
  container.innerHTML = state.colorMap
    .map(
      (entree, i) => `
    <div class="lecture-row" data-index="${i}">
      <div class="fr-input-group fr-input-group--sm">
        <label class="fr-label" for="color-map-key-${i}">Série ou catégorie</label>
        <input class="fr-input fr-input--sm" type="text" id="color-map-key-${i}" list="color-map-suggestions" data-champ="key" data-repere="builder.apparence.couleurs.modalite" data-attribut="dsfr-data-chart:color-map" data-repere-libelle="Série ou catégorie à colorer" value="${escapeHtml(entree.key)}" placeholder="Ex : Bretagne">
      </div>
      <div class="fr-input-group fr-input-group--sm lecture-row__color">
        <label class="fr-label" for="color-map-color-${i}">Couleur</label>
        <input type="color" id="color-map-color-${i}" data-champ="color" data-repere="builder.apparence.couleurs.couleur" data-attribut="dsfr-data-chart:color-map" data-repere-libelle="Couleur de la série ou de la catégorie" value="${escapeHtml(entree.color)}">
      </div>
      <button type="button" class="${BOUTON_SUPPRIMER}" data-action="remove" title="Supprimer cette couleur" aria-label="Supprimer cette couleur" data-repere="builder.apparence.couleurs.supprimer" data-repere-libelle="Supprimer une couleur">
        <i class="ri-delete-bin-line" aria-hidden="true"></i>
      </button>
    </div>`
    )
    .join('');
  refreshColorSuggestions();
}

/**
 * Noms proposés pour une couleur fixée : les séries du graphique telles que la
 * légende les nomme, puis les étiquettes des données déjà générées. Une simple
 * aide à la saisie : tout autre nom reste accepté.
 */
export function colorSuggestions(): string[] {
  const noms = new Set<string>();
  const serie = activeSeriesField(state);
  const camembert = state.chartType === 'pie' || state.chartType === 'doughnut';
  if (serie) {
    // Format long : les séries sont les valeurs du champ de séries.
    for (const ligne of state.data) noms.add(String(ligne[serie] ?? ''));
  } else if (tracedExtraSeries(state).length > 0 || advancedAggregates().length > 1) {
    for (const nom of seriesNames()) noms.add(nom);
  } else if (!camembert) {
    // Une seule série : le générateur la nomme par le titre (attribut `name`).
    noms.add(state.title || state.valueField);
  }
  if (state.labelField) {
    for (const ligne of state.data.slice(0, 50)) noms.add(String(ligne[state.labelField] ?? ''));
  }
  noms.delete('');
  return [...noms];
}

function refreshColorSuggestions(): void {
  const liste = el('color-map-suggestions');
  if (!liste) return;
  liste.innerHTML = colorSuggestions()
    .map((nom) => `<option value="${escapeHtml(nom)}"></option>`)
    .join('');
}

/** Un éditeur de lignes : son conteneur, son bouton d'ajout, sa liste dans l'état. */
interface Editeur {
  conteneur: string;
  bouton: string;
  rendre: () => void;
  liste: () => Record<string, string>[];
  nouvelle: () => Record<string, string>;
}

const EDITEURS: readonly Editeur[] = [
  {
    conteneur: 'reference-lines-container',
    bouton: 'add-reference-line-btn',
    rendre: renderReferenceLines,
    liste: () => state.referenceLines as unknown as Record<string, string>[],
    nouvelle: () => ({ kind: 'value', value: '', label: '' }),
  },
  {
    conteneur: 'targets-container',
    bouton: 'add-target-btn',
    rendre: renderTargets,
    liste: () => state.targets as unknown as Record<string, string>[],
    nouvelle: () => ({ x: '', value: '', label: '', series: 'line' }),
  },
  {
    conteneur: 'color-map-container',
    bouton: 'add-color-map-btn',
    rendre: renderColorMap,
    liste: () => state.colorMap as unknown as Record<string, string>[],
    nouvelle: () => ({ key: '', color: COLOR_MAP_DEFAULT }),
  },
];

function brancherEditeur(editeur: Editeur): void {
  const conteneur = el(editeur.conteneur);
  if (!conteneur) return;

  el(editeur.bouton)?.addEventListener('click', () => {
    editeur.liste().push(editeur.nouvelle());
    editeur.rendre();
    // Le focus va au premier champ de la ligne ajoutée.
    const lignes = conteneur.querySelectorAll<HTMLElement>('.lecture-row');
    lignes[lignes.length - 1]?.querySelector<HTMLElement>('input, select')?.focus();
  });

  // Saisie : l'état suit, la ligne n'est pas re-rendue (le focus reste en place).
  const saisir = (e: Event): void => {
    const cible = e.target as HTMLInputElement | HTMLSelectElement;
    const champ = cible.dataset?.champ;
    const index = Number(cible.closest<HTMLElement>('.lecture-row')?.dataset.index);
    const ligne = editeur.liste()[index];
    if (champ && ligne) ligne[champ] = cible.value;
  };
  conteneur.addEventListener('input', saisir);
  conteneur.addEventListener('change', saisir);

  conteneur.addEventListener('click', (e) => {
    const bouton = (e.target as HTMLElement).closest<HTMLElement>('[data-action="remove"]');
    if (!bouton) return;
    const index = Number(bouton.closest<HTMLElement>('.lecture-row')?.dataset.index);
    if (Number.isInteger(index)) editeur.liste().splice(index, 1);
    editeur.rendre();
    el(editeur.bouton)?.focus();
  });
}

// ---------------------------------------------------------------------------
// Visibilité selon le type
// ---------------------------------------------------------------------------

/**
 * Affiche les réglages de lecture que le type sait lire, masque les autres.
 * Un réglage masqué garde sa valeur dans l'état : il n'est simplement pas
 * écrit dans le code tant que le type ne le lit pas (`lectureAttrs`).
 */
export function updateLectureVisibility(type: ChartType): void {
  const a = lectureApplicability(type);
  afficher('unit-config', a.unit);
  afficher('unit-bar-group', a.unitBar);
  afficher('empty-label-group', a.emptyLabel);
  afficher('axes-details', a.axisBounds || a.referenceLines || a.targets);
  afficher('axis-bounds-group', a.axisBounds);
  afficher('x-bounds-group', a.xBounds);
  afficher('reference-lines-group', a.referenceLines);
  afficher('targets-group', a.targets);
  afficher('color-map-details', a.colorMap);
  afficher('map-summary-group', a.mapSummary);

  // Barres + ligne : deux mesures, deux unités — l'unité générale est celle de la ligne.
  const unite = document.querySelector('label[for="chart-unit"]');
  if (unite) {
    unite.innerHTML = `${a.unitBar ? 'Unité de la ligne' : 'Unité'}<span class="fr-hint-text">Affichée dans l’infobulle, après la valeur (ex&nbsp;: %, €, hab.)</span>`;
  }
  // Des barres partent toujours de zéro : le dire là où la borne se règle.
  const note = el('axis-bounds-note');
  if (note) {
    note.textContent =
      type === 'bar' || type === 'horizontalBar'
        ? 'Les bornes sont arrondies à la graduation voisine. Des barres partent toujours de zéro : seul un minimum négatif est pris en compte.'
        : 'Les bornes sont arrondies à la graduation voisine.';
  }
  // La colonne « Mesure » d'une cible dépend du type.
  renderTargets();
  updateMapSummaryValueVisibility();
}

function updateMapSummaryValueVisibility(): void {
  afficher('map-summary-value-group', state.mapSummary === 'value');
}

// ---------------------------------------------------------------------------
// État ↔ contrôles
// ---------------------------------------------------------------------------

/** Reporte l'état dans les contrôles (favori rouvert, retour d'une autre app). */
export function syncLectureControls(): void {
  for (const { id, cle } of CHAMPS_TEXTE) {
    const input = el<HTMLInputElement>(id);
    if (input) input.value = state[cle];
  }
  for (const { id, cle } of CASES) {
    const box = el<HTMLInputElement>(id);
    if (box) box.checked = state[cle];
  }
  const synthese = el<HTMLSelectElement>('map-summary');
  if (synthese) synthese.value = state.mapSummary;
  renderReferenceLines();
  renderTargets();
  renderColorMap();
  updateLectureVisibility(state.chartType);
  // Un réglage rouvert se montre : la divulgation qui le porte est dépliée.
  const axes = el<HTMLDetailsElement>('axes-details');
  if (
    axes &&
    (state.axisMin ||
      state.axisMax ||
      state.xAxisMin ||
      state.xAxisMax ||
      state.referenceLines.length > 0 ||
      state.targets.length > 0)
  ) {
    axes.open = true;
  }
  const couleurs = el<HTMLDetailsElement>('color-map-details');
  if (couleurs && state.colorMap.length > 0) couleurs.open = true;
}

/**
 * Après la relecture d'un état déposé : les réglages de lecture sont remis en
 * forme. `depose` est l'instantané relu ; une clé qu'il ne porte pas (favori
 * enregistré avant #1218) revient à sa valeur par défaut, au lieu de garder
 * celle de la session en cours.
 */
export function restoreLecture(depose: Record<string, unknown>): void {
  const propre = normalizeLecture(depose);
  const cible = state as unknown as Record<string, unknown>;
  for (const cle of LECTURE_KEYS) cible[cle] = propre[cle as keyof LectureSettings];
}

export function setupLectureListeners(): void {
  for (const { id, cle } of CHAMPS_TEXTE) {
    const input = el<HTMLInputElement>(id);
    input?.addEventListener('input', () => {
      state[cle] = input.value;
    });
  }
  for (const { id, cle } of CASES) {
    const box = el<HTMLInputElement>(id);
    box?.addEventListener('change', () => {
      state[cle] = box.checked;
    });
  }
  const synthese = el<HTMLSelectElement>('map-summary');
  synthese?.addEventListener('change', () => {
    state.mapSummary = synthese.value as MapSummaryMode;
    updateMapSummaryValueVisibility();
  });
  for (const editeur of EDITEURS) brancherEditeur(editeur);
  // Les noms proposés suivent les données : relus à l'ouverture de la divulgation.
  el('color-map-details')?.addEventListener('toggle', refreshColorSuggestions);
  syncLectureControls();
}
