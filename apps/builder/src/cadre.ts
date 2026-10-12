/**
 * Réglages du CADRE OFFICIEL DSFR (la DataBox de DSFR Chart) d'un graphique
 * (#1263, suite de #1218) : titre, source, date — saisie ou lue dans les
 * données —, tendance, téléchargement, capture, infobulle, fenêtre
 * d'information, actions du menu.
 *
 * Module PUR (aucun accès au DOM, aucun import de l'état), sur le modèle de
 * `lecture.ts` : les types, les valeurs par défaut, la lecture défensive d'un
 * état déposé et la traduction en attributs — ceux de `dsfr-data-chart`
 * (`databox-*`) et ceux de la balise `<data-box>` nue des données intégrées.
 * Le formulaire (`ui/cadre.ts`), le générateur (`ui/code-generator.ts`) et les
 * tests lisent les mêmes fonctions.
 *
 * Ce que chaque réglage FAIT a été mesuré dans le navigateur sur DSFR Chart
 * 2.1.1 (2026-10-12), pas déduit du manifeste :
 * - `databox-date-field` : la date la plus récente d'une colonne ISO
 *   (`AAAA-MM-JJ`, heure facultative) s'affiche en JJ/MM/AAAA au pied du cadre.
 *   `databox-date` prime. Le graphique lit des lignes AGRÉGÉES : le générateur
 *   fait traverser le regroupement à la colonne (`champ:max`, ou
 *   `max(champ) as champ__max` pour OpenDataSoft).
 * - `databox-tooltip-title` / `-content` : un bouton « i » dans l'en-tête, qui
 *   ouvre une infobulle au clic ou au focus. Le contenu est rendu comme du
 *   TEXTE (une balise s'affiche telle quelle).
 * - `databox-modal-title` / `-content` : la fenêtre n'existe qu'avec un titre
 *   ET `databox-fullscreen` ; le bouton qui l'ouvre porte l'icône « plein
 *   écran » (#1179). Le Builder écrit donc `databox-fullscreen` dès qu'un titre
 *   de fenêtre est saisi : ce n'est plus une case. Le contenu est injecté comme
 *   du HTML par DSFR Chart (`innerHTML`, sans assainissement) : le Builder
 *   l'ÉCHAPPE (`modalContentHtml`), la saisie est du texte simple.
 * - `databox-actions` : un tableau JSON de libellés, chacun une entrée du menu
 *   « Plus d'actions ». L'entrée porte `data-action` (le libellé en minuscules,
 *   sans accents, mots joints par des tirets) et N'A AUCUN comportement : c'est
 *   à un script de la page d'écouter le clic. Un JSON invalide empêche tout le
 *   cadre de s'afficher — la valeur est toujours produite par `JSON.stringify`.
 * - `databox-default-source` : SANS EFFET avec `dsfr-data-chart`, qui ne
 *   déclare au cadre qu'une source, nommée `default`. Pas de contrôle (voir
 *   `couverture-exclusions.ts`).
 * - Le menu « Plus d'actions » (qui porte aussi le téléchargement CSV et la
 *   capture), l'infobulle et la fenêtre ne s'ouvrent qu'avec le JavaScript du
 *   DSFR (`dsfr.module.min.js`) : le générateur l'ajoute aux dépendances dès
 *   que le cadre est actif.
 */

/** Types du Builder (recopié de `state.ts` pour rester sans import d'état). */
type TypeGraphique = string;

/** Les réglages du cadre officiel, tels que portés par l'état du Builder. */
export interface CadreSettings {
  databoxEnabled: boolean;
  databoxTitle: string;
  databoxSource: string;
  /** Date saisie (`databox-date`) ; prime sur la date lue dans les données. */
  databoxDate: string;
  /** Champ de dates de la source (`databox-date-field`) ; vide = aucune. */
  databoxDateField: string;
  databoxTrend: string;
  databoxDownload: boolean;
  databoxScreenshot: boolean;
  databoxTooltipTitle: string;
  databoxTooltipContent: string;
  /** Titre de la fenêtre d'information ; c'est lui qui la fait exister. */
  databoxModalTitle: string;
  /** Contenu de la fenêtre, saisi comme du texte simple. */
  databoxModalContent: string;
  /** Libellés des entrées ajoutées au menu « Plus d'actions ». */
  databoxActions: string[];
}

/** Valeurs par défaut : cadre désactivé, téléchargement coché à l'activation. */
export function cadreDefaults(): CadreSettings {
  return {
    databoxEnabled: false,
    databoxTitle: '',
    databoxSource: '',
    databoxDate: '',
    databoxDateField: '',
    databoxTrend: '',
    databoxDownload: true,
    databoxScreenshot: false,
    databoxTooltipTitle: '',
    databoxTooltipContent: '',
    databoxModalTitle: '',
    databoxModalContent: '',
    databoxActions: [],
  };
}

