/**
 * Bouton « Sonder les capacités » des reglages IA (#526) : construit le
 * transport selon le mode (serveur-defaut vs jeton utilisateur), lance
 * `runCapabilityProbe` et rend le rapport etape par etape.
 */

import { escapeHtml } from '@dsfr-data/shared';
import { getIAConfig, isServerMode } from './ia-config.js';
import { runCapabilityProbe, type ProbeIO, type ProbeHttpResult } from './capability-probe.js';

async function toResult(res: Response): Promise<ProbeHttpResult> {
  let json: unknown = {};
  try {
    json = await res.json();
  } catch {
    // corps non JSON : on ne garde que le status
  }
  return { status: res.status, json };
}

function buildIO(): ProbeIO | null {
  const config = getIAConfig();
  const serverMode = !config.token && isServerMode();

  if (serverMode) {
    return {
      model: config.model,
      serverMode: true,
      chat: async (body) =>
        toResult(
          await fetch('/ia-proxy-default', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        ),
    };
  }

  if (!config.token || !config.apiUrl) return null;

  const headers = {
    'X-Target-URL': config.apiUrl,
    Authorization: `Bearer ${config.token}`,
  };
  return {
    model: config.model,
    serverMode: false,
    apiUrl: config.apiUrl,
    chat: async (body) =>
      toResult(
        await fetch('/ia-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify(body),
        })
      ),
    get: async (url) =>
      toResult(
        await fetch('/ia-proxy', { method: 'GET', headers: { ...headers, 'X-Target-URL': url } })
      ),
    post: async (url, body) =>
      toResult(
        await fetch('/ia-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers, 'X-Target-URL': url },
          body: JSON.stringify(body),
        })
      ),
  };
}

export async function probeCapabilitiesUI(): Promise<void> {
  const btn = document.getElementById('probe-capabilities-btn') as HTMLButtonElement | null;
  const out = document.getElementById('probe-capabilities-result');
  if (!out) return;

  const io = buildIO();
  if (!io) {
    out.innerHTML =
      '<p class="fr-text--sm">Renseignez une URL d’API et un jeton (ou utilisez un déploiement avec jeton serveur), puis relancez la sonde.</p>';
    return;
  }

  if (btn) btn.disabled = true;
  out.innerHTML = '<p class="fr-text--sm">Sonde en cours…</p>';
  try {
    const report = await runCapabilityProbe(io);
    const items = report.steps
      .map(
        (s) =>
          `<li>${s.ok ? '✅' : '❌'} ${escapeHtml(s.name)} — <span class="fr-text--xs">${escapeHtml(s.detail)}</span></li>`
      )
      .join('');
    const persisted = report.capabilities.probedAt > 0 && (report.steps[0]?.ok ?? false);
    out.innerHTML = `<ul class="fr-text--sm" style="margin:0.5rem 0 0;padding-left:1rem;list-style:none;">${items}</ul>
      <p class="fr-text--xs" style="margin:0.5rem 0 0;">${
        persisted
          ? 'Capacités mémorisées — elles font foi pour les prochains messages.'
          : 'Échec de connexion : capacités NON mémorisées (les réglages actuels restent en vigueur).'
      }</p>`;
  } catch (err) {
    out.innerHTML = `<p class="fr-text--sm">Erreur de sonde : ${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`;
  } finally {
    if (btn) btn.disabled = false;
  }
}
