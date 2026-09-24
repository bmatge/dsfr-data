/**
 * Agregation des repetitions et rendu du rapport du banc du Studio (#1112).
 *
 * Un modele n'est pas deterministe : un essai isole ne dit rien. Le rapport
 * donne donc des TAUX — par critere et par scenario, sur N repetitions — plus
 * les tours, jetons et latences. Un essai en erreur (transport, plafond du
 * proxy) est compte a part et n'entre pas dans les taux : il ne mesure pas le
 * Studio, il mesure la passerelle.
 */

import {
  CRITERES,
  LIBELLES_CRITERES,
  evaluer,
  type CritereId,
  type Execution,
  type ResultatCritere,
  type Scenario,
  type Tokens,
} from './criteres.js';

export interface Essai {
  scenario: string;
  repetition: number;
  criteres: ResultatCritere[];
  tours: number;
  tokens: Tokens;
  latenceMs: number;
  erreur?: string;
  /** Reponses du modele (pour relire un echec). */
  reponses: string[];
  /** Blocs du document final, resumes. */
  blocs: string[];
}

export interface Taux {
  ok: number;
  evalues: number;
  /** ok / evalues, `null` si rien n'a ete evalue (critere sans objet). */
  taux: number | null;
}

export interface SyntheseScenario {
  id: string;
  titre: string;
  essais: number;
  erreurs: number;
  criteres: Record<CritereId, Taux>;
  /** Essais dont TOUS les criteres evalues sont ok. */
  complet: Taux;
  moyennes: { tours: number; tokens: number; latenceMs: number };
}

export interface MetaRapport {
  date: string;
  instance: string;
  modele: string;
  /** Version de la lib servie par l'instance (`/dist/skills-meta.json`), si lue. */
  libVersion?: string;
  commitInstance?: string;
  repetitions: number;
  pauseMs: number;
  sousEnsemble: 'pr' | 'complet' | 'choisi';
}

export interface Rapport {
  meta: MetaRapport;
  scenarios: SyntheseScenario[];
  criteres: Record<CritereId, Taux>;
  cout: { appels: number; tokens: Tokens; latenceMs: number; dureeMs: number };
  essais: Essai[];
}

/** Resume d'un bloc pour le rapport : `b1 map « Carte »`. */
function resumerBlocs(execution: Execution): string[] {
  return execution.document.widgets.map((w) => {
    const chart =
      w.type === 'chart'
        ? `/${String((w.config as { chart?: { type?: string } }).chart?.type)}`
        : '';
    return `${w.id} ${w.type}${chart} « ${w.title} »`;
  });
}

/** Un essai : execution + verdicts. */
export function essaiDe(scenario: Scenario, repetition: number, execution: Execution): Essai {
  return {
    scenario: scenario.id,
    repetition,
    criteres: execution.erreur ? [] : evaluer(scenario, execution),
    tours: execution.tours,
    tokens: execution.tokens,
    latenceMs: execution.latenceMs,
    erreur: execution.erreur,
    reponses: execution.reponses,
    blocs: resumerBlocs(execution),
  };
}

function tauxVide(): Taux {
  return { ok: 0, evalues: 0, taux: null };
}

function ajouter(t: Taux, ok: boolean): void {
  t.evalues += 1;
  if (ok) t.ok += 1;
  t.taux = t.ok / t.evalues;
}

function tauxParCritere(): Record<CritereId, Taux> {
  return Object.fromEntries(CRITERES.map((c) => [c, tauxVide()])) as Record<CritereId, Taux>;
}

function moyenne(valeurs: number[]): number {
  return valeurs.length ? valeurs.reduce((a, b) => a + b, 0) / valeurs.length : 0;
}

