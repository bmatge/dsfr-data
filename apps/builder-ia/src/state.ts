/**
 * Application state for Builder IA
 */

import type { ChartConfig, Field, Source } from '@dsfr-data/shared';

// Source is imported from @dsfr-data/shared (unified interface)
export type { Source } from '@dsfr-data/shared';

// ChartConfig et Field sont promus dans @dsfr-data/shared (#515) : c'est le
// vocabulaire commun builder-IA / dashboard / studio. Re-export : les imports
// historiques (`./state.js`, `../state.js`) restent valides.
export type { ChartConfig, AggregatedResult, Field } from '@dsfr-data/shared';

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
