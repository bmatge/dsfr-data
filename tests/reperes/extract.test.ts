/**
 * Extracteur de reperes d'interface (#997, ADR-143) : fixtures minimales, une
 * regle par test. Les fonctions testees sont pures (scripts/lib/reperes-extract.ts).
 */
import { describe, expect, it } from 'vitest';

import type { ReperesConfig } from '../../packages/shared/src/ui/reperes-types';
import type { CemManifest } from '../../scripts/lib/cem-reference';
import {
  extraireReperes,
  rendreRegistre,
  reperesCites,
  zoneDe,
  type EntreesExtraction,
  type FichierSource,
} from '../../scripts/lib/reperes-extract';
import {
  DYN,
  fragmentsTs,
  lireElements,
  lireObjetExporte,
  sansCommentairesEnTete,
} from '../../scripts/lib/reperes-lexer';

const MANIFEST: CemManifest = {
  modules: [
    {
      declarations: [
        {
          kind: 'class',
          name: 'DsfrDataMapPopup',
          tagName: 'dsfr-data-map-popup',
          attributes: [
            { name: 'mode', description: 'Mode d’affichage.' },
            { name: 'width', description: 'Largeur du panneau.' },
          ],
        },
      ],
    },
  ],
};

const CONFIG: ReperesConfig = {
  app: 'demo',
  prefixe: 'demo',
  sources: ['index.html', 'src/main.ts'],
  zonesDeReglage: [],
  exceptions: [],
};

const PREREQUIS: FichierSource = {
  chemin: 'apps/demo/src/assistant/prerequis.ts',
  contenu: `
    import type { PrerequisParId } from '@dsfr-data/shared';
    export const PREREQUIS = {
      // l'etat de l'app : une apostrophe dans un commentaire ne casse rien
      'couche-active': {
        message: "Sélectionnez une couche d'abord.",
        repereQuiLeve: 'demo.couches',
        verifier: (e) => e.ok,
      },
      source: { message: 'x', repereQuiLeve: "demo.couches", verifier: () => true },
    } satisfies PrerequisParId;`,
};

const HTML_BASE = `
  <section data-zone="demo.couches" aria-label="Couches"></section>
  <section data-zone="demo.panneau" aria-label="Panneau">
    <label for="mode">Comportement au clic</label>
    <select id="mode" data-repere="demo.panneau.mode" data-attribut="dsfr-data-map-popup:mode"></select>
  </section>`;

function extraire(
  fichiers: Record<string, string>,
  config: Partial<ReperesConfig> = {},
  extra: Partial<EntreesExtraction> = {}
) {
  return extraireReperes({
    config: { ...CONFIG, ...config },
    sources: Object.entries(fichiers).map(([chemin, contenu]) => ({ chemin, contenu })),
    manifest: MANIFEST,
    ...extra,
  });
}

const messages = (r: { problemes: { message: string }[] }) => r.problemes.map((p) => p.message);

describe('lecteur de gabarits TS', () => {
  it('inline les gabarits imbriques et marque les expressions', () => {
    const [f] = fragmentsTs(
      'const x = `<div a="${v}">${ok ? `<b>oui</b>` : \'<i>non</i>\'}${f(y)}</div>`;'
    );
    expect(f.html).toBe(`<div a="${DYN}"><b>oui</b><i>non</i>${DYN}</div>`);
  });

  it('ignore commentaires, chaines sans balise et expressions regulieres', () => {
    const src = [
      "// un `gabarit` en commentaire, et l'apostrophe",
      "const re = /['`]/g; const s = 'rien';",
      'const h = `<p>ok</p>`;',
    ].join('\n');
    expect(fragmentsTs(src).map((f) => f.html)).toEqual(['<p>ok</p>']);
  });

  it('lit les attributs, le texte et la parente', () => {
    const els = lireElements('<label for="a">Nom <span>aide</span></label><input id="a">');
    expect(els.map((e) => e.tag)).toEqual(['label', 'span', 'input']);
    expect(els[0].texteDirect.trim()).toBe('Nom');
    expect(els[1].parent).toBe(0);
    expect(els[2].parent).toBeNull();
  });

  it('lit statiquement les cles de PREREQUIS et leur repereQuiLeve', () => {
    const regles = lireObjetExporte(PREREQUIS.contenu, 'PREREQUIS');
    expect([...regles!.entries()]).toEqual([
      ['couche-active', { repereQuiLeve: 'demo.couches' }],
      ['source', { repereQuiLeve: 'demo.couches' }],
    ]);
  });
});

