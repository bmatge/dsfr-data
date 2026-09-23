/**
 * Survol et appui des boutons de l'assistant (#1080).
 *
 * Le DSFR 1.14.4 pose, sous `@media (hover: hover) and (pointer: fine)` :
 *
 *   button:not(:disabled):hover  { background-color: var(--hover-tint); }
 *   button:not(:disabled):active { background-color: var(--active-tint); }
 *
 * avec `button { --hover-tint: var(--hover); --active-tint: var(--active); }`.
 * Spécificité (0,2,1) : un `.assistant-bouton:hover{background-color:…}` (0,2,0)
 * perd, et le bouton bleu passe au gris clair hérité du `--hover` de `body`.
 *
 * La règle retenue : chaque bouton de l'assistant pose ses teintes `--hover` /
 * `--active` sur sa classe (comme `.fr-btn` dans le DSFR), et aucune règle de
 * survol ou d'appui ne pose de fond avec une spécificité inférieure à celle du
 * DSFR. Aucune regex sur la feuille : un analyseur à un seul passage.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { injectAppAssistantStyles } from '../../../packages/app-ui/src/app-assistant.js';

/** Sélecteurs de la règle DSFR 1.14.4 en cause (dist/dsfr.css). */
const SELECTEUR_DSFR_SURVOL = 'button:not(:disabled):hover';
const SELECTEUR_DSFR_APPUI = 'button:not(:disabled):active';

type Specificite = [number, number, number];

interface Regle {
  selecteurs: string[];
  corps: string;
}

/** Retire les commentaires CSS, sans regex. */
function sansCommentaires(css: string): string {
  let sortie = '';
  let i = 0;
  while (i < css.length) {
    const debut = css.indexOf('/*', i);
    if (debut === -1) {
      sortie += css.slice(i);
      break;
    }
    sortie += css.slice(i, debut);
    const fin = css.indexOf('*/', debut + 2);
    i = fin === -1 ? css.length : fin + 2;
  }
  return sortie;
}

/** Règles feuilles (celles des `@media` comprises), en un passage. */
function reglesDe(css: string): Regle[] {
  const texte = sansCommentaires(css);
  const regles: Regle[] = [];
  let tampon = '';
  let prelude = '';
  let feuille = false;
  for (const c of texte) {
    if (c === '{') {
      prelude = tampon.trim();
      tampon = '';
      feuille = true;
    } else if (c === '}') {
      if (feuille && !prelude.startsWith('@')) {
        regles.push({
          selecteurs: prelude.split(',').map((s) => s.trim()),
          corps: tampon.trim(),
        });
      }
      tampon = '';
      feuille = false;
    } else {
      tampon += c;
    }
  }
  return regles;
}

/** Indice de la parenthèse fermante qui répond à celle en `ouvrante`. */
function fermante(s: string, ouvrante: number): number {
  let profondeur = 0;
  for (let i = ouvrante; i < s.length; i++) {
    if (s[i] === '(') profondeur++;
    else if (s[i] === ')') {
      profondeur--;
      if (profondeur === 0) return i;
    }
  }
  return s.length - 1;
}

const estNom = (c: string): boolean =>
  (c >= 'a' && c <= 'z') ||
  (c >= 'A' && c <= 'Z') ||
  (c >= '0' && c <= '9') ||
  c === '-' ||
  c === '_';

/**
 * Spécificité d'un sélecteur simple (Selectors 4) : `:not()`, `:is()` et
 * `:has()` comptent leur argument, `:where()` ne compte rien.
 */
function specificite(selecteur: string): Specificite {
  const r: Specificite = [0, 0, 0];
  let i = 0;
  const lireNom = (): string => {
    const debut = i;
    while (i < selecteur.length && estNom(selecteur[i])) i++;
    return selecteur.slice(debut, i);
  };
  while (i < selecteur.length) {
    const c = selecteur[i];
    if (c === '#') {
      i++;
      lireNom();
      r[0]++;
    } else if (c === '.') {
      i++;
      lireNom();
      r[1]++;
    } else if (c === '[') {
      r[1]++;
      const fin = selecteur.indexOf(']', i);
      i = fin === -1 ? selecteur.length : fin + 1;
    } else if (c === ':') {
      if (selecteur[i + 1] === ':') {
        i += 2;
        lireNom();
        r[2]++;
        continue;
      }
      i++;
      const nom = lireNom();
      if (nom === 'not' || nom === 'is' || nom === 'has') {
        // L'argument est compté par la suite de la boucle ; les parenthèses sont ignorées.
        continue;
      }
      if (nom === 'where' && selecteur[i] === '(') {
        i = fermante(selecteur, i) + 1;
        continue;
      }
      r[1]++;
      if (selecteur[i] === '(') i = fermante(selecteur, i) + 1;
    } else if (estNom(c)) {
      lireNom();
      r[2]++;
    } else {
      i++;
    }
  }
  return r;
}

function auMoins(a: Specificite, b: Specificite): boolean {
  for (let k = 0; k < 3; k++) {
    if (a[k] !== b[k]) return a[k] > b[k];
  }
  return true;
}

/** Valeur d'une déclaration dans un corps de règle (dernière occurrence). */
function valeur(corps: string, propriete: string): string | undefined {
  let trouvee: string | undefined;
  for (const decl of corps.split(';')) {
    const deuxPoints = decl.indexOf(':');
    if (deuxPoints === -1) continue;
    if (decl.slice(0, deuxPoints).trim() === propriete) trouvee = decl.slice(deuxPoints + 1).trim();
  }
  return trouvee;
}

const posePropriete = (corps: string, propriete: string): boolean =>
  valeur(corps, propriete) !== undefined;

const estSurvolOuAppui = (s: string): boolean => s.includes(':hover') || s.includes(':active');

