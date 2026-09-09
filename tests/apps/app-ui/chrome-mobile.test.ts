import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { injectAppHeaderStyles } from '../../../packages/app-ui/src/app-header.js';
import { injectAppActionBarStyles } from '../../../packages/app-ui/src/app-action-bar.js';
import { injectAppDiagnosticStyles } from '../../../packages/app-ui/src/app-diagnostic-panel.js';
import { STACK_MAX_PX, PINNED } from '../../../packages/app-ui/src/chrome-breakpoints.js';

/**
 * Le chrome partage sur telephone (#signalement « barre de titre sticky »).
 *
 * CE FICHIER EXISTE A CAUSE D'UNE VALEUR DERIVEE SANS GARDE.
 * `app-action-bar` s'epinglait a `top: var(--app-header-h, 0px)` SANS media
 * query, alors que l'en-tete n'est epingle qu'au-dessus d'un seuil et que sa
 * hauteur est publiee inconditionnellement. Sur telephone la barre de titre
 * restait donc clouee a 189 px du haut pendant que son referent sortait de
 * l'ecran : 189 px de contenu defilaient AU-DESSUS d'elle.
 *
 * `docs/ux/actions.md` exigeait pourtant l'inverse, mot pour mot : « Le titre
 * (et la zone contexte) restent en haut, dans le flux. » La specification
 * etait juste, c'est le code qui s'en ecartait — et rien ne le verifiait.
 *
 * L'invariant a tenir : `--app-header-h` est inconditionnel en HAUTEUR, mais
 * en DECALAGE D'EPINGLAGE (`top:`) il est derive et doit porter `PINNED`.
 */

const RACINE = join(__dirname, '../../..');
const lire = (p: string) => readFileSync(join(RACINE, p), 'utf-8');

/** La feuille injectee sous cet id, une fois l'injecteur appele. */
function feuille(injecteur: () => void, id: string): string {
  document.getElementById(id)?.remove();
  injecteur();
  const el = document.getElementById(id);
  expect(el, `feuille ${id} non injectee`).not.toBeNull();
  return el!.textContent ?? '';
}

/**
 * Le CSS prive de ses commentaires.
 *
 * Indispensable avant toute analyse par appariement d'accolades : un
 * commentaire qui en contient une desequilibre la pile et fait rendre `null`
 * a `conditionEnglobante`, silencieusement. Les commentaires de ces feuilles
 * expliquent precisement les invariants qu'on verifie ici — ils sont donc
 * denses et pleins de ponctuation.
 */
function sansCommentaires(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Le CSS prive de tous ses blocs @… — c'est-a-dire ses regles racine. */
function reglesRacine(brut: string): string {
  const css = sansCommentaires(brut);
  let sortie = '';
  let i = 0;
  while (i < css.length) {
    if (css[i] === '@') {
      // Sauter la regle @ en entier, accolades appariees.
      const ouvrante = css.indexOf('{', i);
      if (ouvrante === -1) break;
      let profondeur = 1;
      let j = ouvrante + 1;
      while (j < css.length && profondeur > 0) {
        if (css[j] === '{') profondeur++;
        else if (css[j] === '}') profondeur--;
        j++;
      }
      i = j;
      continue;
    }
    sortie += css[i];
    i++;
  }
  return sortie;
}

/** La condition du @media qui contient `aiguille`, ou null si elle est a la racine. */
function conditionEnglobante(brut: string, aiguille: string): string | null {
  const css = sansCommentaires(brut);
  const cible = css.indexOf(aiguille);
  if (cible === -1) return null;
  // Balayage AVANT en pile : a chaque `{` on empile l'en-tete de bloc, a
  // chaque `}` on depile. Quand on atteint la cible, le @media le plus proche
  // encore empile est celui qui l'englobe.
  const pile: string[] = [];
  let debutEntete = 0;
  for (let i = 0; i < cible; i++) {
    if (css[i] === '{') {
      pile.push(css.slice(debutEntete, i).trim());
      debutEntete = i + 1;
    } else if (css[i] === '}') {
      pile.pop();
      debutEntete = i + 1;
    }
  }
  for (let i = pile.length - 1; i >= 0; i--) {
    if (pile[i].startsWith('@media')) return pile[i].replace('@media', '').trim();
  }
  return null;
}

describe('l’ancrage derive porte la garde de son referent', () => {
  it('la barre d’actions n’est PAS epinglee a la racine', () => {
    // T1 — mutation : remettre
    // `app-action-bar{display:block;position:sticky;top:var(--app-header-h,0px);z-index:700}`
    // a la racine de la feuille.
    const racine = reglesRacine(feuille(injectAppActionBarStyles, 'app-action-bar-style'));
    const hote = /(?:^|\})\s*app-action-bar\s*\{([^}]*)\}/.exec(racine);

    expect(hote, 'regle d’hote introuvable').not.toBeNull();
    expect(hote![1], 'epinglage sans garde').not.toContain('position:sticky');
    expect(hote![1], 'decalage derive sans garde').not.toContain('--app-header-h');
    expect(hote![1], 'z-index inerte sur un element static').not.toContain('z-index');
  });

  it('l’en-tete et la barre s’epinglent au MEME seuil', () => {
    // T2 — mutation : corriger un seuil et pas l'autre (remettre 48em dans
    // l'en-tete, ou passer la barre a 62em). L'ancrage se retrouverait sans
    // referent dans une bande de largeurs.
    const enTete = feuille(injectAppHeaderStyles, 'app-header-active-style');
    const barre = feuille(injectAppActionBarStyles, 'app-action-bar-style');

    expect(conditionEnglobante(enTete, 'app-header{position:sticky')).toBe(PINNED);
    expect(conditionEnglobante(barre, 'app-action-bar{position:sticky')).toBe(PINNED);
  });

  it('le seuil d’epinglage est celui de l’empilement des colonnes', () => {
    // T3 — mutation : changer STACK_MAX_PX sans toucher le litteral du layout
    // (ou l'inverse). Les colonnes s'empileraient a une largeur ou quelque
    // chose est encore epingle en haut.
    const layout = lire('packages/app-ui/src/app-layout-builder.ts');

    expect(layout, 'le litteral du layout a derive du seuil partage').toContain(
      `(max-width: ${STACK_MAX_PX}px)`
    );
    expect(PINNED).toBe(`(min-width: ${STACK_MAX_PX + 0.02}px)`);
  });
});