describe('extraction', () => {
  it('HTML statique : libelle par label for, zone par prefixe, attribut enrichi', () => {
    const r = extraire({ 'apps/demo/index.html': HTML_BASE });
    expect(messages(r)).toEqual([]);
    expect(r.reperes.map((x) => x.id)).toEqual([
      'demo.couches',
      'demo.panneau',
      'demo.panneau.mode',
    ]);
    expect(r.reperes[2]).toEqual({
      id: 'demo.panneau.mode',
      genre: 'controle',
      libelle: 'Comportement au clic',
      element: 'select',
      zone: 'demo.panneau',
      attributs: [{ tag: 'dsfr-data-map-popup', nom: 'mode', description: 'Mode d’affichage.' }],
      prerequis: [],
      synonymes: [],
      sources: ['apps/demo/index.html'],
    });
    expect(r.reperes[1].zone).toBeUndefined();
  });

  it('chaine de gabarit TS : repere pose dans une branche de ternaire', () => {
    const r = extraire({
      'apps/demo/index.html': '<section data-zone="demo.panneau" aria-label="Panneau"></section>',
      'apps/demo/src/main.ts': `
        el.innerHTML = \`
          <div data-zone="demo.panneau.clic" role="group" aria-labelledby="t"><span id="t">Au clic</span>
            \${cond ? \`<button type="button" data-repere="demo.panneau.clic.ok">Valider</button>\` : ''}
          </div>\`;`,
    });
    expect(messages(r)).toEqual([]);
    const ok = r.reperes.find((x) => x.id === 'demo.panneau.clic.ok')!;
    expect(ok).toMatchObject({ libelle: 'Valider', element: 'button', zone: 'demo.panneau.clic' });
    expect(r.reperes.find((x) => x.id === 'demo.panneau.clic')!.libelle).toBe('Au clic');
  });

  it('refuse un identifiant dynamique', () => {
    const r = extraire({
      'apps/demo/src/main.ts': 'x = `<input aria-label="a" data-repere="${id}">`;',
    });
    expect(messages(r)).toEqual([expect.stringContaining('data-repere dynamique refuse')]);
    expect(r.reperes).toEqual([]);
  });

  it('refuse un data-attribut absent du manifeste', () => {
    const r = extraire({
      'apps/demo/index.html': HTML_BASE.replace('popup:mode', 'popup:inexistant'),
    });
    expect(messages(r)).toEqual([
      expect.stringContaining('« dsfr-data-map-popup:inexistant » absent du manifeste'),
    ]);
  });

  it('grammaire : controle a trois segments, prefixe de l’app', () => {
    const r = extraire({
      'apps/demo/index.html':
        '<button data-repere="demo.court">A</button><button data-repere="autre.x.y">B</button>',
    });
    expect(messages(r)).toEqual([
      expect.stringContaining('trop court'),
      expect.stringContaining('mal forme'),
    ]);
  });

  it('la zone designee par le prefixe doit exister, et contenir le repere', () => {
    const absente = extraire({
      'apps/demo/index.html': '<button data-repere="demo.fantome.ok">A</button>',
    });
    expect(messages(absente)).toEqual([
      expect.stringContaining("« demo.fantome » n'est posee nulle part"),
    ]);

    const ailleurs = extraire({
      'apps/demo/index.html':
        HTML_BASE +
        '<div data-zone="demo.couches.x" aria-label="X"><button data-repere="demo.panneau.b">B</button></div>',
    });
    expect(messages(ailleurs)).toEqual([expect.stringContaining('demo.panneau.b hors de sa zone')]);
  });

  it('regle 1 : controle sans repere dans une zone de reglage, sauf exception declaree', () => {
    const html =
      HTML_BASE.replace('</section>\n  <section', '</section><section') +
      '<section data-zone="demo.reglage" aria-label="R"><input id="libre"><button class="aide">?</button></section>';
    const r = extraire({ 'apps/demo/index.html': html }, { zonesDeReglage: ['demo.reglage'] });
    expect(messages(r)).toEqual([
      expect.stringContaining('<input id="libre">'),
      expect.stringContaining('<button class="aide">'),
    ]);

    const excepte = extraire(
      { 'apps/demo/index.html': html },
      {
        zonesDeReglage: ['demo.reglage'],
        exceptions: [
          { cible: '#libre', raison: 'champ de recherche local' },
          { cible: 'button.aide', raison: "bouton d'aide, sans reglage" },
          { cible: '#jamais', raison: 'plus rien' },
        ],
      }
    );
    expect(messages(excepte)).toEqual([]);
    expect(excepte.avertissements.map((a) => a.message)).toEqual([
      expect.stringContaining('« #jamais » sans objet'),
    ]);
  });

  it('regle 1 : une zone de reglage designee par #id, et une zone de reglage disparue', () => {
    const r = extraire(
      { 'apps/demo/index.html': '<div id="outils"><select></select></div>' },
      { zonesDeReglage: ['#outils', 'demo.disparue'] }
    );
    expect(messages(r)).toEqual([
      expect.stringContaining('controle sans repere'),
      expect.stringContaining('« demo.disparue » introuvable'),
    ]);
  });

  it('regle 3 : prerequis sans regle, et repereQuiLeve absent du registre', () => {
    const html = HTML_BASE.replace(
      'data-attribut=',
      'data-prerequis="couche-active inconnu" data-attribut='
    );
    const r = extraire(
      { 'apps/demo/index.html': html },
      { prerequis: 'src/assistant/prerequis.ts' },
      { prerequis: PREREQUIS }
    );
    expect(messages(r)).toEqual([expect.stringContaining('prerequis « inconnu » sans regle')]);
    expect(r.reperes.find((x) => x.id === 'demo.panneau.mode')!.prerequis).toEqual([
      'couche-active',
    ]);

    const sansLeveur = extraire(
      { 'apps/demo/index.html': html.replace('data-zone="demo.couches"', '') },
      { prerequis: 'src/assistant/prerequis.ts' },
      { prerequis: PREREQUIS }
    );
    expect(messages(sansLeveur)).toContainEqual(
      expect.stringContaining('le repere qui le leve (« demo.couches ») est absent')
    );
  });

  it('regle 5 : repere cite par un constat absent du registre', () => {
    const constat: FichierSource = {
      chemin: 'packages/shared/src/debug/constats-carto.ts',
      contenu: "export const C = [{ reperes: ['demo.panneau.mode', 'demo.panneau.disparu'] }];",
    };
    expect(reperesCites(constat.contenu, 'demo')).toEqual([
      'demo.panneau.disparu',
      'demo.panneau.mode',
    ]);
    const r = extraire({ 'apps/demo/index.html': HTML_BASE }, {}, { constats: [constat] });
    expect(messages(r)).toEqual([
      expect.stringContaining('« demo.panneau.disparu », absent du registre'),
    ]);
  });

  it('helper declare : ${…} tolere dans son corps, sites d’appel litteraux lus', () => {
    const ts = `
      function champ(opts: { id: string; label: string; repere?: string }): string {
        return \`<label for="\${opts.id}">\${opts.label}</label>
          <input id="\${opts.id}" \${opts.repere ? \`data-repere="\${opts.repere}"\` : ''}>\`;
      }
      el.innerHTML = \`<div data-zone="demo.panneau.clic" aria-label="Au clic">
        \${champ({ id: 'a', label: 'Champ titre', repere: 'demo.panneau.clic.titre', attribut: 'dsfr-data-map-popup:width' })}
        \${champ({ id: 'b', label: 'Libre' })}
        \${champ({ id: 'c', label: lib, repere: variable })}
      </div>\`;`;
    const r = extraire(
      { 'apps/demo/index.html': HTML_BASE, 'apps/demo/src/main.ts': ts },
      {
        helpers: [{ fonction: 'champ', parametre: 'repere' }],
        zonesDeReglage: ['demo.panneau.clic'],
      }
    );
    expect(messages(r)).toEqual([
      expect.stringContaining(
        'controle sans repere dans une zone de reglage : appel de champ(« Libre »)'
      ),
      expect.stringContaining('data-repere dynamique refuse'),
    ]);
    expect(r.reperes.find((x) => x.id === 'demo.panneau.clic.titre')).toMatchObject({
      libelle: 'Champ titre',
      element: 'input',
      attributs: [{ tag: 'dsfr-data-map-popup', nom: 'width' }],
    });
  });

  it('sans declaration du helper, son ${…} est refuse', () => {
    const r = extraire({
      'apps/demo/src/main.ts': 'function champ(o) { return `<input data-repere="${o.repere}">`; }',
    });
    expect(messages(r)).toEqual([expect.stringContaining('data-repere dynamique refuse')]);
  });

  it('doublons : fusion si identiques, erreur sinon ; synonymes recopies', () => {
    const double = HTML_BASE + '<section data-zone="demo.couches" aria-label="Couches"></section>';
    const ok = extraire(
      { 'apps/demo/index.html': double, 'apps/demo/src/main.ts': 'x = `' + HTML_BASE + '`;' },
      { synonymes: { 'demo.panneau.mode': ['popup', 'fiche'] } }
    );
    expect(messages(ok)).toEqual([]);
    const mode = ok.reperes.find((x) => x.id === 'demo.panneau.mode')!;
    expect(mode.sources).toEqual(['apps/demo/index.html', 'apps/demo/src/main.ts']);
    expect(mode.synonymes).toEqual(['popup', 'fiche']);

    const conflit = extraire(
      {
        'apps/demo/index.html': double.replace(
          'aria-label="Couches"></section>\n',
          'aria-label="Autre"></section>\n'
        ),
      },
      { synonymes: { 'demo.orphelin.x': ['y'] } }
    );
    expect(messages(conflit)).toEqual([
      expect.stringContaining('demo.couches pose deux fois'),
      expect.stringContaining('synonymes declares pour « demo.orphelin.x »'),
    ]);
  });

  it('controle repete : data-repere-libelle litteral passe avant tout le reste (#1002)', () => {
    const r = extraire({
      'apps/demo/index.html': HTML_BASE,
      'apps/demo/src/main.ts': `
        el.innerHTML = COULEURS.map((c) => \`
          <button type="button" data-repere="demo.panneau.pastille" aria-label="\${c.nom}"
                  data-repere-libelle="Couleur" title="\${c.nom}"></button>\`).join('');`,
    });
    expect(messages(r)).toEqual([]);
    expect(r.reperes.find((x) => x.id === 'demo.panneau.pastille')).toMatchObject({
      libelle: 'Couleur',
      element: 'button',
    });
    // Prioritaire meme sur un <label for> : c'est le libelle de la famille.
    const prioritaire = extraire({
      'apps/demo/index.html': HTML_BASE.replace(
        'data-repere="demo.panneau.mode"',
        'data-repere="demo.panneau.mode" data-repere-libelle="Mode"'
      ),
    });
    expect(prioritaire.reperes.find((x) => x.id === 'demo.panneau.mode')!.libelle).toBe('Mode');
  });

  it('data-repere-libelle dynamique refuse', () => {
    const r = extraire({
      'apps/demo/index.html': HTML_BASE,
      'apps/demo/src/main.ts': `
        el.innerHTML = \`<button type="button" data-repere="demo.panneau.pastille"
          data-repere-libelle="\${c.nom}">Couleur</button>\`;`,
    });
    expect(messages(r)).toEqual([
      expect.stringContaining('demo.panneau.pastille : data-repere-libelle dynamique refuse'),
    ]);
  });

  it('repere sans libelle refuse', () => {
    const r = extraire({
      'apps/demo/index.html': HTML_BASE + '<input data-repere="demo.panneau.nu">',
    });
    expect(messages(r)).toEqual([expect.stringContaining('demo.panneau.nu : aucun libelle')]);
  });
});

