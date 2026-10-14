import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  canServerExpress,
  hasServerClauseRule,
  splitFilterForServer,
  splitFilterForOdsql,
  odsqlCanExpress,
  tabularCanExpress,
  gristCanExpress,
  SERVER_CLAUSE_RULES,
  COLON_FILTER_OPERATORS,
  getProvider,
} from '@dsfr-data/shared';
import type { ProviderId } from '@dsfr-data/shared';
import { SKILLS } from '../packages/shared/src/skills/skills';

/**
 * Le tableau « Comparaison de texte par fournisseur » (ADR-159, lot 4, #1285)
 * a UNE source, `docs/ARCHITECTURE.md`, entre les marqueurs
 * `<!-- CAPACITES-TEXTE:debut -->` et `<!-- CAPACITES-TEXTE:fin -->`. Ce test
 * le compare à la règle du code — `canServerExpress` pour chaque clause,
 * `contextSearchTemplate` pour la recherche — et à ses deux copies : le guide
 * des skills (`dsfrDataQuery`) et la spec `dsfr-data-query.html`. Une règle
 * changée sans le tableau, ou une copie qui diverge, le fait échouer.
 */

const ROOT = join(__dirname, '..');
const DEBUT = '<!-- CAPACITES-TEXTE:debut -->';
const FIN = '<!-- CAPACITES-TEXTE:fin -->';

function entre(texte: string, fichier: string): string {
  const a = texte.indexOf(DEBUT);
  const b = texte.indexOf(FIN);
  if (a < 0 || b < a) throw new Error(`marqueurs CAPACITES-TEXTE absents de ${fichier}`);
  return texte.slice(a + DEBUT.length, b);
}

/** Lignes `| … |` du tableau Markdown de la source. */
const DOC = entre(readFileSync(join(ROOT, 'docs/ARCHITECTURE.md'), 'utf-8'), 'ARCHITECTURE.md');
const LIGNES_MD = DOC.split('\n')
  .map((l) => l.trim())
  .filter((l) => l.startsWith('|'));

