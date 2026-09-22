/** Remet a zero out/mesures.jsonl avant un passage du banc (#1022). */
import { mkdirSync, writeFileSync } from 'node:fs';
import { MESURES, SORTIE } from './commun';

export default function setup(): void {
  mkdirSync(SORTIE, { recursive: true });
  // BANC_REPRISE=1 : on complete le passage precedent (bloc rejoue seul, -g).
  if (process.env.BANC_REPRISE) return;
  writeFileSync(MESURES, '');
}
