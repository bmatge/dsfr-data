/**
 * Studio IA - Selection de source.
 *
 * Le studio traite les sources dont les donnees sont embarquees (chargees au
 * moment de l'enregistrement dans l'app Sources) : c'est sur elles que
 * l'assistant inspecte, filtre et valide ses blocs. Depuis qu'il remplace
 * l'Assistant IA comme entree usager (#1081), il en reprend l'offre :
 *   - les jeux d'exemple « Préenregistré » (masquables depuis le guide) ;
 *   - le classement « En ligne » / « Local » (ADR-035) ;
 *   - la source ouverte depuis l'app Sources, preselectionnee et chargee ;
 *   - « Voir les données » (champs + 20 premieres lignes) ;
 *   - des suggestions de premiere demande, tirees des types de champs.
 */

import {
  analyzeDataFields,
  isDemoDatasetsDisabled,
  loadFromStorage,
  migrateSource,
  resolveSelectedSource,
  SAMPLE_DATASETS,
  STORAGE_KEYS,
} from '@dsfr-data/shared';
import type { Field, Source } from '@dsfr-data/shared';
import { state } from './state.js';

/** Libellé d'option : « Nom · N lignes ». */
function libelleOption(nom: string, lignes: number): string {
  return `${nom} · ${lignes.toLocaleString('fr-FR')} lignes`;
}

/** Sources proposables : celles qui portent des lignes. */
function avecDonnees(source: Source): boolean {
  return Array.isArray(source.data) && source.data.length > 0;
}

/** Jeux d'exemple, sous la forme d'une source locale. */
export function sourcesExemple(): Source[] {
  if (isDemoDatasetsDisabled()) return [];
  return SAMPLE_DATASETS.map((ds) => ({
    id: `sample-${ds.id}`,
    name: ds.name,
    type: 'manual' as const,
    data: ds.rows as Record<string, unknown>[],
    recordCount: ds.rows.length,
  }));
}

function ajouterGroupe(select: HTMLSelectElement, label: string, sources: Source[]): void {
  if (sources.length === 0) return;
  const group = document.createElement('optgroup');
  group.label = label;
  for (const source of sources) {
    const option = document.createElement('option');
    option.value = source.id;
    option.textContent = libelleOption(source.name, source.data?.length ?? 0);
    option.dataset.source = JSON.stringify(source);
    group.appendChild(option);
  }
  select.appendChild(group);
}

/**
 * Remplit le select. Rend la source a charger d'emblee : celle ouverte depuis
 * l'app Sources (`SELECTED_SOURCE`), si elle porte des lignes.
 */
export function loadSavedSources(): Source | null {
  const select = document.getElementById('saved-source') as HTMLSelectElement | null;
  if (!select) return null;
  select.replaceChildren();
  const vide = document.createElement('option');
  vide.value = '';
  vide.textContent = '-- Choisir --';
  select.appendChild(vide);

  const sources = loadFromStorage<Source[]>(STORAGE_KEYS.SOURCES, []).map(migrateSource);
  const pointee = loadFromStorage<Source | null>(STORAGE_KEYS.SELECTED_SOURCE, null);
  // `SELECTED_SOURCE` ne porte qu'un pointeur depuis #592 : les lignes sont
  // rebranchees depuis SOURCES.
  const selectionnee = resolveSelectedSource(pointee ? migrateSource(pointee) : null, sources);

  const toutes = [...sources];
  if (selectionnee && !sources.some((s) => s.id === selectionnee.id)) toutes.push(selectionnee);
  const utilisables = toutes.filter(avecDonnees);

  ajouterGroupe(select, 'Préenregistré', sourcesExemple());
  ajouterGroupe(
    select,
    'En ligne',
    utilisables.filter((s) => s.type === 'api' || s.type === 'grist')
  );
  ajouterGroupe(
    select,
    'Local',
    utilisables.filter((s) => s.type !== 'api' && s.type !== 'grist')
  );

  if (selectionnee && avecDonnees(selectionnee)) {
    select.value = selectionnee.id;
    return select.value === selectionnee.id ? selectionnee : null;
  }
  return null;
}

/**
 * Suggestions de premiere demande, d'apres les types de champs — reprises de
 * l'ancien Assistant, a l'echelle d'un tableau de bord.
 */
