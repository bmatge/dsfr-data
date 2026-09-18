/**
 * Les contrôles GELÉS (#884) — des échecs vivants devenus des contrôles figés.
 *
 * Une nuit rouge au verdict « bibliothèque » écrit `tools/oracle/out/gel/
 * <id>.json` : un `Check` déterministe complet, lignes brutes comprises. Le
 * copier dans `tests/verif-donnees/gel/` suffit à ce qu'il tourne ici, sans
 * réseau, sur chaque PR, jusqu'au correctif — et à ce qu'il redevienne vert le
 * jour où la bibliothèque est corrigée. Un dossier vide est un dépôt sans
 * nuit rouge gelée : c'est l'état normal.
 *
 * Le balisage gelé parle au faux serveur `gel.verif.invalid`
 * (`repondreGel`, branché dans `fixtures.ts`), qui sert l'export, `/records`
 * et `/facets` depuis les lignes gelées avec le faux serveur ODS du harnais.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Manifest } from '../../tools/oracle/manifest.js';
import { chargerGels } from '../../tools/oracle/gel.js';

/** Le dossier des gels committés. */
export const DOSSIER_GEL = resolve(dirname(fileURLToPath(import.meta.url)), 'gel');

/** Les gels relus, provenance comprise — c'est ce que le faux serveur sert. */
export const GELS = chargerGels(DOSSIER_GEL);

export const GEL: Manifest = { domain: 'gel', checks: GELS.map((g) => g.check) };
