/**
 * Contrat de la copie de l'analyseur statique vers le serveur MCP (#608).
 *
 * Partie PURE, sans I/O : le script d'ecriture l'utilise pour generer, et
 * `tests/mcp/lint-markup.test.ts` pour verifier que la copie commitee est a
 * jour. Le test DOIT importer d'ici et non du script — importer le script
 * l'executerait, donc regenererait le fichier au moment meme ou le test
 * cherche a detecter qu'il est perime.
 */

export const LINT_GENERATED_HEADER = `/* eslint-disable */
/**
 * FICHIER GENERE — NE PAS EDITER A LA MAIN.
 *
 * Copie conforme de packages/shared/src/debug/lint-markup.ts.
 * Regenerer : npm run build:lint-markup
 *
 * Le serveur MCP est hors workspace npm et publie separement : il ne peut pas
 * importer le module d'origine. Toute correction se fait dans la source,
 * jamais ici — tests/mcp/lint-markup.test.ts echoue si les deux divergent.
 */

`;

/** Contenu attendu de mcp-server/src/lint-markup.generated.ts. */
export function buildLintCopy(source: string): string {
  // Un import rendrait la copie non resoluble cote MCP : on refuse de generer
  // plutot que de livrer un fichier casse.
  const importRe = /^\s*import\s/m;
  if (importRe.test(source)) {
    throw new Error(
      'lint-markup.ts ne doit contenir AUCUN import : il est copie tel quel dans le serveur MCP, hors workspace npm.'
    );
  }
  return LINT_GENERATED_HEADER + source;
}
