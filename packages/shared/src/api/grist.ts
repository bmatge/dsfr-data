/**
 * Grist API helpers — shared across all apps.
 */

/**
 * Build standard headers for Grist API requests.
 * @param apiKey  Bearer token (omit or pass null for public access)
 * @param options.contentType  Include `Content-Type: application/json` (for POST/PUT)
 */
export function buildGristHeaders(
  apiKey?: string | null,
  options?: { contentType?: boolean },
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (options?.contentType) headers['Content-Type'] = 'application/json';
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  return headers;
}
