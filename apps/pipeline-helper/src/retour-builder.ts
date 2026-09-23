/**
 * « Revenir au Builder » depuis le Pipeline (#1095).
 *
 * Le Builder dépose l'instantané de sa configuration (`builder-state`) avant
 * d'ouvrir le Pipeline, puis y navigue avec `?from=builder`. Sans chemin de
 * retour, cet instantané n'était jamais relu. Le bouton ramène au Builder avec
 * `?from=pipeline-helper`, origine que le Builder reconnaît
 * (`ORIGINES_ETAT_DEPOSE`) : il rouvre le graphique.
 *
 * Même prudence que le retour du Playground (#965) : le Builder ne relit pas
 * de pipeline, il rouvre sa configuration de départ. Si l'usager a modifié le
 * pipeline, la reprise jetterait la modification ; le Pipeline rapporte donc
 * son code (`CLE_CODE_RAPPORTE`) pour que le Builder avertisse avant.
 *
 * Différence avec le Playground : le code du Pipeline est RÉGÉNÉRÉ depuis le
 * graphe de nœuds, il ne ressemble jamais mot pour mot au code confié par le
 * Builder. On compare donc le pipeline à lui-même — son code à l'arrivée et
 * son code au départ — et on ne rapporte rien quand il n'a pas bougé.
 */
import { CLE_CODE_RAPPORTE, navigateTo, normaliserCode } from '@dsfr-data/shared';

/** Identifiant du bouton, déclaré dans `index.html` (il porte son repère). */
export const ID_BOUTON_RETOUR_BUILDER = 'retour-builder-btn';

/** Le Pipeline a-t-il été ouvert par le Builder ? `from` vient de l'adresse. */
export function arriveDuBuilder(from: string | null): boolean {
  return from === 'builder';
}

/**
 * Code à rapporter au Builder : le code courant s'il diffère de celui de
 * l'arrivée, `null` sinon. Un simple reformatage ne compte pas.
 */
export function codeARapporter(codeDArrivee: string, codeCourant: string): string | null {
  return normaliserCode(codeDArrivee) === normaliserCode(codeCourant) ? null : codeCourant;
}

/**
 * Écrit (ou efface) le rapport. Un rapport absent vaut « rien à comparer » :
 * le Builder rouvre sans avertir, ce qui est juste quand rien n'a changé.
 */
export function rapporterAuBuilder(
  stockage: Pick<Storage, 'setItem' | 'removeItem'>,
  codeDArrivee: string,
  codeCourant: string
): void {
  const code = codeARapporter(codeDArrivee, codeCourant);
  try {
    if (code === null) stockage.removeItem(CLE_CODE_RAPPORTE);
    else stockage.setItem(CLE_CODE_RAPPORTE, code);
  } catch {
    // QuotaExceededError : sans rapport, le Builder ne peut pas avertir. On
    // n'a pas mieux à offrir ici ; la perte reste celle d'avant #1095.
  }
}

/**
 * Affiche « Revenir au Builder » quand on arrive du Builder, et branche le
 * rapport. `codeCourant` régénère le code du pipeline ; il est lu une fois
 * maintenant (le pipeline vient d'être importé) puis à chaque départ.
 *
 * Renvoie `true` si le retour est proposé. `signal` retire les écouteurs
 * (tests : un montage par cas).
 */
export function monterRetourBuilder(opts: {
  from: string | null;
  codeCourant: () => string;
  signal?: AbortSignal;
}): boolean {
  if (!arriveDuBuilder(opts.from)) return false;
  const bouton = document.getElementById(ID_BOUTON_RETOUR_BUILDER);
  if (!bouton) return false;

  const codeDArrivee = opts.codeCourant();
  bouton.hidden = false;
  bouton.addEventListener(
    'click',
    () => {
      navigateTo('builder', { from: 'pipeline-helper' });
    },
    { signal: opts.signal }
  );

  // Sur `pagehide` et non sur le clic : on repart aussi par la barre de
  // navigation ou par « page précédente », et ces sorties-là méritent le même
  // avertissement (même choix que le Playground, #965).
  window.addEventListener(
    'pagehide',
    () => {
      rapporterAuBuilder(sessionStorage, codeDArrivee, opts.codeCourant());
    },
    { signal: opts.signal }
  );
  return true;
}