function cellulesMd(ligne: string): string[] {
  return ligne
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

const [ENTETE, , ...CORPS] = LIGNES_MD.map(cellulesMd);
/** Texte lu d'une cellule : sans marques de code. */
const plat = (c: string) => c.replace(/`/g, '');

const FOURNISSEURS: Record<string, ProviderId> = {
  Opendatasoft: 'opendatasoft',
  Tabular: 'tabular',
  Grist: 'grist',
};
const colonnes = ENTETE.slice(1).map((nom) => {
  const id = FOURNISSEURS[nom];
  if (!id) throw new Error(`colonne inconnue : ${nom}`);
  return id;
});

type Verdict = 'serveur' | 'navigateur';
function verdict(cellule: string): Verdict | null {
  const mot = plat(cellule).split(/[\s:;,]/)[0];
  return mot === 'serveur' || mot === 'navigateur' ? mot : null;
}

/** Clauses éprouvées par une ligne : ses clauses écrites, ou ses opérateurs nus. */
function clausesDe(premiere: string): string[] {
  const codes = [...premiere.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const ecrites = codes.filter((c) => /^[\w|]+:\w+(:.*)?$/.test(c));
  if (ecrites.length > 0) return ecrites;
  const ops: readonly string[] = COLON_FILTER_OPERATORS;
  return codes.filter((c) => ops.includes(c)).map((op) => `champ:${op}:x`);
}

const operateurDe = (clause: string) => clause.split(':')[1];

describe('tableau des capacités de texte (ADR-159) : la doc suit le code', () => {
  it('le tableau existe et nomme les trois fournisseurs à règle', () => {
    expect(colonnes).toEqual(Object.keys(SERVER_CLAUSE_RULES));
    expect(CORPS.length).toBeGreaterThan(4);
  });

  it('chaque clause : « serveur » si et seulement si canServerExpress la confie', () => {
    const ecarts: string[] = [];
    for (const ligne of CORPS) {
      for (const clause of clausesDe(ligne[0])) {
        colonnes.forEach((fournisseur, i) => {
          const attendu: Verdict = canServerExpress(fournisseur, clause) ? 'serveur' : 'navigateur';
          const lu = verdict(ligne[i + 1]);
          if (lu !== attendu)
            ecarts.push(`${clause} / ${fournisseur} : doc « ${lu} », code « ${attendu} »`);
        });
      }
    }
    expect(ecarts).toEqual([]);
  });

  it('les douze opérateurs du dialecte colon sont dans le tableau', () => {
    const couverts = new Set(CORPS.flatMap((l) => clausesDe(l[0]).map(operateurDe)));
    expect([...couverts].sort()).toEqual([...COLON_FILTER_OPERATORS].sort());
  });

  it('la recherche du contexte : « serveur » si le fournisseur déclare de quoi chercher', () => {
    const ligne = CORPS.find((l) => /recherche/.test(l[0]));
    expect(ligne, 'ligne « recherche » du tableau').toBeDefined();
    colonnes.forEach((fournisseur, i) => {
      const gabarit = getProvider(fournisseur).query.contextSearchTemplate ?? null;
      const cellule = plat(ligne![i + 1]);
      expect(verdict(cellule), fournisseur).toBe(gabarit ? 'serveur' : 'navigateur');
      // Gabarit en clause `contains` : un terme que la règle refuse est cherché
      // dans le navigateur, et la cellule le dit.
      if (gabarit?.includes(':contains:')) {
        const refuse = !canServerExpress(fournisseur, 'champ:contains:a*b');
        expect(cellule.includes('terme à étoile : navigateur'), fournisseur).toBe(refuse);
      }
    });
  });
});

describe('tableau des capacités de texte : ses deux copies sont identiques', () => {
  it('le guide des skills (dsfrDataQuery) reprend le tableau ligne à ligne', () => {
    const guide = SKILLS.dsfrDataQuery.content;
    const manquantes = LIGNES_MD.filter((l) => !guide.includes(l));
    expect(manquantes).toEqual([]);
  });

  it('la spec dsfr-data-query reprend le tableau cellule à cellule', () => {
    const fichier = 'specs/components/dsfr-data-query.html';
    const bloc = entre(readFileSync(join(ROOT, fichier), 'utf-8'), fichier);
    const texte = (h: string) =>
      h
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .trim();
    const lignes = [...bloc.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) =>
      [...m[1].matchAll(/<t[hd]>([\s\S]*?)<\/t[hd]>/g)].map((c) => texte(c[1]))
    );
    expect(lignes).toEqual([ENTETE, ...CORPS].map((l) => l.map(plat)));
  });
});

describe('une seule règle serveur (ADR-159, lot 4)', () => {
  it('les règles nommées sont celles du registre', () => {
    expect(SERVER_CLAUSE_RULES).toEqual({
      opendatasoft: odsqlCanExpress,
      tabular: tabularCanExpress,
      grist: gristCanExpress,
    });
  });

  it('un fournisseur sans règle propre confie toute clause', () => {
    for (const fournisseur of ['insee', 'generic', 'ckan']) {
      expect(hasServerClauseRule(fournisseur)).toBe(false);
      for (const op of COLON_FILTER_OPERATORS) {
        expect(canServerExpress(fournisseur, `champ:${op}:x`), `${fournisseur} ${op}`).toBe(true);
      }
    }
  });

  it('splitFilterForOdsql et splitFilterForServer partagent de la même façon', () => {
    const filtre = 'annee:eq:2024, nom:contains:aliment, a|b:notcontains:y, c:contains:a*b';
    const { server, client } = splitFilterForOdsql(filtre);
    expect(splitFilterForServer('opendatasoft', filtre)).toEqual({ server, client });
    expect(splitFilterForServer('tabular', filtre)).toEqual({
      server: 'annee:eq:2024, nom:contains:aliment',
      client: 'a|b:notcontains:y, c:contains:a*b',
    });
    expect(splitFilterForServer('grist', filtre)).toEqual({
      server: 'annee:eq:2024, nom:contains:aliment, c:contains:a*b',
      client: 'a|b:notcontains:y',
    });
    expect(splitFilterForServer('insee', filtre)).toEqual({ server: filtre, client: '' });
  });
});
