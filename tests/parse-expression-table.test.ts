/**
 * #839 — table de référence « expression -> arbre » de `parseExpression`.
 *
 * Écrite AVANT le découpage de la fonction en un tokenizer et un parseur par
 * grammaire, sur le code alors en place, puis rejouée après : elle est le
 * contrat que le refactor ne doit pas bouger. Chaque grammaire y est
 * représentée — accès direct, commune `champ:fn`, historique `fn:champ`,
 * `count:champ:valeur`, `meta:total`, ratio ` / `, filtre `{…}` — avec ses
 * pièges (un champ nommé `sum`, `count:sum:3`, un `{…}` qui contient ` / `,
 * une virgule dans un `in`, les espaces multiples).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseExpression, type ParsedExpression } from '@/utils/aggregations.js';

beforeEach(() => {
  // La grammaire historique émet un avertissement de dépréciation unique par
  // module : la table en traverse plusieurs cas, on le tait.
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Expressions valides : l'arbre rendu est comparé en entier. */
const ARBRES: ReadonlyArray<readonly [string, ParsedExpression]> = [
  // --- accès direct ---
  ['total', { type: 'direct', field: 'total' }],
  ['  total  ', { type: 'direct', field: 'total' }],
  ['fields.score', { type: 'direct', field: 'fields.score' }],
  ['', { type: 'direct', field: '' }],
  // Piège : un champ qui porte le nom d'une fonction reste un champ.
  ['sum', { type: 'direct', field: 'sum' }],
  ['evolution', { type: 'direct', field: 'evolution' }],
  // `count` seul est la seule exception : il compte les lignes.
  ['count', { type: 'count', field: '' }],

  // --- grammaire commune "champ:fn" (#303) ---
  ['population:sum', { type: 'sum', field: 'population' }],
  ['score:avg', { type: 'avg', field: 'score' }],
  ['score:min', { type: 'min', field: 'score' }],
  ['score:max', { type: 'max', field: 'score' }],
  ['date:first', { type: 'first', field: 'date' }],
  ['date:last', { type: 'last', field: 'date' }],
  ['nom_departement:distinct', { type: 'distinct', field: 'nom_departement' }],
  ['nom_departement:count-distinct', { type: 'distinct', field: 'nom_departement' }],
  ['recettes:evolution', { type: 'evolution', field: 'recettes' }],
  ['fields.montant:sum', { type: 'sum', field: 'fields.montant' }],
  // Piège : la barre oblique sans espaces reste un caractère de nom de champ.
  ['km/h:avg', { type: 'avg', field: 'km/h' }],

  // --- grammaire historique "fn:champ" (#303, dépréciée) ---
  ['sum:montant', { type: 'sum', field: 'montant' }],
  ['avg:score', { type: 'avg', field: 'score' }],
  // Piège : une colonne nommée `count` garde la lecture historique.
  ['sum:count', { type: 'sum', field: 'count' }],
  // Piège : `evolution` n'a jamais eu de forme inversée (#675) — c'est la
  // moyenne de la colonne « evolution », pas l'évolution de la colonne « avg ».
  ['evolution:avg', { type: 'avg', field: 'evolution' }],
  // Piège : les deux segments sont des fonctions, l'historique l'emporte.
  ['sum:sum', { type: 'sum', field: 'sum' }],
  ['count:count', { type: 'count', field: 'count' }],

  // --- "count:champ:valeur" (#764) ---
  [
    'count:statut:ouvert',
    { type: 'count', field: 'statut', filterField: 'statut', filterValue: 'ouvert' },
  ],
  ['count:valid:true', { type: 'count', field: 'valid', filterField: 'valid', filterValue: true }],
  [
    'count:valid:false',
    { type: 'count', field: 'valid', filterField: 'valid', filterValue: false },
  ],
  ['count:code:75', { type: 'count', field: 'code', filterField: 'code', filterValue: 75 }],
  // Piège : la valeur peut contenir un deux-points, elle est relue en entier.
  [
    'count:heure:12:30',
    { type: 'count', field: 'heure', filterField: 'heure', filterValue: '12:30' },
  ],
  // Piège : la valeur ne passe pas par la résolution d'alias des fonctions.
  [
    'count:mode:count-distinct',
    { type: 'count', field: 'mode', filterField: 'mode', filterValue: 'count-distinct' },
  ],
  // Piège : un champ nommé `sum` compté sur la valeur 3.
  ['count:sum:3', { type: 'count', field: 'sum', filterField: 'sum', filterValue: 3 }],

  // --- meta:total (#659) ---
  ['meta:total', { type: 'meta', field: 'total' }],

  // --- filtre entre accolades (#776) ---
  ['effectif:sum{sexe:eq:F}', { type: 'sum', field: 'effectif', rowFilter: 'sexe:eq:F' }],
  ['count{sexe:eq:F}', { type: 'count', field: '', rowFilter: 'sexe:eq:F' }],
  // Piège : la virgule d'un `in` et celle qui sépare deux clauses cohabitent.
  [
    'effectif:sum{ecole:in:A|B, effectif:gte:80}',
    { type: 'sum', field: 'effectif', rowFilter: 'ecole:in:A|B, effectif:gte:80' },
  ],
  [
    'count:statut:ouvert{secteur:eq:public}',
    {
      type: 'count',
      field: 'statut',
      filterField: 'statut',
      filterValue: 'ouvert',
      rowFilter: 'secteur:eq:public',
    },
  ],
  [' effectif:sum { sexe:eq:F } ', { type: 'sum', field: 'effectif', rowFilter: 'sexe:eq:F' }],

  // --- ratio (#673) ---
  [
    'count:statut:ouvert / count',
    {
      type: 'ratio',
      field: '',
      numerator: { type: 'count', field: 'statut', filterField: 'statut', filterValue: 'ouvert' },
      denominator: { type: 'count', field: '' },
    },
  ],
  [
    'montant:sum / meta:total',
    {
      type: 'ratio',
      field: '',
      numerator: { type: 'sum', field: 'montant' },
      denominator: { type: 'meta', field: 'total' },
    },
  ],
  // Piège : les suites d'espaces sont repliées avant la coupe.
  [
    'montant:sum   /   count',
    {
      type: 'ratio',
      field: '',
      numerator: { type: 'sum', field: 'montant' },
      denominator: { type: 'count', field: '' },
    },
  ],
  [
    'effectif:sum{sexe:eq:F} / effectif:sum',
    {
      type: 'ratio',
      field: '',
      numerator: { type: 'sum', field: 'effectif', rowFilter: 'sexe:eq:F' },
      denominator: { type: 'sum', field: 'effectif' },
    },
  ],
  [
    'effectif:sum{sexe:eq:F, secteur:eq:public} / effectif:sum{secteur:eq:public}',
    {
      type: 'ratio',
      field: '',
      numerator: { type: 'sum', field: 'effectif', rowFilter: 'sexe:eq:F, secteur:eq:public' },
      denominator: { type: 'sum', field: 'effectif', rowFilter: 'secteur:eq:public' },
    },
  ],
  [
    'valeur:evolution / count',
    {
      type: 'ratio',
      field: '',
      numerator: { type: 'evolution', field: 'valeur' },
      denominator: { type: 'count', field: '' },
    },
  ],
];

