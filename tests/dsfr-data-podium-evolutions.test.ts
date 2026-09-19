import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DsfrDataPodium,
  relativeLuminance,
  resetPodiumMediaWarnings,
} from '@/components/dsfr-data-podium.js';
import { clearDataCache, dispatchDataLoaded } from '@/utils/data-bridge.js';
import { CHOROPLETH_SCALES, PALETTE_COLORS } from '@dsfr-data/shared/lib';

const REGIONS = [
  {
    nom: 'Ile-de-France',
    population: 12271794,
    logo: 'https://exemple.fr/idf.png',
    icone: 'fr-icon-building-line',
    picto: 'buildings/city-hall',
  },
  {
    nom: 'Auvergne-Rhone-Alpes',
    population: 8092834,
    logo: 'https://exemple.fr/ara.png',
    icone: 'ri-map-pin-line',
    picto: 'buildings/school',
  },
  {
    nom: 'Nouvelle-Aquitaine',
    population: 6109841,
    logo: 'https://exemple.fr/na.png',
    icone: 'fr-icon-earth-line',
    picto: 'buildings/mairie',
  },
  {
    nom: 'Hauts-de-France',
    population: 6003095,
    logo: 'https://exemple.fr/hdf.png',
    icone: 'fr-icon-home-4-line',
    picto: 'buildings/ecole',
  },
  {
    nom: 'Occitanie',
    population: 5924858,
    logo: 'https://exemple.fr/oc.png',
    icone: 'fr-icon-map-pin-2-line',
    picto: 'buildings/prefecture',
  },
];

let seq = 0;

async function mount(
  configure: (p: DsfrDataPodium) => void,
  data: Record<string, unknown>[] = REGIONS
): Promise<DsfrDataPodium> {
  const id = `podium-evo-${seq++}`;
  clearDataCache(id);
  const podium = new DsfrDataPodium();
  podium.source = id;
  podium.labelField = 'nom';
  podium.valueField = 'population';
  configure(podium);
  document.body.appendChild(podium);
  podium.connectedCallback();
  dispatchDataLoaded(id, data);
  await podium.updateComplete;
  return podium;
}

