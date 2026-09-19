import { describe, it, expect, afterEach, vi } from 'vitest';

/**
 * PREUVE D'ÉCHAPPEMENT — `dsfr-data-map-popup` (alertes CodeQL
 * `js/html-constructed-from-input` #89 et #90).
 *
 * CodeQL signale les deux écritures `innerHTML` du corps, dans `_showPanel` et
 * dans `_showModal` : le HTML rendu y entre sans passer par un assainisseur que
 * l'analyse sache reconnaître. L'échappement existe, mais il traverse une
 * indirection (`out()` dans `renderTemplate`) que le suivi de flot ne franchit
 * pas.
 *
 * Ce fichier est ce qui rend l'écartement des deux alertes légitime : il
 * démontre, sur des charges utiles réelles, que la DONNÉE est échappée dans les
 * QUATRE combinaisons de la matrice — deux modes (`panel-right` → `_showPanel`,
 * `modal` → `_showModal`) × deux chemins de rendu (avec `<template>` d'auteur →
 * `renderTemplate`, sans → `_buildAutoTable`).
 *
 * Il devient ROUGE si quelqu'un passe `raw: true` ou `escape: false` à
 * `renderTemplate`, ou retire un `escapeHtml` de `_buildAutoTable`.
 *
 * Ce qu'il NE couvre pas, et qui reste de la responsabilité de l'auteur de la
 * page : le gabarit `<template>` lui-même n'est pas échappé (c'est du HTML
 * écrit par l'auteur, comme pour `dsfr-data-display`), et un `{{champ}}` nu
 * placé dans un `href` laisse passer `javascript:` — c'est précisément l'objet
 * du format `{{champ:url}}`, vérifié ici aussi.
 */

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { DsfrDataMapPopup } from '@/components/dsfr-data-map-popup.js';

/** Charges utiles : balise, gestionnaire d'évènement, sortie d'attribut, sortie de balise. */
const CHARGES = {
  script: '<script>alert(1)</script>',
  img: '<img src=x onerror=alert(1)>',
  svg: '"><svg onload=alert(1)>',
  attribut: '" onmouseover="alert(1)',
  // Une donnée qui contient elle-même un placeholder ne doit pas être rescannée.
  gabarit: '{{autre}}',
} as const;

const ENREGISTREMENT: Record<string, unknown> = { ...CHARGES, autre: 'JAMAIS-SUBSTITUE' };

const GABARIT_AUTEUR = `
  <h4>{{script}}</h4>
  <p>{{img}}</p>
  <p>{{svg}}</p>
  <span data-nom="{{attribut}}">attribut</span>
  <p>{{gabarit}}</p>
  <p>{{{script}}}</p>
`;

/** Balises qui exécutent ou chargent : aucune ne doit naître d'une donnée. */
const BALISES_EXECUTABLES = 'script, iframe, object, embed, svg, img, link, style, form';

/** Tout attribut `on*` présent sur un descendant (dans le DOM comme dans le HTML brut). */
function gestionnairesEvenement(racine: Element): string[] {
  const trouves: string[] = [];
  for (const el of racine.querySelectorAll('*')) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.toLowerCase().startsWith('on')) trouves.push(`${el.tagName}[${attr.name}]`);
    }
  }
  return trouves;
}

/**
 * Le contrat, en un seul endroit : rien d'exécutable, aucun `on*`, et chaque
 * charge utile lisible TELLE QUELLE dans le texte (donc rendue, pas avalée).
 */
function attendreDonneeInerte(racine: Element, charges: string[]) {
  expect(racine.querySelectorAll(BALISES_EXECUTABLES).length).toBe(0);
  expect(gestionnairesEvenement(racine)).toEqual([]);
  // `alert(` peut subsister comme TEXTE ; ce qui ne doit pas exister, c'est un
  // `<` qui ouvre une balise depuis la donnée.
  const texte = racine.textContent ?? '';
  for (const charge of charges) expect(texte).toContain(charge);
}

function nouveauPopup(mode: 'panel-right' | 'modal', gabarit?: string) {
  const carte = document.createElement('dsfr-data-map');
  document.body.appendChild(carte);
  const popup = new DsfrDataMapPopup();
  popup.mode = mode;
  popup.titleField = 'script';
  if (gabarit !== undefined) {
    const tpl = document.createElement('template');
    tpl.innerHTML = gabarit;
    popup.appendChild(tpl);
  }
  carte.appendChild(popup);
  return { carte, popup };
}

