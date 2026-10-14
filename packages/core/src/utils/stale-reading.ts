/**
 * Le dernier relevé d'une source en panne (#1288, proposition B) : la règle
 * qui dit s'il s'affiche, et les textes qui le datent.
 *
 * Par défaut, une source en panne ne laisse aucun de ses anciens chiffres à
 * l'écran (ADR-158, proposition A). L'intégrateur peut demander le contraire,
 * source par source, par `stale-if-error="<secondes>"` : les afficheurs
 * gardent alors les derniers chiffres reçus, marqués « Non actualisé » et
 * datés de leur relevé.
 *
 * UNE règle, lue par tous les afficheurs et par le bandeau : `judgeStaleReading`.
 * Le relevé n'est PAS montré — et l'on rend le message de panne — quand :
 * - la source ne porte pas `stale-if-error` (`sans-consigne`) ;
 * - la cause n'est pas passagère (`cause-durable`) : données introuvables,
 *   accès restreint, page mal réglée — le producteur a retiré ou fermé ces
 *   données, les remontrer serait les republier (même règle que C-CACHE-6 du
 *   relais) ;
 * - l'appel en échec n'est pas celui qui a produit les lignes
 *   (`autre-requete`) : filtre, page, tri ou emprise changés — les lignes
 *   gardées répondent à une autre question ;
 * - le relevé est plus vieux que la durée donnée (`echu`) ;
 * - rien n'a jamais été reçu (`rien-recu`).
 *
 * La date est `loadedAt` : le moment où LA PAGE a reçu les lignes — jamais
 * celui du rendu, ni celui de l'échec. D'où « relevés le », et non « données
 * du », qui se lirait comme le millésime de la donnée (`databox-date`).
 *
 * Fonctions PURES, hormis `readStaleReading` qui lit le registre : l'horloge
 * est un paramètre, les textes se recalculent par un contrôle de donnée.
 */
import { getLastKnownData, type LastKnownData } from './data-bridge.js';
import { describeSourceCause, type SourceErrorCause } from './source-errors.js';

/** Pourquoi un relevé n'est pas affiché. `a-jour` : il n'y a pas de panne. */
export type StaleRefusal =
  'rien-recu' | 'a-jour' | 'sans-consigne' | 'cause-durable' | 'autre-requete' | 'echu';

/** Un relevé affichable : les lignes, leur date, et jusqu'à quand il vaut. */
export interface StaleReading {
  data: unknown;
  /** Date (`Date.now()`) du dernier chargement réussi — celle qu'on affiche. */
  loadedAt: number;
  cause: SourceErrorCause;
  /** Source qui a réellement échoué, au bout de la chaîne. */
  originId: string;
  /** Instant à partir duquel le relevé n'est plus affichable. */
  expiresAt: number;
}

/** Verdict de la règle : un relevé, ou la raison de son refus. */
export type StaleVerdict =
  { reading: StaleReading; refusal?: undefined } | { reading?: undefined; refusal: StaleRefusal };

/**
 * La règle (#1288) : ce qu'une étape garde en mémoire est-il affichable comme
 * « dernier relevé », à l'instant `now` ?
 */
export function judgeStaleReading(known: LastKnownData | undefined, now: number): StaleVerdict {
  if (!known) return { refusal: 'rien-recu' };
  const { stale } = known;
  if (!stale) return { refusal: 'a-jour' };
  if (stale.staleIfError === undefined || !(stale.staleIfError > 0)) {
    return { refusal: 'sans-consigne' };
  }
  // Passagère : exactement les causes où « Réessayer » a un sens.
  if (!describeSourceCause(stale.cause).retry) return { refusal: 'cause-durable' };
  if (!stale.sameRequest) return { refusal: 'autre-requete' };
  const expiresAt = known.loadedAt + stale.staleIfError * 1000;
  if (now > expiresAt) return { refusal: 'echu' };
  return {
    reading: {
      data: known.data,
      loadedAt: known.loadedAt,
      cause: stale.cause,
      originId: stale.originId,
      expiresAt,
    },
  };
}

/** Le relevé affichable d'une étape, ou `null` — voir `judgeStaleReading`. */
export function readStaleReading(sourceId: string, now: number = Date.now()): StaleReading | null {
  if (!sourceId) return null;
  return judgeStaleReading(getLastKnownData(sourceId), now).reading ?? null;
}

// ---------------------------------------------------------------------------
// Textes
// ---------------------------------------------------------------------------

/** Étiquette commune à tous les blocs qui montrent un relevé. */
export const STALE_LABEL = 'Non actualisé';

/**
 * Style de l'étiquette, posé EN LIGNE : les composants rendent en light DOM,
 * et une bulle de carte est écrite en HTML hors de tout gabarit. Gris de TEXTE
 * sur gris de contraste : 4,5:1 au moins, en clair comme en sombre.
 */
export const STALE_BADGE_STYLE =
  'display: inline-block; padding: 0.0625rem 0.375rem; border-radius: 0.25rem;' +
  'font-size: 0.6875rem; font-weight: 700; line-height: 1.25rem; text-transform: uppercase;' +
  'letter-spacing: 0.02em; white-space: nowrap;' +
  'color: var(--text-default-grey, #3a3a3a);' +
  'background: var(--background-contrast-grey, #eee);';

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

const two = (n: number): string => String(n).padStart(2, '0');

