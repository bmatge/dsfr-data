/**
 * Rendu Markdown minimal et sur des messages du chat.
 *
 * La source vit desormais dans `@dsfr-data/shared`
 * (`packages/shared/src/ui/markdown.ts`) : le chat du Studio IA rend ses
 * reponses avec le meme code (#1081). Ce shim re-exporte l'API — point
 * d'entree historique des imports et des tests.
 */

export { renderMarkdown } from '@dsfr-data/shared';
