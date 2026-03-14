/**
 * Provider registry and detection.
 *
 * detectProvider(url) tests each registered provider's urlPatterns and
 * returns the first match, or GENERIC_CONFIG as fallback.
 */

export type { ProviderConfig, ProviderId } from './provider-config.js';
export { ODS_CONFIG } from './opendatasoft.js';
export { TABULAR_CONFIG } from './tabular.js';
export { GRIST_CONFIG } from './grist.js';
export { GENERIC_CONFIG } from './generic.js';
export { INSEE_CONFIG } from './insee.js';

import type { ProviderConfig, ProviderId } from './provider-config.js';
import { ODS_CONFIG } from './opendatasoft.js';
import { TABULAR_CONFIG } from './tabular.js';
import { GRIST_CONFIG } from './grist.js';
import { GENERIC_CONFIG } from './generic.js';
import { INSEE_CONFIG } from './insee.js';

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const PROVIDER_REGISTRY = new Map<ProviderId, ProviderConfig>();

export function registerProvider(config: ProviderConfig): void {
  PROVIDER_REGISTRY.set(config.id, config);
}

export function getProvider(id: ProviderId): ProviderConfig {
  return PROVIDER_REGISTRY.get(id) ?? GENERIC_CONFIG;
}

export function getAllProviders(): ProviderConfig[] {
  return Array.from(PROVIDER_REGISTRY.values());
}

// Register built-in providers (order matters: first match wins in detectProvider)
registerProvider(ODS_CONFIG);
registerProvider(TABULAR_CONFIG);
registerProvider(GRIST_CONFIG);
registerProvider(INSEE_CONFIG);
registerProvider(GENERIC_CONFIG);

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Detect the provider from an API URL by testing each registered
 * provider's urlPatterns. Returns GENERIC_CONFIG if no match.
 */
export function detectProvider(url: string): ProviderConfig {
  for (const provider of PROVIDER_REGISTRY.values()) {
    if (provider.id === 'generic') continue; // fallback, tested last
    for (const pattern of provider.urlPatterns) {
      if (pattern.test(url)) return provider;
    }
  }
  return GENERIC_CONFIG;
}

/**
 * Extract resource IDs from a URL for a given provider.
 * If no provider is specified, detects it first.
 */
export function extractResourceIds(
  url: string,
  provider?: ProviderConfig,
): Record<string, string> | null {
  const p = provider ?? detectProvider(url);
  return p.resource.extractIds(url);
}
