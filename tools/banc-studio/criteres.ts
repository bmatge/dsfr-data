/**
 * Criteres du banc de pertinence du Studio (#1112) — tous DETERMINISTES.
 *
 * Chaque critere lit l'etat final (le document, le code exporte) et la
 * conversation (appels d'outils, reponses), et rend `ok`, `echec` ou `na`
 * (sans objet pour ce scenario). Aucun juge LLM : un critere qu'on ne sait pas
 * ecrire en code n'entre pas dans ce premier lot.
 *
 * Les reponses du modele sont des ENTREES EXTERNES : on les compare, on ne les
 * execute jamais, et les recherches de mots-cles se font par `includes` sur un
 * texte normalise — aucune expression reguliere construite depuis le modele.
 */

import type { DashboardData, Widget } from '@dsfr-data/shared';
import type { LintFinding } from '@dsfr-data/shared';
import { ecartsDeLAppel, type AppelOutil, type OutilDeclare } from './schema.js';
import type { Ligne } from './fixtures.js';

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

type Scalaire = string | number | boolean;

/** Valeur attendue d'une option : exacte, parmi une liste, presente ou absente. */
export type Attendu =
  Scalaire | { unDe: readonly Scalaire[] } | { present: true } | { absent: true };

export type NatureBloc = 'text' | 'chart' | 'filters' | 'map';

export interface BlocAttendu {
  /** Libelle lisible dans le rapport. */
  libelle: string;
  kind: NatureBloc;
  /** kind=chart : options de la ChartConfig (`type`, `sortOrder`…). */
  chart?: Readonly<Record<string, Attendu>>;
  /** kind=map : options qu'AU MOINS UNE couche doit porter. */
  couche?: Readonly<Record<string, Attendu>>;
  /** kind=filters : champs qui doivent figurer parmi les filtres. */
  champsFiltres?: readonly string[];
}

/**
 * Mots-cles attendus dans les reponses : CHAQUE groupe de `tous` doit etre
 * satisfait par au moins une de ses variantes (casse et accents ignores).
 */
export interface MotsCles {
  libelle: string;
  tous: readonly (readonly string[])[];
}

export interface Scenario {
  id: string;
  titre: string;
  /** Fait partie du sous-ensemble joue sur une PR (les plus discriminants). */
  pr: boolean;
  source: { nom: string; lignes: Ligne[] };
  /** Messages successifs de l'usager (un tour de boucle par message). */
  messages: readonly string[];
  attendu: {
    /** Blocs attendus dans le document final ; vide = aucun bloc. */
    blocs: readonly BlocAttendu[];
    /** Blocs acceptes EN PLUS sans compter comme non demandes. */
    toleres?: readonly BlocAttendu[];
    /** Avertissements que les reponses doivent porter. */
    avertissements?: readonly MotsCles[];
    /** Demande impossible : le dire d'emblee, sans toucher au document. */
    refus?: MotsCles;
    /** Plafond d'appels au modele pour tout le scenario (defaut : 6 par message). */
    maxTours?: number;
  };
}

// ---------------------------------------------------------------------------
// Ce qu'une execution laisse
// ---------------------------------------------------------------------------

export interface Tokens {
  prompt: number;
  completion: number;
  total: number;
}

export interface Execution {
  document: DashboardData;
  /** Reponse finale de chaque tour, dans l'ordre des messages. */
  reponses: string[];
  /** Tous les appels d'outils emis par le modele, dans l'ordre. */
  appels: AppelOutil[];
  /** Outils declares au modele (corps de la premiere requete). */
  outils: OutilDeclare[];
  /** Appels au modele. */
  tours: number;
  /** Un tour de boucle a atteint son plafond (dernier appel sans outils). */
  plafond: boolean;
  /** Code exporte (vide si le document n'a aucun bloc). */
  html: string;
  /** Constats du lint de balisage sur `html`. */
  lint: LintFinding[];
  tokens: Tokens;
  /** Temps passe dans les appels au modele (pauses de sobriete exclues). */
  latenceMs: number;
  /** Erreur de transport ou d'execution : l'essai ne compte pas dans les taux. */
  erreur?: string;
}