/** Clés d'état du cadre officiel (instantané des favoris, statut « modifié »). */
export const CADRE_KEYS = Object.keys(cadreDefaults()) as (keyof CadreSettings)[];

/** Types sans cadre : ils ne sont pas rendus par `dsfr-data-chart`. */
const TYPES_SANS_CADRE: readonly TypeGraphique[] = ['kpi', 'gauge', 'datalist', 'podium'];

/** Le type courant peut-il être encadré ? (la section est masquée sinon) */
export function cadreApplies(type: TypeGraphique): boolean {
  return !TYPES_SANS_CADRE.includes(type);
}

/** Le cadre est-il écrit dans le code ? Coché, et sur un type qui l'accepte. */
export function cadreActive(
  type: TypeGraphique,
  s: Pick<CadreSettings, 'databoxEnabled'>
): boolean {
  return s.databoxEnabled && cadreApplies(type);
}

/**
 * Champ de dates à faire traverser l'agrégation, ou chaîne vide : il faut un
 * cadre actif, un champ choisi, et PAS de date saisie (elle primerait, et la
 * colonne serait chargée pour rien).
 */
export function cadreDateField(type: TypeGraphique, s: CadreSettings): string {
  if (!cadreActive(type, s) || s.databoxDate.trim()) return '';
  return s.databoxDateField.trim();
}

/** Nom de la colonne qui porte la date la plus récente après l'agrégation. */
export function dateColumn(path: string): string {
  return `${path}__max`;
}

// ---------------------------------------------------------------------------
// Lecture défensive d'un état déposé (favori, retour d'une autre app)
// ---------------------------------------------------------------------------

function texte(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
}

/**
 * Réglages du cadre d'un état quelconque, remis en forme. Une clé absente
 * (favori enregistré AVANT #1263 : l'instantané ne portait AUCUN réglage du
 * cadre) ou mal formée prend sa valeur par défaut — le graphique se rouvre
 * sans cadre, comme il se rouvrait, au lieu d'hériter du cadre de la session.
 */
export function normalizeCadre(source: unknown): CadreSettings {
  const s =
    source && typeof source === 'object' && !Array.isArray(source)
      ? (source as Record<string, unknown>)
      : {};
  const d = cadreDefaults();
  const bool = (v: unknown, defaut: boolean): boolean => (typeof v === 'boolean' ? v : defaut);
  return {
    databoxEnabled: bool(s.databoxEnabled, d.databoxEnabled),
    databoxTitle: texte(s.databoxTitle),
    databoxSource: texte(s.databoxSource),
    databoxDate: texte(s.databoxDate),
    databoxDateField: texte(s.databoxDateField),
    databoxTrend: texte(s.databoxTrend),
    databoxDownload: bool(s.databoxDownload, d.databoxDownload),
    databoxScreenshot: bool(s.databoxScreenshot, d.databoxScreenshot),
    databoxTooltipTitle: texte(s.databoxTooltipTitle),
    databoxTooltipContent: texte(s.databoxTooltipContent),
    databoxModalTitle: texte(s.databoxModalTitle),
    databoxModalContent: texte(s.databoxModalContent),
    databoxActions: Array.isArray(s.databoxActions) ? s.databoxActions.map(texte) : [],
  };
}

// ---------------------------------------------------------------------------
// Mise en forme des valeurs
// ---------------------------------------------------------------------------

/** Texte sur une ligne : retours à la ligne et blancs répétés ramenés à une espace. */
export function uneLigne(raw: string): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Échappement d'un texte destiné à un NŒUD HTML (pas à un attribut). */
function echapperTexte(raw: string): string {
  return raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Contenu de la fenêtre d'information, du texte saisi au HTML que DSFR Chart
 * injecte tel quel (`innerHTML`). Tout est ÉCHAPPÉ : une balise saisie
 * s'affiche, elle ne s'exécute pas. Une ligne vide sépare deux paragraphes, un
 * retour simple devient `<br>`. Chaîne vide si la saisie l'est.
 *
 * La valeur rendue est du HTML : le générateur l'échappe UNE SECONDE FOIS pour
 * la poser dans un attribut (`&lt;` devient `&amp;lt;`).
 */
export function modalContentHtml(raw: string): string {
  const paragraphes = String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paragraphes
    .map(
      (p) =>
        `<p>${p
          .split('\n')
          .map((ligne) => echapperTexte(ligne.trim()))
          .join('<br>')}</p>`
    )
    .join('');
}

/** Libellés d'actions valides : sur une ligne, non vides, sans doublon. */
export function actionsValue(actions: readonly string[]): string[] {
  const out: string[] = [];
  for (const brut of actions) {
    const libelle = uneLigne(brut);
    if (libelle && !out.includes(libelle)) out.push(libelle);
  }
  return out;
}

/**
 * La date la plus récente d'une série de valeurs, selon la règle de la
 * bibliothèque (`_latestIsoDate` de `dsfr-data-chart`) : préfixe `AAAA-MM-JJ`,
 * heure facultative après `T` ou une espace, comparaison lexicographique. Sert
 * à l'agrégation locale des données intégrées, où la colonne de dates doit
 * survivre au regroupement. `null` si aucune valeur n'est une date ISO.
 */
export function latestIsoDate(values: readonly unknown[]): string | null {
  let latest: string | null = null;
  for (const raw of values) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}/.test(value)) continue;
    if (value.length > 10 && value[10] !== 'T' && value[10] !== ' ') continue;
    if (!Number.isFinite(Date.parse(value))) continue;
    if (latest === null || value > latest) latest = value;
  }
  return latest;
}

