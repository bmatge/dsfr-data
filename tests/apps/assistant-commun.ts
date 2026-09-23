/**
 * Outils communs aux tests de l'assistant contextuel par app (#1017, #1018) :
 * corps d'un `index.html` sans ses scripts, transport Albert factice (aucun
 * réseau), question posée au panneau, clic sur « Me montrer » d'un constat.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { vi, expect } from 'vitest';

import {
  CLASSE_REPERE_MONTRE,
  type AssistantPanelElement,
  type Constat,
  type OpenAIResponse,
  type TransportAssistant,
} from '@dsfr-data/shared';

const RACINE = resolve(import.meta.dirname, '../..');

/** Corps de `apps/<app>/index.html`, sans ses `<script>` (le module de l'app est importé à part). */
export function corpsIndex(app: string): string {
  const html = readFileSync(join(RACINE, 'apps', app, 'index.html'), 'utf-8');
  const ouverture = html.indexOf('>', html.indexOf('<body')) + 1;
  let corps = html.slice(ouverture, html.indexOf('</body>'));
  for (let debut = corps.indexOf('<script'); debut !== -1; debut = corps.indexOf('<script')) {
    const fin = corps.indexOf('</script>', debut);
    corps = corps.slice(0, debut) + corps.slice(fin + '</script>'.length);
  }
  return corps;
}

/** Réponse du modèle qui appelle `montrer(id)`. */
export function appelMontrer(id: string): OpenAIResponse {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: 'Voici le réglage.',
          tool_calls: [
            {
              id: 'call_montrer',
              type: 'function',
              function: { name: 'montrer', arguments: JSON.stringify({ id, message: 'Ici.' }) },
            },
          ],
        },
      },
    ],
  };
}

/** Transport Albert en mode serveur, tool-calling, `post` mocké. */
export function transportAlbert(
  post: TransportAssistant['post']
): () => Promise<TransportAssistant> {
  return async () => ({
    mode: 'server',
    model: 'albert-large',
    post,
    capacites: { toolCalling: true },
  });
}

/** Transport sans configuration (`mode: 'none'`). */
export const transportAucun = async (): Promise<TransportAssistant> => ({
  mode: 'none',
  model: '',
  post: async () => {
    throw new Error('Aucune configuration IA');
  },
  capacites: { toolCalling: false },
});

/** Pose une question au panneau et attend la réponse. */
export async function poser(panel: AssistantPanelElement, question: string): Promise<void> {
  const avant = panel.messages.length;
  panel.dispatchEvent(new CustomEvent('assistant-envoyer', { detail: { question } }));
  await vi.waitFor(() => expect(panel.messages.length).toBeGreaterThan(avant + 1));
}

/** Clique « Me montrer » sur le premier constat du résumé. */
export async function cliquerMeMontrer(panel: AssistantPanelElement): Promise<void> {
  panel.toggle(true);
  await (panel as AssistantPanelElement & { updateComplete: Promise<boolean> }).updateComplete;
  const bouton = [...panel.querySelectorAll<HTMLButtonElement>('.assistant-constats button')].find(
    (b) => b.textContent?.trim() === 'Me montrer'
  );
  expect(bouton, 'bouton « Me montrer » du constat').toBeDefined();
  bouton!.click();
}

/** Élément surligné par `montrer()`. */
export const surligne = (): HTMLElement | null =>
  document.querySelector<HTMLElement>(`.${CLASSE_REPERE_MONTRE}`);

/** Repère d'un élément : `data-repere`, sinon `data-zone`. */
export const repereDe = (el: HTMLElement | null): string | null =>
  el?.getAttribute('data-repere') ?? el?.getAttribute('data-zone') ?? null;

/** Constat factice désignant `repere`. */
export function constatSur(repere: string, partiel: Partial<Constat> = {}): Constat {
  return {
    id: `test/constat@${repere}`,
    regle: 'test/constat',
    gravite: 'avertissement',
    titre: `Constat sur ${repere}`,
    explication: 'Explication.',
    reperes: [repere],
    preuve: 'preuve',
    ...partiel,
  };
}
