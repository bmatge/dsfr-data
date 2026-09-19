/**
 * Évolutions d'affichage de `dsfr-data-kpi` (planche « kpi-evolutions »,
 * tours 1 à 3) : position et taille d'icône, pictogramme DSFR déclaratif,
 * image, orientation, formats de liseré, fond teinté et couleurs
 * illustratives. Rien côté données.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DsfrDataKpi,
  resetKpiDisplayWarnings,
  ILLUSTRATIVE_COLOR_TOKENS,
} from '@/components/dsfr-data-kpi.js';
import { DsfrDataKpiGroup } from '@/components/dsfr-data-kpi-group.js';
import { clearDataCache, dispatchDataLoaded } from '@/utils/data-bridge.js';

void DsfrDataKpiGroup;

const ROWS = [{ n: 3, theme: 'environment/leaf', mauvais: '../secret' }];

async function monter(html: string): Promise<DsfrDataKpi> {
  clearDataCache('aff');
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  const kpi = wrapper.querySelector('dsfr-data-kpi') as DsfrDataKpi;
  await kpi.updateComplete;
  dispatchDataLoaded('aff', ROWS);
  await kpi.updateComplete;
  return kpi;
}

const carte = (kpi: DsfrDataKpi) => kpi.querySelector('.dsfr-data-kpi') as HTMLElement;
const contenu = (kpi: DsfrDataKpi) => kpi.querySelector('.dsfr-data-kpi__content') as HTMLElement;
const css = (kpi: DsfrDataKpi) => kpi.querySelector('style')?.textContent ?? '';

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetKpiDisplayWarnings();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  document.body.innerHTML = '';
  clearDataCache('aff');
});

describe('icon : liste blanche de classes', () => {
  it('accepte fr-icon-* et ri-*', async () => {
    const a = await monter(
      '<dsfr-data-kpi source="aff" value="n" icon="fr-icon-leaf-line"></dsfr-data-kpi>'
    );
    expect(a.querySelector('.dsfr-data-kpi__icon')?.classList.contains('fr-icon-leaf-line')).toBe(
      true
    );
    const b = await monter(
      '<dsfr-data-kpi source="aff" value="n" icon="ri-truck-line"></dsfr-data-kpi>'
    );
    expect(b.querySelector('.dsfr-data-kpi__icon')?.classList.contains('ri-truck-line')).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it('ignore une valeur hors motif, avec un avertissement qui la nomme', async () => {
    const kpi = await monter(
      '<dsfr-data-kpi source="aff" value="n" icon="fr-icon-leaf-line evil-class"></dsfr-data-kpi>'
    );
    expect(kpi.querySelector('.dsfr-data-kpi__icon')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('fr-icon-leaf-line evil-class');
  });

  it('avertit UNE fois pour 200 instances portant la même valeur fautive', async () => {
    const html = Array.from(
      { length: 200 },
      () => '<dsfr-data-kpi source="aff" value="n" icon="pas-une-icone"></dsfr-data-kpi>'
    ).join('');
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);
    const kpis = Array.from(wrapper.querySelectorAll('dsfr-data-kpi')) as DsfrDataKpi[];
    await Promise.all(kpis.map((k) => k.updateComplete));
    dispatchDataLoaded('aff', ROWS);
    await Promise.all(kpis.map((k) => k.updateComplete));
    expect(kpis.every((k) => k.querySelector('.dsfr-data-kpi__icon') === null)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('icon-position et icon-size', () => {
  it('label (défaut) : icône entre le surtitre et la valeur, sans classe de taille', async () => {
    const kpi = await monter(
      '<dsfr-data-kpi source="aff" value="n" heading="H" icon="ri-leaf-line" label="L"></dsfr-data-kpi>'
    );
    const enfants = Array.from(contenu(kpi).children).map((e) => e.className.split(' ')[0]);
    expect(enfants).toEqual([
      'dsfr-data-kpi__heading',
      'dsfr-data-kpi__icon',
      'dsfr-data-kpi__value-wrapper',
      'dsfr-data-kpi__label',
    ]);
    const icone = kpi.querySelector('.dsfr-data-kpi__icon')!;
    expect(icone.className).not.toMatch(/icon--(top|right|md|sm)/);
  });

  it('top : icône en tête du contenu, dans la couleur de l’accent (1a)', async () => {
    const kpi = await monter(
      '<dsfr-data-kpi source="aff" value="n" heading="H" icon="ri-leaf-line" icon-position="top"></dsfr-data-kpi>'
    );
    const premier = contenu(kpi).firstElementChild!;
    expect(premier.classList.contains('dsfr-data-kpi__icon')).toBe(true);
    expect(premier.classList.contains('dsfr-data-kpi__icon--top')).toBe(true);
    expect(css(kpi)).toMatch(
      /\.dsfr-data-kpi__icon--top[^{]*\{[^}]*color:\s*var\(--dsfr-data-kpi-accent[,)]/
    );
  });

  it('right : icône en dernier, contenu en grille deux colonnes (1b)', async () => {
    const kpi = await monter(
      '<dsfr-data-kpi source="aff" value="n" icon="ri-building-line" icon-position="right"></dsfr-data-kpi>'
    );
    expect(contenu(kpi).classList.contains('dsfr-data-kpi__content--icon-right')).toBe(true);
    expect(contenu(kpi).lastElementChild!.classList.contains('dsfr-data-kpi__icon--right')).toBe(
      true
    );
  });

  it('icon-size="md" : 2 rem, en font-size ET en --icon-size (fr-icon passe par ::before)', async () => {
    const kpi = await monter(
      '<dsfr-data-kpi source="aff" value="n" icon="fr-icon-leaf-line" icon-size="md"></dsfr-data-kpi>'
    );
    expect(
      kpi.querySelector('.dsfr-data-kpi__icon')!.classList.contains('dsfr-data-kpi__icon--md')
    ).toBe(true);
    expect(css(kpi)).toMatch(/\.dsfr-data-kpi__icon--md\s*\{[^}]*font-size:\s*2rem/);
    expect(css(kpi)).toMatch(/\.dsfr-data-kpi__icon--md\s*\{[^}]*--icon-size:\s*2rem/);
  });

  it('icon-size="lg" n’existe pas : ignoré, avertissement nommant la valeur', async () => {
    const kpi = await monter(
      '<dsfr-data-kpi source="aff" value="n" icon="ri-leaf-line" icon-size="lg"></dsfr-data-kpi>'
    );
    expect(kpi.querySelector('.dsfr-data-kpi__icon')!.className).not.toContain('--lg');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('icon-size="lg"');
  });
});

describe('picto : pictogramme DSFR déclaratif', () => {
  const BASE = '/assets/pictograms/';

  it('rend un SVG fr-artwork à trois <use>, base + nom + .svg#fragment', async () => {
    const kpi = await monter(
      `<dsfr-data-kpi source="aff" value="n" picto="environment/leaf" picto-base="${BASE}"></dsfr-data-kpi>`
    );
    const svg = kpi.querySelector('svg.fr-artwork.dsfr-data-kpi__picto')!;
    expect(svg).not.toBeNull();
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    const uses = Array.from(svg.querySelectorAll('use')).map((u) => [
      u.getAttribute('class'),
      u.getAttribute('href'),
    ]);
    expect(uses).toEqual([
      ['fr-artwork-decorative', '/assets/pictograms/environment/leaf.svg#artwork-decorative'],
      ['fr-artwork-minor', '/assets/pictograms/environment/leaf.svg#artwork-minor'],
      ['fr-artwork-major', '/assets/pictograms/environment/leaf.svg#artwork-major'],
    ]);
    expect(kpi.querySelector('.dsfr-data-kpi__icon')).toBeNull();
  });

  it('picto prime sur icon quand les deux sont posés', async () => {
    const kpi = await monter(
      `<dsfr-data-kpi source="aff" value="n" icon="ri-leaf-line" picto="environment/leaf" picto-base="${BASE}"></dsfr-data-kpi>`
    );
    expect(kpi.querySelector('svg.dsfr-data-kpi__picto')).not.toBeNull();
    expect(kpi.querySelector('.dsfr-data-kpi__icon')).toBeNull();
  });

  it.each(['../secret', 'javascript:alert(1)', 'leaf.svg', 'Leaf', 'a b', '/environment/leaf'])(
    'refuse le nom « %s » sans assainisseur : rien rendu, avertissement nommant la valeur',
    async (nom) => {
      const kpi = await monter(
        `<dsfr-data-kpi source="aff" value="n" picto="${nom}" picto-base="${BASE}"></dsfr-data-kpi>`
      );
      expect(kpi.querySelector('svg')).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain(nom);
    }
  );

  it('picto sans picto-base : rien rendu, avertissement', async () => {
    const kpi = await monter(
      '<dsfr-data-kpi source="aff" value="n" picto="environment/leaf"></dsfr-data-kpi>'
    );
    expect(kpi.querySelector('svg')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('picto-base');
  });

  it('picto-field lit le nom sur la première ligne, même motif', async () => {
    const ok = await monter(
      `<dsfr-data-kpi source="aff" value="n" picto-field="theme" picto-base="${BASE}"></dsfr-data-kpi>`
    );
    expect(ok.querySelector('use')?.getAttribute('href')).toBe(
      '/assets/pictograms/environment/leaf.svg#artwork-decorative'
    );
    const ko = await monter(
      `<dsfr-data-kpi source="aff" value="n" picto-field="mauvais" picto-base="${BASE}"></dsfr-data-kpi>`
    );
    expect(ko.querySelector('svg')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('picto-base sans barre finale : la barre est ajoutée', async () => {
    const kpi = await monter(
      '<dsfr-data-kpi source="aff" value="n" picto="environment/leaf" picto-base="/p"></dsfr-data-kpi>'
    );
    expect(kpi.querySelector('use')?.getAttribute('href')).toBe(
      '/p/environment/leaf.svg#artwork-decorative'
    );
  });

  it('taille : sm = 3,5 rem, md (défaut) = 5 rem — l’échelle des tuiles DSFR', async () => {
    const md = await monter(
      `<dsfr-data-kpi source="aff" value="n" picto="environment/leaf" picto-base="${BASE}"></dsfr-data-kpi>`
    );
    expect(md.querySelector('svg')!.classList.contains('dsfr-data-kpi__picto--sm')).toBe(false);
    expect(css(md)).toMatch(/\.dsfr-data-kpi__picto\s*\{[^}]*height:\s*5rem/);
    const sm = await monter(
      `<dsfr-data-kpi source="aff" value="n" picto="environment/leaf" picto-base="${BASE}" icon-size="sm"></dsfr-data-kpi>`
    );
    expect(sm.querySelector('svg')!.classList.contains('dsfr-data-kpi__picto--sm')).toBe(true);
    expect(css(sm)).toMatch(/\.dsfr-data-kpi__picto--sm\s*\{[^}]*height:\s*3\.5rem/);
  });

  it('avec une couleur illustrative, le SVG porte fr-artwork--<nom> (couleur mineure DSFR)', async () => {
    const kpi = await monter(
      `<dsfr-data-kpi source="aff" value="n" picto="environment/leaf" picto-base="${BASE}" color-token="green-emeraude"></dsfr-data-kpi>`
    );
    expect(kpi.querySelector('svg')!.classList.contains('fr-artwork--green-emeraude')).toBe(true);
  });
});

describe('image', () => {
  it('top (défaut) : bandeau avant le contenu, img avec alt', async () => {
    const kpi = await monter(
      '<dsfr-data-kpi source="aff" value="n" image="https://example.org/pac.jpg" image-alt="Pompe à chaleur"></dsfr-data-kpi>'
    );
    expect(carte(kpi).classList.contains('dsfr-data-kpi--image-top')).toBe(true);
    const figure = carte(kpi).firstElementChild!;
    expect(figure.classList.contains('dsfr-data-kpi__image')).toBe(true);
    const img = figure.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('https://example.org/pac.jpg');
    expect(img.getAttribute('alt')).toBe('Pompe à chaleur');
  });

  it('sans image-alt : alt vide (décorative)', async () => {
    const kpi = await monter(
      '<dsfr-data-kpi source="aff" value="n" image="/pac.jpg"></dsfr-data-kpi>'
    );
    expect(kpi.querySelector('img')!.getAttribute('alt')).toBe('');
  });

  it.each(['left', 'right'])(
    'image-position="%s" : classe de position, contenu conservé',
    async (pos) => {
      const kpi = await monter(
        `<dsfr-data-kpi source="aff" value="n" image="/pac.jpg" image-position="${pos}" label="L"></dsfr-data-kpi>`
      );
      expect(carte(kpi).classList.contains(`dsfr-data-kpi--image-${pos}`)).toBe(true);
      expect(kpi.querySelector('img')).not.toBeNull();
      expect(kpi.querySelector('.dsfr-data-kpi__label')!.textContent).toBe('L');
      const enfants = Array.from(carte(kpi).children).map((e) => e.className.split(' ')[0]);
      expect(enfants).toEqual(
        pos === 'left'
          ? ['dsfr-data-kpi__image', 'dsfr-data-kpi__content']
          : ['dsfr-data-kpi__content', 'dsfr-data-kpi__image']
      );
    }
  );

  it.each(['javascript:alert(1)', 'data:text/html,x', 'vbscript:x'])(
    'URL refusée « %s » (sanitizeTemplateUrl) : rien rendu, avertissement',
    async (url) => {
      const kpi = await monter(
        `<dsfr-data-kpi source="aff" value="n" image="${url}"></dsfr-data-kpi>`
      );
      expect(kpi.querySelector('img')).toBeNull();
      expect(carte(kpi).className).not.toContain('image');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain(url);
    }
  );
});

describe('orientation', () => {
  it('vertical sans média : liseré haut, aligné à gauche (1g)', async () => {
    const kpi = await monter(
      '<dsfr-data-kpi source="aff" value="n" orientation="vertical"></dsfr-data-kpi>'
    );
    expect(carte(kpi).classList.contains('dsfr-data-kpi--vertical')).toBe(true);
    expect(carte(kpi).classList.contains('dsfr-data-kpi--border-top')).toBe(true);
    expect(carte(kpi).classList.contains('dsfr-data-kpi--centered')).toBe(false);
  });

  it('vertical avec icône : tuile centrée, icône au-dessus (1f)', async () => {
    const kpi = await monter(
      '<dsfr-data-kpi source="aff" value="n" orientation="vertical" icon="ri-sun-line" heading="H"></dsfr-data-kpi>'
    );
    expect(carte(kpi).classList.contains('dsfr-data-kpi--centered')).toBe(true);
    expect(contenu(kpi).firstElementChild!.classList.contains('dsfr-data-kpi__icon--top')).toBe(
      true
    );
  });

  it('vertical + border explicite : le border explicite prime', async () => {
    const kpi = await monter(
      '<dsfr-data-kpi source="aff" value="n" orientation="vertical" border="outline"></dsfr-data-kpi>'
    );
    expect(carte(kpi).classList.contains('dsfr-data-kpi--border-outline')).toBe(true);
    expect(carte(kpi).classList.contains('dsfr-data-kpi--border-top')).toBe(false);
  });

  it('kpi-group vertical : les KPI enfants sont stylés par le sélecteur du groupe', async () => {
    const kpi = await monter(
      '<dsfr-data-kpi-group orientation="vertical"><dsfr-data-kpi source="aff" value="n" icon="ri-car-line"></dsfr-data-kpi></dsfr-data-kpi-group>'
    );
    expect(css(kpi)).toMatch(
      /dsfr-data-kpi-group\[orientation=["']vertical["']\] > dsfr-data-kpi > \.dsfr-data-kpi/
    );
    const groupe = document.querySelector('dsfr-data-kpi-group') as DsfrDataKpiGroup;
    const styles = (groupe.constructor as typeof DsfrDataKpiGroup).styles;
    expect(String((styles as { cssText: string }).cssText)).toContain(
      ":host([orientation='vertical'])"
    );
  });
});

describe('border', () => {
  it.each(['top', 'bottom', 'outline', 'left-short', 'none'])(
    'border="%s" : classe de mode',
    async (mode) => {
      const kpi = await monter(
        `<dsfr-data-kpi source="aff" value="n" border="${mode}"></dsfr-data-kpi>`
      );
      expect(carte(kpi).classList.contains(`dsfr-data-kpi--border-${mode}`)).toBe(true);
      expect(css(kpi)).toContain(`.dsfr-data-kpi--border-${mode}`);
    }
  );

  it('border="left" (défaut) : aucune classe de mode', async () => {
    const kpi = await monter(
      '<dsfr-data-kpi source="aff" value="n" border="left"></dsfr-data-kpi>'
    );
    expect(carte(kpi).className).not.toContain('--border-');
  });

  it('valeur inconnue : ignorée avec avertissement', async () => {
    const kpi = await monter(
      '<dsfr-data-kpi source="aff" value="n" border="thick"></dsfr-data-kpi>'
    );
    expect(carte(kpi).className).not.toContain('--border-');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('border="thick"');
  });

  it('les modes consomment la couleur d’accent, jamais un hexadécimal', async () => {
    const kpi = await monter('<dsfr-data-kpi source="aff" value="n" border="top"></dsfr-data-kpi>');
    expect(css(kpi)).toMatch(
      /\.dsfr-data-kpi--border-top\s*\{[^}]*var\(--dsfr-data-kpi-accent[,)]/
    );
    expect(css(kpi)).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });
});

describe('tint', () => {
  it('tint seul : fond -950 du token, valeur toujours en gris titre', async () => {
    const kpi = await monter('<dsfr-data-kpi source="aff" value="n" tint></dsfr-data-kpi>');
    expect(carte(kpi).classList.contains('dsfr-data-kpi--tint')).toBe(true);
    expect(carte(kpi).getAttribute('style')).toContain(
      '--dsfr-data-kpi-tint: var(--background-contrast-info)'
    );
    // La valeur reste --text-title-grey : aucune règle ne la met dans l'accent.
    expect(css(kpi)).not.toMatch(
      /--tint[^{]*__value\s*\{[^}]*color:\s*var\(--dsfr-data-kpi-accent\)/
    );
    expect(css(kpi)).toMatch(/\.dsfr-data-kpi__value\s*\{[^}]*color:\s*var\(--text-title-grey\)/);
  });

  it('tint="975" et tint="925" sur une couleur illustrative : alt et option 925', async () => {
    const a = await monter(
      '<dsfr-data-kpi source="aff" value="n" tint="975" color-token="green-emeraude"></dsfr-data-kpi>'
    );
    expect(carte(a).getAttribute('style')).toContain(
      '--dsfr-data-kpi-tint: var(--background-alt-green-emeraude)'
    );
    const b = await monter(
      '<dsfr-data-kpi source="aff" value="n" tint="925" color-token="green-emeraude"></dsfr-data-kpi>'
    );
    expect(carte(b).getAttribute('style')).toContain(
      '--dsfr-data-kpi-tint: var(--green-emeraude-925-125)'
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('tint="975" sur un token sémantique : option -975-75 ; 925 n’existe pas → 950 et avertissement', async () => {
    const a = await monter(
      '<dsfr-data-kpi source="aff" value="n" tint="975" color-token="vert"></dsfr-data-kpi>'
    );
    expect(carte(a).getAttribute('style')).toContain('--dsfr-data-kpi-tint: var(--success-975-75)');
    const b = await monter(
      '<dsfr-data-kpi source="aff" value="n" tint="925" color-token="rouge"></dsfr-data-kpi>'
    );
    expect(carte(b).getAttribute('style')).toContain(
      '--dsfr-data-kpi-tint: var(--background-contrast-error)'
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('925');
  });

  it('tint="false" ne teinte pas', async () => {
    const kpi = await monter('<dsfr-data-kpi source="aff" value="n" tint="false"></dsfr-data-kpi>');
    expect(carte(kpi).classList.contains('dsfr-data-kpi--tint')).toBe(false);
    expect(carte(kpi).hasAttribute('style')).toBe(false);
  });
});

describe('color-token : 17 couleurs illustratives', () => {
  it('expose les 17 noms de la planche 3c', () => {
    expect([...ILLUSTRATIVE_COLOR_TOKENS].sort()).toEqual(
      [
        'green-tilleul-verveine',
        'green-bourgeon',
        'green-emeraude',
        'green-menthe',
        'green-archipel',
        'blue-ecume',
        'blue-cumulus',
        'purple-glycine',
        'pink-macaron',
        'pink-tuile',
        'yellow-tournesol',
        'yellow-moutarde',
        'orange-terre-battue',
        'brown-cafe-creme',
        'brown-opera',
        'brown-caramel',
        'beige-gris-galet',
      ].sort()
    );
  });

  it.each([...ILLUSTRATIVE_COLOR_TOKENS])(
    '%s : accent = --border-plain-<nom>, fond = --background-contrast-<nom>, pas d’hexadécimal',
    async (nom) => {
      const kpi = await monter(
        `<dsfr-data-kpi source="aff" value="n" label="L" color-token="${nom}" tint icon="ri-leaf-line" icon-position="top"></dsfr-data-kpi>`
      );
      expect(carte(kpi).classList.contains('dsfr-data-kpi--illustrative')).toBe(true);
      const style = carte(kpi).getAttribute('style') ?? '';
      expect(style).toContain(`--dsfr-data-kpi-accent: var(--border-plain-${nom})`);
      expect(style).toContain(`--dsfr-data-kpi-tint: var(--background-contrast-${nom})`);
      expect(kpi.innerHTML).not.toMatch(/#[0-9a-f]{3,6}\b/i);
      expect(warn).not.toHaveBeenCalled();
    }
  );

  it('sans tint : la classe illustrative pose le liseré depuis l’accent', async () => {
    const kpi = await monter(
      '<dsfr-data-kpi source="aff" value="n" color-token="blue-cumulus"></dsfr-data-kpi>'
    );
    expect(carte(kpi).classList.contains('dsfr-data-kpi--info')).toBe(false);
    expect(css(kpi)).toMatch(
      /\.dsfr-data-kpi--illustrative\s*\{[^}]*border-left-color:\s*var\(--dsfr-data-kpi-accent\)/
    );
  });

  it('un token inconnu est ignoré avec un avertissement, repli sur les seuils / bleu', async () => {
    const kpi = await monter(
      '<dsfr-data-kpi source="aff" value="n" color-token="rouge-vif"></dsfr-data-kpi>'
    );
    expect(carte(kpi).classList.contains('dsfr-data-kpi--info')).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('rouge-vif');
  });

  it('une couleur illustrative ne dit aucun « état » dans le libellé accessible', async () => {
    const kpi = await monter(
      '<dsfr-data-kpi source="aff" value="n" label="Sports" color-token="orange-terre-battue" threshold-green="80" threshold-orange="50"></dsfr-data-kpi>'
    );
    expect(carte(kpi).getAttribute('aria-label')).not.toContain('etat');
  });

  it('les 4 tokens sémantiques définissent l’accent par règle CSS, DOM inchangé', async () => {
    const kpi = await monter(
      '<dsfr-data-kpi source="aff" value="n" color-token="vert"></dsfr-data-kpi>'
    );
    expect(carte(kpi).hasAttribute('style')).toBe(false);
    expect(css(kpi)).toMatch(
      /\.dsfr-data-kpi--success\s*\{[^}]*--dsfr-data-kpi-accent:\s*var\(--background-flat-success\)/
    );
  });
});