// ---------------------------------------------------------------------------
// Criteres
// ---------------------------------------------------------------------------

export const CRITERES = [
  'blocs-attendus',
  'hors-schema',
  'bloc-non-demande',
  'avertissements',
  'refus-d-emblee',
  'code-valide',
  'fin-propre',
  'tours',
] as const;
export type CritereId = (typeof CRITERES)[number];

export const LIBELLES_CRITERES: Record<CritereId, string> = {
  'blocs-attendus': 'Blocs attendus (types, options clés)',
  'hors-schema': 'Aucune option hors schéma',
  'bloc-non-demande': 'Pas de bloc non demandé',
  avertissements: 'Avertissements attendus',
  'refus-d-emblee': 'Impossible dit d’emblée',
  'code-valide': 'Code généré valide (lint de balisage)',
  'fin-propre': 'Fin propre (finish ou réponse, sans plafond)',
  tours: 'Tours dans le budget',
};

export type Verdict = 'ok' | 'echec' | 'na';

export interface ResultatCritere {
  critere: CritereId;
  verdict: Verdict;
  /** Pourquoi, en une ligne (vide si ok). */
  detail: string;
}

/** Outils qui modifient le document. */
const OUTILS_DOCUMENT = new Set([
  'add_blocks',
  'update_block',
  'remove_block',
  'move_block',
  'set_page',
  'reset_document',
]);

/** Minuscules, sans accents, apostrophes et espaces unifiees. */
export function normaliser(texte: string): string {
  return (
    texte
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u2018\u2019]/g, "'")
      // Espaces insecables (fine et normale) : le modele les emploie devant « : ».
      .replace(/[\u00a0\u202f]/g, ' ')
      .toLowerCase()
  );
}

/** Chaque groupe de mots-cles trouve dans le texte ? Rend les groupes manquants. */
export function groupesManquants(texte: string, mots: MotsCles): string[] {
  const t = normaliser(texte);
  return mots.tous
    .filter((variantes) => !variantes.some((v) => t.includes(normaliser(v))))
    .map((variantes) => variantes.join(' | '));
}

function estAbsent(valeur: unknown): boolean {
  return valeur === undefined || valeur === null || valeur === '';
}

function correspond(valeur: unknown, attendu: Attendu): boolean {
  if (typeof attendu === 'object') {
    if ('unDe' in attendu) return attendu.unDe.some((v) => v === valeur);
    if ('present' in attendu) return !estAbsent(valeur);
    return estAbsent(valeur);
  }
  return valeur === attendu;
}

function decrireAttendu(attendu: Attendu): string {
  if (typeof attendu === 'object') {
    if ('unDe' in attendu) return attendu.unDe.map((v) => JSON.stringify(v)).join(' | ');
    if ('present' in attendu) return 'présent';
    return 'absent';
  }
  return JSON.stringify(attendu);
}

/** Ecarts d'un objet d'options a ses attentes : « cle : attendu X, obtenu Y ». */
function ecartsOptions(
  objet: Readonly<Record<string, unknown>>,
  attentes: Readonly<Record<string, Attendu>>
): string[] {
  return Object.entries(attentes)
    .filter(([cle, attendu]) => !correspond(objet[cle], attendu))
    .map(
      ([cle, attendu]) =>
        `${cle} : attendu ${decrireAttendu(attendu)}, obtenu ${
          estAbsent(objet[cle]) ? 'absent' : JSON.stringify(objet[cle])
        }`
    );
}

function chartDe(widget: Widget): Record<string, unknown> {
  if (widget.type !== 'chart') return {};
  const config = widget.config as { chart?: Record<string, unknown> };
  return config.chart ?? {};
}