/** « 14 h 32 », « 9 h 05 » — heure locale du navigateur. */
export function formatReadingHour(at: number): string {
  const d = new Date(at);
  return `${d.getHours()} h ${two(d.getMinutes())}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Le moment du relevé, en toutes lettres : « aujourd’hui à 14 h 32 », ou « le
 * 12 octobre à 18 h 05 » un autre jour (« le 12 octobre 2025 à … » une autre
 * année). Jamais « hier », jamais « il y a 3 min » : un texte relatif se périme
 * sur une capture d'écran et ne se contrôle pas par recalcul.
 */
export function formatReadingMoment(loadedAt: number, now: number): string {
  const d = new Date(loadedAt);
  const today = new Date(now);
  const hour = formatReadingHour(loadedAt);
  if (sameDay(d, today)) return `aujourd’hui à ${hour}`;
  const day = d.getDate() === 1 ? '1er' : String(d.getDate());
  const year = d.getFullYear() === today.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `le ${day} ${MONTHS[d.getMonth()]}${year} à ${hour}`;
}

/**
 * Le même moment, à l'échelle d'une tuile ou d'un bouton : « à 14 h 32 », ou
 * « le 12/10 à 18 h 05 » un autre jour (« le 12/10/2025 à … » une autre année).
 */
export function formatReadingMomentShort(loadedAt: number, now: number): string {
  const d = new Date(loadedAt);
  const today = new Date(now);
  const hour = formatReadingHour(loadedAt);
  if (sameDay(d, today)) return `à ${hour}`;
  const year = d.getFullYear() === today.getFullYear() ? '' : `/${d.getFullYear()}`;
  return `le ${two(d.getDate())}/${two(d.getMonth() + 1)}${year} à ${hour}`;
}

/** Valeur de l'attribut `datetime` d'un `<time>` : l'instant, en ISO 8601. */
export function readingDateTime(loadedAt: number): string {
  return new Date(loadedAt).toISOString();
}

/**
 * Ce qui a été relevé, et son accord : « Chiffres relevés », « Points
 * relevés », « Données relevées ».
 */
export interface ReadingSubject {
  /** Nom au pluriel, avec majuscule : « Chiffres ». */
  noun: string;
  feminine?: boolean;
}

export const READING_FIGURES: ReadingSubject = { noun: 'Chiffres' };
export const READING_POINTS: ReadingSubject = { noun: 'Points' };
export const READING_DATA: ReadingSubject = { noun: 'Données', feminine: true };

/** « Chiffres relevés », « Données relevées ». */
export function readingHead(subject: ReadingSubject = READING_FIGURES): string {
  return `${subject.noun} relevé${subject.feminine ? 'e' : ''}s`;
}

/** « Chiffres relevés aujourd’hui à 14 h 32. » — la mention d'un bloc. */
export function readingSentence(
  loadedAt: number,
  now: number,
  subject: ReadingSubject = READING_FIGURES
): string {
  return `${readingHead(subject)} ${formatReadingMoment(loadedAt, now)}.`;
}

/**
 * Suffixe du nom accessible d'une figure : « Chiffres relevés aujourd’hui à
 * 14 h 32, non actualisés. » — la date est lue AVEC le chiffre.
 */
export function readingAccessibleSuffix(
  loadedAt: number,
  now: number,
  subject: ReadingSubject = READING_FIGURES
): string {
  const e = subject.feminine ? 'e' : '';
  return `${readingHead(subject)} ${formatReadingMoment(loadedAt, now)}, non actualisé${e}s.`;
}

/** Ligne d'une tuile de KPI : « Relevé à 14 h 32 · non actualisé ». */
export function readingTileLine(loadedAt: number, now: number): string {
  return `Relevé ${formatReadingMomentShort(loadedAt, now)} · non actualisé`;
}

/** Fin du nom accessible d'un KPI : « chiffre relevé aujourd’hui à 14 h 32, non actualisé ». */
export function readingKpiAccessible(loadedAt: number, now: number): string {
  return `chiffre relevé ${formatReadingMoment(loadedAt, now)}, non actualisé`;
}

/** Zones d'une couche de carte (`type="geoshape"`) : « Zones relevées ». */
export const READING_ZONES: ReadingSubject = { noun: 'Zones', feminine: true };

/**
 * Note d'une BULLE de carte ouverte sur un point relevé (#1288) : « Non
 * actualisé » puis « Relevé aujourd’hui à 14 h 32. », en HTML — une bulle
 * Leaflet, un volet ou une modale s'écrivent en chaîne. Aucune donnée ici :
 * l'étiquette, une date formatée par la bibliothèque, un instant ISO.
 */
export function readingPopupNoteHtml(loadedAt: number, now: number): string {
  return (
    `<p class="dsfr-data-map__popup-stale" style="margin: 0 0 0.5rem; font-size: 0.8125rem;` +
    ` line-height: 1.5; color: var(--text-default-grey, #3a3a3a);">` +
    `<span class="dsfr-data-status__stale-badge" style="${STALE_BADGE_STYLE}">${STALE_LABEL}</span>` +
    ` Relevé <time datetime="${readingDateTime(loadedAt)}" style="white-space: nowrap;` +
    ` font-weight: 700;">${formatReadingMoment(loadedAt, now)}</time>.</p>`
  );
}

/** Complément d'un bouton d'export : « (chiffres relevés à 14 h 32) ». */
export function readingExportSuffix(loadedAt: number, now: number): string {
  return `(chiffres relevés ${formatReadingMomentShort(loadedAt, now)})`;
}

/**
 * Nom d'un fichier exporté pendant la panne : la date du relevé avant
 * l'extension — `données.csv` → `données_relevé-2026-10-13-14h32.csv`. Date
 * complète dans tous les cas : un fichier se retrouve des jours plus tard.
 */
export function readingFilename(filename: string, loadedAt: number): string {
  const d = new Date(loadedAt);
  const stamp =
    `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}` +
    `-${two(d.getHours())}h${two(d.getMinutes())}`;
  const dot = filename.lastIndexOf('.');
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : '';
  return `${base}_relevé-${stamp}${ext}`;
}
