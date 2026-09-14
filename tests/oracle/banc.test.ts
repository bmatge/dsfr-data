import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { ecrireRapportBanc, type FicheBanc } from '../../tools/oracle/banc';
import type { Constat } from '../../tools/oracle/compare';

/**
 * `out/banc.md` — le rendu que le BANC d'essai relit.
 *
 * C'est le seul endroit qui relie un identifiant du registre (`AM-0XX`,
 * `BUG-0XX`) à un chiffre mesuré. Un rendu qui perdrait un constat, oublierait
 * un contrôle en attente ou casserait une ligne de tableau ferait dire au
 * dépôt qu'il n'y avait rien à voir — exactement ce que la vérification vient
 * empêcher. D'où ces contrôles, sur des constats écrits à la main.
 */

const dossiers: string[] = [];

afterEach(() => {
  for (const d of dossiers.splice(0)) rmSync(d, { recursive: true, force: true });
});

function dossierTemporaire(): string {
  const d = mkdtempSync(resolve(tmpdir(), 'banc-md-'));
  dossiers.push(d);
  return d;
}

function constat(partiel: Partial<Constat> & Pick<Constat, 'controle' | 'observation'>): Constat {
  return {
    domaine: 'banc-pages',
    mode: 'live',
    rawRows: 100,
    lib: '1',
    oracle: '1',
    ecart: 0,
    comparaisons: 1,
    ok: true,
    message: '',
    ...partiel,
  };
}

/** Rend le fichier et le relit, tel que le banc le lira. */
function rendre(constats: Constat[], fiches: FicheBanc[]): string {
  const dossier = dossierTemporaire();
  const chemin = ecrireRapportBanc(constats, fiches, dossier);
  expect(chemin).toBe(resolve(dossier, 'banc.md'));
  return readFileSync(chemin, 'utf-8');
}

describe('ecrireRapportBanc — groupement par page', () => {
  it('range les observations sous leur page, avec les constats du contrôle', () => {
    const md = rendre(
      [
        constat({ controle: 'a', observation: 'kpi:k1', lib: '3 604', oracle: '3604' }),
        constat({ controle: 'a', observation: 'kpi:k2', lib: '99', oracle: '99' }),
      ],
      [
        {
          id: 'a',
          origin: 'la page et son constat',
          page: 'viz/qualite-tourisme',
          constats: ['PG-017'],
        },
      ]
    );
    expect(md).toContain('## viz/qualite-tourisme');
    expect(md).toContain('### `a` — constats : PG-017');
    expect(md).toContain('la page et son constat');
    expect(md).toContain('100 lignes brutes.');
    expect(md).toContain('| `kpi:k1` | 3 604 | 3604 | 1 | conforme |');
    expect(md).toContain('| `kpi:k2` | 99 | 99 | 1 | conforme |');
  });

  it('écarte ce qui ne vient pas d’une reproduction', () => {
    // Un contrôle sur fixture n'a rien à dire au banc, et l'y noyer rendrait
    // le fichier illisible — mais il ne doit pas non plus être COMPTÉ.
    const md = rendre(
      [
        constat({ controle: 'avec-page', observation: 'kpi:k1' }),
        constat({ domaine: 'query', controle: 'sans-page', observation: 'kpi:k9' }),
      ],
      [
        { id: 'avec-page', origin: 'o', page: 'viz/bofip', constats: ['AM-034'] },
        { id: 'sans-page', origin: 'un contrôle déterministe' },
      ]
    );
    expect(md).toContain('`kpi:k1`');
    expect(md).not.toContain('`kpi:k9`');
    expect(md).not.toContain('sans-page');
    expect(md).toContain('1 page(s) reproduites, 1 observation(s)');
  });

  it('annonce les écarts et les rend en toutes lettres', () => {
    const md = rendre(
      [
        constat({
          controle: 'a',
          observation: 'kpi:k1',
          lib: '0',
          oracle: '3458',
          ecart: -3458,
          ok: false,
          message: 'affiché 0 (0), recalculé 3458',
        }),
      ],
      [{ id: 'a', origin: 'o', page: 'viz/qualite-tourisme', constats: ['BUG-009'] }]
    );
    expect(md).toContain('1 observation(s), 1 écart(s)');
    expect(md).toContain('**écart** — affiché 0 (0), recalculé 3458');
  });

  it('range les pages par ordre alphabétique, pour que deux runs se comparent', () => {
    const md = rendre(
      [
        constat({ controle: 'z', observation: 'kpi:kz' }),
        constat({ controle: 'a', observation: 'kpi:ka' }),
      ],
      [
        { id: 'z', origin: 'o', page: 'viz/bofip' },
        { id: 'a', origin: 'o', page: 'education/tne-dashboard' },
      ]
    );
    expect(md.indexOf('## education/tne-dashboard')).toBeLessThan(md.indexOf('## viz/bofip'));
  });

  it('rend un fichier utilisable même sans aucune reproduction', () => {
    const md = rendre([], []);
    expect(md).toContain('0 page(s) reproduites, 0 observation(s)');
    expect(md).not.toContain('## Index par constat');
    expect(md).not.toContain('## Contrôles en attente');
  });
});

