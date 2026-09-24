/**
 * Studio IA - Point d'entree : wiring DOM + orchestration d'un tour de chat.
 */

import {
  createEmptyDashboard,
  loadFromStorage,
  normalizeDashboard,
  saveToStorage,
  STORAGE_KEYS,
  toastSuccess,
  toastWarning,
  injectTourStyles,
  startTour,
  startTourIfFirstVisit,
  STUDIO_TOUR,
  evaluerConstats,
  mountDiagnosticPanel,
  resolveTransport,
  recupererDiagnostic,
  fetchServerConfig,
  rerankSkills,
  type MountedDiagnostic,
  type ReclasserSkills,
  type ResolvedTransport,
  type UserIAConfig,
} from '@dsfr-data/shared';
import type { DashboardData } from '@dsfr-data/shared';
import './styles/studio.css';
import { state } from './state.js';
import {
  appliquerSource,
  enregistrerSourceChargee,
  loadSavedSources,
  handleSourceChange,
  remplirApercuDonnees,
  suggestionsPourChamps,
} from './sources.js';
import { chargerSourceDepuisUrl } from './source-url.js';
import {
  addMessage,
  clearChat,
  definirEnvoiSuggestion,
  removeThinking,
  showThinking,
  updateThinkingSteps,
} from './ui/chat.js';
import { ajouterAuxFavoris, exporterImage, ouvrirDansPlayground } from './ui/actions.js';
import {
  chargerConfigIA,
  enregistrerConfigIA,
  lireConfigFormulaire,
  majBadgeIA,
  reinitialiserConfigIA,
  sonderCapacites,
  surChangementModele,
} from './ia/ia-config.js';
import { currentExportHtml, renderPreview, schedulePreviewRender } from './ui/preview.js';
import { runStudioLoop } from './ia/agent-loop.js';
import { buildSystemPrompt } from './ia/system-prompt.js';

const SESSION_KEY = 'studio-messages';
/**
 * Volet Diagnostic monte au demarrage — l'assistant s'y branche pour
 * observer l'apercu (#607).
 */
let diagnosticMonte: MountedDiagnostic | undefined;

const SESSION_DOC_KEY = 'studio-document';

/** Réponse quand aucune IA n'est joignable : le réglage est ICI, plus dans l'ancien Assistant. */
export const MESSAGE_IA_NON_CONFIGUREE =
  'Aucune configuration IA disponible : renseignez un jeton d’API dans « Configuration IA », au-dessus du chat, ou utilisez un déploiement avec jeton serveur.';

/** Relances proposées après un tour qui a modifié le document. */
export const SUGGESTIONS_APRES_COMPOSITION = [
  'Ajouter des filtres partagés',
  'Ajouter un indicateur clé',
  'Ajouter un tableau des données',
];

/**
 * Reclassement des skills par `/v1/rerank` (#514) : seulement avec un jeton
 * UTILISATEUR (en mode serveur, le jeton n'atteint jamais le navigateur) et
 * un rerank confirmé par la sonde. Sinon, l'ordre du scoring local.
 */
export function reclasseurPour(
  transport: Pick<ResolvedTransport, 'mode' | 'capacites'>,
  user: UserIAConfig
): ReclasserSkills | undefined {
  const { rerank, rerankModel } = transport.capacites;
  if (transport.mode !== 'user' || !rerank || !rerankModel || !user.token) return undefined;
  return (message, candidates) =>
    rerankSkills(message, candidates, {
      apiUrl: user.apiUrl,
      token: user.token,
      model: rerankModel,
    });
}

