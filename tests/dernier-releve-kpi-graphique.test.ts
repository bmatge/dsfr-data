/**
 * #1288, proposition B — le dernier relevé, daté et marqué, quand l'intégrateur
 * le demande (`stale-if-error="<secondes>"` sur la source).
 *
 * Lot 5 — la tuile de KPI et le graphique (cadre officiel compris) : le chiffre
 * ou le tracé restent, datés, et la date entre dans le nom accessible de la
 * figure. La règle elle-même est dans `dernier-releve.test.ts`.
 */
import { describe, it, expect, vi } from 'vitest';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataChart } from '@/components/dsfr-data-chart.js';
import { DsfrDataKpi } from '@/components/dsfr-data-kpi.js';
import { DsfrDataQuery } from '@/components/dsfr-data-query.js';
import { DsfrDataSource } from '@/components/dsfr-data-source.js';
import { DsfrDataSourceStatus } from '@/components/dsfr-data-source-status.js';
import {
  dispatchDataError,
  dispatchDataLoaded,
  dispatchDataLoading,
  subscribeToSourceCommands,
} from '@/utils/data-bridge.js';
import {
  E404,
  MINUTE,
  RELEVE,
  charge,
  horlogeDuReleve,
  mountSource,
  nom,
  panne,
  reponseKo,
  reponseOk,
  source,
  texte,
  tourner,
  type Commande,
} from './helpers/dernier-releve.js';

void DsfrDataChart;
void DsfrDataKpi;
void DsfrDataQuery;
void DsfrDataSource;
void DsfrDataSourceStatus;

horlogeDuReleve(mockFetch);

// ---------------------------------------------------------------------------
// KPI
// ---------------------------------------------------------------------------

