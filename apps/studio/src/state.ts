/**
 * Studio IA - Etat applicatif.
 *
 * Le document est une `DashboardData` du modele partage (#515) : ce que
 * l'assistant construit ici s'ouvre tel quel dans l'app dashboard, et
 * reciproquement.
 */

import { createEmptyDashboard } from '@dsfr-data/shared';
import type { DashboardData, Field, Source } from '@dsfr-data/shared';

export type { DashboardData, Field, Source };

/** Message du chat. */
export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface AppState {
  source: Source | null;
  localData: Record<string, unknown>[] | null;
  fields: Field[];
  document: DashboardData;
  messages: Message[];
  isThinking: boolean;
}

export const state: AppState = {
  source: null,
  localData: null,
  fields: [],
  document: createEmptyDashboard(),
  messages: [],
  isThinking: false,
};