function couchesDe(widget: Widget): Record<string, unknown>[] {
  if (widget.type !== 'map') return [];
  // Copie a plat : une couche se lit comme un objet d'options quelconque.
  return (widget.config.layers ?? []).map((couche): Record<string, unknown> => ({ ...couche }));
}

function champsFiltresDe(widget: Widget): string[] {
  if (widget.type !== 'filters') return [];
  const config = widget.config as { filters?: Array<{ field?: string }> };
  return (config.filters ?? []).map((f) => f.field ?? '');
}

/**
 * Ecarts d'un widget a un bloc attendu (liste vide = il correspond). Pour une
 * carte, on retient la couche la plus proche.
 */
export function ecartsAuBloc(widget: Widget, bloc: BlocAttendu): string[] {
  if (widget.type !== bloc.kind) return [`nature ${widget.type} au lieu de ${bloc.kind}`];
  const ecarts: string[] = [];
  if (bloc.chart) ecarts.push(...ecartsOptions(chartDe(widget), bloc.chart));
  if (bloc.couche) {
    const couches = couchesDe(widget);
    const parCouche = couches.map((c) => ecartsOptions(c, bloc.couche ?? {}));
    const meilleure = parCouche.sort((a, b) => a.length - b.length)[0];
    if (!meilleure) ecarts.push('aucune couche');
    else ecarts.push(...meilleure);
  }
  if (bloc.champsFiltres) {
    const presents = champsFiltresDe(widget);
    for (const champ of bloc.champsFiltres) {
      if (!presents.includes(champ)) ecarts.push(`filtre « ${champ} » absent`);
    }
  }
  return ecarts;
}

/** Meme FORME que le bloc attendu (nature, et type de graphique s'il est fixe). */
function memeForme(widget: Widget, bloc: BlocAttendu): boolean {
  if (widget.type !== bloc.kind) return false;
  const type = bloc.chart?.type;
  return type === undefined || correspond(chartDe(widget).type, type);
}

function decrireWidget(widget: Widget): string {
  const type = widget.type === 'chart' ? `/${String(chartDe(widget).type ?? '?')}` : '';
  return `${widget.id} ${widget.type}${type} « ${widget.title} »`;
}

// --- Les criteres, un par un -----------------------------------------------

function critereBlocsAttendus(s: Scenario, e: Execution): ResultatCritere {
  const blocs = s.attendu.blocs;
  if (blocs.length === 0) return { critere: 'blocs-attendus', verdict: 'na', detail: '' };
  const pris = new Set<string>();
  const manques: string[] = [];
  for (const bloc of blocs) {
    const trouve = e.document.widgets.find(
      (w) => !pris.has(w.id) && ecartsAuBloc(w, bloc).length === 0
    );
    if (trouve) {
      pris.add(trouve.id);
      continue;
    }
    const candidats = e.document.widgets.filter((w) => w.type === bloc.kind && !pris.has(w.id));
    const proche = candidats
      .map((w) => ({ w, ecarts: ecartsAuBloc(w, bloc) }))
      .sort((a, b) => a.ecarts.length - b.ecarts.length)[0];
    manques.push(
      proche
        ? `${bloc.libelle} : ${proche.ecarts.join(' ; ')} (${proche.w.id})`
        : `${bloc.libelle} : aucun bloc ${bloc.kind}`
    );
  }
  return {
    critere: 'blocs-attendus',
    verdict: manques.length === 0 ? 'ok' : 'echec',
    detail: manques.join(' · '),
  };
}

function critereHorsSchema(e: Execution): ResultatCritere {
  const ecarts = e.appels.flatMap((a) => ecartsDeLAppel(a, e.outils));
  return {
    critere: 'hors-schema',
    verdict: ecarts.length === 0 ? 'ok' : 'echec',
    detail: ecarts.slice(0, 5).join(' · '),
  };
}

