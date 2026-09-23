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

/**
 * Modules partages copies tels quels dans le serveur MCP : source (monorepo)
 * -> copie (mcp-server/src). Le moteur de matching (#514) et l'adressage par
 * niveau / reference des skills ecrites a la main (#1035). Chemins FIXES :
 * jamais derives d'une entree.
 */
export const MCP_COPIES = [
  {
    source: 'packages/shared/src/ia/skill-matching.ts',
    copy: 'mcp-server/src/skill-matching.generated.ts',
    test: 'tests/mcp/skill-matching.test.ts',
    nom: 'skill-matching.ts',
  },
  {
    source: 'packages/shared/src/ia/skill-levels.ts',
    copy: 'mcp-server/src/skill-levels.generated.ts',
    test: 'tests/mcp/skill-levels.test.ts',
    nom: 'skill-levels.ts',
  },
] as const;

export type McpCopy = (typeof MCP_COPIES)[number];

/** En-tete de la copie : dit d'ou elle vient et comment la regenerer. */
export function generatedHeader(copie: McpCopy = MCP_COPIES[0]): string {
  return `/* eslint-disable */
/**
 * FICHIER GENERE — NE PAS EDITER A LA MAIN.
 *
 * Copie conforme de ${copie.source}.
 * Regenerer : npm run build:skill-matching
 *
 * Le serveur MCP est hors workspace npm et publie separement : il ne peut pas
 * importer le module d'origine. Toute correction se fait dans la source, jamais
 * ici — ${copie.test} echoue si les deux divergent.
 */

`;
}

/** En-tete historique de la copie du moteur de matching. */
export const GENERATED_HEADER = generatedHeader(MCP_COPIES[0]);

/** Contenu attendu de la copie (par defaut : mcp-server/src/skill-matching.generated.ts). */
export function buildCopy(source: string, copie: McpCopy = MCP_COPIES[0]): string {
  // Un import rendrait la copie non resoluble cote MCP (chemins du monorepo
  // absents du package publie) : on refuse de generer plutot que de livrer un
  // fichier qui casserait au build du serveur.
  if (/^\s*import\s/m.test(source)) {
    throw new Error(
      `${copie.nom} ne doit contenir AUCUN import : il est copie tel quel dans le serveur MCP.`
    );
  }
  return generatedHeader(copie) + source;
}
