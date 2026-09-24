/**
 * Rejoue UN scenario dans la VRAIE boucle du Studio (#1112).
 *
 * Rien n'est copie : `runStudioLoop`, `buildSystemPrompt`, le document
 * (`document.ts`), l'export (`generateDashboardHTML`) et le lint de balisage
 * sont ceux de l'application. Le banc compose l'appel comme `main.ts` le fait
 * (`sendMessage`) — memes options, meme `max_completion_tokens`, meme
 * conversation bornee — et n'ajoute qu'une chose : un transport qui ENREGISTRE
 * (appels d'outils, tours, jetons, latence) sans rien modifier de ce qui passe.
 *
 * Seul ecart assume avec le Studio en ligne : sous Node, il n'y a pas d'apercu
 * a observer. Les outils de diagnostic restent declares (meme prompt, memes
 * outils, meme budget de tours qu'en ligne), mais repondent qu'aucune trace
 * n'est disponible.
 */

import {
  analyzeDataFields,
  createEmptyDashboard,
  generateDashboardHTML,
  lintMarkup,
  type ComponentContract,
  type DiagnosticContext,
  type OpenAIResponse,
  type PostChat,
  type Source,
} from '@dsfr-data/shared';
import { runStudioLoop } from '../../apps/studio/src/ia/agent-loop.js';
import { buildSystemPrompt } from '../../apps/studio/src/ia/system-prompt.js';
import {
  chargerSourceDepuisUrl,
  type ResultatChargement,
} from '../../apps/studio/src/source-url.js';
import { COMPONENT_CONTRACT } from '../../mcp-server/src/component-contract.generated.js';
import type { Execution, Scenario, Tokens } from './criteres.js';
import type { AppelOutil, OutilDeclare } from './schema.js';

export interface OptionsExecution {
  /** Transport brut vers le modele (le banc l'enveloppe pour enregistrer). */
  post: PostChat;
  model: string;
  /** Attente AVANT chaque appel (sobriete) — hors de la latence mesuree. */
  avantAppel?: () => Promise<void>;
  /**
   * Chargement d'une source par URL (#1140) : le vrai par defaut
   * (`chargerSourceDepuisUrl`, reseau reel) ; les tests y branchent un reseau
   * simule.
   */
  chargerSource?: (url: string, ressource?: string) => Promise<ResultatChargement>;
}

/** Messages gardes dans la conversation, comme `state.messages.slice(-10)`. */
const FENETRE_CONVERSATION = 10;

/** Meme plafond de sortie que le Studio en ligne (`main.ts`). */
const EXTRA_STUDIO = { max_completion_tokens: 4096 } as const;

/** Diagnostic sans apercu : outils declares, aucune trace a rendre. */
const DIAGNOSTIC_SANS_APERCU: DiagnosticContext = {
  attachment: () => null,
  rerender: () => undefined,
  redactValues: () => false,
};

/** `usage` d'une reponse OpenAI-compatible, s'il est fourni. */
function lireUsage(reponse: OpenAIResponse): Tokens {
  const usage = (reponse as { usage?: Record<string, unknown> }).usage ?? {};
  const nombre = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const prompt = nombre(usage.prompt_tokens);
  const completion = nombre(usage.completion_tokens);
  const total = nombre(usage.total_tokens) || prompt + completion;
  return { prompt, completion, total };
}

export async function executerScenario(
  scenario: Scenario,
  options: OptionsExecution
): Promise<Execution> {
  const document = createEmptyDashboard();
  // Source courante : celle du scenario (comme le selecteur), ou celle que le
  // modele charge par `charger_source_url` (#1140) — comme `main.ts`, le
  // message suivant voit la source chargee au precedent.
  let source: Source | null = scenario.source
    ? {
        id: `banc-${scenario.id}`,
        name: scenario.source.nom,
        type: 'manual',
        data: scenario.source.lignes,
        recordCount: scenario.source.lignes.length,
      }
    : null;
  // Comme `handleSourceChange` : la source devient LA source du document.
  if (source) document.sources = [source as unknown as (typeof document.sources)[number]];
  const charger =
    options.chargerSource ??
    ((url: string, ressource?: string) => chargerSourceDepuisUrl(url, { ressource }));

  const appels: AppelOutil[] = [];
  let outils: OutilDeclare[] = [];
  let tours = 0;
  let plafond = false;
  let latenceMs = 0;
  const tokens: Tokens = { prompt: 0, completion: 0, total: 0 };

  const post: PostChat = async (body) => {
    if (outils.length === 0 && Array.isArray(body.tools)) outils = body.tools as OutilDeclare[];
    // Le dernier tour d'une boucle est le seul sans outils : l'atteindre,
    // c'est avoir epuise le budget.
    if (body.tool_choice === 'none') plafond = true;
    await options.avantAppel?.();
    const debut = Date.now();
    const reponse = await options.post(body);
    latenceMs += Date.now() - debut;
    tours += 1;
    const usage = lireUsage(reponse);
    tokens.prompt += usage.prompt;
    tokens.completion += usage.completion;
    tokens.total += usage.total;
    for (const appel of reponse.choices?.[0]?.message?.tool_calls ?? []) {
      appels.push({ nom: appel.function.name, brut: appel.function.arguments });
    }
    return reponse;
  };

  const codeGenere = (): string =>
    document.widgets.length > 0 ? generateDashboardHTML(document) : '';

  const conversation: { role: 'user' | 'assistant'; content: string }[] = [];
  const reponses: string[] = [];
  let erreur: string | undefined;

  try {
    for (const message of scenario.messages) {
      conversation.push({ role: 'user', content: message });
      const donnees = source?.data ?? [];
      const fields = analyzeDataFields(donnees);
      const resultat = await runStudioLoop({
        conversation: conversation.slice(-FENETRE_CONVERSATION),
        systemPrompt: buildSystemPrompt({
          source,
          fields,
          sampleRecord: donnees[0] ?? null,
          document,
          diagnostic: true,
          data: donnees,
          sourceParUrl: true,
        }),
        document,
        data: donnees,
        fields,
        sourceId: source?.id ?? '',
        post,
        model: options.model,
        diagnostic: DIAGNOSTIC_SANS_APERCU,
        generatedCode: codeGenere,
        sourceParUrl: {
          charger,
          surChargement: (chargee) => {
            source = chargee;
          },
        },
        extra: { ...EXTRA_STUDIO },
      });
      // Texte BRUT pour les criteres (une reponse vide est un defaut) ; la
      // conversation garde ce que l'usager voit, comme `addMessage`.
      reponses.push(resultat.text);
      conversation.push({ role: 'assistant', content: resultat.text || 'Document mis à jour.' });
    }
  } catch (e) {
    erreur = e instanceof Error ? e.message : String(e);
  }

  const html = codeGenere();
  return {
    document,
    reponses,
    appels,
    outils,
    tours,
    plafond,
    html,
    lint: html ? lintMarkup(html, COMPONENT_CONTRACT as unknown as ComponentContract) : [],
    tokens,
    latenceMs,
    erreur,
  };
}
