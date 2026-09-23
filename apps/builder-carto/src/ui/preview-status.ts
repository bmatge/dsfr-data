/**
 * Ligne de statut de l'aperçu carto, rendue DEPUIS LES CONSTATS (#1000).
 *
 * Avant, `updatePreviewStatus()` comptait lui-même sources, marqueurs et
 * chemins Leaflet, et écrivait sa propre prose (« panneau Couches »). Le
 * volet Diagnostic, l'assistant et cette ligne disaient donc trois choses
 * différentes d'une même panne. Désormais la ligne ne fait que CHOISIR : le
 * premier constat (le plus grave, dans l'ordre du pipeline) une fois mûr, ou
 * le compte d'éléments dessinés lu dans la trace.
 *
 * Fonction pure, sans DOM : `main.ts` garde les sondes temporelles et le
 * rendu, `tests/apps/builder-carto/preview-status.test.ts` juge ce choix.
 */
import type { Constat, Trace } from '@dsfr-data/shared';

export type TonStatut = 'ok' | 'warn' | 'err';

export interface StatutApercu {
  ton: TonStatut;
  /** Classe Remix Icon. */
  icone: string;
  texte: string;
  /** Le constat rendu, quand la ligne en vient. */
  constat?: Constat;
}

/**
 * Sonde à partir de laquelle un constat carto peut s'afficher (les sondes de
 * `main.ts` tombent à 0,8 s, 2 s, 4 s, 8 s et 15 s ; la première vaut 1).
 * Leaflet se charge paresseusement : sur les premières sondes, « rien
 * dessiné » est souvent vrai et faux une seconde plus tard. Mêmes échéances
 * qu'avant (#482) ; les pannes du pipeline (erreur HTTP, configuration)
 * s'affichent dès la première sonde.
 */
const SONDE_CARTO = 2;
const SONDE_PAR_REGLE: Record<string, number> = { 'carte/aucune-donnee': 4 };
/** Au-delà, on n'attend plus la fin du chargement. */
const SONDE_PATIENCE = 4;

function sondeMinimale(c: Constat): number {
  return SONDE_PAR_REGLE[c.regle] ?? (c.regle.startsWith('carte/') ? SONDE_CARTO : 1);
}

function mot(n: number, singulier: string): string {
  return `${n.toLocaleString('fr-FR')} ${singulier}${n > 1 ? 's' : ''}`;
}

/** Une étape du pipeline charge encore. */
function enChargement(trace: Trace | null): boolean {
  return !!trace && Object.values(trace.states).some((s) => s.status === 'loading');
}

/**
 * Éléments dessinés et enregistrements reçus par les couches de la carte
 * principale (les clones d'encart ne sont pas recomptés), lus dans la trace.
 * `null` si une couche n'expose pas son compte.
 */
export function comptesDessines(trace: Trace): { dessines: number; recus: number } | null {
  const couches = trace.graph.nodes.filter((n) => n.tag === 'dsfr-data-map-layer' && !n.inset);
  if (couches.length === 0 || couches.some((n) => n.renderedCount === undefined)) return null;
  const dessines = couches.reduce((acc, n) => acc + (n.renderedCount ?? 0), 0);
  const amonts = new Set(couches.map((n) => n.upstream[0]).filter((id) => id !== undefined));
  let recus = 0;
  for (const id of amonts) {
    const s = trace.states[id];
    if (s?.status === 'loaded') recus += s.rows ?? 0;
  }
  return { dessines, recus };
}

/**
 * Le statut à afficher à la sonde `sonde`, ou `null` pour garder le statut
 * courant (« Chargement… ») et laisser la sonde suivante juger.
 */
export function statutDepuisConstats(
  constats: readonly Constat[],
  trace: Trace | null,
  sonde: number
): StatutApercu | null {
  const chargement = enChargement(trace);
  const murs = constats.filter(
    (c) =>
      c.gravite !== 'info' &&
      sonde >= sondeMinimale(c) &&
      (!chargement || c.gravite === 'erreur' || sonde >= SONDE_PATIENCE)
  );
  const premier = murs[0];
  if (premier) {
    const erreur = premier.gravite === 'erreur';
    const suite = murs.length > 1 ? ' Autres constats dans le volet Diagnostic.' : '';
    return {
      ton: erreur ? 'err' : 'warn',
      icone: erreur ? 'ri-error-warning-line' : 'ri-alert-line',
      texte: `${premier.titre}${premier.action ? ` — ${premier.action}` : ''}.${suite}`,
      constat: premier,
    };
  }
  if (!trace || (chargement && sonde < SONDE_PATIENCE)) return null;
  const comptes = comptesDessines(trace);
  if (!comptes || comptes.dessines === 0) return null;
  const affiches = comptes.dessines > 1 ? 'affichés' : 'affiché';
  return {
    ton: 'ok',
    icone: 'ri-check-line',
    texte: `${mot(comptes.dessines, 'élément')} ${affiches} (${mot(comptes.recus, 'enregistrement')})`,
  };
}