describe('ecrireRapportBanc — contrôles en attente', () => {
  it('rend un contrôle en attente avec sa raison, sans constat mesuré', () => {
    // Un contrôle mis en attente ne produit AUCUN constat : s'il ne se lisait
    // que par ses constats, il disparaîtrait du rapport — et le banc lirait un
    // fichier qui ne dit que ce que la bibliothèque passe.
    const md = rendre(
      [],
      [
        {
          id: 'delegue',
          origin: 'o',
          page: 'viz/qualite-tourisme',
          constats: ['BUG-009'],
          skip: 'DÉFAUT — affiché 0, recalculé 3 458.',
        },
      ]
    );
    expect(md).toContain('## Contrôles en attente');
    expect(md).toContain(
      '| viz/qualite-tourisme | `delegue` | BUG-009 | DÉFAUT — affiché 0, recalculé 3 458. |'
    );
    expect(md).toContain('0 écart(s), 1 contrôle(s) en attente.');
  });

  it('ne met en attente que ce qui vient d’une reproduction', () => {
    const md = rendre([], [{ id: 'x', origin: 'o', skip: 'une attente sans page' }]);
    expect(md).not.toContain('## Contrôles en attente');
  });
});

describe('ecrireRapportBanc — index par constat', () => {
  it('range les identifiants du registre et pointe page et contrôle', () => {
    const md = rendre(
      [
        constat({ controle: 'b', observation: 'kpi:k1' }),
        constat({ controle: 'a', observation: 'kpi:k2' }),
      ],
      [
        { id: 'b', origin: 'o', page: 'viz/bofip', constats: ['PG-012', 'AM-003'] },
        { id: 'a', origin: 'o', page: 'viz/plan-de-relance', constats: ['PG-012'] },
      ]
    );
    const index = md.slice(md.indexOf('## Index par constat du registre'));
    expect(index).toContain('| AM-003 | viz/bofip | `b` | conforme |');
    expect(index).toContain('| PG-012 | viz/bofip | `b` | conforme |');
    expect(index).toContain('| PG-012 | viz/plan-de-relance | `a` | conforme |');
    expect(index.indexOf('AM-003')).toBeLessThan(index.indexOf('PG-012'));
  });

  it('ne répète pas un contrôle qui a plusieurs observations conformes', () => {
    const md = rendre(
      [
        constat({ controle: 'a', observation: 'kpi:k1' }),
        constat({ controle: 'a', observation: 'kpi:k2' }),
        constat({ controle: 'a', observation: 'kpi:k3' }),
      ],
      [{ id: 'a', origin: 'o', page: 'viz/bofip', constats: ['AM-034'] }]
    );
    const index = md.slice(md.indexOf('## Index par constat du registre'));
    expect(index.split('| AM-034 |')).toHaveLength(2);
  });

  it('montre l’écart à côté du conforme quand un contrôle est à moitié rouge', () => {
    // Un contrôle dont une observation tombe reste vert sur les autres : si
    // l'index n'en gardait qu'une, il annoncerait « conforme » un contrôle en
    // écart, ce qui est précisément l'erreur à ne pas faire.
    const md = rendre(
      [
        constat({ controle: 'a', observation: 'kpi:k1' }),
        constat({ controle: 'a', observation: 'kpi:k2', ok: false, message: 'écart' }),
      ],
      [{ id: 'a', origin: 'o', page: 'viz/qualite-tourisme', constats: ['BUG-009'] }]
    );
    const index = md.slice(md.indexOf('## Index par constat du registre'));
    expect(index).toContain('| BUG-009 | viz/qualite-tourisme | `a` | conforme |');
    expect(index).toContain('| BUG-009 | viz/qualite-tourisme | `a` | **écart** |');
  });
});

describe('ecrireRapportBanc — échappement des cellules', () => {
  it('neutralise la barre verticale, qui ouvrirait une colonne de plus', () => {
    const md = rendre(
      [constat({ controle: 'a', observation: 'kpi:k1', lib: 'a | b', oracle: 'c' })],
      [{ id: 'a', origin: 'o', page: 'viz/bofip' }]
    );
    expect(md).toContain('| `kpi:k1` | a \\| b | c | 1 | conforme |');
  });

  it('replie un texte multiligne, qui terminerait la ligne au milieu', () => {
    const md = rendre(
      [],
      [{ id: 'a', origin: 'o', page: 'viz/bofip', skip: 'première ligne\n  seconde ligne' }]
    );
    expect(md).toContain('| première ligne seconde ligne |');
    expect(md).not.toContain('première ligne\n');
  });

  it('échappe l’ANTISLASH EN PREMIER, sinon un texte le terminant ouvre la cellule', () => {
    // L'ordre est la règle : échapper la barre puis l'antislash reviendrait à
    // échapper l'antislash que l'on vient d'ajouter (`\|` deviendrait `\\|`,
    // c'est-à-dire un antislash littéral suivi d'une barre de tableau).
    const md = rendre(
      [constat({ controle: 'a', observation: 'kpi:k1', lib: 'fin \\', oracle: 'x' })],
      [{ id: 'a', origin: 'o', page: 'viz/bofip' }]
    );
    expect(md).toContain('| `kpi:k1` | fin \\\\ | x | 1 | conforme |');
    const ligne = md.split('\n').find((l) => l.includes('`kpi:k1`'))!;
    // Cinq barres : les quatre séparateurs de colonnes, plus celle de fin.
    expect(ligne.match(/(?<!\\)\|/g)).toHaveLength(6);
  });
});