describe('#1288 B — dsfr-data-kpi : le chiffre reste, daté', () => {
  const ROWS = [{ n: 15000 }, { n: 909 }];

  async function mountKpi(src: string, attrs: Record<string, string> = {}): Promise<DsfrDataKpi> {
    const el = document.createElement('dsfr-data-kpi') as DsfrDataKpi;
    for (const [k, v] of Object.entries({
      source: src,
      value: 'n:sum',
      label: 'Bénéficiaires',
      ...attrs,
    })) {
      el.setAttribute(k, v);
    }
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
  }

  const valeur = (el: Element) => texte(el.querySelector('.dsfr-data-kpi__value'));
  const figure = (el: Element) => el.querySelector('[role="figure"]') as HTMLElement;

  it('sans la consigne : « — », comme avant (proposition A)', async () => {
    const src = source('kpi-sans');
    const el = await mountKpi(src);
    charge(src, ROWS);
    await el.updateComplete;
    panne(src, { consigne: null });
    await el.updateComplete;

    expect(valeur(el)).toBe('—');
    expect(el.querySelector('.dsfr-data-kpi--stale')).toBeNull();
    expect(texte(el)).not.toMatch(/15/);
    expect(nom(figure(el))).toBe('Bénéficiaires: Chiffre momentanément indisponible');
  });

  it('avec la consigne : le chiffre, « Relevé à 14 h 32 · non actualisé », et la date dans le nom', async () => {
    const src = source('kpi');
    const el = await mountKpi(src);
    charge(src, ROWS);
    await el.updateComplete;
    vi.setSystemTime(RELEVE + 7 * MINUTE);
    panne(src);
    await el.updateComplete;

    expect(valeur(el)).toBe('15 909');
    expect(el.querySelector('.dsfr-data-kpi--stale')).not.toBeNull();
    expect(texte(el.querySelector('.dsfr-data-kpi__stale-line .dsfr-data-status__title'))).toBe(
      'Relevé à 14 h 32 · non actualisé'
    );
    // L'heure est celle du CHARGEMENT : ni celle de l'échec, ni celle du rendu
    const time = el.querySelector('time') as HTMLTimeElement;
    expect(time.getAttribute('datetime')).toBe(new Date(RELEVE).toISOString());
    expect(nom(figure(el))).toBe(
      'Bénéficiaires: 15 909, chiffre relevé aujourd’hui à 14 h 32, non actualisé'
    );
    // Sans bandeau : la tuile annonce, et porte « Réessayer »
    expect(el.querySelector('.dsfr-data-kpi__stale')?.getAttribute('role')).toBe('status');
    expect(texte(el.querySelector('.dsfr-data-status__retry'))).toBe('Réessayer');
  });

  it('ni tendance, ni couleur de seuil, ni lignes complémentaires sur un chiffre non actualisé', async () => {
    const src = source('kpi-seuil');
    const el = await mountKpi(src, {
      'threshold-green': '100',
      trend: 'evol:avg',
      lines: '[{"value":"n:max","suffix":"au plus"}]',
    });
    charge(src, [
      { n: 15000, evol: 4 },
      { n: 909, evol: 2 },
    ]);
    await el.updateComplete;
    expect(el.querySelector('.dsfr-data-kpi__tendance')).not.toBeNull();
    expect(el.querySelector('.dsfr-data-kpi__line')).not.toBeNull();
    expect(nom(figure(el))).toContain('etat bon');

    panne(src);
    await el.updateComplete;
    expect(el.querySelector('.dsfr-data-kpi__tendance')).toBeNull();
    expect(el.querySelector('.dsfr-data-kpi__line')).toBeNull();
    expect(nom(figure(el))).not.toContain('etat');
  });

  it('passé la durée, la tuile revient d’elle-même à « — »', async () => {
    const src = source('kpi-echeance');
    const el = await mountKpi(src);
    charge(src, ROWS);
    await el.updateComplete;
    vi.setSystemTime(RELEVE + 10 * MINUTE);
    panne(src);
    await el.updateComplete;
    expect(valeur(el)).toBe('15 909');

    vi.advanceTimersByTime(49 * MINUTE);
    await el.updateComplete;
    expect(valeur(el)).toBe('15 909');

    vi.advanceTimersByTime(2 * MINUTE);
    await el.updateComplete;
    expect(valeur(el)).toBe('—');
    expect(texte(el)).not.toMatch(/15/);
    expect(el.querySelector('time')).toBeNull();
  });

  it('pendant un nouvel essai le chiffre reste, le bouton attend ; au retour la marque part', async () => {
    const src = source('kpi-essai');
    const el = await mountKpi(src);
    charge(src, ROWS);
    await el.updateComplete;
    panne(src);
    await el.updateComplete;

    dispatchDataLoading(src);
    await el.updateComplete;
    expect(valeur(el)).toBe('15 909');
    expect(el.querySelector('.dsfr-data-kpi__loading')).toBeNull();
    const bouton = el.querySelector('.dsfr-data-status__retry') as HTMLButtonElement;
    expect(texte(bouton)).toBe('Nouvel essai en cours…');
    expect(bouton.getAttribute('aria-disabled')).toBe('true');

    vi.setSystemTime(RELEVE + 30 * MINUTE);
    charge(src, [{ n: 16000 }]);
    await el.updateComplete;
    expect(valeur(el)).toBe('16 000');
    expect(el.querySelector('.dsfr-data-kpi--stale')).toBeNull();
    expect(el.querySelector('time')).toBeNull();
    expect(nom(figure(el))).toBe('Bénéficiaires: 16 000');
  });

  it('« Réessayer » relance la source d’ORIGINE, même derrière une étape', async () => {
    const src = source('kpi-origine');
    const etape = source('kpi-origine-etape');
    const commandes: Commande[] = [];
    const off = subscribeToSourceCommands(src, (c) => commandes.push(c));
    const el = await mountKpi(etape);
    charge(src, ROWS);
    dispatchDataLoaded(etape, ROWS, { loadedAt: RELEVE });
    const erreur = panne(src);
    dispatchDataError(etape, erreur, undefined, { relayedFrom: src });
    await el.updateComplete;

    (el.querySelector('.dsfr-data-status__retry') as HTMLButtonElement).click();
    expect(commandes).toEqual([{ reload: true }]);
    off();
  });

  it('données retirées, ou autre requête : « — », jamais le chiffre d’avant', async () => {
    const src = source('kpi-refus');
    const el = await mountKpi(src);
    charge(src, ROWS);
    await el.updateComplete;
    panne(src, { erreur: E404() });
    await el.updateComplete;
    expect(valeur(el)).toBe('—');

    charge(src, ROWS, 'region=Occitanie');
    await el.updateComplete;
    panne(src, { key: 'region=Bretagne' });
    await el.updateComplete;
    expect(valeur(el)).toBe('—');
    expect(texte(el)).not.toMatch(/15/);
  });

  it('un échec qui refuse le relevé le retire : 503 puis 404', async () => {
    const src = source('kpi-503-404');
    const el = await mountKpi(src);
    charge(src, ROWS);
    await el.updateComplete;
    panne(src);
    await el.updateComplete;
    expect(valeur(el)).toBe('15 909');
    dispatchDataLoading(src);
    panne(src, { erreur: E404() });
    await el.updateComplete;
    expect(valeur(el)).toBe('—');
  });

  it('une tuile montée PENDANT la panne montre le relevé, pas un tiret', async () => {
    const src = source('kpi-tardif');
    charge(src, ROWS);
    panne(src);
    const el = await mountKpi(src);
    expect(valeur(el)).toBe('15 909');
    expect(texte(el.querySelector('.dsfr-data-kpi__stale-line .dsfr-data-status__title'))).toBe(
      'Relevé à 14 h 32 · non actualisé'
    );
  });

  it('avec un bandeau : ni bouton, ni détail, ni annonce dans la tuile', async () => {
    const src = source('kpi-bandeau');
    const bandeau = document.createElement('dsfr-data-source-status') as DsfrDataSourceStatus;
    bandeau.setAttribute('source', src);
    document.body.appendChild(bandeau);
    const el = await mountKpi(src);
    charge(src, ROWS);
    panne(src);
    await el.updateComplete;
    await bandeau.updateComplete;

    expect(valeur(el)).toBe('15 909');
    expect(el.querySelector('.dsfr-data-status__retry')).toBeNull();
    expect(el.querySelector('details')).toBeNull();
    expect(el.querySelector('.dsfr-data-kpi__stale')?.hasAttribute('role')).toBe(false);
  });

  it('hors connexion et error-message : dits à la suite', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const src = source('kpi-hors-ligne');
    const el = await mountKpi(src);
    charge(src, ROWS);
    panne(src, { erreur: new TypeError('Failed to fetch'), message: 'Mise à jour en cours.' });
    await el.updateComplete;
    expect(texte(el.querySelector('.dsfr-data-kpi__stale-line .dsfr-data-status__title'))).toBe(
      'Relevé à 14 h 32 · non actualisé. Vous semblez hors connexion. Mise à jour en cours.'
    );
  });

  it('au changement de jour, « à 14 h 32 » devient la date', async () => {
    const src = source('kpi-minuit');
    const el = await mountKpi(src);
    charge(src, ROWS);
    panne(src, { consigne: 86_400 });
    await el.updateComplete;
    vi.advanceTimersByTime(10 * 3600_000);
    await el.updateComplete;
    expect(texte(el.querySelector('.dsfr-data-kpi__stale-line .dsfr-data-status__title'))).toBe(
      'Relevé le 13/10 à 14 h 32 · non actualisé'
    );
    expect(nom(figure(el))).toBe(
      'Bénéficiaires: 15 909, chiffre relevé le 13 octobre à 14 h 32, non actualisé'
    );
  });
});

