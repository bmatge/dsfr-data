/**
 * Garde-fou du registre de reperes GENERE de la carto (#997), sur le modele de
 * `tests/apps/builder-ia/skills-reference.test.ts` : le module commite est le
 * rendu exact de l'extraction du balisage reel. Un repere ajoute, renomme ou
 * retire sans `npm run build:reperes` fait echouer ce test (et check:reperes).
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import config from '../../apps/builder-carto/src/assistant/reperes.config';
import { REGISTRE, REPERES } from '../../apps/builder-carto/src/assistant/reperes.generated';
import type { CemManifest } from '../../scripts/lib/cem-reference';
import {
  extraireReperes,
  rendreRegistre,
  type FichierSource,
} from '../../scripts/lib/reperes-extract';

const racine = resolve(import.meta.dirname, '../..');
const dossier = join(racine, 'apps', config.app);
const lire = (chemin: string): FichierSource => ({
  chemin,
  contenu: readFileSync(join(racine, chemin), 'utf-8'),
});

function extraireCarto() {
  const manifest = JSON.parse(
    readFileSync(join(racine, 'packages/core/custom-elements.json'), 'utf-8')
  ) as CemManifest;
  return extraireReperes({
    config,
    sources: config.sources.map((s) => lire(`apps/${config.app}/${s}`)),
    manifest,
    prerequis: config.prerequis ? lire(`apps/${config.app}/${config.prerequis}`) : undefined,
    constats: (config.constats ?? []).filter((c) => existsSync(join(racine, c))).map(lire),
  });
}

describe('registre de reperes de la carto', () => {
  const res = extraireCarto();

  it("l'extraction du balisage reel ne signale aucun probleme", () => {
    expect(res.problemes).toEqual([]);
  });

  it('le module commite est le rendu exact de l’extraction', () => {
    const commite = readFileSync(join(dossier, 'src/assistant/reperes.generated.ts'), 'utf-8');
    expect(commite).toBe(rendreRegistre(config, res.reperes));
  });

  it('le module importe expose le meme registre', () => {
    expect(REPERES).toEqual(res.reperes);
    expect(REGISTRE).toMatchObject({ app: 'builder-carto', prefixe: 'carto' });
    expect(REGISTRE.reperes).toBe(REPERES);
  });

  it('echantillon #997 : le bloc « Au clic » est balise et relie a la lib', () => {
    const mode = REPERES.find((r) => r.id === 'carto.elements.clic.popup-mode');
    expect(mode).toMatchObject({
      genre: 'controle',
      zone: 'carto.elements.clic',
      prerequis: ['couche-active', 'couche-interactive'],
      attributs: [{ tag: 'dsfr-data-map-popup', nom: 'mode' }],
    });
    // Un controle pose par le helper fieldInput, lu sur son site d'appel
    expect(REPERES.find((r) => r.id === 'carto.elements.clic.title-field')).toMatchObject({
      libelle: 'Champ titre',
      element: 'input',
    });
  });

  it('preuve de mutation : retirer un repere de la zone de reglage fait echouer', () => {
    const main = lire(`apps/${config.app}/src/main.ts`);
    const mute = main.contenu.replace(' data-repere="carto.elements.clic.popup-width"', '');
    expect(mute).not.toBe(main.contenu);
    const manifest = JSON.parse(
      readFileSync(join(racine, 'packages/core/custom-elements.json'), 'utf-8')
    ) as CemManifest;
    const r = extraireReperes({
      config,
      sources: config.sources.map((s) =>
        s === 'src/main.ts' ? { ...main, contenu: mute } : lire(`apps/${config.app}/${s}`)
      ),
      manifest,
      prerequis: lire(`apps/${config.app}/${config.prerequis}`),
    });
    expect(r.problemes.map((p) => p.message)).toEqual([
      'controle sans repere dans une zone de reglage : <input id="layer-popup-width">',
    ]);
  });
});
