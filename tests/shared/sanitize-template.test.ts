/**
 * Filtre du gabarit de popup ecrit par le modele (#1109) : chaque vecteur est
 * retire, un gabarit sain ressort a l'identique.
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

describe('urlInterdite', () => {
  it('lit le schema malgre la casse, les controles et les entites', () => {
    expect(urlInterdite('javascript:x')).toBe(true);
    expect(urlInterdite('  DATA:text/html,x')).toBe(true);
    expect(urlInterdite('java\u0000script:x')).toBe(true);
    expect(urlInterdite('https://exemple.fr/?q=javascript:')).toBe(false);
    expect(urlInterdite('/relatif')).toBe(false);
  });
});
