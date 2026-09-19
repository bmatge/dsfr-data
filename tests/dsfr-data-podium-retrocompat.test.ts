import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { DsfrDataPodium } from '@/components/dsfr-data-podium.js';
import { clearDataCache, dispatchDataLoaded } from '@/utils/data-bridge.js';

/**
 * Retrocompatibilite des evolutions cosmetiques du podium.
 *
 * Les deux temoins de ce fichier ont ete captures sur `origin/main` (commit
 * a950e9d, version 0.33.x) AVANT le changement, par le meme scenario que le
 * test ci-dessous :
 *  - `fixtures/podium-dom-avant-0.34.html` : le DOM rendu, marqueurs Lit
 *    (commentaires `<!--?lit$…-->`, dont le hash depend du gabarit) retires
 *    et espaces inter-balises normalises ;
 *  - `fixtures/podium-styles-avant-0.34.css` : la feuille injectee, telle
 *    quelle.
 *
 * La propriete demontree : sans aucun des attributs neufs, le rendu est
 * identique a l'ancien, a l'exception unique des arrondis (`square` devenu
 * le defaut).
 */

const FIXTURES = process.cwd() + '/tests/fixtures/';

/**
 * Re-serialise un arbre en ignorant deux choses qui ne sont pas du rendu :
 * les marqueurs de gabarit Lit (commentaires, dont le hash depend du
 * template) et l'ORDRE des attributs (Lit pose les attributs lies apres les
 * attributs statiques ; `class="a" role="b"` et `role="b" class="a"` sont le
 * meme element). Tout le reste — balises, attributs, valeurs, texte, ordre
 * des noeuds — est compare a l'identique.
 */
function serialize(node: Node): string {
  if (node.nodeType === Node.COMMENT_NODE) return '';
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent || '').replace(/\s+/g, ' ');
  const el = node as Element;
  const attrs = [...el.attributes]
    .map((a) => `${a.name}="${a.value}"`)
    .sort()
    .join(' ');
  const inner = [...el.childNodes].map(serialize).join('');
  return `<${el.tagName.toLowerCase()}${attrs ? ' ' + attrs : ''}>${inner}</${el.tagName.toLowerCase()}>`;
}

const normalize = (html: string) => {
  const host = document.createElement('div');
  host.innerHTML = html;
  return serialize(host.firstElementChild!).replace(/>\s+</g, '><').trim();
};

/** Decoupe naive d'une feuille en { selecteur -> { propriete -> valeur } }. */
function parseRules(css: string): Map<string, Map<string, string>> {
  const rules = new Map<string, Map<string, string>>();
  for (const block of css.split('}')) {
    const [rawSelector, body] = block.split('{');
    if (!body) continue;
    const decls = new Map<string, string>();
    for (const decl of body.split(';')) {
      const idx = decl.indexOf(':');
      if (idx === -1) continue;
      decls.set(decl.slice(0, idx).trim(), decl.slice(idx + 1).trim());
    }
    // Les selecteurs multi-lignes sont normalises sur une ligne.
    rules.set(rawSelector.replace(/\s+/g, ' ').trim(), decls);
  }
  return rules;
}

async function renderDefaultPodium(): Promise<DsfrDataPodium> {
  clearDataCache('retro-podium');
  const podium = new DsfrDataPodium();
  podium.source = 'retro-podium';
  podium.labelField = 'nom';
  podium.valueField = 'population';
  podium.subtitle = 'Region';
  podium.valueUnit = 'hab.';
  podium.maxItems = 3;
  document.body.appendChild(podium);
  podium.connectedCallback();
  dispatchDataLoaded('retro-podium', [
    { nom: 'Ile-de-France', population: 12271794 },
    { nom: 'Auvergne-Rhone-Alpes', population: 8092834 },
    { nom: 'Nouvelle-Aquitaine', population: 6109841 },
  ]);
  await podium.updateComplete;
  return podium;
}

describe('dsfr-data-podium — retrocompatibilite (0.33 -> 0.34)', () => {
  let avantDom: string;
  let avantCss: string;

  beforeEach(() => {
    avantDom = normalize(readFileSync(FIXTURES + 'podium-dom-avant-0.34.html', 'utf8').trim());
    avantCss = readFileSync(FIXTURES + 'podium-styles-avant-0.34.css', 'utf8');
  });

  it('rend, sans aucun attribut neuf, exactement le DOM d’avant', async () => {
    const podium = await renderDefaultPodium();
    const apres = normalize(podium.querySelector('ol')!.outerHTML);
    podium.remove();

    expect(apres).toBe(avantDom);
  });

  it('ne pose aucune classe supplementaire sur la liste par defaut', async () => {
    const podium = await renderDefaultPodium();
    const classes = podium.querySelector('ol')!.className;
    podium.remove();

    expect(classes).toBe('dsfr-data-podium');
  });

  it('ne change, dans les regles deja presentes, que le border-radius', async () => {
    const podium = await renderDefaultPodium();
    const apresCss = podium.querySelector('style')!.textContent || '';
    podium.remove();

    const avant = parseRules(avantCss);
    const apres = parseRules(apresCss);

    const differences: string[] = [];
    for (const [selector, declsAvant] of avant) {
      const declsApres = apres.get(selector);
      expect(declsApres, `regle disparue : ${selector}`).toBeDefined();
      const props = new Set([...declsAvant.keys(), ...declsApres!.keys()]);
      for (const prop of props) {
        if (declsAvant.get(prop) !== declsApres!.get(prop)) {
          differences.push(`${selector} { ${prop} }`);
        }
      }
    }

    // La seule difference tolereee : les arrondis.
    expect(differences.every((d) => d.includes('border-radius'))).toBe(true);
    expect(differences).toEqual([
      '.dsfr-data-podium__item { border-radius }',
      '.dsfr-data-podium__bar-track { border-radius }',
      '.dsfr-data-podium__bar-fill { border-radius }',
    ]);
  });

  it('n’ajoute que des regles portees par une classe neuve', async () => {
    const podium = await renderDefaultPodium();
    const apresCss = podium.querySelector('style')!.textContent || '';
    podium.remove();

    const avant = parseRules(avantCss);
    const nouvelles = [...parseRules(apresCss).keys()].filter((s) => !avant.has(s));

    const porteeNeuve = /dsfr-data-podium--|__image|__picto|__icon|__rank--|__item--|data-fr-theme/;
    const fuites = nouvelles.filter((s) => !porteeNeuve.test(s));
    expect(fuites).toEqual([]);
  });

  it('retablit les arrondis d’avant avec `rounded`', async () => {
    const podium = await renderDefaultPodium();
    podium.rounded = true;
    await podium.updateComplete;
    const css = podium.querySelector('style')!.textContent || '';
    const classes = podium.querySelector('ol')!.className;
    podium.remove();

    expect(classes).toContain('dsfr-data-podium--rounded');
    expect(css).toContain('.dsfr-data-podium--rounded .dsfr-data-podium__item');
  });

  it('`square` l’emporte sur `rounded`', async () => {
    const podium = await renderDefaultPodium();
    podium.rounded = true;
    podium.square = true;
    await podium.updateComplete;
    const classes = podium.querySelector('ol')!.className;
    podium.remove();

    expect(classes).not.toContain('dsfr-data-podium--rounded');
  });
});
