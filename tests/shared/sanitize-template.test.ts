/**
 * Filtre du gabarit de popup ecrit par le modele (#1109), devenu le nettoyeur
 * de HTML de la bibliotheque (#1289) : chaque vecteur est retire, un gabarit
 * sain ressort a l'identique.
 */
import { describe, it, expect } from 'vitest';
import {
  nettoyerGabarit,
  urlInterdite,
} from '../../packages/shared/src/dashboard/sanitize-template';

describe('nettoyerGabarit — gabarits sains inchanges', () => {
  it.each([
    '{nom} — {montant} €',
    '<strong>{nom}</strong><br/><p class="fr-text--sm">{adresse}</p>',
    '<a class="fr-link" href="https://exemple.fr/{id}" target="_blank">Fiche</a>',
    '<a href="/fiche/{id}">relatif</a> <a href="mailto:{mail}">écrire</a>',
    '<img src=\'https://exemple.fr/{picto}.png\' alt="{nom}">',
    '<ul><li>{a}</li><li>{b}</li></ul>',
    'Seuil < 5 et {x} > 2',
    '<table class="fr-table"><tr><th>Ville</th><td>{Ville}</td></tr></table>',
  ])('%s', (sain) => {
    expect(nettoyerGabarit(sain)).toBe(sain);
  });
});

describe('nettoyerGabarit — vecteurs retires', () => {
  it.each([
    ['script', '{a}<script>alert(1)</script>{b}', '{a}{b}'],
    ['script en majuscules', '{a}<SCRIPT src=x></SCRIPT >{b}', '{a}{b}'],
    ['script non ferme : tout le reste part', '{a}<script>alert(1)', '{a}'],
    ['iframe', '<iframe src="https://x"></iframe>{a}', '{a}'],
    ['object', '<object data="x.swf"><param name=a></object>{a}', '{a}'],
    ['embed', '<embed src="x.swf">{a}', '{a}'],
    ['style', '<style>body{display:none}</style>{a}', '{a}'],
    ['meta refresh', '<meta http-equiv="refresh" content="0;url=https://x">{a}', '{a}'],
    ['base', '<base href="https://x/">{a}', '{a}'],
    ['link', '<link rel="stylesheet" href="https://x/a.css">{a}', '{a}'],
    ['template', '<template><img src=x onerror=a()></template>{a}', '{a}'],
    ['onerror', '<img src="x.png" onerror="alert(1)" alt="{a}">', '<img src="x.png" alt="{a}">'],
    ['onclick sans guillemets', '<b onclick=alert(1)>{a}</b>', '<b>{a}</b>'],
    ['OnMouseOver', '<b OnMouseOver="x()">{a}</b>', '<b>{a}</b>'],
    ['href javascript:', '<a href="javascript:alert(1)">{a}</a>', '<a>{a}</a>'],
    ['href JaVaScRiPt: espacé', '<a href=" \tJaVa\nScRiPt:alert(1)">{a}</a>', '<a>{a}</a>'],
    ['href par entités', '<a href="&#106;avascript&colon;alert(1)">{a}</a>', '<a>{a}</a>'],
    ['href hexadécimal', '<a href="&#x6A;avascript:x">{a}</a>', '<a>{a}</a>'],
    ['src data:', '<img src="data:text/html;base64,AAAA" alt="{a}">', '<img alt="{a}">'],
    ['vbscript:', "<a href='vbscript:x'>{a}</a>", '<a>{a}</a>'],
    ['commentaire', '{a}<!-- <script>x</script> -->{b}', '{a}{b}'],
    ['déclaration', '<!DOCTYPE html>{a}', '{a}'],
  ])('%s', (_nom, entree, attendu) => {
    expect(nettoyerGabarit(entree)).toBe(attendu);
  });

  it('un gabarit piege dans les donnees ne laisse ni script, ni on*, ni javascript:', () => {
    const piege =
      '<div onmouseover="x()"><scr<script>ipt>alert(1)</script><a href="javascript:x">{v}</a></div>';
    const net = nettoyerGabarit(piege).toLowerCase();
    expect(net).not.toContain('<script');
    expect(net).not.toContain('onmouseover');
    expect(net).not.toContain('javascript:');
    expect(net).toContain('{v}');
  });
});

/**
 * #1289 — contournements MESURES dans Chromium avant correction (la charge
 * s'executait apres `nettoyerGabarit` + `innerHTML`). Le rendu reel est
 * rejoue sur le vrai DSFR Chart par `e2e/chart-cadre-html.spec.ts` ; ici, la
 * forme de la sortie.
 */
