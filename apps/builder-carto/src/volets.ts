/**
 * Rail + volet unique de la carto (#1088).
 *
 * Les trois blocs Carte · Couches · Éléments étaient des panneaux flottants
 * empilés sur la carte : ouverts ensemble, chacun n'avait que 80 à 250 px de
 * haut. On a rarement besoin des trois à la fois : un rail d'icônes ouvre
 * désormais UN volet pleine hauteur, posé à côté de la carte (et non plus
 * par-dessus), dont le corps défile.
 *
 * Le marqueur « masqué » reste `carto-panel--collapsed` (lu par l'adaptateur
 * de l'assistant, `estAffiche`) : un seul panneau en est dépourvu à la fois.
 * Aucun volet ouvert = volet replié, la carte prend toute la largeur.
 */

/** Les volets, dans l'ordre du rail. */
export const VOLETS = ['panel-carte', 'panel-couches', 'panel-elements'] as const;
export type Volet = (typeof VOLETS)[number];

/** Classe d'un panneau masqué (partagée avec l'adaptateur de l'assistant). */
export const CLASSE_VOLET_MASQUE = 'carto-panel--collapsed';

/** Classe posée sur `.carto-workspace` quand aucun volet n'est ouvert. */
export const CLASSE_VOLET_FERME = 'carto-workspace--volet-ferme';

/** Mémoire du dernier volet ouvert (`''` = replié). */
export const CLE_VOLET = 'dsfr-data-carto-volet';

/** Volet ouvert à la première visite : on commence par les données. */
export const VOLET_PAR_DEFAUT: Volet = 'panel-couches';

export function estVolet(id: string | null | undefined): id is Volet {
  return (VOLETS as readonly string[]).includes(id ?? '');
}

/** Volet ouvert, ou `null` si le volet est replié. */
export function voletOuvert(racine: Document = document): Volet | null {
  for (const id of VOLETS) {
    const el = racine.getElementById(id);
    if (el && !el.classList.contains(CLASSE_VOLET_MASQUE)) return id;
  }
  return null;
}

/**
 * Ouvre le volet `id` et masque les deux autres ; `null` replie le volet.
 * Rail et espace de travail suivent. N'enregistre le choix que si
 * `memoriser` (un geste de l'usager, pas une révélation de l'assistant).
 */
export function ouvrirVolet(
  racine: Document,
  id: Volet | null,
  { memoriser = false }: { memoriser?: boolean } = {}
): void {
  for (const v of VOLETS) {
    racine.getElementById(v)?.classList.toggle(CLASSE_VOLET_MASQUE, v !== id);
  }
  racine.querySelectorAll<HTMLElement>('[data-volet]').forEach((btn) => {
    btn.setAttribute('aria-expanded', btn.getAttribute('data-volet') === id ? 'true' : 'false');
  });
  racine.querySelector('.carto-workspace')?.classList.toggle(CLASSE_VOLET_FERME, id === null);
  if (!memoriser) return;
  try {
    localStorage.setItem(CLE_VOLET, id ?? '');
  } catch {
    // Stockage indisponible : le choix vaut pour la session.
  }
}

/** Volet à rouvrir : le dernier choisi, sinon celui par défaut. */
export function voletMemorise(): Volet | null {
  try {
    const v = localStorage.getItem(CLE_VOLET);
    if (v === '') return null;
    if (estVolet(v)) return v;
  } catch {
    // Stockage indisponible : volet par défaut.
  }
  return VOLET_PAR_DEFAUT;
}

/**
 * Branche le rail (`[data-volet]`) et les boutons « Replier le volet »
 * (`[data-volet-replier]`), puis restaure le dernier volet ouvert.
 * Cliquer le bouton du volet déjà ouvert le replie.
 */
export function initVolets(racine: Document = document): void {
  racine.querySelectorAll<HTMLElement>('[data-volet]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-volet');
      if (!estVolet(id)) return;
      ouvrirVolet(racine, voletOuvert(racine) === id ? null : id, { memoriser: true });
    });
  });
  racine.querySelectorAll<HTMLElement>('[data-volet-replier]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = voletOuvert(racine);
      ouvrirVolet(racine, null, { memoriser: true });
      // Le focus revient au bouton du rail qui rouvre ce volet.
      if (id) racine.querySelector<HTMLElement>(`[data-volet="${id}"]`)?.focus();
    });
  });
  ouvrirVolet(racine, voletMemorise());
}