// ---------------------------------------------------------------------------
// Traduction en attributs
// ---------------------------------------------------------------------------

/**
 * Un attribut à écrire : nom et valeur BRUTE (non échappée pour l'attribut).
 * `value` absent : attribut booléen. `json` : valeur JSON, à écrire entre
 * guillemets simples.
 */
export interface CadreAttr {
  name: string;
  value?: string;
  json?: boolean;
}

/** Infobulle, fenêtre et actions : communs aux deux balises, au préfixe près. */
function attrsInformation(s: CadreSettings, prefixe: string): CadreAttr[] {
  const out: CadreAttr[] = [];
  const texteAttr = (name: string, raw: string): void => {
    const v = uneLigne(raw);
    if (v) out.push({ name: `${prefixe}${name}`, value: v });
  };
  texteAttr('tooltip-title', s.databoxTooltipTitle);
  texteAttr('tooltip-content', s.databoxTooltipContent);
  // Sans titre, DSFR Chart ne rend ni le bouton ni la fenêtre : rien n'est écrit.
  if (uneLigne(s.databoxModalTitle)) {
    texteAttr('modal-title', s.databoxModalTitle);
    const contenu = modalContentHtml(s.databoxModalContent);
    if (contenu) out.push({ name: `${prefixe}modal-content`, value: contenu });
  }
  const actions = actionsValue(s.databoxActions);
  if (actions.length > 0) {
    out.push({ name: `${prefixe}actions`, value: JSON.stringify(actions), json: true });
  }
  return out;
}

/** La fenêtre d'information existe-t-elle ? (elle demande un titre) */
export function hasModal(s: Pick<CadreSettings, 'databoxModalTitle'>): boolean {
  return uneLigne(s.databoxModalTitle) !== '';
}

/**
 * Attributs `databox-*` de `dsfr-data-chart`. `dateFieldColumn` : la colonne
 * qui porte la date après l'agrégation (voir `cadreDateField`), ou chaîne vide.
 * Tableau vide si le cadre n'est pas actif pour ce type. Sans aucun des
 * réglages de #1263, la liste est celle d'avant, dans le même ordre.
 */
export function cadreAttrs(
  type: TypeGraphique,
  s: CadreSettings,
  dateFieldColumn: string = ''
): CadreAttr[] {
  if (!cadreActive(type, s)) return [];
  const out: CadreAttr[] = [{ name: 'databox' }];
  if (s.databoxTitle) out.push({ name: 'databox-title', value: s.databoxTitle });
  if (s.databoxSource) out.push({ name: 'databox-source', value: s.databoxSource });
  if (s.databoxDate) out.push({ name: 'databox-date', value: s.databoxDate });
  else if (dateFieldColumn) out.push({ name: 'databox-date-field', value: dateFieldColumn });
  if (s.databoxDownload) out.push({ name: 'databox-download' });
  if (s.databoxScreenshot) out.push({ name: 'databox-screenshot' });
  // Le bouton « plein écran » est celui qui ouvre la fenêtre d'information.
  if (hasModal(s)) out.push({ name: 'databox-fullscreen' });
  if (s.databoxTrend) out.push({ name: 'databox-trend', value: s.databoxTrend });
  out.push(...attrsInformation(s, 'databox-'));
  return out;
}

/**
 * Attributs de la balise `<data-box>` nue (données intégrées, types
 * historiques). `name`, `source` et `date` y sont obligatoires : une espace et
 * la date du jour en tiennent lieu, comme avant #1263. La date lue dans les
 * données n'a pas d'équivalent ici — le générateur passe alors par
 * `dsfr-data-chart`.
 */
export function dataBoxAttrs(s: CadreSettings, id: string, today: string): CadreAttr[] {
  const out: CadreAttr[] = [
    { name: 'id', value: id },
    { name: 'name', value: s.databoxTitle || ' ' },
    { name: 'source', value: s.databoxSource || ' ' },
    { name: 'date', value: s.databoxDate || today },
  ];
  if (s.databoxDownload) out.push({ name: 'download' });
  if (s.databoxScreenshot) out.push({ name: 'screenshot' });
  if (hasModal(s)) out.push({ name: 'fullscreen' });
  if (s.databoxTrend) out.push({ name: 'trend', value: s.databoxTrend });
  out.push(...attrsInformation(s, ''));
  out.push({ name: 'segmented-control' });
  return out;
}
