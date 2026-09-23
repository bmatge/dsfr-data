/**
 * Retour au Builder : décider s'il faut avertir avant d'écraser (#965).
 *
 * Le Builder rouvre un instantané de configuration, jamais le code affiché.
 * Ce qui se teste ici est la **décision** — code repris ≠ code à l'écran donc
 * on avertit — pas le libellé du message.
 */
import { describe, it, expect } from 'vitest';
import {
  normaliserCode,
  verdictRetourAuBuilder,
  AVERTISSEMENT_RETOUR_PLAYGROUND,
  AVERTISSEMENT_RETOUR_PIPELINE,
  RETOUR_VERS_ACCUEIL,
} from '../../packages/shared/src/ui/passation.js';

const CODE = '<dsfr-data-source id="s" url="https://x/records"></dsfr-data-source>';

describe('verdictRetourAuBuilder', () => {
  it('avertit quand le code rapporté diffère du code confié', () => {
    const v = verdictRetourAuBuilder({
      from: 'playground',
      codeConfie: CODE,
      codeRapporte: CODE + '\n<dsfr-data-chart type="bar"></dsfr-data-chart>',
    });
    expect(v.verdict).toBe('divergent');
    if (v.verdict === 'divergent') {
      // Le code rapporté est rendu tel quel : c'est lui qu'on redonne au
      // Playground si l'utilisateur refuse de le perdre.
      expect(v.codeRapporte).toContain('dsfr-data-chart');
    }
  });

  it("n'avertit pas quand le code revient identique", () => {
    expect(
      verdictRetourAuBuilder({ from: 'playground', codeConfie: CODE, codeRapporte: CODE }).verdict
    ).toBe('inchange');
  });

  it('ignore une simple différence de mise en forme', () => {
    expect(
      verdictRetourAuBuilder({
        from: 'playground',
        codeConfie: `  ${CODE}\r\n\r\n`,
        codeRapporte: `${CODE}\n`,
      }).verdict
    ).toBe('inchange');
  });

  it('avertit aussi au retour du Pipeline (#1095)', () => {
    expect(
      verdictRetourAuBuilder({
        from: 'pipeline-helper',
        codeConfie: CODE,
        codeRapporte: CODE + '\n<dsfr-data-query id="q"></dsfr-data-query>',
      }).verdict
    ).toBe('divergent');
    // Le Pipeline ne rapporte rien quand son pipeline n'a pas bougé.
    expect(
      verdictRetourAuBuilder({ from: 'pipeline-helper', codeConfie: CODE, codeRapporte: null })
        .verdict
    ).toBe('rien-a-comparer');
  });

  it("n'a rien à comparer quand on arrive des favoris", () => {
    expect(
      verdictRetourAuBuilder({ from: 'favorites', codeConfie: CODE, codeRapporte: 'autre chose' })
        .verdict
    ).toBe('rien-a-comparer');
  });

  it("n'a rien à comparer quand le Playground n'a rien rapporté (retour navigateur)", () => {
    expect(
      verdictRetourAuBuilder({ from: 'playground', codeConfie: CODE, codeRapporte: null }).verdict
    ).toBe('rien-a-comparer');
    expect(
      verdictRetourAuBuilder({ from: 'playground', codeConfie: CODE, codeRapporte: '   \n ' })
        .verdict
    ).toBe('rien-a-comparer');
  });

  it('avertit quand un code est rapporté sans preuve de ce qui était parti', () => {
    // On ne peut pas prouver que c'est le même : on ne l'écrase pas en silence.
    expect(
      verdictRetourAuBuilder({ from: 'playground', codeConfie: null, codeRapporte: CODE }).verdict
    ).toBe('divergent');
  });
});

describe('normaliserCode', () => {
  it('rend une chaîne vide pour un code absent', () => {
    expect(normaliserCode(null)).toBe('');
    expect(normaliserCode(undefined)).toBe('');
  });

  it('unifie fins de ligne, indentation et lignes vides', () => {
    expect(normaliserCode('a\r\n\n   b  \r')).toBe('a\nb');
  });
});

describe("le texte de l'avertissement", () => {
  it('dit ce qui se passe, pourquoi, et ce qu’on peut faire à la place', () => {
    const { message, confirmLabel, cancelLabel } = AVERTISSEMENT_RETOUR_PLAYGROUND;
    expect(message).toMatch(/ne sait pas relire du code/);
    expect(message).toMatch(/conserver/);
    // Les deux issues sont nommées par leur effet, pas par « OK / Annuler ».
    expect(confirmLabel).toMatch(/configuration/i);
    expect(cancelLabel).toMatch(/Playground/);
    // Pas de jargon interne dans ce qui s'affiche.
    expect(`${message} ${confirmLabel} ${cancelLabel}`).not.toMatch(
      /sessionStorage|builderStateJson|builder-state|JSON/
    );
  });
});

describe('le retour vers chaque app d’accueil', () => {
  it('repart par la clé que l’app relit, avec son propre avertissement', () => {
    expect(RETOUR_VERS_ACCUEIL.playground.cleCode).toBe('playground-code');
    expect(RETOUR_VERS_ACCUEIL['pipeline-helper'].cleCode).toBe('pipeline-helper-code');
    expect(RETOUR_VERS_ACCUEIL['pipeline-helper'].avertissement).toBe(
      AVERTISSEMENT_RETOUR_PIPELINE
    );
    expect(AVERTISSEMENT_RETOUR_PIPELINE.cancelLabel).toMatch(/Pipeline/);
    expect(AVERTISSEMENT_RETOUR_PIPELINE.message).not.toMatch(/sessionStorage|builder-state|JSON/);
  });
});
