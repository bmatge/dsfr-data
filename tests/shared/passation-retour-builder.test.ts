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
  verdictRetourPlayground,
  AVERTISSEMENT_RETOUR_PLAYGROUND,
} from '../../packages/shared/src/ui/passation.js';

const CODE = '<dsfr-data-source id="s" url="https://x/records"></dsfr-data-source>';

describe('verdictRetourPlayground', () => {
  it('avertit quand le code rapporté diffère du code confié', () => {
    const v = verdictRetourPlayground({
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
      verdictRetourPlayground({ from: 'playground', codeConfie: CODE, codeRapporte: CODE }).verdict
    ).toBe('inchange');
  });

  it('ignore une simple différence de mise en forme', () => {
    expect(
      verdictRetourPlayground({
        from: 'playground',
        codeConfie: `  ${CODE}\r\n\r\n`,
        codeRapporte: `${CODE}\n`,
      }).verdict
    ).toBe('inchange');
  });

  it("n'a rien à comparer quand on arrive des favoris", () => {
    expect(
      verdictRetourPlayground({ from: 'favorites', codeConfie: CODE, codeRapporte: 'autre chose' })
        .verdict
    ).toBe('rien-a-comparer');
  });

  it("n'a rien à comparer quand le Playground n'a rien rapporté (retour navigateur)", () => {
    expect(
      verdictRetourPlayground({ from: 'playground', codeConfie: CODE, codeRapporte: null }).verdict
    ).toBe('rien-a-comparer');
    expect(
      verdictRetourPlayground({ from: 'playground', codeConfie: CODE, codeRapporte: '   \n ' })
        .verdict
    ).toBe('rien-a-comparer');
  });

  it('avertit quand un code est rapporté sans preuve de ce qui était parti', () => {
    // On ne peut pas prouver que c'est le même : on ne l'écrase pas en silence.
    expect(
      verdictRetourPlayground({ from: 'playground', codeConfie: null, codeRapporte: CODE }).verdict
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