describe('zoneDe et rendu', () => {
  it('zone = identifiant prive du dernier segment', () => {
    expect(zoneDe('carto.elements.clic.popup-mode', 'controle')).toBe('carto.elements.clic');
    expect(zoneDe('carto.elements.clic', 'zone')).toBe('carto.elements');
    expect(zoneDe('carto.elements', 'zone')).toBeUndefined();
  });

  it('le registre porte REPERES, RepereId et REGISTRE, sans index', () => {
    const r = extraire({ 'apps/demo/index.html': HTML_BASE });
    const src = rendreRegistre(CONFIG, r.reperes);
    expect(src).toContain('NE PAS EDITER');
    expect(src).toContain('] as const satisfies readonly Repere[];');
    expect(src).toContain("export type RepereId = (typeof REPERES)[number]['id'];");
    expect(src).toContain('export const REGISTRE: RegistreReperes = {');
    expect(src).not.toContain('REPERES_PAR_ID');
  });
});

describe('temps lineaire (CodeQL js/redos, alerte #95)', () => {
  // `/*` suivi de `*//*` repete : l'ancienne regex des commentaires en tete,
  // `(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*`, y backtrackait de facon
  // exponentielle. Le parcours manuel doit rester sous 200 ms.
  const pathologique = '/*' + '*//*'.repeat(50_000);

  // Taille BORNEE : sous l'ancienne regex, le temps triple tous les deux motifs
  // (28 ms a 22 repetitions, 27 s a 30, mesure le 2026-09-23). C'est ce cas qui
  // rend la preuve de mutation lisible : le test echoue en temps fini, alors que
  // l'entree de 50 000 motifs bloquerait le thread indefiniment (une regex
  // synchrone n'est pas interruptible par le timeout de vitest).
  it('sansCommentairesEnTete : preuve de mutation, entree bornee', () => {
    const t0 = performance.now();
    sansCommentairesEnTete('/*' + '*//*'.repeat(30) + ' x');
    expect(performance.now() - t0).toBeLessThan(200);
  });

  it('sansCommentairesEnTete sur une entree pathologique', () => {
    const t0 = performance.now();
    sansCommentairesEnTete(pathologique + ' x');
    expect(performance.now() - t0).toBeLessThan(200);
  });

  it('lireObjetExporte sur une cle precedee de commentaires pathologiques', () => {
    const src = `export const PREREQUIS = { ${pathologique} ok: { repereQuiLeve: 'a.b' } };`;
    const t0 = performance.now();
    lireObjetExporte(src, 'PREREQUIS');
    expect(performance.now() - t0).toBeLessThan(200);
  });

  it('sansCommentairesEnTete retire blancs et commentaires, et seulement eux', () => {
    expect(sansCommentairesEnTete('  // a\n /* b */ cle: 1')).toBe('cle: 1');
    expect(sansCommentairesEnTete('/* non ferme')).toBe('');
    expect(sansCommentairesEnTete('cle /* garde */')).toBe('cle /* garde */');
  });
});
