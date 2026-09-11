import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'etat vide du panneau d'apercu (#629).
 *
 * CE FICHIER EXISTE A CAUSE D'UNE COLLISION DE SPECIFICITE.
 * `app-preview-panel` rend en LIGHT DOM : sa feuille et celle de l'app
 * s'affrontent reellement, sans frontiere d'ombre pour les separer. Sa regle
 * `.preview-panel-tab-content .empty-state` (0-2-0) l'emportait sur le
 * `.empty-state` du Studio (0-1-0) et sortait l'etat vide du flux
 * (`position: absolute`). Comme l'iframe d'apercu est `hidden` tant qu'aucun
 * document n'est charge, plus rien ne tendait le conteneur : le panneau droit
 * du Studio tombait a ~96 px de haut.
 *
 * Deux invariants a tenir :
 *  1. l'etat vide est un ITEM FLEX QUI GRANDIT, pas un overlay — et son
 *     conteneur est bien une colonne flex, sinon `flex: 1` reste inerte ;
 *  2. aucune app ne style les classes internes du panneau (meme doctrine que
 *     #613 pour `app-layout-builder`) : une surcharge app-side qui perd la
 *     bataille de specificite est un bug qui ne se voit pas.
 */

const RACINE = join(__dirname, '../../..');
const lire = (p: string) => readFileSync(join(RACINE, p), 'utf-8');
const sansCommentaires = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Corps de la premiere regle dont le selecteur est exactement `selecteur`. */
function regle(css: string, selecteur: string): string {
  const nettoye = sansCommentaires(css);
  for (const m of nettoye.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1].replace(/\s+/g, ' ').trim() === selecteur) return m[2].replace(/\s+/g, ' ').trim();
  }
  throw new Error(`regle introuvable : ${selecteur}`);
}

/**
 * Classes que `app-preview-panel` style lui-meme sous
 * `.preview-panel-tab-content` : elles sont a lui, pas aux apps.
 */
const INTERNES = [
  'preview-panel',
  'preview-panel-tab-content',
  'preview-panel-aside',
  'preview-chart',
  'chart-wrapper',
  'chart-container',
  'empty-state',
  'preview-title',
  'preview-subtitle',
  'code-output',
];

/** Les apps qui montent reellement le panneau — la liste ne se maintient pas a la main. */
function appsAvecPanneau(): string[] {
  return readdirSync(join(RACINE, 'apps'))
    .filter((app) => existsSync(join(RACINE, 'apps', app, 'index.html')))
    .filter((app) => lire(`apps/${app}/index.html`).includes('<app-preview-panel'));
}

/** Selecteurs d'une feuille app-side, commentaires et blocs @… aplatis. */
function selecteurs(chemin: string): string[] {
  const css = sansCommentaires(lire(chemin));
  return [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].map((m) => m[1].replace(/\s+/g, ' ').trim());
}

describe('l’etat vide grandit au lieu de flotter', () => {
  const source = lire('packages/app-ui/src/app-preview-panel.ts');

  it('rend en light DOM — c’est ce qui rend la collision possible', () => {
    // T0 — mutation : retirer `createRenderRoot`. Le composant repasserait en
    // shadow DOM, sa feuille cesserait de dialoguer avec celles des apps, et
    // les trois tests suivants perdraient leur raison d'etre.
    expect(source).toContain("@customElement('app-preview-panel')");
    expect(source, 'sans light DOM, plus de cascade partagee').toContain('createRenderRoot()');
  });

  it('l’etat vide est un item flex, pas un overlay', () => {
    // T1 — mutation : remettre `position: absolute; inset: 0`. L'etat vide
    // ressort du flux et le conteneur s'effondre des que l'iframe est hidden.
    const corps = regle(source, '.preview-panel-tab-content .empty-state');

    expect(corps, 'l’etat vide est ressorti du flux').not.toContain('position: absolute');
    expect(corps, 'inset n’a de sens que sur un element positionne').not.toContain('inset:');
    expect(corps, 'sans flex-grow il ne tend plus rien').toContain('flex: 1');
    expect(corps).toContain('min-height: 300px');
  });

  it('le conteneur du graphique est une colonne flex', () => {
    // T2 — mutation : retirer `display: flex` de `.chart-container`. Le
    // `flex: 1` de l'etat vide redevient inerte dans le Builder, seule app a
    // interposer ce conteneur entre `.preview-chart` et l'etat vide.
    const corps = regle(source, '.preview-panel-tab-content .chart-container');

    expect(corps, '`flex: 1` de l’enfant serait inerte').toContain('display: flex');
    expect(corps).toContain('flex-direction: column');
  });

  it('le contenu projete dans l’onglet Apercu est tendu par le panneau', () => {
    // T2bis — mutation : retirer la regle. Le `<div slot="preview">` des apps
    // redevient un bloc a hauteur automatique et coupe la chaine flex AVANT
    // l'etat vide : mesure a 300 px dans un panneau de 614 px (#629).
    const corps = regle(source, ".preview-panel-tab-content[data-tab='preview'] > *");

    expect(corps).toContain('flex: 1');
    expect(corps).toContain('flex-direction: column');
    expect(corps, 'sans min-height: 0 un enfant qui defile deborde').toContain('min-height: 0');

    // La regle vise l'onglet Apercu SEUL : Code et Donnees rendent du texte
    // qui doit defiler, pas s'etirer.
    expect(source).not.toContain(".preview-panel-tab-content[data-tab='code'] > *");
  });

  it('les trois conteneurs d’apercu se comportent pareil', () => {
    // T3 — mutation : diverger l'un des trois. Le meme etat vide se
    // comporterait differemment selon l'app qui l'accueille.
    for (const selecteur of [
      '.preview-panel-tab-content .preview-chart, .preview-panel-tab-content .chart-wrapper',
      '.preview-panel-tab-content .chart-container',
    ]) {
      const corps = regle(source, selecteur);
      expect(corps, `${selecteur} n’est pas une colonne flex extensible`).toContain('flex: 1');
      expect(corps).toContain('flex-direction: column');
    }
  });
});