/** Expressions refusées : le type, le champ porté et un fragment du message. */
const REFUS: ReadonlyArray<readonly [string, string, string]> = [
  // fonction hors liste blanche (#649)
  ['x:somme', 'x', '"somme"'],
  ['montant:somme', 'montant', 'fonctions acceptées'],
  ['evolution:recettes', 'evolution', '"recettes"'],
  ['distinct:commune', 'distinct', '"commune"'],
  ['compte:statut:ouvert', 'statut', '"compte"'],
  // collision avec count:champ:valeur (#764)
  ['montant:sum:categorie=Actif', 'sum', '"montant"'],
  ['sum:montant:ouvert', 'montant', 'count:champ:valeur'],
  ['avg:montant:ouvert', 'montant', 'seule la fonction count'],
  // ratio mal formé (#673)
  ['a:sum / b:sum / c:sum', '', 'mal formé'],
  ['montant:somme / count', '', 'fonctions acceptées'],
  ['a:sum / b:sum / c:sum / d:sum', '', 'mal formé'],
  // filtre mal formé (#776)
  ['effectif:sum{}', '', 'filtre vide'],
  ['effectif:sum{sexe:eq:F', '', 'mal formé'],
  ['effectif:sum{sexe:eq:F}x', '', 'mal formé'],
  ['effectif:sum{a:eq:1}{b:eq:2}', '', 'mal formé'],
  ['{sexe:eq:F}', '', 'sans expression'],
  ['meta:total{sexe:eq:F}', '', 'ne se filtre pas'],
  ['effectif{sexe:eq:F}', '', 'accès direct'],
  ['effectif:somme{sexe:eq:F}', 'effectif', 'inconnue'],
  ['effectif:sum{sexe:egal:F}', '', 'opérateur inconnu'],
  ['effectif:sum{sexe:eq}', '', 'valeur manquante'],
];

describe('#839 — table de référence « expression -> arbre »', () => {
  it.each(ARBRES)('%s', (expression, attendu) => {
    expect(parseExpression(expression)).toEqual(attendu);
  });

  it('la table couvre au moins 40 expressions', () => {
    expect(ARBRES.length + REFUS.length).toBeGreaterThanOrEqual(40);
  });
});

describe('#839 — table de référence des refus', () => {
  it.each(REFUS)('%s', (expression, field, fragment) => {
    const parsed = parseExpression(expression);
    expect(parsed.type).toBe('invalid');
    expect(parsed.field).toBe(field);
    expect(parsed.error).toContain(fragment);
  });
});