describe('nettoyerGabarit — contournements fermes (#1289)', () => {
  const X = 'alert(1)';

  it.each(['textarea', 'title', 'xmp', 'noembed', 'noframes', 'noscript', 'plaintext'])(
    'element a texte brut <%s> : sa fermeture cachee dans un attribut ne libere rien',
    (el) => {
      const net = nettoyerGabarit(
        `<${el}><a title="</${el}><img src=x onerror=${X}>">x</a></${el}>`
      );
      expect(net).not.toContain('onerror');
      expect(net.toLowerCase()).not.toContain(`<${el}`);
    }
  );

  it.each([
    ['nom d’attribut en « = »', `<a ="><img src=x onerror=${X}>">x</a>`],
    ['« /= »', `<a /="><img src=x onerror=${X}>">x</a>`],
    ['« = » colle a une valeur', `<a title="a"="><img src=x onerror=${X}>">x</a>`],
  ])('%s : la balise se ferme ou le navigateur la ferme', (_nom, brut) => {
    expect(nettoyerGabarit(brut)).not.toContain('onerror');
  });

  it.each([
    ['decimale sans point-virgule', `<a href="&#106avascript:${X}">x</a>`],
    ['decimale sans point-virgule, un plus loin', `<a href="&#106avascript:${X};">x</a>`],
    ['hexadecimale sans point-virgule', `<a href="&#x6A&#x61vascript:${X}">x</a>`],
    ['deux-points en reference', `<a href="javascript&#58${X}">x</a>`],
    ['zeros de tete', `<a href="&#0000106;avascript:${X}">x</a>`],
  ])('reference numerique — %s', (_nom, brut) => {
    expect(nettoyerGabarit(brut)).toBe('<a>x</a>');
  });

  it('une reference hors d’Unicode ne leve pas', () => {
    expect(() => nettoyerGabarit('<a href="&#99999999999;x">a</a>')).not.toThrow();
    expect(() => urlInterdite('&#x110000;javascript:x')).not.toThrow();
    expect(nettoyerGabarit('<a href="&#99999999999;x">a</a>')).toBe(
      '<a href="&#99999999999;x">a</a>'
    );
  });

  it.each([
    [
      'animate',
      `<svg><a><animate attributeName="href" values="javascript:${X}" /><text>x</text></a></svg>`,
    ],
    [
      'set',
      `<svg><a><set attributeName="href" to="javascript:${X}"></set><text>x</text></a></svg>`,
    ],
  ])('animation SVG <%s> : retiree', (_nom, brut) => {
    expect(nettoyerGabarit(brut)).toBe('<svg><a><text>x</text></a></svg>');
  });

  it.each([
    ['« < » devant un element retire', `<<script></script>img src=x onerror=${X}>`],
    ['« < » devant un commentaire', `<<!---->img src=x onerror=${X}>`],
    ['« < » devant un element vide retire', `<<meta>img src=x onerror=${X}>`],
    ['« </ » devant un element retire', `</<style></style>img src=x onerror=${X}>`],
    ['imbrique', `<<!---->script>${X}<<!---->/script><<<!---->!---->img src=x onerror=${X}>`],
  ])('recollement — %s : aucune balise ne se reforme', (_nom, brut) => {
    const net = nettoyerGabarit(brut);
    expect(net).not.toMatch(/<img|<script/i);
    // Point fixe : ce qui sort n'est plus retouche.
    expect(nettoyerGabarit(net)).toBe(net);
  });

  it('recollement de deux attributs autour d’un attribut retire', () => {
    expect(nettoyerGabarit(`<img src=x o onx="1"nerror=${X}>`)).toBe(`<img src=x o nerror=${X}>`);
    expect(nettoyerGabarit(`<img src=x o onx='1'nerror=${X}>`)).not.toMatch(/\sonerror/);
  });

  it('empilement de chevrons et de commentaires : aucune balise ne se reforme, sortie stable', () => {
    const etages = 40;
    const piege = `${'<'.repeat(etages)}${'!---->'.repeat(etages)}img src=x onerror=${X}>`;
    const net = nettoyerGabarit(piege);
    expect(net).not.toMatch(/<img|<!--/i);
    expect(nettoyerGabarit(net)).toBe(net);
  });

  it('idempotent sur les sorties, y compris celles des vecteurs', () => {
    for (const brut of [
      '<img src="x.png" onerror="alert(1)" alt="{a}">',
      '<div onmouseover="x()"><scr<script>ipt>alert(1)</script><a href="javascript:x">{v}</a></div>',
      '<textarea></textarea><p>a</p>',
    ]) {
      const net = nettoyerGabarit(brut);
      expect(nettoyerGabarit(net)).toBe(net);
    }
  });

  it.each([
    'prix<seuil',
    'm<sup>2</sup>',
    '< 5 ans & plus',
    'a << b',
    '<p>Voir <a href="https://exemple.fr/?a=1&amp;b=2">la méthode</a>.</p>',
    '<details><summary>Plus</summary><p>…</p></details>',
  ])('texte et HTML simples inchanges : %s', (sain) => {
    expect(nettoyerGabarit(sain)).toBe(sain);
  });

  /**
   * Ce que le filtre laisse passer, ecrit pour etre LU (docs/SECURITY.md) : il
   * retire ce qui s'execute, pas ce qui trompe. Si l'un de ces cas change, la
   * section de SECURITY.md change avec lui.
   */
  it('limites connues : formulaire vers un tiers, style et id restent ; image data: retiree', () => {
    const formulaire =
      '<form action="https://tiers.example/vol"><input name="mdp"><button>ok</button></form>';
    expect(nettoyerGabarit(formulaire)).toBe(formulaire);
    expect(
      nettoyerGabarit(
        '<form action="javascript:x"><button formaction="javascript:y">ok</button></form>'
      )
    ).toBe('<form><button>ok</button></form>');
    const style = '<div id="dsfr" style="position:fixed;inset:0">x</div>';
    expect(nettoyerGabarit(style)).toBe(style);
    expect(nettoyerGabarit('<img alt="i" src="data:image/gif;base64,R0lGOD">')).toBe(
      '<img alt="i">'
    );
  });
});

describe('urlInterdite', () => {
  it('lit le schema malgre la casse, les controles et les entites', () => {
    expect(urlInterdite('javascript:x')).toBe(true);
    expect(urlInterdite('  DATA:text/html,x')).toBe(true);
    expect(urlInterdite('java\u0000script:x')).toBe(true);
    expect(urlInterdite('https://exemple.fr/?q=javascript:')).toBe(false);
    expect(urlInterdite('/relatif')).toBe(false);
  });
});