/** Le conteneur réellement écrit par l'`innerHTML` signalé. */
function conteneurRendu(popup: DsfrDataMapPopup): HTMLElement {
  const interne = popup as unknown as {
    _panelEl: HTMLElement | null;
    _modalEl: HTMLElement | null;
  };
  const el = interne._panelEl ?? interne._modalEl;
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

afterEach(() => {
  document.querySelectorAll('dsfr-data-map, .dsfr-data-map-popup__modal-overlay').forEach((el) => {
    el.remove();
  });
});

describe.each([
  ['panel-right', 'panneau latéral (innerHTML de _showPanel)'],
  ['modal', 'modale (innerHTML de _showModal)'],
] as const)('%s — %s', (mode, _libelle) => {
  it('gabarit d’auteur : la donnée est échappée, rien d’exécutable ne naît', () => {
    const { popup } = nouveauPopup(mode, GABARIT_AUTEUR);
    popup.showForRecord(ENREGISTREMENT);

    const rendu = conteneurRendu(popup);
    attendreDonneeInerte(rendu, [CHARGES.script, CHARGES.img, CHARGES.svg]);

    // Sortie d'attribut : le guillemet est entité, l'attribut porte la valeur brute
    const span = rendu.querySelector('span[data-nom]') as HTMLElement;
    expect(span).not.toBeNull();
    expect(span.getAttribute('data-nom')).toBe(CHARGES.attribut);
    expect(span.hasAttribute('onmouseover')).toBe(false);

    // Une donnée porteuse de `{{…}}` n'est pas rescannée
    expect(rendu.textContent).toContain('{{autre}}');
    expect(rendu.textContent).not.toContain('JAMAIS-SUBSTITUE');

    // `{{{brut}}}` est traité comme `{{brut}}` : les popups passent raw=false
    expect(rendu.innerHTML).not.toContain('<script');
  });

  it('sans gabarit : le tableau automatique échappe clés ET valeurs', () => {
    const { popup } = nouveauPopup(mode);
    // Une CLÉ hostile autant qu'une valeur : _buildAutoTable échappe les deux
    popup.showForRecord({ ...ENREGISTREMENT, '<b>cle</b>': '<i>valeur</i>' });

    const rendu = conteneurRendu(popup);
    expect(rendu.querySelector('table')).not.toBeNull();
    attendreDonneeInerte(rendu, [CHARGES.script, CHARGES.img, CHARGES.svg]);
    expect(rendu.querySelector('b')).toBeNull();
    expect(rendu.querySelector('i')).toBeNull();
    expect(rendu.textContent).toContain('<b>cle</b>');
    expect(rendu.textContent).toContain('<i>valeur</i>');
  });

  it('le titre (title-field) est échappé lui aussi', () => {
    const { popup } = nouveauPopup(mode, '<p>{{img}}</p>');
    popup.showForRecord(ENREGISTREMENT);

    const rendu = conteneurRendu(popup);
    const titre = rendu.querySelector(
      '.dsfr-data-map-popup__panel-title, .dsfr-data-map-popup__modal-title'
    ) as HTMLElement;
    expect(titre).not.toBeNull();
    expect(titre.querySelector('script')).toBeNull();
    expect(titre.textContent).toBe(CHARGES.script);
  });
});

describe('mode popup — getPopupHtml (bulle Leaflet, même moteur)', () => {
  it('la chaîne rendue ne contient aucune balise venue de la donnée', () => {
    const { popup } = nouveauPopup('panel-right', GABARIT_AUTEUR);
    const html = popup.getPopupHtml(ENREGISTREMENT);

    const hote = document.createElement('div');
    hote.innerHTML = html;
    document.body.appendChild(hote);
    attendreDonneeInerte(hote, [CHARGES.script, CHARGES.img, CHARGES.svg]);
    hote.remove();
  });
});

describe('href : le format :url est la voie sûre, le placeholder nu ne l’est pas', () => {
  it('{{champ:url}} neutralise javascript:, {{champ}} nu le laisse passer', () => {
    const { popup } = nouveauPopup(
      'modal',
      '<a id="sur" href="{{lien:url}}">sûr</a><a id="nu" href="{{lien}}">nu</a>'
    );
    popup.showForRecord({ lien: 'javascript:alert(1)' });

    const rendu = conteneurRendu(popup);
    expect(rendu.querySelector('#sur')?.getAttribute('href')).toBe('');
    // Constat assumé et documenté : sans `:url`, l'auteur porte la responsabilité
    expect(rendu.querySelector('#nu')?.getAttribute('href')).toBe('javascript:alert(1)');
  });
});
