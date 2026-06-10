/**
 * Fetch helpers: timeout wrapper and user-friendly HTTP error messages
 */

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Fetch with an automatic AbortController timeout.
 * Throws a user-friendly message on timeout.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Composer avec le signal de l'appelant (#322) : l'ecraser rendait toute
  // annulation amont impossible
  const signal = init?.signal
    ? AbortSignal.any([init.signal, controller.signal])
    : controller.signal;

  try {
    const response = await fetch(input, { ...init, signal });
    return response;
  } catch (_error: unknown) {
    if (_error instanceof DOMException && _error.name === 'AbortError') {
      const err = new Error('La requête a expire. Vérifiez votre connexion ou reessayez.');
      (err as unknown as { cause: unknown }).cause = _error;
      throw err;
    }
    throw _error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Convert an HTTP status code into a user-friendly French error message.
 */
export function httpErrorMessage(status: number): string {
  switch (true) {
    case status === 401 || status === 403:
      return 'Clé API invalide ou expiree. Vérifiez votre configuration.';
    case status === 404:
      return "Ressource introuvable. Vérifiez l'URL de la source.";
    case status === 429:
      return 'Trop de requêtes. Reessayez dans quelques secondes.';
    case status >= 500:
      return `Erreur serveur (${status}). Le service est peut-etre temporairement indisponible.`;
    default:
      return `Erreur HTTP ${status}.`;
  }
}