// ---------------------------------------------------------------------------
// Graphique
// ---------------------------------------------------------------------------

describe('#1288 B — dsfr-data-chart : le tracé reste, sous la mention', () => {
  const ROWS = [
    { region: 'Occitanie', n: 1640 },
    { region: 'Bretagne', n: 902 },
  ];

  async function mountChart(
    src: string,
    attrs: Record<string, string> = {}
  ): Promise<DsfrDataChart> {
    const el = document.createElement('dsfr-data-chart') as DsfrDataChart;
    for (const [k, v] of Object.entries({
      source: src,
      type: 'bar',
      'label-field': 'region',
      'value-field': 'n',
      ...attrs,
    })) {
      el.setAttribute(k, v);
    }
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
  }

  const mention = (el: Element) => el.querySelector('.dsfr-data-chart__stale');

  it('sans la consigne : le message de panne, aucun tracé', async () => {
    const src = source('chart-sans');
    const el = await mountChart(src);
    charge(src, ROWS);
    await el.updateComplete;
    panne(src, { consigne: null });
    await el.updateComplete;
    expect(el.querySelector('.dsfr-data-chart__error')).not.toBeNull();
    expect(el.querySelector('bar-chart')).toBeNull();
    expect(mention(el)).toBeNull();
    expect(el.classList.contains('dsfr-data-chart--stale')).toBe(false);
  });

  it('avec la consigne : le tracé, l’étiquette, la phrase, et la date dans le nom accessible', async () => {
    const src = source('chart');
    const el = await mountChart(src);
    charge(src, ROWS);
    await el.updateComplete;
    vi.setSystemTime(RELEVE + 4 * MINUTE);
    panne(src);
    await el.updateComplete;

    expect(el.querySelector('.dsfr-data-chart__error')).toBeNull();
    const chart = el.querySelector('bar-chart') as HTMLElement;
    expect(chart).not.toBeNull();
    expect(chart.getAttribute('y')).toBe('[[1640,902]]');
    expect(texte(mention(el)!.querySelector('.dsfr-data-status__stale-badge'))).toBe(
      'Non actualisé'
    );
    expect(texte(mention(el)!.querySelector('.dsfr-data-status__stale-text'))).toBe(
      'Chiffres relevés aujourd’hui à 14 h 32.'
    );
    expect(mention(el)!.getAttribute('role')).toBe('status');
    expect(el.classList.contains('dsfr-data-chart--stale')).toBe(true);
    expect(el.querySelector('.dsfr-data-chart__wrapper')!.getAttribute('aria-label')).toBe(
      'Graphique barres, 2 valeurs. Chiffres relevés aujourd’hui à 14 h 32, non actualisés.'
    );
    // La mention est AVANT le tracé : elle est lue d'abord
    expect(
      mention(el)!.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('passé la durée : le message de panne ; au retour : le tracé sans marque', async () => {
    const src = source('chart-echeance');
    const el = await mountChart(src);
    charge(src, ROWS);
    await el.updateComplete;
    panne(src, { consigne: 600 });
    await el.updateComplete;
    expect(el.querySelector('bar-chart')).not.toBeNull();

    vi.advanceTimersByTime(11 * MINUTE);
    await el.updateComplete;
    expect(el.querySelector('bar-chart')).toBeNull();
    expect(el.querySelector('.dsfr-data-chart__error')).not.toBeNull();
    expect(el.classList.contains('dsfr-data-chart--stale')).toBe(false);

    charge(src, [{ region: 'Corse', n: 7 }]);
    await el.updateComplete;
    expect(mention(el)).toBeNull();
    expect(el.querySelector('bar-chart')!.getAttribute('y')).toBe('[[7]]');
    expect(el.querySelector('.dsfr-data-chart__wrapper')!.getAttribute('aria-label')).toBe(
      'Graphique barres, 1 valeurs'
    );
  });

  it('pendant un nouvel essai : pas de sablier, le tracé reste', async () => {
    const src = source('chart-essai');
    const el = await mountChart(src);
    charge(src, ROWS);
    await el.updateComplete;
    panne(src);
    await el.updateComplete;
    const avant = el.querySelector('bar-chart');
    dispatchDataLoading(src);
    await el.updateComplete;
    expect(el.querySelector('.dsfr-data-chart__loading')).toBeNull();
    // Le MÊME élément : pas de remontage, donc pas de clignotement
    expect(el.querySelector('bar-chart')).toBe(avant);
    expect(texte(el.querySelector('.dsfr-data-status__retry'))).toBe('Nouvel essai en cours…');
  });

  it('cadre officiel : le cadre reste, sous la mention ; sa date n’est pas celle du relevé', async () => {
    const src = source('chart-databox');
    const el = await mountChart(src, {
      databox: '',
      'databox-title': 'Bénéficiaires par région',
      'databox-date': '31/12/2025',
    });
    charge(src, ROWS);
    await el.updateComplete;
    panne(src);
    await el.updateComplete;
    const box = el.querySelector('data-box') as HTMLElement;
    expect(box).not.toBeNull();
    expect(box.getAttribute('date')).toBe('31/12/2025');
    expect(texte(mention(el)!.querySelector('.dsfr-data-status__stale-text'))).toBe(
      'Chiffres relevés aujourd’hui à 14 h 32.'
    );
  });
});

// ---------------------------------------------------------------------------
// La chaîne réelle
// ---------------------------------------------------------------------------

describe('#1288 B — source → requête → KPI, par une vraie requête', () => {
  it('source → requête → KPI : le dernier AGRÉGAT reste, daté du chargement de la source', async () => {
    const id = source('chaine');
    const q = source('chaine-q');
    mockFetch.mockReturnValueOnce(
      reponseOk([
        { r: 'A', n: 40 },
        { r: 'A', n: 2 },
        { r: 'B', n: 8 },
      ])
    );
    const src = await mountSource(id, {
      url: 'https://exemple.test/a.json',
      'stale-if-error': '3600',
    });
    const query = document.createElement('dsfr-data-query') as DsfrDataQuery;
    query.id = q;
    query.setAttribute('source', id);
    query.setAttribute('filter', 'r:eq:A');
    query.setAttribute('aggregate', 'n:sum:total');
    document.body.appendChild(query);
    const kpi = document.createElement('dsfr-data-kpi') as DsfrDataKpi;
    kpi.setAttribute('source', q);
    kpi.setAttribute('value', 'total:sum');
    kpi.setAttribute('label', 'Total A');
    document.body.appendChild(kpi);
    await tourner();
    await kpi.updateComplete;
    expect(texte(kpi.querySelector('.dsfr-data-kpi__value'))).toBe('42');

    vi.setSystemTime(RELEVE + 9 * MINUTE);
    mockFetch.mockReturnValueOnce(reponseKo(503));
    src.reload();
    await tourner();
    await kpi.updateComplete;

    expect(texte(kpi.querySelector('.dsfr-data-kpi__value'))).toBe('42');
    expect(texte(kpi.querySelector('.dsfr-data-kpi__stale-line .dsfr-data-status__title'))).toBe(
      'Relevé à 14 h 32 · non actualisé'
    );
    // ADR-158 : la requête ne rend toujours rien par le chemin par défaut
    expect(query.getData()).toEqual([]);

    // Un attribut de la requête change PENDANT la panne : ce qu'elle garde
    // répond à l'ancienne demande — plus de relevé, jamais l'ancien total
    query.setAttribute('filter', 'r:eq:B');
    await query.updateComplete;
    await tourner();
    await kpi.updateComplete;
    expect(texte(kpi.querySelector('.dsfr-data-kpi__value'))).toBe('—');
  });
});
