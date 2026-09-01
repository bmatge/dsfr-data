/**
 * Contrat de la copie du moteur de matching vers le serveur MCP (#514).
 *
 * Partie PURE, sans I/O : `scripts/build-skill-matching.ts` l'utilise pour
 * ecrire le fichier, et `tests/mcp/skill-matching.test.ts` pour verifier que
 * la copie commitee est a jour.
 *
 * Le test DOIT importer d'ici et non du script : importer le script
 * l'executerait, donc regenererait le fichier au moment meme ou le test
 * cherche a detecter qu'il est perime.
 */

export const GENERATED_HEADER = `/* eslint-disable */
/**
 * FICHIER GENERE — NE PAS EDITER A LA MAIN.
 *
 * Copie conforme de apps/builder-ia/src/skill-matching.ts.
 * Regenerer : npm run build:skill-matching
 *
 * Le serveur MCP est hors workspace npm et publie separement : il ne peut pas
 * importer le module d'origine. Toute correction se fait dans la source, jamais
 * ici — tests/mcp/skill-matching.test.ts echoue si les deux divergent.
 */

`;

/** Contenu attendu de mcp-server/src/skill-matching.generated.ts. */
export function buildCopy(source: string): string {
  // Un import rendrait la copie non resoluble cote MCP (chemins du monorepo
  // absents du package publie) : on refuse de generer plutot que de livrer un
  // fichier qui casserait au build du serveur.
  if (/^\s*import\s/m.test(source)) {
    throw new Error(
      'skill-matching.ts ne doit contenir AUCUN import : il est copie tel quel dans le serveur MCP.'
    );
  }
  return GENERATED_HEADER + source;
}
