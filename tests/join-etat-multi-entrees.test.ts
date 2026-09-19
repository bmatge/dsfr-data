import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * #897 (BUG-015 du banc d'essai) — un transformateur MULTI-ENTREES derive son
 * etat de TOUTES ses entrees, pas du dernier evenement recu.
 *
 * CE QUI S'EST PASSE. `TransformerMixin` relayait chaque evenement amont tel
 * quel : `onLoading -> emitTransformerLoading()`, `onIdle ->
 * emitTransformerIdle()`. Avec une seule entree, l'etat du dernier evenement
 * EST l'etat du noeud. Avec deux, les relais s'ecrasent mutuellement : si le
 * « chargement » de l'entree ordinaire arrive APRES l'« attente » de l'entree
 * `require-where`, l'aval reste sur « Chargement... » — et rien ne vient jamais
 * le lever, puisque la jointure n'emet rien tant que ses deux entrees ne sont
 * pas la. La seule difference entre la page qui marche et la page qui bloque
 * etait l'ordre des deux `dsfr-data-source` dans le DOM.
 *
 * REGLE POSEE ICI : une entree en attente met tout le noeud en attente (aucune
 * jointure ne se fera sans son filtre), quel que soit l'ordre des evenements ;
 * une erreur reste prioritaire ; le chargement ne subsiste que si aucune entree
 * n'attend.
 *
 * ATTENTION happy-dom : ce fichier joue des EVENEMENTS, pas un cycle de vie —
 * l'ordre y est celui que le test ecrit, pas celui que l'environnement decide.
 * L'equivalent navigateur (ordre des balises dans le DOM) est couvert par
 * `e2e/join-require-where.spec.ts`.
 */

import { DsfrDataJoin } from '@/components/dsfr-data-join.js';
import {
  clearDataCache,
  clearDataMeta,
  dispatchDataIdle,
  dispatchDataLoaded,
  dispatchDataLoading,
  dispatchDataError,
} from '@/utils/data-bridge.js';

const GAUCHE = 'j897-gauche';
const DROITE = 'j897-droite';
const SORTIE = 'j897-sortie';

const LIGNES_GAUCHE = [{ reg_code: '53', reg_nom: 'Bretagne' }];
const LIGNES_DROITE = [{ reg_code: '53', part: 63 }];

interface VueTransformateur {
  isIdle(): boolean;
  isLoading(): boolean;
  getError(): Error | null;
}

function purge() {
  for (const id of [GAUCHE, DROITE, SORTIE]) {
    dispatchDataLoaded(id, []);
    clearDataCache(id);
    clearDataMeta(id);
  }
}

/** Une jointure montee, ses deux entrees encore muettes. */
async function monterJointure() {
  const join = new DsfrDataJoin();
  join.id = SORTIE;
  join.left = GAUCHE;
  join.right = DROITE;
  join.on = 'reg_code';
  join.type = 'inner';
  document.body.appendChild(join);
  await join.updateComplete;
  return join;
}

/** Etats releves en aval de la jointure, dans l'ordre d'emission. */
function espionnerAval(): string[] {
  const vus: string[] = [];
  const ecoute = (nom: string) => (e: Event) => {
    if ((e as CustomEvent<{ sourceId: string }>).detail?.sourceId === SORTIE) vus.push(nom);
  };
  document.addEventListener('dsfr-data-loading', ecoute('loading'));
  document.addEventListener('dsfr-data-idle', ecoute('idle'));
  document.addEventListener('dsfr-data-loaded', ecoute('loaded'));
  return vus;
}

describe('#897 — une jointure avec une entree en attente ne bloque pas sur « Chargement »', () => {
  beforeEach(purge);

  afterEach(() => {
    document.body.innerHTML = '';
    purge();
  });

  it('attente a gauche PUIS chargement a droite : le noeud est en attente', async () => {
    const join = await monterJointure();
    const vue = join as unknown as VueTransformateur;
    const aval = espionnerAval();

    // L'ordre qui bloquait : la source `require-where` parle la premiere.
    dispatchDataIdle(GAUCHE);
    dispatchDataLoading(DROITE);
    await join.updateComplete;

    expect(vue.isIdle()).toBe(true);
    expect(vue.isLoading()).toBe(false);
    expect(aval.at(-1)).toBe('idle');
  });

  it('chargement a droite PUIS attente a gauche : meme resultat', async () => {
    const join = await monterJointure();
    const vue = join as unknown as VueTransformateur;

    dispatchDataLoading(DROITE);
    dispatchDataIdle(GAUCHE);
    await join.updateComplete;

    expect(vue.isIdle()).toBe(true);
    expect(vue.isLoading()).toBe(false);
  });

  it('une entree LOADED qui ne suffit pas a joindre ne laisse pas l’aval en chargement', async () => {
    const join = await monterJointure();
    const vue = join as unknown as VueTransformateur;
    const aval = espionnerAval();

    dispatchDataIdle(GAUCHE);
    dispatchDataLoading(DROITE);
    dispatchDataLoaded(DROITE, LIGNES_DROITE);
    await join.updateComplete;

    // La jointure n'a pas de quoi joindre — mais elle dit POURQUOI.
    expect(aval).not.toContain('loaded');
    expect(aval.at(-1)).toBe('idle');
    expect(vue.isIdle()).toBe(true);
  });

  it('le filtre arrive : l’attente est levee et la jointure emet', async () => {
    const join = await monterJointure();
    const vue = join as unknown as VueTransformateur;

    dispatchDataIdle(GAUCHE);
    dispatchDataLoaded(DROITE, LIGNES_DROITE);
    await join.updateComplete;
    expect(vue.isIdle()).toBe(true);

    dispatchDataLoading(GAUCHE);
    await join.updateComplete;
    expect(vue.isLoading()).toBe(true);
    expect(vue.isIdle()).toBe(false);

    dispatchDataLoaded(GAUCHE, LIGNES_GAUCHE);
    await join.updateComplete;
    expect(vue.isIdle()).toBe(false);
    expect(vue.isLoading()).toBe(false);
    expect(join.getData()).toHaveLength(1);
  });

  it('une erreur reste prioritaire sur l’attente d’une autre entree', async () => {
    const join = await monterJointure();
    const vue = join as unknown as VueTransformateur;

    dispatchDataIdle(GAUCHE);
    dispatchDataError(DROITE, new Error('HTTP 500'));
    await join.updateComplete;

    expect(vue.getError()?.message).toBe('HTTP 500');
    expect(vue.isIdle()).toBe(false);
    expect(vue.isLoading()).toBe(false);
  });

  it('deux entrees qui chargent restent un chargement', async () => {
    const join = await monterJointure();
    const vue = join as unknown as VueTransformateur;

    dispatchDataLoading(GAUCHE);
    dispatchDataLoading(DROITE);
    dispatchDataLoaded(DROITE, LIGNES_DROITE);
    await join.updateComplete;

    expect(vue.isLoading()).toBe(true);
    expect(vue.isIdle()).toBe(false);
  });
});
