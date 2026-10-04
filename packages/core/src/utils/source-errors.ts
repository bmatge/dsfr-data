/**
 * Barème des erreurs de source (#1203) : un message par cause, deux lecteurs.
 *
 * L'usager lit ce qui se passe et ce qu'il peut faire ; l'intégrateur trouve
 * le code, l'adresse appelée et l'heure dans « Détails techniques » et en
 * console. Avant, chaque bloc rendait `Erreur de chargement: HTTP 503: Service
 * Unavailable` en rouge : l'usager croyait la page cassée de son côté.
 *
 * Fonctions PURES : la cause se classe sans DOM, à partir de l'`Error` et de
 * l'état du réseau AU MOMENT de l'échec. Une erreur de configuration d'un
 * composant d'affichage (`renderConfigError`, #649) ne passe JAMAIS par ce
 * barème : une faute de l'intégrateur ne doit pas ressembler à une panne
 * passagère, ni l'inverse.
 *
 * Textes : planche `docs/ux/erreurs-donnees/bareme-messages.png`. Un écart
 * assumé : la planche annonçait « Nouvel essai dans quelques secondes » sur un
 * 429 ; l'arbitrage du 2026-10-03 n'a retenu AUCUN essai automatique sur 429,
 * le texte invite donc à réessayer plutôt que de promettre un essai qui
 * n'aura pas lieu.
 */

/** Cause d'un échec de source, au sens du barème. */
export type SourceErrorCause =
  | 'service-indisponible'
  | 'hors-connexion'
  | 'service-sollicite'
  | 'donnees-introuvables'
  | 'acces-restreint'
  | 'page-mal-reglee'
  | 'reponse-bloquee';

/** Ce que l'usager lit, et ce que l'intégrateur déplie. */
export interface SourceErrorDescription {
  cause: SourceErrorCause;
  /** Titre court, en gras dans le bloc et le bandeau. */
  title: string;
  /** Phrase de cause, à la suite du titre (vide quand le titre suffit). */
  detail: string;
  /** « Réessayer » a-t-il un sens pour cette cause ? */
  retry: boolean;
  /** Nouvel essai automatique au retour de la connexion (hors connexion seul). */
  autoRetryOnline: boolean;
  /** Piste pour l'intégrateur, dans « Détails techniques ». */
  hint: string;
  /** Code HTTP lu dans le message de l'erreur, s'il y en a un. */
  status?: number;
}

const HTTP_STATUS = /\bHTTP (\d{3})\b/;

/** Code HTTP porté par le message d'une erreur d'adaptateur (`HTTP 503: …`). */
export function httpStatusOf(error: Error | null | undefined): number | undefined {
  const match = error?.message ? HTTP_STATUS.exec(error.message) : null;
  return match ? Number(match[1]) : undefined;
}

function isTimeout(error: Error): boolean {
  return (
    error.name === 'TimeoutError' ||
    /(timeout|timed out|délai dépassé|delai depasse)/i.test(error.message || '')
  );
}

/**
 * Classe une erreur de source.
 *
 * @param online état du réseau au moment de l'échec (`navigator.onLine`).
 *   Sans lui, un `TypeError` de `fetch` est indiscernable d'une réponse
 *   bloquée faute d'en-tête CORS (#598).
 */
export function classifySourceError(
  error: Error | null | undefined,
  online = true
): SourceErrorCause {
  if (!error) return 'service-indisponible';
  const status = httpStatusOf(error);
  if (status !== undefined) {
    if (status === 429) return 'service-sollicite';
    if (status === 404 || status === 410) return 'donnees-introuvables';
    if (status === 401 || status === 403) return 'acces-restreint';
    if (status === 408 || status >= 500) return 'service-indisponible';
    if (status >= 400) return 'page-mal-reglee';
  }
  // Rejet générique de `fetch` : panne réseau, DNS, ou réponse cross-origin
  // illisible. Même test que `isOpaqueFetchFailure` (`name`, pas `instanceof`).
  if (error.name === 'TypeError') return online ? 'reponse-bloquee' : 'hors-connexion';
  if (!online) return 'hors-connexion';
  if (isTimeout(error)) return 'service-indisponible';
  // Tout le reste vient de la page : données inline invalides, `api-type`
  // inconnu, réponse non-JSON, paramètres refusés par l'adaptateur.
  return 'page-mal-reglee';
}

const BAREME: Record<SourceErrorCause, Omit<SourceErrorDescription, 'cause' | 'status'>> = {
  'service-indisponible': {
    title: 'Données momentanément indisponibles',
    detail: 'Le service qui publie ces chiffres ne répond pas pour l’instant.',
    retry: true,
    autoRetryOnline: false,
    hint: 'Le service a répondu une erreur ou n’a pas répondu à temps.',
  },
  'hors-connexion': {
    title: 'Vous semblez hors connexion',
    detail: 'Les chiffres s’afficheront quand la connexion reviendra.',
    retry: true,
    autoRetryOnline: true,
    hint: 'Le navigateur se déclarait hors ligne au moment de l’appel.',
  },
  'service-sollicite': {
    title: 'Le service est très sollicité',
    detail: 'Réessayez dans quelques instants.',
    retry: true,
    autoRetryOnline: false,
    hint: 'Limite de débit de l’API atteinte : aucun nouvel essai automatique.',
  },
  'donnees-introuvables': {
    title: 'Ces données ne sont plus publiées à cette adresse',
    detail: 'Le producteur les a peut-être déplacées ou retirées.',
    retry: false,
    autoRetryOnline: false,
    hint: 'Vérifier dataset-id / resource.',
  },
  'acces-restreint': {
    title: 'Ces données ne sont pas accessibles publiquement',
    detail: '',
    retry: false,
    autoRetryOnline: false,
    hint: 'Clé API absente ou refusée. Derrière un relais (relay-url) : hôte ou chemin absent de sa liste blanche, ou clé du relais refusée par le portail.',
  },
  'page-mal-reglee': {
    title: 'Cet affichage n’a pas pu être construit',
    detail: 'Le problème vient de la page, pas de votre connexion.',
    retry: false,
    autoRetryOnline: false,
    hint: 'Requête refusée ou source mal configurée : lire le message ci-dessous.',
  },
  'reponse-bloquee': {
    title: 'Données momentanément indisponibles',
    detail: 'Le service qui publie ces chiffres ne répond pas pour l’instant.',
    retry: true,
    autoRetryOnline: false,
    hint: 'Réponse illisible, souvent faute d’en-tête CORS : passer par un proxy (use-proxy).',
  },
};

/** Le message du barème pour une cause déjà classée. */
export function describeSourceCause(
  cause: SourceErrorCause,
  error?: Error | null
): SourceErrorDescription {
  const status = httpStatusOf(error);
  return { cause, ...BAREME[cause], ...(status !== undefined ? { status } : {}) };
}

/** Classe puis décrit : le raccourci des appelants qui n'ont que l'`Error`. */
export function describeSourceError(
  error: Error | null | undefined,
  online = true
): SourceErrorDescription {
  return describeSourceCause(classifySourceError(error, online), error);
}

/** Heure locale `HH:MM:SS` d'un échec, pour « Détails techniques ». */
export function formatErrorTime(at: number): string {
  const d = new Date(at);
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}