export function suggestionsPourChamps(fields: Field[]): string[] {
  const numeriques = fields.filter((f) => f.type === 'numérique');
  const textes = fields.filter((f) => f.type === 'texte');
  const dates = fields.filter((f) => f.type === 'date');
  const suggestions: string[] = [];
  if (numeriques.length > 0 && textes.length > 0) {
    suggestions.push(`Barres de ${numeriques[0].name} par ${textes[0].name}`);
  }
  if (dates.length > 0 && numeriques.length > 0) {
    suggestions.push(`Évolution de ${numeriques[0].name}`);
  }
  if (numeriques.length > 0) suggestions.push(`Indicateur clé sur ${numeriques[0].name}`);
  if (textes.length >= 2) suggestions.push('Tableau avec filtres');
  if (suggestions.length === 0) suggestions.push('Tableau des données');
  return suggestions.slice(0, 3);
}

/** Résumé de la ligne « Source » quand rien n'est choisi (#1142). */
export const RESUME_SANS_SOURCE = 'aucune source choisie';

/** Résumé en une ligne de la source chargée : nom, lignes, champs (#1142). */
export function resumeSource(nom: string, lignes: number, champs: number): string {
  const n = (x: number, unite: string) =>
    `${x.toLocaleString('fr-FR')} ${unite}${x > 1 ? 's' : ''}`;
  return `${nom} · ${n(lignes, 'ligne')}, ${n(champs, 'champ')}`;
}

/** Charge la source selectionnee dans l'etat + met a jour l'UI. */
export function handleSourceChange(onLoaded?: (source: Source) => void): void {
  const select = document.getElementById('saved-source') as HTMLSelectElement | null;
  const infoEl = document.getElementById('saved-source-info');
  const summaryEl = document.getElementById('source-summary');
  const voirBtn = document.getElementById('show-data-btn') as HTMLButtonElement | null;
  const selectedOption = select?.options[select.selectedIndex];

  if (!selectedOption?.dataset.source) {
    state.source = null;
    state.localData = null;
    state.fields = [];
    if (infoEl) infoEl.textContent = '';
    if (summaryEl) summaryEl.textContent = RESUME_SANS_SOURCE;
    if (voirBtn) voirBtn.hidden = true;
    return;
  }

  const source: Source = JSON.parse(selectedOption.dataset.source);
  state.source = source;
  state.localData = source.data ?? [];
  state.fields = analyzeDataFields(state.localData);

  // La source devient LA source du document (id stable pour l'export).
  state.document.sources = [source as unknown as (typeof state.document.sources)[number]];

  if (infoEl) {
    infoEl.textContent = `${state.localData.length} enregistrements · ${state.fields
      .map((f) => f.name)
      .join(', ')}`;
  }
  if (summaryEl) {
    summaryEl.textContent = resumeSource(source.name, state.localData.length, state.fields.length);
    summaryEl.title = summaryEl.textContent;
  }
  if (voirBtn) voirBtn.hidden = false;
  onLoaded?.(source);
}

/** Tronque une valeur de cellule pour l'aperçu. */
function cellule(valeur: unknown): string {
  const texte = valeur === null || valeur === undefined ? '—' : String(valeur);
  return texte.length > 60 ? `${texte.slice(0, 57)}…` : texte;
}

/**
 * Remplit l'aperçu des données : champs typés puis 20 premières lignes.
 * Construit par l'API DOM — les valeurs viennent de la source.
 */
export function remplirApercuDonnees(conteneur: HTMLElement): void {
  conteneur.replaceChildren();
  const data = state.localData ?? [];
  if (data.length === 0) {
    conteneur.textContent = 'Aucune donnée chargée : choisissez une source.';
    return;
  }
  const cles = Object.keys(data[0]);

  const resume = document.createElement('p');
  resume.className = 'fr-text--sm fr-mb-1w';
  resume.textContent = `${data.length} enregistrement(s), ${cles.length} champs — aperçu des 20 premiers.`;

  const champs = document.createElement('ul');
  champs.className = 'studio-data__fields';
  for (const f of state.fields) {
    const li = document.createElement('li');
    li.className = 'fr-tag fr-tag--sm';
    li.textContent = `${f.name} (${f.type})`;
    champs.appendChild(li);
  }

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  for (const cle of cles) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = cle;
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  const tbody = document.createElement('tbody');
  for (const ligne of data.slice(0, 20)) {
    const tr = document.createElement('tr');
    for (const cle of cles) {
      const td = document.createElement('td');
      td.textContent = cellule(ligne[cle]);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.append(thead, tbody);
  const wrap = document.createElement('div');
  wrap.className = 'fr-table fr-table--sm studio-data__table';
  wrap.appendChild(table);

  conteneur.append(resume, champs, wrap);
}