describe('rien ne squatte la place de l’etat vide', () => {
  it('l’iframe de l’Assistant IA respecte son attribut hidden', () => {
    // T5 — mutation : retirer `.preview-frame[hidden]`. Le `display: block`
    // de la regle de base bat l'attribut `hidden` : l'iframe vide reprend ses
    // 420 px et ecrase le message d'accueil a sa hauteur minimale (#629).
    const css = sansCommentaires(lire('apps/builder-ia/src/styles/builder-ia.css')).replace(
      /\s+/g,
      ' '
    );

    expect(css, 'display: block bat hidden sans garde').toContain(
      '.preview-frame[hidden] { display: none; }'
    );
  });

  it('l’etat vide respecte son propre attribut hidden', () => {
    // T6 — mutation : retirer `.empty-state[hidden]`. Le `display: flex` de la
    // regle de base est une regle d'AUTEUR : il bat le `[hidden] { display:
    // none }` de la feuille du navigateur quelle que soit la specificite.
    // L'etat vide restait alors affiche AU-DESSUS de l'apercu une fois le
    // tableau de bord rendu. La garde posee en #629 ne couvrait que l'iframe ;
    // le meme piege valait pour l'etat vide lui-meme.
    const css = sansCommentaires(lire('packages/app-ui/src/app-preview-panel.ts')).replace(
      /\s+/g,
      ' '
    );

    expect(css, 'display: flex bat hidden sans garde').toContain(
      '.preview-panel-tab-content .empty-state[hidden] { display: none; }'
    );
  });

  it.each(['studio', 'builder-ia'])(
    '%s masque l’etat vide par l’attribut, pas par un style en ligne',
    (app) => {
      // C'est CE choix qui rend la garde CSS indispensable : `el.hidden = true`
      // ne pose aucun style en ligne, il ne peut donc pas battre la feuille du
      // panneau. Le Builder, lui, ecrit `style.display` et masquait par
      // accident — ce qui avait laissé le bug invisible de son cote.
      const source = lire(`apps/${app}/src/ui/preview.ts`);
      expect(source).toMatch(/empty\w*\.hidden\s*=/i);
    }
  );
});

describe('les apps ne stylent plus les classes internes du panneau', () => {
  const apps = appsAvecPanneau();

  it('trois apps montent le panneau', () => {
    // Si une app s'ajoute, elle entre d'office dans le test suivant.
    expect(apps.sort()).toEqual(['builder', 'builder-ia', 'studio']);
  });

  it.each(appsAvecPanneau())('%s ne surcharge aucune classe interne', (app) => {
    // T4 — mutation : remettre `.empty-state { flex: 1; ... }` dans
    // studio.css. La regle perd contre celle du panneau (0-1-0 contre 0-2-0)
    // et donne l'illusion d'un correctif app-side.
    const dossier = join(RACINE, 'apps', app, 'src/styles');
    const feuilles = existsSync(dossier)
      ? readdirSync(dossier).filter((f) => f.endsWith('.css'))
      : [];
    expect(feuilles.length, `aucune feuille trouvee pour ${app}`).toBeGreaterThan(0);

    for (const feuille of feuilles) {
      for (const selecteur of selecteurs(`apps/${app}/src/styles/${feuille}`)) {
        for (const classe of INTERNES) {
          // Frontiere de mot : `.empty-state__bars` et `.empty-state-steps`
          // appartiennent bien a l'app, ce sont ses propres enfants.
          const cible = new RegExp(`\\.${classe}(?![\\w-])`);
          expect(
            cible.test(selecteur),
            `${feuille} : « ${selecteur} » cible .${classe}, classe interne du panneau`
          ).toBe(false);
        }
      }
    }
  });
});