async function sendMessage(): Promise<void> {
  const input = document.getElementById('chat-input') as HTMLTextAreaElement | null;
  const text = input?.value.trim();
  if (!text || state.isThinking) return;
  if (input) input.value = '';

  addMessage('user', text);
  state.isThinking = true;
  showThinking();

  try {
    const user = lireConfigFormulaire();
    const transport = await resolveTransport({ user });
    if (transport.mode === 'none') {
      removeThinking();
      addMessage('assistant', MESSAGE_IA_NON_CONFIGUREE);
      const section = document.getElementById('section-ia-config') as HTMLDetailsElement | null;
      if (section) section.open = true;
      return;
    }

    const result = await runStudioLoop({
      conversation: state.messages.slice(-10),
      systemPrompt: buildSystemPrompt({
        source: state.source,
        fields: state.fields,
        sampleRecord: state.localData?.[0] ?? null,
        document: state.document,
        diagnostic: !!diagnosticMonte?.attachment,
        data: state.localData ?? [],
        sourceParUrl: true,
      }),
      document: state.document,
      data: state.localData ?? [],
      fields: state.fields,
      sourceId: state.document.sources[0]?.id ?? '',
      post: transport.post,
      model: transport.model,
      onProgress: updateThinkingSteps,
      onDocumentChange: () => {
        schedulePreviewRender();
        persistSession();
      },
      // L'assistant observe le MEME apercu que l'utilisateur, via le meme
      // collecteur : ce qu'il lit et ce qui s'affiche ne peuvent pas diverger.
      diagnostic: diagnosticMonte?.attachment
        ? {
            attachment: () => diagnosticMonte?.attachment ?? null,
            rerender: () => renderPreview(),
            // LE reglage du volet, pas une copie : l'utilisateur decide une
            // fois ce qui sort du navigateur, et ce que l'assistant recoit
            // est exactement ce qu'il voit.
            redactValues: () => diagnosticMonte?.panel.redactValues ?? false,
            // Les constats de la MEME trace, par les regles generiques : le
            // studio n'a pas de regles propres (#1010).
            constats: () => {
              const trace = diagnosticMonte?.attachment?.snapshot();
              return trace
                ? evaluerConstats(trace, { app: 'studio', origine: window.location.origin })
                : null;
            },
          }
        : undefined,
      // Le code COPIÉ par l'utilisateur, relu par l'assistant avant d'en
      // parler (#787) — jamais décrit de mémoire.
      generatedCode: currentExportHtml,
      reclasserSkills: reclasseurPour(transport, user),
      // Source donnee par URL dans la conversation (#1140) : meme etat que le
      // selecteur (`appliquerSource`), puis enregistree et selectionnee.
      sourceParUrl: {
        charger: (url, ressource) => chargerSourceDepuisUrl(url, { ressource }),
        surChargement: (source) => {
          appliquerSource(source);
          enregistrerSourceChargee(source);
        },
      },
      extra: { max_completion_tokens: 4096 },
    });

    removeThinking();
    addMessage('assistant', result.text || 'Document mis à jour.', {
      suggestions: result.applied > 0 ? SUGGESTIONS_APRES_COMPOSITION : [],
      etapes: result.steps,
    });
  } catch (err) {
    removeThinking();
    addMessage('assistant', `Erreur : ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    state.isThinking = false;
    persistSession();
  }
}

/** Conversation + document survivants d'un refresh (sessionStorage, comme le builder-IA). */
function persistSession(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.messages));
    sessionStorage.setItem(SESSION_DOC_KEY, JSON.stringify(state.document));
  } catch {
    // quota / navigation privee : tant pis pour la persistance de session
  }
}

function restoreSession(): void {
  try {
    const doc = sessionStorage.getItem(SESSION_DOC_KEY);
    if (doc) {
      state.document = normalizeDashboard(JSON.parse(doc) as DashboardData);
    }
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const messages = JSON.parse(raw) as { role: 'user' | 'assistant'; content: string }[];
      for (const m of messages) addMessage(m.role, m.content);
      state.messages = messages;
    }
  } catch {
    // session illisible : on repart proprement
  }
}

/** Enregistre le document dans les dashboards partages (ouvrables dans l'app dashboard). */
function saveDashboard(): void {
  if (state.document.widgets.length === 0) {
    toastWarning('Rien à enregistrer : le document est vide.');
    return;
  }
  const now = new Date().toISOString();
  if (!state.document.id) state.document.id = crypto.randomUUID();
  if (!state.document.createdAt) state.document.createdAt = now;
  state.document.updatedAt = now;

  const saved = loadFromStorage<DashboardData[]>(STORAGE_KEYS.DASHBOARDS, []);
  const idx = saved.findIndex((d) => d.id === state.document.id);
  if (idx >= 0) saved[idx] = state.document;
  else saved.push(state.document);
  saveToStorage(STORAGE_KEYS.DASHBOARDS, saved);
  toastSuccess(`« ${state.document.name} » enregistré — visible dans l'app Dashboard.`);
}

/**
 * « Effacer » remet le studio a zero : conversation ET document (donc apercu).
 * Le document vit en sessionStorage pour survivre a un refresh en cours de
 * travail — sans ce reset explicite, l'apercu resterait affiche a jamais.
 * La source chargee est conservee (elle reste liee au document vierge).
 */
function resetStudio(): void {
  clearChat();
  const fresh = createEmptyDashboard();
  if (state.document.sources.length > 0) fresh.sources = state.document.sources;
  state.document = fresh;
  renderPreview();
  persistSession();
  addMessage(
    'assistant',
    'Conversation et document réinitialisés. Décrivez le tableau de bord que vous voulez composer.'
  );
}

function copyCode(): void {
  const code = document.getElementById('generated-code')?.textContent ?? '';
  void navigator.clipboard.writeText(code).then(() => toastSuccess('Code copié !'));
}

/** Configuration IA : formulaire rempli une fois la config serveur connue. */
function initConfigIA(): void {
  chargerConfigIA();
  majBadgeIA();
  void fetchServerConfig().then(() => {
    chargerConfigIA();
    majBadgeIA();
  });
  document.getElementById('ia-model')?.addEventListener('change', surChangementModele);
  document.getElementById('ia-token')?.addEventListener('input', majBadgeIA);
  document.getElementById('ia-save-btn')?.addEventListener('click', enregistrerConfigIA);
  document.getElementById('ia-reset-btn')?.addEventListener('click', reinitialiserConfigIA);
  document
    .getElementById('probe-capabilities-btn')
    ?.addEventListener('click', () => void sonderCapacites());
}

/** « Voir les données » : champs et premières lignes de la source chargée. */
function initApercuDonnees(): void {
  const dialog = document.getElementById('studio-data-dialog') as HTMLDialogElement | null;
  const body = document.getElementById('studio-data-body');
  document.getElementById('show-data-btn')?.addEventListener('click', () => {
    if (!dialog || !body) return;
    remplirApercuDonnees(body);
    dialog.showModal();
  });
  document.getElementById('studio-data-close')?.addEventListener('click', () => dialog?.close());
}

/** Source chargée : l'annoncer dans le chat, avec des premières demandes possibles. */
function surSourceChargee(source: { name: string }): void {
  addMessage(
    'assistant',
    `Source « ${source.name} » chargée (${state.localData?.length ?? 0} lignes, ${state.fields.length} champs). Décrivez le tableau de bord souhaité — vous pouvez coller votre texte éditorial.`,
    { suggestions: suggestionsPourChamps(state.fields) }
  );
  persistSession();
}

/**
 * Source à charger au démarrage :
 *   - celle du document repris (refresh en cours de travail) : sans elle,
 *     l'assistant retrouvait le document mais plus ses données ;
 *   - sinon celle ouverte depuis l'app Sources, annoncée dans le chat comme
 *     dans l'ancien Assistant IA.
 */
function restaurerSource(preselectionId: string | null): void {
  const select = document.getElementById('saved-source') as HTMLSelectElement | null;
  if (!select) return;
  const disponible = (id: string) => Array.from(select.options).some((o) => o.value === id);
  const sourceDuDocument = state.document.sources[0]?.id;
  if (state.messages.length > 0 && sourceDuDocument && disponible(sourceDuDocument)) {
    select.value = sourceDuDocument;
    handleSourceChange();
  } else if (preselectionId && disponible(preselectionId)) {
    select.value = preselectionId;
    handleSourceChange(state.messages.length === 0 ? surSourceChargee : undefined);
  }
}

/** Une suggestion cliquée part comme un message tapé. */
function envoyerTexte(texte: string): void {
  const input = document.getElementById('chat-input') as HTMLTextAreaElement | null;
  if (!input || state.isThinking) return;
  input.value = texte;
  void sendMessage();
}

function init(): void {
  // Volet Diagnostic (#606) — l'aperçu du Studio EST l'export : de vrais
  // composants dans une iframe srcdoc, donc un pipeline pleinement observable.
  // Seule app avec le Studio à porter un chat : le diagnostic peut partir
  // directement vers l'assistant.
  diagnosticMonte = mountDiagnosticPanel({
    frame: document.getElementById('preview-frame') as HTMLIFrameElement | null,
    toggleButtonId: 'diagnostic-btn',
    canSend: true,
    onSend: injecterDiagnostic,
    emptyHint: 'Décrivez un tableau de bord pour observer ce qui transite entre les composants.',
  });

  definirEnvoiSuggestion(envoyerTexte);
  const preselection = loadSavedSources();
  restoreSession();
  renderPreview();
  initConfigIA();
  initApercuDonnees();

  document.getElementById('saved-source')?.addEventListener('change', () => {
    handleSourceChange(surSourceChargee);
  });
  restaurerSource(preselection?.id ?? null);

  document.getElementById('chat-send-btn')?.addEventListener('click', () => void sendMessage());
  document.getElementById('chat-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  });
  document.getElementById('clear-chat')?.addEventListener('click', resetStudio);
  document.getElementById('save-dashboard-btn')?.addEventListener('click', saveDashboard);
  // Visite guidée (lot UX 7, #544)
  injectTourStyles();
  document.getElementById('tour-btn')?.addEventListener('click', () => startTour(STUDIO_TOUR));
  startTourIfFirstVisit(STUDIO_TOUR);
  document.getElementById('copy-code-btn')?.addEventListener('click', copyCode);
  document
    .getElementById('save-favorite-btn')
    ?.addEventListener('click', () => void ajouterAuxFavoris());
  document
    .getElementById('open-playground-btn')
    ?.addEventListener('click', () => ouvrirDansPlayground());
  document
    .getElementById('export-png-btn')
    ?.addEventListener('click', () => void exporterImage('png'));
  document
    .getElementById('export-jpg-btn')
    ?.addEventListener('click', () => void exporterImage('jpg'));

  if (state.messages.length === 0) {
    addMessage(
      'assistant',
      'Bienvenue dans le **Studio IA**. Choisissez une source de données, puis décrivez le tableau de bord complet que vous voulez : titre, texte éditorial (collez-le), indicateurs, graphiques, filtres. Je le compose bloc par bloc sous vos yeux.'
    );
  }

  // Passation « Construire pour moi dans le Studio » (#1016).
  recupererDiagnosticTransmis();
}

/**
 * Injecte un diagnostic dans le champ du chat plutôt que de l'envoyer
 * directement : l'utilisateur relit ce qui part vers un service externe —
 * la trace contient des échantillons de données réelles — et peut
 * l'accompagner de sa question.
 */
function injecterDiagnostic(texte: string, question = QUESTION_DIAGNOSTIC): void {
  const input = document.getElementById('chat-input') as HTMLTextAreaElement | null;
  if (!input) return;
  input.value = `${question}\n\n${texte}`;
  input.focus();
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Question posée avec un diagnostic du Studio lui-même. */
export const QUESTION_DIAGNOSTIC = 'Voici le diagnostic du pipeline. Qu’est-ce qui ne va pas ?';

/**
 * Question posée avec un diagnostic transmis par « Construire pour moi dans
 * le Studio » de l'assistant contextuel (#1016) : l'app d'origine y décrit ce
 * qu'elle a commencé, le Studio le construit.
 */
export const QUESTION_CONSTRUIRE =
  'Construisez pour moi, dans ce tableau de bord, ce que décrit ce diagnostic.';

/**
 * Diagnostic transmis par une autre app (`transmettreDiagnostic`) : posé dans
 * le champ, JAMAIS envoyé — l'usager relit ce qui part vers le modèle (la
 * trace contient des échantillons de données) et peut compléter sa demande.
 * Rend `true` si un diagnostic attendait.
 */
export function recupererDiagnosticTransmis(): boolean {
  const texte = recupererDiagnostic();
  if (!texte) return false;
  injecterDiagnostic(texte, QUESTION_CONSTRUIRE);
  return true;
}

document.addEventListener('DOMContentLoaded', init);
