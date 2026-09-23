/**
 * Sonde des capacites Albert (#526).
 *
 * La source vit desormais dans `@dsfr-data/shared`
 * (`packages/shared/src/ia/capability-probe.ts`) : le Studio IA, qui remplace
 * l'Assistant IA comme entree usager (#1081), sonde avec le meme code. Ce shim
 * re-exporte l'API — point d'entree historique des imports et des tests.
 */

export type { ProbeHttpResult, ProbeIO, ProbeStep, ProbeReport } from '@dsfr-data/shared';
export { runCapabilityProbe } from '@dsfr-data/shared';
