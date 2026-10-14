/**
 * #1288, proposition B — le dernier relevé, daté et marqué, quand l'intégrateur
 * le demande (`stale-if-error="<secondes>"` sur la source).
 *
 * Lot 6 — la liste, les fiches, le podium, le répéteur, et le tableau équivalent
 * avec son export : les lignes restent sous la mention, le fichier porte la date
 * du relevé dans son nom. La règle elle-même est dans `dernier-releve.test.ts`.
 */
import { describe, it, expect, vi } from 'vitest';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataA11y } from '@/components/dsfr-data-a11y.js';
import { DsfrDataDisplay } from '@/components/dsfr-data-display.js';
import { DsfrDataKpi } from '@/components/dsfr-data-kpi.js';
import { DsfrDataList } from '@/components/dsfr-data-list.js';
import { DsfrDataPodium } from '@/components/dsfr-data-podium.js';
import { DsfrDataRepeat } from '@/components/dsfr-data-repeat.js';
import {
  dispatchDataLoading,
  getDataCache,
  setDataMeta,
  subscribeToSourceCommands,
} from '@/utils/data-bridge.js';
import {
  MINUTE,
  RELEVE,
  charge,
  horlogeDuReleve,
  panne,
  source,
  texte,
  type Commande,
} from './helpers/dernier-releve.js';

void DsfrDataA11y;
void DsfrDataDisplay;
void DsfrDataKpi;
void DsfrDataList;
void DsfrDataPodium;
void DsfrDataRepeat;

horlogeDuReleve(mockFetch);

// ---------------------------------------------------------------------------
// Liste, fiches, podium, répéteur
// ---------------------------------------------------------------------------

