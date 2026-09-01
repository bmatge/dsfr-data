/**
 * Application state for Builder IA
 */

import type { ChartConfig, Source } from '@dsfr-data/shared';

// Source is imported from @dsfr-data/shared (unified interface)
export type { Source } from '@dsfr-data/shared';

// ChartConfig est promue dans @dsfr-data/shared (#515) : c'est le vocabulaire
// commun builder-IA / dashboard / studio. Re-export : les imports historiques
// (`./state.js`, `../state.js`) restent valides.
export type { ChartConfig, AggregatedResult } from '@dsfr-data/shared';

/** Analyzed field metadata */
export interface Field {
  name: string;
  type: string;
  sample: unknown;
}

/** Chat message */
export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/** Application state shape */
export interface AppState {
  source: Source | null;
  localData: Record<string, unknown>[] | null;
  fields: Field[];
  chartConfig: ChartConfig | null;
  chart: unknown | null;
  messages: Message[];
  isThinking: boolean;
}

/** Global application state singleton */
export const state: AppState = {
  source: null,
  localData: null,
  fields: [],
  chartConfig: null,
  chart: null,
  messages: [],
  isThinking: false,
};
