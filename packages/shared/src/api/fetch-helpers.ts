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
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    return response;
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('La requete a expire. Verifiez votre connexion ou reessayez.');
    }
    throw error;
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
      return 'Cle API invalide ou expiree. Verifiez votre configuration.';
    case status === 404:
      return 'Ressource introuvable. Verifiez l\'URL de la source.';
    case status === 429:
      return 'Trop de requetes. Reessayez dans quelques secondes.';
    case status >= 500:
      return `Erreur serveur (${status}). Le service est peut-etre temporairement indisponible.`;
    default:
      return `Erreur HTTP ${status}.`;
  }
}