describe('#1288 B — dsfr-data-list : les lignes restent, sous la mention', () => {
  const ROWS = [
    { region: 'Occitanie', n: 1640 },
    { region: 'Bretagne', n: 902 },
    { region: 'Corse', n: 310 },
  ];

  async function mountList(src: string, attrs: Record<string, string> = {}): Promise<DsfrDataList> {
    const el = document.createElement('dsfr-data-list') as DsfrDataList;
    for (const [k, v] of Object.entries({
      source: src,
      columns: 'region:Région,n:Bénéficiaires',
      ...attrs,
    })) {
      el.setAttribute(k, v);
    }
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
  }

  const lignes = (el: Element) => el.querySelectorAll('tbody tr').length;
  const mention = (el: Element) => el.querySelector('.dsfr-data-list__stale');

  it('sans la consigne : aucune ligne', async () => {
    const src = source('list-sans');
    const el = await mountList(src);
    charge(src, ROWS);
    await el.updateComplete;
    panne(src, { consigne: null });
    await el.updateComplete;
    expect(lignes(el)).toBe(0);
    expect(mention(el)).toBeNull();
    expect(el.querySelector('.dsfr-data-list__error')).not.toBeNull();
  });

  it('avec la consigne : les lignes, l’étiquette et la phrase au-dessus du tableau', async () => {
    const src = source('list');
    const el = await mountList(src);
    charge(src, ROWS);
    await el.updateComplete;
    panne(src);
    await el.updateComplete;
    expect(lignes(el)).toBe(3);
    expect(el.querySelector('.dsfr-data-list__error')).toBeNull();
    expect(texte(mention(el)!.querySelector('.dsfr-data-status__stale-text'))).toBe(
      'Chiffres relevés aujourd’hui à 14 h 32.'
    );
    expect(
      mention(el)!.compareDocumentPosition(el.querySelector('table')!) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('tri et pagination LOCAUX restent possibles sur les lignes relevées', async () => {
    const src = source('list-local');
    const el = await mountList(src, { pagination: '2', sortable: 'n' });
    charge(src, ROWS);
    await el.updateComplete;
    (el.querySelector('.fr-pagination__link--next') as HTMLButtonElement).click();
    await el.updateComplete;
    expect(texte(el.querySelector('tbody'))).toContain('Corse');

    panne(src);
    await el.updateComplete;
    // La page n'est pas ramenée à 1 : ce sont les mêmes lignes
    expect(texte(el.querySelector('tbody'))).toContain('Corse');
    expect(lignes(el)).toBe(1);
    (el.querySelector('.fr-pagination__link--prev') as HTMLButtonElement).click();
    await el.updateComplete;
    expect(lignes(el)).toBe(2);
    expect(el.querySelector('.fr-pagination__link--prev')!.hasAttribute('aria-disabled')).toBe(
      false
    );
  });

  it('pagination SERVEUR : la page reste, les autres sont neutralisées et c’est dit', async () => {
    const src = source('list-serveur');
    const commandes: Commande[] = [];
    const off = subscribeToSourceCommands(src, (c) => commandes.push(c));
    const el = await mountList(src);
    setDataMeta(src, { page: 2, pageSize: 3, total: 30, serverSide: true });
    charge(src, ROWS, 'page=2');
    await el.updateComplete;
    panne(src, { key: 'page=2' });
    await el.updateComplete;

    expect(lignes(el)).toBe(3);
    expect(texte(mention(el)!.querySelector('.dsfr-data-status__stale-text'))).toBe(
      'Chiffres relevés aujourd’hui à 14 h 32. Les autres pages reviendront avec les données.'
    );
    const suivante = el.querySelector('.fr-pagination__link--next') as HTMLButtonElement;
    expect(suivante.getAttribute('aria-disabled')).toBe('true');
    // aria-disabled, pas disabled : le bouton garde le focus qu'il portait
    expect(suivante.disabled).toBe(false);
    suivante.click();
    await el.updateComplete;
    expect(commandes).toEqual([]);
    expect(el.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('2');
    off();
  });

  it('page changée puis échec : la page précédente est dite pour ce qu’elle est, sans relevé', async () => {
    const src = source('list-page');
    const el = await mountList(src);
    setDataMeta(src, { page: 1, pageSize: 3, total: 30, serverSide: true });
    charge(src, ROWS, 'page=1');
    await el.updateComplete;
    (el.querySelector('.fr-pagination__link--next') as HTMLButtonElement).click();
    panne(src, { key: 'page=2' });
    await el.updateComplete;

    expect(mention(el)).toBeNull();
    expect(texte(el.querySelector('.dsfr-data-list__page-error'))).toContain(
      'La page 2 n’a pas pu être chargée. Vous consultez toujours la page 1.'
    );
  });

  it('export : permis, daté dans le libellé et dans le nom du fichier', async () => {
    const src = source('list-export');
    const noms: string[] = [];
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() })
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      noms.push(this.download);
    });
    const el = await mountList(src, { export: 'csv,html' });
    charge(src, ROWS);
    await el.updateComplete;
    const boutons = () =>
      [...el.querySelectorAll('.dsfr-data-list__export-buttons button')] as HTMLButtonElement[];
    expect(boutons().map((b) => texte(b))).toEqual(['Exporter CSV', 'Exporter HTML']);

    panne(src);
    await el.updateComplete;
    expect(boutons().map((b) => texte(b))).toEqual([
      'Exporter CSV (chiffres relevés à 14 h 32)',
      'Exporter HTML (chiffres relevés à 14 h 32)',
    ]);
    expect(boutons()[0].hasAttribute('aria-disabled')).toBe(false);
    boutons()[0].click();
    boutons()[1].click();
    expect(noms).toEqual([
      'export_relevé-2026-10-13-14h32.csv',
      'export_relevé-2026-10-13-14h32.html',
    ]);
  });

  it('passé la durée : plus aucune ligne ; au retour : les nouvelles, sans mention', async () => {
    const src = source('list-echeance');
    const el = await mountList(src);
    charge(src, ROWS);
    await el.updateComplete;
    panne(src, { consigne: 300 });
    await el.updateComplete;
    expect(lignes(el)).toBe(3);
    vi.advanceTimersByTime(6 * MINUTE);
    await el.updateComplete;
    expect(lignes(el)).toBe(0);
    expect(el.querySelector('.dsfr-data-list__error')).not.toBeNull();

    charge(src, ROWS.slice(0, 1));
    await el.updateComplete;
    expect(lignes(el)).toBe(1);
    expect(mention(el)).toBeNull();
  });

  it('une liste montée pendant la panne reprend les lignes du relevé', async () => {
    const src = source('list-tardive');
    charge(src, ROWS);
    panne(src);
    const el = await mountList(src);
    expect(lignes(el)).toBe(3);
    expect(mention(el)).not.toBeNull();
  });
});