describe('dsfr-data-podium — evolutions d’affichage', () => {
  beforeEach(() => {
    resetPodiumMediaWarnings();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.querySelectorAll('dsfr-data-podium').forEach((el) => el.remove());
  });

  describe('image-field (3a)', () => {
    it('rend une vignette entre le rang et le libelle', async () => {
      const podium = await mount((p) => {
        p.imageField = 'logo';
        p.maxItems = 3;
      });
      const item = podium.querySelector('.dsfr-data-podium__item')!;
      const img = item.querySelector('img.dsfr-data-podium__image') as HTMLImageElement;
      expect(img).not.toBeNull();
      expect(img.getAttribute('src')).toBe('https://exemple.fr/idf.png');
      expect(img.getAttribute('alt')).toBe('');
      // Ordre : rang, vignette, contenu.
      const kids = [...item.children].map((c) => c.className.split(' ')[0]);
      expect(kids).toEqual([
        'dsfr-data-podium__rank',
        'dsfr-data-podium__image',
        'dsfr-data-podium__content',
      ]);
    });

    it('pose la classe de forme ronde avec image-shape="circle"', async () => {
      const podium = await mount((p) => {
        p.imageField = 'logo';
        p.imageShape = 'circle';
      });
      expect(podium.querySelector('ol')!.className).toContain('dsfr-data-podium--image-circle');
    });

    it('refuse une URL hors liste blanche de schemas et avertit', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const podium = await mount(
        (p) => (p.imageField = 'logo'),
        [
          { nom: 'A', population: 2, logo: 'javascript:alert(1)' },
          { nom: 'B', population: 1, logo: 'https://ok.fr/b.png' },
        ]
      );
      expect(podium.querySelectorAll('img.dsfr-data-podium__image')).toHaveLength(1);
      expect(warn).toHaveBeenCalled();
      expect(warn.mock.calls[0][0]).toContain('logo');
      expect(warn.mock.calls[0][0]).toContain('javascript:alert(1)');
    });
  });

  describe('icon-field / icon (3b)', () => {
    it('pose la classe d’icone venue de la donnee', async () => {
      const podium = await mount((p) => {
        p.iconField = 'icone';
        p.maxItems = 2;
      });
      const icons = [...podium.querySelectorAll('.dsfr-data-podium__icon')].map((e) => e.className);
      expect(icons[0]).toContain('fr-icon-building-line');
      expect(icons[1]).toContain('ri-map-pin-line');
    });

    it('applique la meme icone a tous avec `icon`', async () => {
      const podium = await mount((p) => {
        p.icon = 'fr-icon-trophy-line';
        p.maxItems = 3;
      });
      expect(podium.querySelectorAll('.fr-icon-trophy-line')).toHaveLength(3);
    });

    it('ignore une valeur hors liste blanche, avertit, et ne pose aucun balisage', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const podium = await mount(
        (p) => (p.iconField = 'icone'),
        [
          { nom: 'A', population: 3, icone: '<img src=x onerror=alert(1)>' },
          { nom: 'B', population: 2, icone: 'fr-icon-ok-line' },
        ]
      );
      expect(podium.querySelectorAll('.dsfr-data-podium__icon')).toHaveLength(1);
      expect(podium.innerHTML).not.toContain('onerror');
      expect(warn.mock.calls[0][0]).toContain('icone');
    });

    it('n’emet qu’un avertissement par valeur refusee, pas un par ligne', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // 40 lignes, 3 valeurs invalides distinctes repetees.
      const mauvaises = ['pas-une-classe', 'fr-icon BAD', 'ri-'];
      const data = Array.from({ length: 40 }, (_, i) => ({
        nom: `Item ${i}`,
        population: 100 - i,
        icone: mauvaises[i % 3],
      }));
      await mount((p) => {
        p.iconField = 'icone';
        p.maxItems = 40;
      }, data);
      expect(warn).toHaveBeenCalledTimes(3);
    });
  });

  describe('picto / picto-field', () => {
    it('construit l’URL en concatenant picto-base et le nom, en balisage fr-artwork', async () => {
      const podium = await mount((p) => {
        p.pictoField = 'picto';
        p.pictoBase = '/dsfr/artwork/pictograms/';
        p.maxItems = 1;
      });
      const svg = podium.querySelector('svg.fr-artwork')!;
      expect(svg.getAttribute('viewBox')).toBe('0 0 80 80');
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      const uses = [...svg.querySelectorAll('use')].map((u) => ({
        cls: u.getAttribute('class'),
        href: u.getAttribute('href'),
      }));
      expect(uses).toEqual([
        {
          cls: 'fr-artwork-decorative',
          href: '/dsfr/artwork/pictograms/buildings/city-hall.svg#artwork-decorative',
        },
        {
          cls: 'fr-artwork-minor',
          href: '/dsfr/artwork/pictograms/buildings/city-hall.svg#artwork-minor',
        },
        {
          cls: 'fr-artwork-major',
          href: '/dsfr/artwork/pictograms/buildings/city-hall.svg#artwork-major',
        },
      ]);
    });

    it('refuse un nom qui tente de sortir de la base', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const podium = await mount(
        (p) => {
          p.pictoField = 'picto';
          p.pictoBase = '/dsfr/artwork/pictograms/';
        },
        [{ nom: 'A', population: 1, picto: '../../../etc/passwd' }]
      );
      expect(podium.querySelector('svg.fr-artwork')).toBeNull();
      expect(warn.mock.calls[0][0]).toContain('../../../etc/passwd');
    });

    it('refuse un nom a schema (javascript:)', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const podium = await mount(
        (p) => {
          p.pictoField = 'picto';
          p.pictoBase = '/p/';
        },
        [{ nom: 'A', population: 1, picto: 'javascript:alert(1)' }]
      );
      expect(podium.querySelector('svg.fr-artwork')).toBeNull();
      expect(warn).toHaveBeenCalled();
    });

    it('ne rend rien et avertit quand picto-base manque', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const podium = await mount(
        (p) => (p.picto = 'buildings/city-hall'),
        [{ nom: 'A', population: 1 }]
      );
      expect(podium.querySelector('svg.fr-artwork')).toBeNull();
      expect(warn.mock.calls[0][0]).toContain('picto-base');
    });
  });

  describe('rank (3b, 3c, 3d)', () => {
    it('affiche le chiffre par defaut', async () => {
      const podium = await mount((p) => (p.maxItems = 3));
      const ranks = [...podium.querySelectorAll('.dsfr-data-podium__rank')].map(
        (e) => e.textContent
      );
      expect(ranks).toEqual(['1', '2', '3']);
    });

    it('rank="medal" pose la pastille et une classe d’encre', async () => {
      const podium = await mount((p) => {
        p.rank = 'medal';
        p.maxItems = 5;
      });
      expect(podium.querySelector('ol')!.className).toContain('dsfr-data-podium--rank-medal');
      const inks = [...podium.querySelectorAll('.dsfr-data-podium__rank--medal')].map((e) =>
        e.className.includes('--ink-light') ? 'light' : 'dark'
      );
      // sequentialDescending : les trois premiers tons sont sombres, les deux
      // suivants trop clairs pour du blanc.
      expect(inks).toEqual(['light', 'light', 'light', 'dark', 'dark']);
    });

    it('la pastille reste aria-hidden : l’ordre est porte par la liste', async () => {
      const podium = await mount((p) => (p.rank = 'medal'));
      expect(
        podium.querySelector('.dsfr-data-podium__rank--medal')!.getAttribute('aria-hidden')
      ).toBe('true');
    });

    it('rank="none" supprime le rang du DOM', async () => {
      const podium = await mount((p) => (p.rank = 'none'));
      expect(podium.querySelectorAll('.dsfr-data-podium__rank')).toHaveLength(0);
    });
  });

  describe('bar, bar-position, border : trois axes independants', () => {
    it('bar="none" ne rend aucune barre, mais garde le lisere', async () => {
      const podium = await mount((p) => {
        p.bar = 'none';
        p.border = 'left';
      });
      expect(podium.querySelectorAll('.dsfr-data-podium__bar-track')).toHaveLength(0);
      expect(podium.querySelector('ol')!.className).not.toContain('--border-none');
    });

    it('bar="full" remplit la barre a 100 % quelle que soit la valeur', async () => {
      const podium = await mount((p) => {
        p.bar = 'full';
        p.maxItems = 3;
      });
      const widths = [...podium.querySelectorAll('.dsfr-data-podium__bar-fill')].map(
        (e) => (e as HTMLElement).style.width
      );
      expect(widths).toEqual(['100%', '100%', '100%']);
    });

    it('bar-position="between" place la barre dans l’en-tete, entre libelle et valeur', async () => {
      const podium = await mount((p) => {
        p.barPosition = 'between';
        p.maxItems = 1;
      });
      const header = podium.querySelector('.dsfr-data-podium__header')!;
      const kids = [...header.children].map((c) => c.className.split(' ')[0]);
      expect(kids).toEqual([
        'dsfr-data-podium__label-group',
        'dsfr-data-podium__bar-track',
        'dsfr-data-podium__value',
      ]);
      expect(
        podium.querySelector('.dsfr-data-podium__content > .dsfr-data-podium__bar-track')
      ).toBeNull();
    });

    it('bar-position="inline" garde la barre sous le libelle (rendu actuel)', async () => {
      const podium = await mount((p) => (p.maxItems = 1));
      expect(
        podium.querySelector('.dsfr-data-podium__content > .dsfr-data-podium__bar-track')
      ).not.toBeNull();
    });

    it('bar-position="top" et "bottom" posent la classe correspondante', async () => {
      const haut = await mount((p) => (p.barPosition = 'top'));
      expect(haut.querySelector('ol')!.className).toContain('dsfr-data-podium--bar-top');
      const bas = await mount((p) => (p.barPosition = 'bottom'));
      expect(bas.querySelector('ol')!.className).toContain('dsfr-data-podium--bar-bottom');
    });

    it('border="none" retire le lisere sans toucher a la barre', async () => {
      const podium = await mount((p) => (p.border = 'none'));
      expect(podium.querySelector('ol')!.className).toContain('dsfr-data-podium--border-none');
      expect(podium.querySelectorAll('.dsfr-data-podium__bar-track').length).toBeGreaterThan(0);
    });

    it('combine les trois axes comme la vignette 3h', async () => {
      const podium = await mount((p) => {
        p.bar = 'proportional';
        p.barPosition = 'top';
        p.border = 'left';
      });
      const cls = podium.querySelector('ol')!.className;
      expect(cls).toContain('dsfr-data-podium--bar-top');
      expect(cls).not.toContain('dsfr-data-podium--bar-full');
      expect(cls).not.toContain('dsfr-data-podium--border-none');
    });
  });

  describe('orientation="vertical" (3e)', () => {
    it('rend une colonne par item, valeur puis barre puis rang puis libelle', async () => {
      const podium = await mount((p) => {
        p.orientation = 'vertical';
        p.maxItems = 3;
      });
      expect(podium.querySelector('ol')!.className).toContain('dsfr-data-podium--vertical');
      const kids = [...podium.querySelector('.dsfr-data-podium__item')!.children].map(
        (c) => c.className.split(' ')[0]
      );
      expect(kids).toEqual([
        'dsfr-data-podium__value',
        'dsfr-data-podium__bar-track',
        'dsfr-data-podium__rank',
        'dsfr-data-podium__label-group',
      ]);
    });

    it('pilote la barre en hauteur, pas en largeur', async () => {
      const podium = await mount((p) => {
        p.orientation = 'vertical';
        p.maxItems = 2;
      });
      const fills = [...podium.querySelectorAll('.dsfr-data-podium__bar-fill')] as HTMLElement[];
      expect(fills[0].style.height).toBe('100%');
      expect(fills[1].style.height).toBe('66%');
      expect(fills[0].style.width).toBe('');
    });
  });

  describe('layout="podium" — estrade 2-1-3 (3f)', () => {
    it('garde le DOM dans l’ordre 1, 2, 3', async () => {
      const podium = await mount((p) => {
        p.layout = 'podium';
        p.maxItems = 5;
      });
      const labels = [...podium.querySelectorAll('.dsfr-data-podium__label')].map(
        (e) => e.textContent
      );
      expect(labels).toEqual([
        'Ile-de-France',
        'Auvergne-Rhone-Alpes',
        'Nouvelle-Aquitaine',
        'Hauts-de-France',
        'Occitanie',
      ]);
      const ranks = [...podium.querySelectorAll('.dsfr-data-podium__rank')].map(
        (e) => e.textContent
      );
      expect(ranks).toEqual(['1', '2', '3', '4', '5']);
    });

    it('n’inverse qu’en CSS : order 2 / 1 / 3 sur les trois marches', async () => {
      const podium = await mount((p) => {
        p.layout = 'podium';
        p.maxItems = 5;
      });
      const css = podium.querySelector('style')!.textContent!.replace(/\s+/g, ' ');
      expect(css).toContain(
        '.dsfr-data-podium--podium .dsfr-data-podium__item--step:nth-child(1) { order: 2;'
      );
      expect(css).toContain(
        '.dsfr-data-podium--podium .dsfr-data-podium__item--step:nth-child(2) { order: 1;'
      );
      expect(css).toContain(
        '.dsfr-data-podium--podium .dsfr-data-podium__item--step:nth-child(3) { order: 3;'
      );
    });

    it('garde tous les items dans le meme <ol>, le 4e et au-dela en liste compacte', async () => {
      const podium = await mount((p) => {
        p.layout = 'podium';
        p.maxItems = 5;
      });
      const ol = podium.querySelector('ol')!;
      expect(ol.children).toHaveLength(5);
      const classes = [...ol.children].map((li) =>
        li.className.includes('--step') ? 'step' : 'tail'
      );
      expect(classes).toEqual(['step', 'step', 'step', 'tail', 'tail']);
    });
  });

  describe('exclusivite des vignettes', () => {
    it('avertit une fois quand image-field et icon-field sont poses ensemble', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const podium = await mount((p) => {
        p.imageField = 'logo';
        p.iconField = 'icone';
        p.maxItems = 3;
      });
      const exclusifs = warn.mock.calls.filter((c) => String(c[0]).includes('exclusifs'));
      expect(exclusifs).toHaveLength(1);
      // L'image l'emporte.
      expect(podium.querySelectorAll('img.dsfr-data-podium__image')).toHaveLength(3);
      expect(podium.querySelectorAll('.dsfr-data-podium__icon')).toHaveLength(0);
    });
  });

  /**
   * Garde-fou de la documentation du contraste.
   *
   * Les chiffres de contraste de la pastille sont ecrits a quatre endroits
   * (corps de PR, changeset, JSDoc de `rank`, spec vivante). Ils ont deja ete
   * faux trois fois : la planche de design cite une rampe qui n'est pas celle
   * du composant, et `dsfr-palettes.ts` expose DEUX rampes homonymes —
   * `PALETTE_COLORS.sequentialDescending` (5 tons, celle de dsfr-charts) et
   * `CHOROPLETH_SCALES.sequentialDescending` (9 tons). Le podium importe la
   * SECONDE. Lire la premiere donne un tableau plausible et faux.
   *
   * Ce test fige les couples (couleur servie, encre retenue) et les ratios
   * documentes, en partant de `CHOROPLETH_SCALES` — pas d'une copie. Un
   * changement de palette casse ici, au lieu de faire mentir silencieusement
   * la documentation une quatrieme fois.
   */
  describe('contraste de la pastille — chiffres documentes', () => {
    const BLANC = '#ffffff';
    const GRIS_TITRE = '#161616';

    /** Ratio de contraste WCAG 2.x entre deux couleurs. */
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const arrondi = (n: number) => Math.round(n * 100) / 100;

    it('sert bien les cinq premiers tons de CHOROPLETH_SCALES, pas ceux de PALETTE_COLORS', async () => {
      const podium = await mount((p) => (p.maxItems = 5));
      const servies = (podium as unknown as { _processItems(): { color: string }[] })
        ._processItems()
        .map((i) => i.color);

      expect(servies).toEqual(CHOROPLETH_SCALES['sequentialDescending'].slice(0, 5));
      // Le tableau documente, verrouille en clair.
      expect(servies).toEqual(['#000091', '#2323B4', '#4747E5', '#6A6AF4', '#8585F6']);
      // Et surtout : ce n'est PAS la rampe a 5 tons de PALETTE_COLORS.
      expect(servies).not.toEqual(PALETTE_COLORS.sequentialDescending);
    });

    it('fige les cinq couples (couleur, encre retenue)', async () => {
      const podium = await mount((p) => {
        p.rank = 'medal';
        p.maxItems = 5;
      });
      const couples = [...podium.querySelectorAll('.dsfr-data-podium__rank--medal')].map((e) => {
        const li = e.closest('li') as HTMLElement;
        return [
          li.style.getPropertyValue('--podium-color').trim(),
          e.className.includes('--ink-light') ? 'blanc' : 'gris',
        ];
      });

      expect(couples).toEqual([
        ['#000091', 'blanc'],
        ['#2323B4', 'blanc'],
        ['#4747E5', 'blanc'],
        ['#6A6AF4', 'gris'],
        ['#8585F6', 'gris'],
      ]);
    });

    it('fige les ratios documentes, et le point bas au rang 4', () => {
      const rampe = CHOROPLETH_SCALES['sequentialDescending'].slice(0, 5);
      const table = rampe.map((c) => ({
        blanc: arrondi(ratio(c, BLANC)),
        gris: arrondi(ratio(c, GRIS_TITRE)),
      }));

      expect(table).toEqual([
        { blanc: 14.91, gris: 1.21 },
        { blanc: 10.65, gris: 1.7 },
        { blanc: 6.36, gris: 2.84 },
        { blanc: 4.22, gris: 4.29 },
        { blanc: 3.14, gris: 5.76 },
      ]);

      // L'encre retenue est toujours la meilleure des deux.
      const retenus = table.map((t) => Math.max(t.blanc, t.gris));
      expect(retenus).toEqual([14.91, 10.65, 6.36, 4.29, 5.76]);

      // Le point bas est le RANG 4 (#6A6AF4), pas un autre.
      const pire = Math.min(...retenus);
      expect(pire).toBe(4.29);
      expect(retenus.indexOf(pire) + 1).toBe(4);

      // Sous AA texte normal, au-dessus de AA texte large. A dire, pas a cacher.
      expect(pire).toBeLessThan(4.5);
      expect(pire).toBeGreaterThan(3);
    });

    it('bascule blanc → gris entre le rang 3 et le rang 4', () => {
      const rampe = CHOROPLETH_SCALES['sequentialDescending'].slice(0, 5);
      const encres = rampe.map((c) => (ratio(c, BLANC) >= ratio(c, GRIS_TITRE) ? 'blanc' : 'gris'));
      expect(encres).toEqual(['blanc', 'blanc', 'blanc', 'gris', 'gris']);
      // Trois rangs en blanc sur cette rampe.
      expect(encres.filter((e) => e === 'blanc')).toHaveLength(3);
    });
  });

  describe('relativeLuminance', () => {
    it('classe la rampe sequentialDescending du plus sombre au plus clair', () => {
      const l = CHOROPLETH_SCALES['sequentialDescending'].slice(0, 5).map(relativeLuminance);
      expect(l).toEqual([...l].sort((a, b) => a - b));
    });

    it('rend 0 pour une chaine qui n’est pas un #rrggbb', () => {
      expect(relativeLuminance('rouge')).toBe(0);
    });
  });

  describe('defauts', () => {
    it('les nouveaux attributs ont les defauts annonces', () => {
      const p = new DsfrDataPodium();
      expect(p.rank).toBe('number');
      expect(p.orientation).toBe('horizontal');
      expect(p.layout).toBe('list');
      expect(p.bar).toBe('proportional');
      expect(p.barPosition).toBe('inline');
      expect(p.border).toBe('left');
      expect(p.imageShape).toBe('square');
      expect(p.square).toBe(false);
      expect(p.rounded).toBe(false);
    });
  });
});