/**
 * Classes `assistant-*` portées par un `<button>` dans le gabarit, lues dans la
 * source (un bouton n'est rendu que dans certains états du panneau).
 */
function classesDeBoutons(source: string): Set<string> {
  const classes = new Set<string>();
  let i = source.indexOf('<button');
  while (i !== -1) {
    const fenetre = source.slice(i, i + 300);
    const fin = fenetre.indexOf('>');
    const balise = fin === -1 ? fenetre : fenetre.slice(0, fin);
    const attr = balise.indexOf('class="');
    if (attr !== -1) {
      const debut = attr + 'class="'.length;
      const valeurClasse = balise.slice(debut, balise.indexOf('"', debut));
      for (const nom of valeurClasse.split(' ')) {
        if (nom.startsWith('assistant-')) classes.add(nom);
      }
    }
    i = source.indexOf('<button', i + 1);
  }
  return classes;
}

let regles: Regle[] = [];
let boutons: Set<string>;

beforeAll(() => {
  document.getElementById('app-assistant-style')?.remove();
  injectAppAssistantStyles();
  regles = reglesDe(document.getElementById('app-assistant-style')!.textContent ?? '');
  const source = readFileSync(
    join(__dirname, '../../../packages/app-ui/src/app-assistant.ts'),
    'utf-8'
  );
  boutons = classesDeBoutons(source);
});

/** Corps des règles non pseudo-classées dont un sélecteur vaut exactement `selecteur`. */
function corpsDe(selecteur: string): string[] {
  return regles.filter((r) => r.selecteurs.includes(selecteur)).map((r) => r.corps);
}

describe('survol et appui des boutons de l’assistant face au DSFR (#1080)', () => {
  it('calcule la spécificité comme le navigateur', () => {
    expect(specificite(SELECTEUR_DSFR_SURVOL)).toEqual([0, 2, 1]);
    expect(specificite(SELECTEUR_DSFR_APPUI)).toEqual([0, 2, 1]);
    expect(specificite('.assistant-bouton:hover')).toEqual([0, 2, 0]);
    expect(specificite('.assistant-bouton:not(:disabled):hover')).toEqual([0, 3, 0]);
    expect(specificite('.assistant-mode-choix button:hover')).toEqual([0, 2, 1]);
    expect(specificite('.a:where(.b, #c)::before')).toEqual([0, 1, 1]);
    expect(auMoins([0, 2, 0], [0, 2, 1])).toBe(false);
  });

  it('l’analyseur voit les boutons du gabarit et les règles de la feuille', () => {
    // Garde de l'outil lui-même : sans ça, un analyseur muet laisserait tout passer.
    expect([...boutons].sort()).toEqual(
      expect.arrayContaining([
        'assistant-bouton',
        'assistant-bouton--secondaire',
        'assistant-envoi',
        'assistant-icone',
        'assistant-lanceur',
        'assistant-onglet',
        'assistant-suggestion',
      ])
    );
    expect(regles.length).toBeGreaterThan(50);
  });

  it('aucune règle de survol ou d’appui ne pose un fond moins spécifique que le DSFR', () => {
    // Mutation : remettre `.assistant-bouton:hover{background-color:…}` → rouge.
    const perdantes: string[] = [];
    const reference = specificite(SELECTEUR_DSFR_SURVOL);
    for (const r of regles) {
      if (!posePropriete(r.corps, 'background-color') && !posePropriete(r.corps, 'background')) {
        continue;
      }
      for (const s of r.selecteurs) {
        if (estSurvolOuAppui(s) && !auMoins(specificite(s), reference)) perdantes.push(s);
      }
    }
    expect(perdantes).toEqual([]);
  });

  it('chaque bouton de l’assistant pose ses teintes --hover et --active sur sa classe', () => {
    // Mutation : retirer `--hover` de `.assistant-envoi{…}` → rouge.
    const cibles = [...[...boutons].map((c) => `.${c}`), '.assistant-mode-choix button'];
    const sansTeinte = cibles.filter((sel) => {
      const corps = corpsDe(sel);
      return !(
        corps.some((c) => posePropriete(c, '--hover')) &&
        corps.some((c) => posePropriete(c, '--active'))
      );
    });
    expect(sansTeinte).toEqual([]);
  });

  it('les boutons bleus survolent en bleu, les autres en gris', () => {
    // Mutation : `.assistant-bouton{--hover:var(--background-default-grey-hover)}` → rouge.
    const bleu = (sel: string): (string | undefined)[] =>
      corpsDe(sel).map((c) => valeur(c, '--hover'));
    for (const sel of ['.assistant-bouton', '.assistant-envoi', '.assistant-lanceur']) {
      expect(bleu(sel), sel).toContain('var(--background-action-high-blue-france-hover)');
      expect(
        corpsDe(sel).map((c) => valeur(c, '--active')),
        sel
      ).toContain('var(--background-action-high-blue-france-active)');
    }
    for (const sel of [
      '.assistant-bouton--secondaire',
      '.assistant-icone',
      '.assistant-suggestion',
      '.assistant-onglet',
      '.assistant-mode-choix button',
    ]) {
      expect(bleu(sel), sel).toContain('var(--background-default-grey-hover)');
    }
  });

  it('l’envoi désactivé (aria-disabled) ne s’allume pas au survol', () => {
    // `aria-disabled` n'est pas `:disabled` : la règle DSFR s'applique encore.
    const corps = corpsDe('.assistant-envoi[aria-disabled="true"]');
    expect(corps.map((c) => valeur(c, '--hover'))).toContain('var(--background-disabled-grey)');
    expect(corps.map((c) => valeur(c, '--active'))).toContain('var(--background-disabled-grey)');
  });
});