function critereBlocNonDemande(s: Scenario, e: Execution): ResultatCritere {
  const restants = [...s.attendu.blocs];
  const toleres = s.attendu.toleres ?? [];
  const enTrop: string[] = [];
  for (const widget of e.document.widgets) {
    const i = restants.findIndex((b) => memeForme(widget, b));
    if (i >= 0) {
      restants.splice(i, 1);
      continue;
    }
    if (toleres.some((b) => memeForme(widget, b))) continue;
    enTrop.push(decrireWidget(widget));
  }
  return {
    critere: 'bloc-non-demande',
    verdict: enTrop.length === 0 ? 'ok' : 'echec',
    detail: enTrop.length ? `en trop : ${enTrop.join(', ')}` : '',
  };
}

function critereAvertissements(s: Scenario, e: Execution): ResultatCritere {
  const attendus = s.attendu.avertissements ?? [];
  if (attendus.length === 0) return { critere: 'avertissements', verdict: 'na', detail: '' };
  const texte = e.reponses.join('\n');
  const manques = attendus
    .map((m) => ({ m, groupes: groupesManquants(texte, m) }))
    .filter(({ groupes }) => groupes.length > 0)
    .map(({ m, groupes }) => `${m.libelle} (manque : ${groupes.join(' ; ')})`);
  return {
    critere: 'avertissements',
    verdict: manques.length === 0 ? 'ok' : 'echec',
    detail: manques.join(' · '),
  };
}

function critereRefus(s: Scenario, e: Execution): ResultatCritere {
  const refus = s.attendu.refus;
  if (!refus) return { critere: 'refus-d-emblee', verdict: 'na', detail: '' };
  const actions = e.appels.filter((a) => OUTILS_DOCUMENT.has(a.nom)).map((a) => a.nom);
  const manques = groupesManquants(e.reponses[0] ?? '', refus);
  const raisons: string[] = [];
  if (actions.length > 0) raisons.push(`a agi sur le document : ${actions.join(', ')}`);
  if (manques.length > 0) raisons.push(`${refus.libelle} absent (manque : ${manques.join(' ; ')})`);
  return {
    critere: 'refus-d-emblee',
    verdict: raisons.length === 0 ? 'ok' : 'echec',
    detail: raisons.join(' · '),
  };
}

function critereCodeValide(e: Execution): ResultatCritere {
  if (e.document.widgets.length === 0) {
    return { critere: 'code-valide', verdict: 'na', detail: '' };
  }
  const erreurs = e.lint.filter((f) => f.severity === 'erreur');
  return {
    critere: 'code-valide',
    verdict: erreurs.length === 0 ? 'ok' : 'echec',
    detail: erreurs
      .slice(0, 3)
      .map((f) => `${f.tag} : ${f.message}`)
      .join(' · '),
  };
}

function critereFinPropre(e: Execution): ResultatCritere {
  const vide = e.reponses.some((r) => r.trim() === '');
  const raisons = [
    ...(e.plafond ? ['plafond de tours atteint'] : []),
    ...(vide ? ['réponse vide'] : []),
  ];
  return {
    critere: 'fin-propre',
    verdict: raisons.length === 0 ? 'ok' : 'echec',
    detail: raisons.join(' · '),
  };
}

function critereTours(s: Scenario, e: Execution): ResultatCritere {
  const max = s.attendu.maxTours ?? 6 * s.messages.length;
  return {
    critere: 'tours',
    verdict: e.tours <= max ? 'ok' : 'echec',
    detail: e.tours <= max ? '' : `${e.tours} appels au modèle (budget ${max})`,
  };
}

/** Tous les criteres d'un essai, dans l'ordre de `CRITERES`. */
export function evaluer(s: Scenario, e: Execution): ResultatCritere[] {
  return [
    critereBlocsAttendus(s, e),
    critereHorsSchema(e),
    critereBlocNonDemande(s, e),
    critereAvertissements(s, e),
    critereRefus(s, e),
    critereCodeValide(e),
    critereFinPropre(e),
    critereTours(s, e),
  ];
}