export function agreger(
  scenarios: readonly Scenario[],
  essais: readonly Essai[],
  meta: MetaRapport,
  dureeMs: number
): Rapport {
  const global = tauxParCritere();
  const syntheses = scenarios.map((s): SyntheseScenario => {
    const siens = essais.filter((e) => e.scenario === s.id);
    const valides = siens.filter((e) => !e.erreur);
    const criteres = tauxParCritere();
    const complet = tauxVide();
    for (const essai of valides) {
      for (const r of essai.criteres) {
        if (r.verdict === 'na') continue;
        ajouter(criteres[r.critere], r.verdict === 'ok');
        ajouter(global[r.critere], r.verdict === 'ok');
      }
      ajouter(
        complet,
        essai.criteres.every((r) => r.verdict !== 'echec')
      );
    }
    return {
      id: s.id,
      titre: s.titre,
      essais: siens.length,
      erreurs: siens.length - valides.length,
      criteres,
      complet,
      moyennes: {
        tours: moyenne(valides.map((e) => e.tours)),
        tokens: moyenne(valides.map((e) => e.tokens.total)),
        latenceMs: moyenne(valides.map((e) => e.latenceMs)),
      },
    };
  });
  const somme = (f: (e: Essai) => number): number => essais.reduce((a, e) => a + f(e), 0);
  return {
    meta,
    scenarios: syntheses,
    criteres: global,
    cout: {
      appels: somme((e) => e.tours),
      tokens: {
        prompt: somme((e) => e.tokens.prompt),
        completion: somme((e) => e.tokens.completion),
        total: somme((e) => e.tokens.total),
      },
      latenceMs: somme((e) => e.latenceMs),
      dureeMs,
    },
    essais: [...essais],
  };
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

function cellule(t: Taux): string {
  if (t.taux === null) return '—';
  return `${Math.round(t.taux * 100)} % (${t.ok}/${t.evalues})`;
}

function secondes(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

/** Une cellule de tableau Markdown ne supporte ni `|` ni saut de ligne. */
function echapper(texte: string): string {
  return texte
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/[\r\n]+/g, ' ');
}

/** Criteres evalues au moins une fois : les autres n'encombrent pas le tableau. */
function criteresEvalues(r: Rapport): CritereId[] {
  return CRITERES.filter((c) => r.criteres[c].evalues > 0);
}

export function rapportMarkdown(r: Rapport): string {
  const { meta, cout } = r;
  const criteres = criteresEvalues(r);
  const lignes: string[] = [];
  lignes.push('## Banc de pertinence du Studio IA');
  lignes.push('');
  lignes.push(
    `Instance \`${meta.instance}\` · modèle \`${meta.modele}\`` +
      (meta.libVersion ? ` · lib ${meta.libVersion}` : '') +
      (meta.commitInstance ? ` (\`${meta.commitInstance}\`)` : '') +
      ` · ${meta.repetitions} répétition(s) · jeu ${meta.sousEnsemble} · ${meta.date}`
  );
  lignes.push('');
  lignes.push('### Par scénario');
  lignes.push('');
  lignes.push(
    `| Scénario | Complet | ${criteres.map((c) => LIBELLES_CRITERES[c]).join(' | ')} | Tours | Jetons | Latence | Erreurs |`
  );
  lignes.push(`|---|---|${criteres.map(() => '---').join('|')}|---|---|---|---|`);
  for (const s of r.scenarios) {
    lignes.push(
      `| \`${s.id}\` | ${cellule(s.complet)} | ${criteres.map((c) => cellule(s.criteres[c])).join(' | ')} | ` +
        `${s.moyennes.tours.toFixed(1)} | ${Math.round(s.moyennes.tokens)} | ${secondes(s.moyennes.latenceMs)} | ${s.erreurs} |`
    );
  }
  lignes.push('');
  lignes.push('### Par critère (tous scénarios)');
  lignes.push('');
  lignes.push('| Critère | Taux |');
  lignes.push('|---|---|');
  for (const c of criteres) lignes.push(`| ${LIBELLES_CRITERES[c]} | ${cellule(r.criteres[c])} |`);
  lignes.push('');
  lignes.push('### Coût');
  lignes.push('');
  lignes.push(
    `${cout.appels} appels au modèle · ${cout.tokens.total} jetons ` +
      `(${cout.tokens.prompt} en entrée, ${cout.tokens.completion} en sortie) · ` +
      `${secondes(cout.latenceMs)} de latence cumulée · ${secondes(cout.dureeMs)} au total (pauses comprises)`
  );

  const echecs = r.essais.flatMap((e) =>
    e.erreur
      ? [`- \`${e.scenario}\` #${e.repetition} : erreur — ${echapper(e.erreur)}`]
      : e.criteres
          .filter((c) => c.verdict === 'echec')
          .map(
            (c) =>
              `- \`${e.scenario}\` #${e.repetition} · ${LIBELLES_CRITERES[c.critere]} : ${echapper(c.detail)}`
          )
  );
  if (echecs.length > 0) {
    lignes.push('');
    lignes.push('### Échecs et erreurs');
    lignes.push('');
    lignes.push(...echecs);
  }
  lignes.push('');
  return lignes.join('\n');
}