describe('#1288 B — fiches, podium, répéteur', () => {
  const ROWS = [
    { region: 'Occitanie', n: 1640 },
    { region: 'Bretagne', n: 902 },
  ];

  it('dsfr-data-display : les fiches restent, sous la mention ; sans consigne, aucune', async () => {
    const src = source('display');
    const el = document.createElement('dsfr-data-display') as DsfrDataDisplay;
    el.setAttribute('source', src);
    el.innerHTML = '<template><p class="fiche">{{region}} : {{n}}</p></template>';
    document.body.appendChild(el);
    await el.updateComplete;
    charge(src, ROWS);
    await el.updateComplete;
    expect(el.querySelectorAll('.fiche')).toHaveLength(2);

    panne(src);
    await el.updateComplete;
    expect(el.querySelectorAll('.fiche')).toHaveLength(2);
    expect(texte(el.querySelector('.dsfr-data-display__stale .dsfr-data-status__stale-text'))).toBe(
      'Chiffres relevés aujourd’hui à 14 h 32.'
    );

    dispatchDataLoading(src);
    panne(src, { consigne: null });
    await el.updateComplete;
    expect(el.querySelectorAll('.fiche')).toHaveLength(0);
    expect(el.querySelector('.dsfr-data-display__error')).not.toBeNull();
  });

  it('dsfr-data-podium : le classement reste, daté dans son nom accessible', async () => {
    const src = source('podium');
    const el = document.createElement('dsfr-data-podium') as DsfrDataPodium;
    for (const [k, v] of Object.entries({
      source: src,
      'label-field': 'region',
      'value-field': 'n',
    })) {
      el.setAttribute(k, v);
    }
    document.body.appendChild(el);
    await el.updateComplete;
    charge(src, ROWS);
    await el.updateComplete;
    panne(src);
    await el.updateComplete;

    const liste = el.querySelector('ol') as HTMLElement;
    expect(liste.querySelectorAll('li')).toHaveLength(2);
    expect(liste.classList.contains('dsfr-data-podium--stale')).toBe(true);
    expect(liste.getAttribute('aria-label')).toMatch(
      /^Classement : 1\. Occitanie, .* Chiffres relevés aujourd’hui à 14 h 32, non actualisés\.$/
    );
    expect(texte(el.querySelector('.dsfr-data-podium__stale .dsfr-data-status__stale-text'))).toBe(
      'Chiffres relevés aujourd’hui à 14 h 32.'
    );

    vi.advanceTimersByTime(61 * MINUTE);
    await el.updateComplete;
    expect(el.querySelector('ol')).toBeNull();
    expect(el.querySelector('.dsfr-data-podium__error')).not.toBeNull();
  });

  it('dsfr-data-repeat : la mention prend la place du message de panne, au-dessus des lignes', async () => {
    const src = source('repeat');
    const el = document.createElement('dsfr-data-repeat') as DsfrDataRepeat;
    el.setAttribute('source', src);
    el.setAttribute('key-field', 'region');
    el.innerHTML = '<template><p class="ligne">{{ region }} : {{ n }}</p></template>';
    document.body.appendChild(el);
    await el.updateComplete;
    charge(src, ROWS);
    await el.updateComplete;
    panne(src);
    await el.updateComplete;

    expect(el.querySelectorAll('.ligne')).toHaveLength(2);
    expect(el.querySelector('.dsfr-data-repeat__error')).toBeNull();
    const mention = el.querySelector('.dsfr-data-repeat__stale') as HTMLElement;
    expect(texte(mention.querySelector('.dsfr-data-status__stale-text'))).toBe(
      'Chiffres relevés aujourd’hui à 14 h 32.'
    );
    expect(
      mention.compareDocumentPosition(el.querySelector('.ligne')!) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});

describe('#1288 B — dsfr-data-repeat : ses lignes suivent la règle des autres afficheurs', () => {
  const ROWS = [
    { code: 'r1', libelle: 'Accueil', n: 41 },
    { code: 'r2', libelle: 'Délais', n: 42 },
  ];

  /**
   * Monté comme une page le fait : le balisage entier, analysé d'un coup. La
   * source scopée y est déclarée — absente, le répéteur la dirait
   * « introuvable », une autre panne que celle qu'on éprouve.
   */
  async function mountRepeat(src: string, gabarit: string, scopes = ''): Promise<DsfrDataRepeat> {
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    hote.innerHTML =
      (scopes ? `<div id="${scopes.split(':')[0]}"></div>` : '') +
      `<dsfr-data-repeat source="${src}" key-field="code"${scopes ? ` scopes="${scopes}"` : ''}>` +
      `<template>${gabarit}</template></dsfr-data-repeat>`;
    const el = hote.querySelector('dsfr-data-repeat') as DsfrDataRepeat;
    await vi.advanceTimersByTimeAsync(5);
    await el.updateComplete;
    return el;
  }

  const lignes = (el: Element) => [...el.querySelectorAll('.ligne')].map((l) => texte(l));

  it('sans la consigne : aucune ligne de l’ancien jeu sous le message de panne ; tout revient au retour', async () => {
    const src = source('repeat-sans');
    const el = await mountRepeat(src, '<p class="ligne">{{ libelle }} : {{ n }}</p>');
    charge(src, ROWS);
    await el.updateComplete;
    expect(lignes(el)).toEqual(['Accueil : 41', 'Délais : 42']);

    panne(src, { consigne: null });
    await el.updateComplete;
    expect(lignes(el)).toEqual([]);
    expect(el.querySelector('.dsfr-data-repeat__error')).not.toBeNull();
    expect(texte(el)).not.toMatch(/41|42/);

    // Pendant un nouvel essai : toujours rien de l'ancien jeu
    dispatchDataLoading(src);
    await el.updateComplete;
    expect(lignes(el)).toEqual([]);

    charge(src, [{ code: 'r1', libelle: 'Accueil', n: 50 }]);
    await el.updateComplete;
    expect(lignes(el)).toEqual(['Accueil : 50']);
    expect(el.querySelector('.dsfr-data-repeat__error')).toBeNull();
  });

  it('avec la consigne : les lignes sous la mention ; à l’échéance, plus de ligne et le message de panne', async () => {
    const src = source('repeat-echeance');
    const el = await mountRepeat(src, '<p class="ligne">{{ libelle }} : {{ n }}</p>');
    charge(src, ROWS);
    await el.updateComplete;
    panne(src, { consigne: 600 });
    await el.updateComplete;
    expect(lignes(el)).toEqual(['Accueil : 41', 'Délais : 42']);
    expect(texte(el.querySelector('.dsfr-data-repeat__stale .dsfr-data-status__stale-text'))).toBe(
      'Chiffres relevés aujourd’hui à 14 h 32.'
    );

    vi.advanceTimersByTime(11 * MINUTE);
    await el.updateComplete;
    expect(lignes(el)).toEqual([]);
    expect(el.querySelector('.dsfr-data-repeat__stale')).toBeNull();
    expect(el.querySelector('.dsfr-data-repeat__error')).not.toBeNull();
    expect(texte(el)).not.toMatch(/41|42/);
  });

  it('données retirées, ou autre requête, malgré la consigne : les lignes partent', async () => {
    const src = source('repeat-refus');
    const el = await mountRepeat(src, '<p class="ligne">{{ libelle }} : {{ n }}</p>');
    charge(src, ROWS);
    await el.updateComplete;
    panne(src, { erreur: new Error('HTTP 404: Not Found') });
    await el.updateComplete;
    expect(lignes(el)).toEqual([]);

    charge(src, ROWS, 'page=1');
    await el.updateComplete;
    expect(lignes(el)).toHaveLength(2);
    panne(src, { key: 'page=2' });
    await el.updateComplete;
    expect(lignes(el)).toEqual([]);
  });

  describe('scopes', () => {
    const SCORES = [
      { code: 'r1', score: 10 },
      { code: 'r1', score: 20 },
      { code: 'r2', score: 120 },
    ];
    const GABARIT =
      '<p class="ligne">{{ libelle }}</p>' +
      '<dsfr-data-kpi class="score" source="{{$scope.sc}}" value="score:sum" label="Score"></dsfr-data-kpi>';
    const valeurs = (el: Element) =>
      [...el.querySelectorAll('.score .dsfr-data-kpi__value')].map((v) => texte(v));
    const attendre = async (el: DsfrDataRepeat) => {
      // Le répéteur diffère une partie de son montage d'une macro-tâche
      await vi.advanceTimersByTimeAsync(5);
      await el.updateComplete;
      for (const k of el.querySelectorAll('dsfr-data-kpi')) {
        await (k as DsfrDataKpi).updateComplete;
      }
    };

    it('la source SCOPÉE tombe, avec la consigne : chaque tuile garde son chiffre, daté de la source', async () => {
      const src = source('repeat-scopes');
      const scores = source('repeat-scopes-scores');
      charge(scores, SCORES);
      charge(src, ROWS);
      const el = await mountRepeat(src, GABARIT, `${scores}:code:sc`);
      await attendre(el);
      expect(valeurs(el)).toEqual(['30', '120']);

      vi.setSystemTime(RELEVE + 6 * MINUTE);
      panne(scores);
      await attendre(el);
      // Les lignes du répéteur ne sont pas touchées : sa source, elle, répond
      expect(lignes(el)).toEqual(['Accueil', 'Délais']);
      expect(el.querySelector('.dsfr-data-repeat__stale')).toBeNull();
      expect(valeurs(el)).toEqual(['30', '120']);
      const dates = [...el.querySelectorAll('.score time')].map((t) => t.getAttribute('datetime'));
      expect(dates).toEqual([new Date(RELEVE).toISOString(), new Date(RELEVE).toISOString()]);
      expect(
        texte(el.querySelector('.score .dsfr-data-kpi__stale-line .dsfr-data-status__title'))
      ).toBe('Relevé à 14 h 32 · non actualisé');
    });

    it('la source scopée tombe, sans la consigne : « — » dans chaque tuile', async () => {
      const src = source('repeat-scopes-sans');
      const scores = source('repeat-scopes-sans-scores');
      charge(scores, SCORES);
      charge(src, ROWS);
      const el = await mountRepeat(src, GABARIT, `${scores}:code:sc`);
      await attendre(el);
      panne(scores, { consigne: null });
      await attendre(el);
      expect(valeurs(el)).toEqual(['—', '—']);
    });

    it('la source du RÉPÉTEUR tombe, sans la consigne : lignes, tuiles et ids scopés partent ; tout revient', async () => {
      const src = source('repeat-scopes-hote');
      const scores = source('repeat-scopes-hote-scores');
      charge(scores, SCORES);
      charge(src, ROWS);
      const el = await mountRepeat(src, GABARIT, `${scores}:code:sc`);
      await attendre(el);
      expect(getDataCache('sc-r1')).toHaveLength(2);

      panne(src, { consigne: null });
      await attendre(el);
      expect(lignes(el)).toEqual([]);
      expect(el.querySelectorAll('dsfr-data-kpi')).toHaveLength(0);
      expect(getDataCache('sc-r1')).toBeUndefined();

      charge(src, ROWS);
      await attendre(el);
      expect(valeurs(el)).toEqual(['30', '120']);
    });

    it('la source du répéteur tombe, avec la consigne : lignes et tuiles restent, la mention date les lignes', async () => {
      const src = source('repeat-scopes-releve');
      const scores = source('repeat-scopes-releve-scores');
      charge(scores, SCORES);
      charge(src, ROWS);
      const el = await mountRepeat(src, GABARIT, `${scores}:code:sc`);
      await attendre(el);
      panne(src);
      await attendre(el);
      expect(lignes(el)).toEqual(['Accueil', 'Délais']);
      expect(el.querySelector('.dsfr-data-repeat__stale')).not.toBeNull();
      // Les tuiles lisent une source qui répond : chiffres à jour, sans marque
      expect(valeurs(el)).toEqual(['30', '120']);
      expect(el.querySelector('.score time')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Tableau équivalent et export
// ---------------------------------------------------------------------------

describe('#1288 B — dsfr-data-a11y : tableau daté, export daté', () => {
  const ROWS = [
    { region: 'Occitanie', n: 1640 },
    { region: 'Bretagne', n: 902 },
  ];

  async function mountA11y(src: string, attrs: Record<string, string> = {}): Promise<DsfrDataA11y> {
    const el = document.createElement('dsfr-data-a11y') as DsfrDataA11y;
    for (const [k, v] of Object.entries({ source: src, table: '', download: '', ...attrs })) {
      el.setAttribute(k, v);
    }
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
  }

  const bouton = (el: Element) => el.querySelector('button') as HTMLButtonElement;

  /** Ce qu'un export a produit : le nom du fichier et son contenu. */
  function espionExport() {
    const fichiers: Array<{ nom: string; contenu: Blob }> = [];
    let dernier: Blob | null = null;
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn((b: Blob) => {
          dernier = b;
          return 'blob:x';
        }),
        revokeObjectURL: vi.fn(),
      })
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      fichiers.push({ nom: this.download, contenu: dernier as Blob });
    });
    return fichiers;
  }

  it('la légende devient visible et porte l’étiquette et la date ; le bouton est daté', async () => {
    const src = source('a11y');
    const el = await mountA11y(src);
    charge(src, ROWS);
    await el.updateComplete;
    expect(el.querySelector('caption')!.className).toBe('dsfr-data-a11y__sr-only');
    expect(texte(bouton(el))).toBe('Télécharger en CSV');

    panne(src);
    await el.updateComplete;
    expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
    const legende = el.querySelector('caption') as HTMLElement;
    expect(legende.className).toBe('dsfr-data-a11y__stale-caption');
    expect(texte(legende)).toBe(
      'Données du graphique — Non actualisé chiffres relevés aujourd’hui à 14 h 32'
    );
    expect(texte(bouton(el))).toBe('Télécharger en CSV (chiffres relevés à 14 h 32)');
    expect(bouton(el).hasAttribute('aria-disabled')).toBe(false);
    expect(el.querySelector('.dsfr-data-a11y__unavailable')).toBeNull();
    // La description de la cible porte la date
    expect(texte(el.querySelector(`#${el.id}-desc`))).toBe(
      'Données du graphique : 2 lignes. Téléchargement CSV disponible. Tableau de données ' +
        'disponible. Chiffres relevés aujourd’hui à 14 h 32, non actualisés.'
    );
  });

  it('le fichier porte la date du relevé dans son nom ; son contenu est celui d’avant la panne, brut', async () => {
    const src = source('a11y-export');
    const fichiers = espionExport();
    const el = await mountA11y(src);
    charge(src, ROWS);
    await el.updateComplete;
    bouton(el).click();
    vi.setSystemTime(RELEVE + 12 * MINUTE);
    panne(src);
    await el.updateComplete;
    bouton(el).click();

    expect(fichiers.map((f) => f.nom)).toEqual([
      'données.csv',
      'données_relevé-2026-10-13-14h32.csv',
    ]);
    expect(await fichiers[1].contenu.text()).toBe(await fichiers[0].contenu.text());
    expect(await fichiers[1].contenu.text()).toContain('Occitanie');
  });

  it('pendant un nouvel essai l’export reste possible : le relevé est daté', async () => {
    const src = source('a11y-essai');
    const fichiers = espionExport();
    const el = await mountA11y(src, { filename: 'aides.csv' });
    charge(src, ROWS);
    panne(src);
    dispatchDataLoading(src);
    await el.updateComplete;
    expect(bouton(el).hasAttribute('aria-disabled')).toBe(false);
    bouton(el).click();
    expect(fichiers.map((f) => f.nom)).toEqual(['aides_relevé-2026-10-13-14h32.csv']);
  });

  it('sans la consigne, ou passé la durée : ni tableau ni fichier (proposition A)', async () => {
    const src = source('a11y-sans');
    const fichiers = espionExport();
    const el = await mountA11y(src);
    charge(src, ROWS);
    await el.updateComplete;
    panne(src, { consigne: 120 });
    await el.updateComplete;
    expect(el.querySelector('table')).not.toBeNull();

    vi.advanceTimersByTime(3 * MINUTE);
    await el.updateComplete;
    expect(el.querySelector('table')).toBeNull();
    expect(bouton(el).getAttribute('aria-disabled')).toBe('true');
    expect(texte(bouton(el))).toBe('Télécharger en CSV');
    bouton(el).click();
    expect(fichiers).toEqual([]);
    expect(texte(el.querySelector('.dsfr-data-a11y__unavailable'))).toBe(
      'Données momentanément indisponibles. Le tableau et le téléchargement reviendront avec les données.'
    );
  });

  it('téléchargement seul : la mention est écrite à côté du bouton', async () => {
    const src = source('a11y-bouton');
    const el = await mountA11y(src, {});
    el.removeAttribute('table');
    await el.updateComplete;
    charge(src, ROWS);
    panne(src);
    await el.updateComplete;
    expect(el.querySelector('table')).toBeNull();
    expect(texte(el.querySelector('.dsfr-data-a11y__stale'))).toBe(
      'Non actualisé Chiffres relevés aujourd’hui à 14 h 32.'
    );
  });

  it('seul dans la page, il annonce ; à côté d’un graphique, jamais', async () => {
    const src = source('a11y-annonce');
    const seul = await mountA11y(src);
    const cible = document.createElement('div');
    cible.id = 'cible-b1288';
    document.body.appendChild(cible);
    const accompagne = await mountA11y(src, { for: 'cible-b1288' });
    charge(src, ROWS);
    panne(src);
    await seul.updateComplete;
    await accompagne.updateComplete;
    expect(texte(seul.querySelector('[role="status"]'))).toBe(
      'Chiffres relevés aujourd’hui à 14 h 32, non actualisés.'
    );
    expect(accompagne.querySelector('[role="status"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// #1306 — `aria-details` ne désigne le tableau que quand il existe
// ---------------------------------------------------------------------------

describe('#1306 — dsfr-data-a11y : aria-details suit la présence du tableau', () => {
  const ROWS = [
    { region: 'Occitanie', n: 1640 },
    { region: 'Bretagne', n: 902 },
  ];

  async function monter(src: string): Promise<{ el: DsfrDataA11y; cible: HTMLElement }> {
    const cible = document.createElement('div');
    cible.id = `cible-${src}`;
    document.body.appendChild(cible);
    const el = document.createElement('dsfr-data-a11y') as DsfrDataA11y;
    el.setAttribute('source', src);
    el.setAttribute('for', cible.id);
    el.setAttribute('table', '');
    document.body.appendChild(el);
    await el.updateComplete;
    return { el, cible };
  }

  /** L'élément que `aria-details` désigne, ou `null` : la référence doit mener quelque part. */
  const designe = (cible: Element) => {
    const id = cible.getAttribute('aria-details');
    return id === null ? null : document.getElementById(id);
  };

  it('chargement, données, panne, retour : posé seulement quand le tableau est là', async () => {
    const src = source('a11y-details');
    const { el, cible } = await monter(src);

    // Premier chargement : aucun tableau, aucun aria-details
    dispatchDataLoading(src);
    await el.updateComplete;
    expect(el.querySelector('table')).toBeNull();
    expect(cible.hasAttribute('aria-details')).toBe(false);

    // Données : le tableau, et aria-details vers lui
    charge(src, ROWS);
    await el.updateComplete;
    expect(cible.getAttribute('aria-details')).toBe(`${el.id}-table`);
    expect(designe(cible)?.querySelector('table')).not.toBeNull();

    // Panne sans relevé : tableau retiré, aria-details aussi
    panne(src, { consigne: null });
    await el.updateComplete;
    expect(el.querySelector('table')).toBeNull();
    expect(cible.hasAttribute('aria-details')).toBe(false);

    // Nouvel essai pendant la panne : toujours rien à désigner
    dispatchDataLoading(src);
    await el.updateComplete;
    expect(el.querySelector('table')).toBeNull();
    expect(cible.hasAttribute('aria-details')).toBe(false);

    // Retour des données : remis
    charge(src, ROWS);
    await el.updateComplete;
    expect(designe(cible)?.querySelector('table')).not.toBeNull();
  });

  it('relevé stale-if-error : le tableau gardé reste désigné, puis retiré à l’échéance', async () => {
    const src = source('a11y-details-releve');
    const { el, cible } = await monter(src);
    charge(src, ROWS);
    await el.updateComplete;
    panne(src, { consigne: 120 });
    await el.updateComplete;
    expect(el.querySelector('table')).not.toBeNull();
    expect(designe(cible)?.querySelector('table')).not.toBeNull();

    vi.advanceTimersByTime(3 * MINUTE);
    await el.updateComplete;
    expect(el.querySelector('table')).toBeNull();
    expect(cible.hasAttribute('aria-details')).toBe(false);
  });

  it('un aria-details posé par l’intégrateur vers autre chose n’est pas retiré', async () => {
    const src = source('a11y-details-tiers');
    const { el, cible } = await monter(src);
    cible.setAttribute('aria-details', 'note-de-methode');
    panne(src, { consigne: null });
    await el.updateComplete;
    expect(cible.getAttribute('aria-details')).toBe('note-de-methode');
  });
});