describe('l’en-tete rend le haut de l’ecran sur telephone', () => {
  const source = lire('packages/app-ui/src/app-header.ts').replace(/\s+/g, ' ');

  it('la tagline est masquee par les utilitaires DSFR', () => {
    // T4 — mutation : retirer `fr-hidden` (la tagline revient sur telephone)
    // ou la remplacer par un @media maison a un quatrieme seuil.
    expect(source).toContain('class="fr-header__service-tagline fr-hidden fr-unhidden-lg"');
  });

  it('le badge de statut vit dans le TITRE, pas dans la tagline', () => {
    // T5 — mutation : redescendre le badge dans la tagline. Elle redeviendrait
    // non masquable sans perdre le signal « outil en evolution », et les 48 px
    // reviendraient. Regression aujourd'hui SILENCIEUSE : aucun controle
    // visuel de bureau ne broncherait.
    const titre = /fr-header__service-title[^]*?<\/p>/.exec(source);
    expect(titre, 'titre de service introuvable').not.toBeNull();
    expect(titre![0], 'le badge a quitte le titre').toContain('fr-badge');

    const tagline = /fr-header__service-tagline[^>]*>/.exec(source);
    expect(tagline![0], 'mise en page artisanale reintroduite').not.toContain('style=');
  });

  it('le numero de version ne pollue pas le nom accessible du lien d’accueil', () => {
    // Le titre est DANS le <a> : son contenu devient le nom accessible du lien,
    // sur chaque page de chaque app.
    const titre = /fr-header__service-title[^]*?<\/p>/.exec(source)![0];

    expect(titre).toContain('aria-hidden="true"');
  });
});

describe('le mobilier bas ne se recouvre pas', () => {
  it('la raison de desactivation s’empile AU-DESSUS du rail', () => {
    // T6 — mutation : supprimer la regle. `.app-action-bar__reason` est fixe
    // dans la meme bande que le rail et peint a 800 ; depuis que la barre
    // d'actions n'est plus un contexte d'empilement en mobile, elle
    // recouvrirait le bouton du rail et le rendrait inatteignable.
    const css = feuille(injectAppDiagnosticStyles, 'app-diagnostic-panel-style');
    const mobile = /@media \(max-width:47\.99em\)\{([^]*?)\n\}/.exec(css);

    expect(mobile, 'bloc mobile introuvable').not.toBeNull();
    const regle = /\.app-action-bar__reason\{([^}]*)\}/.exec(mobile![1]);
    expect(regle, 'la raison n’est pas reempilee').not.toBeNull();
    expect(regle![1]).toContain('--app-action-bar-fixed-h');
    expect(regle![1]).toContain('--app-diagnostic-h');
  });
});
