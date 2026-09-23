/**
 * Adaptateur de révélation de l'app Sources (#1007, ADR-143 §6) : ouverture de
 * la modale qui porte le repère, étape et « Paramètres avancés » de la
 * connexion, type de connexion et mode de saisie préparés SEULEMENT dans une
 * modale fermée ; `null` sans prérequis ; aucune connexion ni source créée.
 * Et le chemin par `montrer()` : un prérequis manquant montre ce qui le lève.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { closeModal, effacerSurbrillance, montrer } from '@dsfr-data/shared';
import type { Source } from '@dsfr-data/shared';
import {
  creerAdaptateurSources,
  modaleDuRepere,
  modeSaisieDuRepere,
  typeConnexionDuRepere,
} from '../../../apps/sources/src/assistant/adaptateur';
import { PREREQUIS, type EtatSources } from '../../../apps/sources/src/assistant/prerequis';
import { REGISTRE, REPERES } from '../../../apps/sources/src/assistant/reperes.generated';
import { createInitialState, state } from '../../../apps/sources/src/state';
import {
  getConnType,
  setConnType,
  setConnectionModalStep,
} from '../../../apps/sources/src/connections/connection-manager';

vi.mock('@dsfr-data/shared', async (importOriginal) => {
  const reel = await importOriginal<Record<string, unknown>>();
  return { ...reel, toastWarning: vi.fn() };
});

const RACINE = resolve(import.meta.dirname, '../../..');

function corpsIndex(): string {
  const html = readFileSync(join(RACINE, 'apps/sources/index.html'), 'utf-8');
  const ouverture = html.indexOf('>', html.indexOf('<body')) + 1;
  let corps = html.slice(ouverture, html.indexOf('</body>'));
  for (let debut = corps.indexOf('<script'); debut !== -1; debut = corps.indexOf('<script')) {
    const fin = corps.indexOf('</script>', debut);
    corps = corps.slice(0, debut) + corps.slice(fin + '</script>'.length);
  }
  return corps;
}

const source = (id: string, data: Record<string, unknown>[] = [{ a: 1 }]): Source =>
  ({ id, name: id, type: 'manual', data, recordCount: data.length }) as Source;

const actif = (id: string) => document.getElementById(id)!.classList.contains('active');
const donnees = () => JSON.stringify({ c: state.connections, s: state.sources });

let etatInitial: string;

beforeAll(() => {
  etatInitial = JSON.stringify(createInitialState());
});

beforeEach(() => {
  document.body.innerHTML = corpsIndex();
  Object.assign(state, JSON.parse(etatInitial));
});

afterEach(() => {
  effacerSurbrillance();
  document.body.innerHTML = '';
});

describe('tables de l’adaptateur', () => {
  it('modale, type de connexion et mode de saisie se déduisent de l’identifiant', () => {
    expect(modaleDuRepere('sources.connexion.configuration.api.url')).toBe('connection-modal');
    expect(modaleDuRepere('sources.jointure')).toBe('join-source-modal');
    expect(modaleDuRepere('sources.actions.exporter')).toBeUndefined();
    expect(typeConnexionDuRepere('sources.connexion.configuration.grist.cle-api')).toBe('grist');
    expect(typeConnexionDuRepere('sources.connexion.configuration.nom')).toBeUndefined();
    expect(modeSaisieDuRepere('sources.manuelle.json.contenu')).toBe('json');
    expect(modeSaisieDuRepere('sources.manuelle.nom')).toBeUndefined();
  });

  it('chaque modale de la table existe dans le DOM avec sa zone', () => {
    for (const zone of ['sources.connexion', 'sources.jointure', 'sources.manuelle']) {
      const modale = modaleDuRepere(zone)!;
      expect(document.getElementById(modale)?.getAttribute('data-zone'), zone).toBe(zone);
    }
  });
});

describe('reveler()', () => {
  const adaptateur = () => creerAdaptateurSources();

  it('cibles de la visite guidée : nouvelle connexion, source manuelle, connexions', async () => {
    const a = adaptateur();
    expect((await a.reveler('sources.actions.nouvelle-connexion'))?.id).toBe('add-connection-btn');
    expect((await a.reveler('sources.locaux.creer'))?.id).toBe('add-source-btn');
    expect((await a.reveler('sources.connexions'))?.id).toBe('connections-list');
  });

  it('champ fichier masqué : rend son libellé-bouton « Importer »', async () => {
    const el = await adaptateur().reveler('sources.actions.importer');
    expect(el?.id).toBe('import-data-btn');
  });

  it('modale de connexion fermée : ouverte à l’étape de détection', async () => {
    const el = await adaptateur().reveler('sources.connexion.detection.url');
    expect(el?.id).toBe('detect-url');
    expect(actif('connection-modal')).toBe(true);
  });

  it('champ Grist : étape configuration, avancés dépliés, type Grist', async () => {
    const el = await adaptateur().reveler('sources.connexion.configuration.grist.cle-api');
    expect(el?.id).toBe('conn-api-key');
    expect((document.getElementById('advanced-settings') as HTMLDetailsElement).open).toBe(true);
    expect(getConnType()).toBe('grist');
  });

  it('modale ouverte sur l’autre type : jamais basculée, null', async () => {
    const a = adaptateur();
    await a.reveler('sources.connexion.configuration.api.url');
    expect(getConnType()).toBe('api');
    expect(await a.reveler('sources.connexion.configuration.grist.url')).toBeNull();
    expect(getConnType()).toBe('api');
    expect(actif('connection-modal')).toBe(true);
  });

  it('modale ouverte : l’étape change (affichage seulement)', async () => {
    const a = adaptateur();
    await a.reveler('sources.connexion.detection.url');
    setConnType('api');
    const el = await a.reveler('sources.connexion.configuration.nom');
    expect(el?.id).toBe('conn-name');
    setConnectionModalStep('detect');
  });

  it('source manuelle : mode JSON préparé dans une modale fermée', async () => {
    const el = await adaptateur().reveler('sources.manuelle.json.contenu');
    expect(el?.id).toBe('json-input');
    expect(document.getElementById('source-mode-json')!.style.display).toBe('block');
  });

  it('source manuelle ouverte en mode tableau : pas de bascule vers CSV', async () => {
    const a = adaptateur();
    await a.reveler('sources.manuelle.tableau.ajouter-ligne');
    expect(await a.reveler('sources.manuelle.csv.separateur')).toBeNull();
    expect(document.getElementById('source-mode-csv')!.style.display).toBe('none');
  });

  it('jointure sans deux jeux locaux : null, modale fermée', async () => {
    expect(await adaptateur().reveler('sources.jointure.cle')).toBeNull();
    expect(actif('join-source-modal')).toBe(false);
  });

  it('jointure avec deux jeux locaux : ouverte', async () => {
    state.sources = [source('a'), source('b')];
    const el = await adaptateur().reveler('sources.jointure.cle');
    expect(el?.id).toBe('join-on');
    closeModal('join-source-modal');
  });

  it('bouton du panneau d’aperçu fermé : null', async () => {
    expect(await adaptateur().reveler('sources.apercu.actualiser')).toBeNull();
  });

  it('identifiant hors grammaire ou absent du DOM : null', async () => {
    expect(await adaptateur().reveler('sources.x"] *')).toBeNull();
    expect(await adaptateur().reveler('sources.connexion.inexistant')).toBeNull();
  });

  it('ne crée ni ne modifie jamais connexion ou source', async () => {
    state.sources = [source('a'), source('b')];
    const avant = donnees();
    const a = adaptateur();
    for (const r of REPERES) {
      await a.reveler(r.id);
      for (const m of document.querySelectorAll('.modal-overlay')) m.classList.remove('active');
    }
    expect(donnees()).toBe(avant);
  });
});

describe('prérequis', () => {
  const etat = (reglages: Partial<EtatSources> = {}): EtatSources => ({
    app: state,
    apercuOuvert: false,
    ...reglages,
  });

  it('chaque règle, fausse puis vraie, levée par un repère du registre', () => {
    const ids = new Set<string>(REPERES.map((r) => r.id));
    for (const [nom, regle] of Object.entries(PREREQUIS)) {
      expect(ids.has(regle.repereQuiLeve), nom).toBe(true);
    }
    expect(PREREQUIS['apercu-ouvert'].verifier(etat())).toBe(false);
    expect(
      PREREQUIS['apercu-ouvert'].verifier(
        etat({ apercuOuvert: true, app: { ...state, previewedSource: source('p') } })
      )
    ).toBe(true);
    expect(PREREQUIS['deux-sources-locales'].verifier(etat())).toBe(false);
    expect(
      PREREQUIS['deux-sources-locales'].verifier(
        etat({ app: { ...state, sources: [source('a'), source('b', [])] } })
      )
    ).toBe(false);
    expect(
      PREREQUIS['deux-sources-locales'].verifier(
        etat({ app: { ...state, sources: [source('a'), source('b')] } })
      )
    ).toBe(true);
    expect(PREREQUIS['document-grist-choisi'].verifier(etat())).toBe(false);
    expect(
      PREREQUIS['document-grist-choisi'].verifier(
        etat({ app: { ...state, selectedConnectionId: 'c', selectedDocument: 'd' } })
      )
    ).toBe(true);
  });
});

describe('montrer() avec l’adaptateur de Sources', () => {
  it('jointure sans jeux locaux : montre « Créer une source manuelle »', async () => {
    const r = await montrer('sources.jointure.cle', {
      registre: REGISTRE,
      adaptateur: creerAdaptateurSources(),
      mode: 'dire',
    });
    expect(r.ok).toBe(false);
    expect(r.prerequis).toBe('deux-sources-locales');
    expect(r.element?.id).toBe('add-source-btn');
  });

  it('champ de connexion API : montré avec son chemin', async () => {
    const r = await montrer('sources.connexion.configuration.api.methode', {
      registre: REGISTRE,
      adaptateur: creerAdaptateurSources(),
      mode: 'dire',
    });
    expect(r.ok).toBe(true);
    expect(r.element?.id).toBe('api-method');
    expect(r.chemin).toEqual([
      'Nouvelle connexion',
      'Configuration de la connexion',
      'API REST',
      'Méthode HTTP',
    ]);
  });
});
