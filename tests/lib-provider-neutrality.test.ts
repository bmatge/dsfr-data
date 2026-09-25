import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Garde-fou statique de neutralité fournisseur (#1134).
 *
 * Principe : les composants (`packages/core/src/components`) et leurs
 * utilitaires (`packages/core/src/utils`) ne connaissent AUCUN fournisseur
 * d'API. Grammaires de requête, endpoints, noms de fournisseur, types bruts
 * d'un portail : tout cela vit dans les adaptateurs (`packages/core/src/adapters`)
 * et dans les `ProviderConfig` de `@dsfr-data/shared`. Ajouter un fournisseur
 * doit rester « un adaptateur + une config, zéro modification des composants »
 * (docs/ARCHITECTURE.md, §Adapters et ProviderConfig).
 *
 * Sur le modèle de `lib-app-boundary.test.ts` : commentaires et JSDoc retirés
 * avant analyse (une mention en prose n'est pas une dépendance), `.test.ts`
 * exclus. Une dérive légitime est déclarée dans `EXCEPTIONS`, avec son issue ;
 * une exception qui ne couvre plus rien fait échouer le test (même mécanique
 * que `check:specs-tables`) : sans cela la liste ne ferait que grossir.
 */

const ROOT = join(__dirname, '..');
const CORE = join(ROOT, 'packages/core/src');

/**
 * Retire commentaires de bloc et de ligne en respectant chaînes, gabarits et
 * littéraux d'expression régulière — `'https://…'` ou `/['’]/` ne sont pas
 * des commentaires. Les lignes sont conservées (numéros exacts).
 */
function stripComments(code: string): string {
  let out = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i];
    const d = code[i + 1];
    if (c === '/' && d === '*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      out += code.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
      continue;
    }
    if (c === '/' && d === '/') {
      const end = code.indexOf('\n', i);
      const stop = end < 0 ? n : end;
      out += ' '.repeat(stop - i);
      i = stop;
      continue;
    }
    if (c === '/') {
      const before = out.replace(/\s+$/, '');
      const last = before[before.length - 1];
      if (!last || '(,=:[!&|?{};+-*%<>~^'.includes(last) || /\breturn$/.test(before)) {
        let j = i + 1;
        let inClass = false;
        while (j < n && code[j] !== '\n') {
          const ch = code[j];
          if (ch === '\\') {
            j += 2;
            continue;
          }
          if (ch === '[') inClass = true;
          else if (ch === ']') inClass = false;
          else if (ch === '/' && !inClass) break;
          j++;
        }
        out += code.slice(i, j + 1);
        i = j + 1;
        continue;
      }
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n && code[j] !== c) {
        if (code[j] === '\\') j++;
        j++;
      }
      out += code.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Périmètre : composants, utilitaires, points d'entrée publics. */
function perimeterFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') && !e.name.endsWith('.d.ts'))
        files.push(p);
    }
  };
  walk(join(CORE, 'components'));
  walk(join(CORE, 'utils'));
  for (const e of readdirSync(CORE)) if (/^index.*\.ts$/.test(e)) files.push(join(CORE, e));
  return files.sort();
}

/**
 * Motifs interdits hors adaptateurs. Chacun nomme ce qu'il attrape : c'est le
 * message que lira celui qui le réintroduit.
 */
const MOTIFS: ReadonlyArray<{ name: string; re: RegExp }> = [
  // Grammaires et paramètres de requête des fournisseurs
  { name: 'filtre géographique ODSQL in_bbox()', re: /in_bbox\s*\(/ },
  { name: 'clé de requête group_by', re: /\bgroup_by\b/ },
  { name: 'clé de requête order_by', re: /\border_by\b/ },
  { name: 'clé de réponse total_count', re: /\btotal_count\b/ },
  { name: 'clé de pagination page_size', re: /\bpage_size\b/ },
  { name: 'clé de réponse nhits', re: /\bnhits\b/ },
  {
    // Suffixes d'opérateur de Tabular (`champ__sum`, `champ__exact`) ; les
    // classes BEM des composants (`dsfr-data-list__sort-btn`) ne comptent pas
    name: 'suffixe d’opérateur __fonction',
    re: /(?<!dsfr-data-[\w-]*)__(sum|avg|min|max|count|groupby|sort|exact|differs|contains|in|notin|less|greater|strictly_less|strictly_greater|isnull|isnotnull)\b(?!-)/,
  },
  { name: 'opérateur strictly_less / strictly_greater', re: /strictly_(less|greater)/ },
  { name: 'paramètre refine. / exclude.', re: /\b(refine|exclude)\./ },
  {
    name: 'endpoint de fournisseur (/records, /exports, /profile, /facets, /sql)',
    re: /\/(records|exports|profile|facets|sql)(?=\/?['"`?]|\/\$\{)/,
  },
  { name: 'jointure ODSQL « AND »', re: /['"`] AND ['"`]/ },
  { name: 'littéral de dialecte odsql', re: /['"`]odsql['"`]/ },
  {
    name: 'type de champ déclaré par un fournisseur (int, double, decimal…)',
    re: /['"`](int|integer|long|double|float|decimal)['"`]/,
  },
  // Identifiants de fournisseur
  {
    name: 'nom de fournisseur',
    re: /opendatasoft|tabular|grist|insee|melodi|datagouv|data\.gouv|parquet/i,
  },
  {
    name: 'identifiant préfixé par un fournisseur',
    re: /\b(Grist|Tabular|Ods|Odsql|Insee)[A-Z]\w+/,
  },
  // Tests de type d'API
  { name: "test d'api-type (hors 'generic')", re: /apiType\s*[!=]==?\s*['"`](?!generic['"`])/ },
  { name: "test du type d'adaptateur", re: /adapter\??\.type\s*[!=]==?/ },
  // Noms d'hôtes
  {
    name: 'nom d’hôte de fournisseur',
    re: /[a-z0-9-]+\.(gouv\.fr|opendatasoft\.com|getgrist\.com|insee\.fr)/i,
  },
];

interface Exception {
  /** Chemin relatif à `packages/core/src`. */
  file: string;
  /** Ce que la ligne excusée contient. */
  line: RegExp;
  /** Issue qui porte la dérive (ou qui la résorbera). */
  issue: string;
  reason: string;
}

/**
 * Dérives déclarées. Chacune doit couvrir au moins une ligne réelle : une
 * exception morte fait échouer le test ci-dessous. Retirer l'entrée quand
 * l'issue qui la porte est livrée.
 */
const EXCEPTIONS: readonly Exception[] = [
  {
    file: 'utils/map-geo-keys.ts',
    line: /INSEE_TO_REGION/,
    issue: '#1134',
    reason:
      'Code officiel géographique (COG) : un référentiel de l’État lu dans les données, ' +
      'pas une API — le nom de l’organisme qui le publie n’est pas une dépendance.',
  },
  {
    file: 'index.ts',
    line: /\bTabular(Adapter|Profile|ProfileParams)\b|adapters\/tabular-adapter\.js/,
    issue: '#985',
    reason:
      'API publique : le profil de colonnes Tabular (fetchProfile) est exporté pour les ' +
      'builders ; un point d’entrée n’est pas un composant.',
  },
];

interface Hit {
  file: string;
  lineNo: number;
  text: string;
  motif: string;
}

function scan(): Hit[] {
  const hits: Hit[] = [];
  for (const path of perimeterFiles()) {
    const file = relative(CORE, path);
    const lines = stripComments(readFileSync(path, 'utf8')).split('\n');
    lines.forEach((text, idx) => {
      for (const { name, re } of MOTIFS) {
        if (re.test(text)) hits.push({ file, lineNo: idx + 1, text: text.trim(), motif: name });
      }
    });
  }
  return hits;
}

const excuses = (exc: Exception, hit: Hit) => exc.file === hit.file && exc.line.test(hit.text);

describe('#1134 — les composants ne connaissent aucun fournisseur', () => {
  const hits = scan();

  it('aucun motif de fournisseur hors exceptions déclarées', () => {
    const offenders = hits
      .filter((h) => !EXCEPTIONS.some((e) => excuses(e, h)))
      .map((h) => `${h.file}:${h.lineNo} [${h.motif}] ${h.text}`);
    expect(
      offenders,
      'Déplacer cette spécificité dans un adaptateur (packages/core/src/adapters) ou sa ' +
        'ProviderConfig, ou la déclarer dans EXCEPTIONS avec son issue.'
    ).toEqual([]);
  });

  it('aucune exception morte : chacune couvre encore au moins une ligne', () => {
    const dead = EXCEPTIONS.filter((e) => !hits.some((h) => excuses(e, h))).map(
      (e) => `${e.file} ${e.line} (${e.issue})`
    );
    expect(dead, 'Exception devenue sans objet : la retirer de EXCEPTIONS.').toEqual([]);
  });

  it('chaque exception cite son issue et sa raison', () => {
    for (const e of EXCEPTIONS) {
      expect(e.issue, e.file).toMatch(/^#\d+$/);
      expect(e.reason.length, e.file).toBeGreaterThan(20);
    }
  });
});

describe('#1134 — le contrat ApiAdapter reste une surface de capacités', () => {
  const apiAdapter = stripComments(readFileSync(join(CORE, 'adapters/api-adapter.ts'), 'utf8'));

  it('AdapterCapabilities ne contient que des booléens et whereFormat', () => {
    const body = apiAdapter.match(/export interface AdapterCapabilities \{([\s\S]*?)\n\}/)?.[1];
    expect(body, 'interface AdapterCapabilities introuvable').toBeTruthy();
    const members = (body ?? '')
      .split(';')
      .map((m) => m.trim())
      .filter(Boolean);
    expect(members.length).toBeGreaterThan(0);
    for (const m of members) {
      const [, name, type] = m.match(/^(?:readonly\s+)?(\w+)\??\s*:\s*([\s\S]+)$/) ?? [];
      if (name === 'whereFormat') continue;
      expect(type?.trim(), `AdapterCapabilities.${name}`).toBe('boolean');
    }
  });

  /** Méthodes optionnelles d'ApiAdapter (`nom?(`). */
  const optionalMethods = [
    ...(apiAdapter.match(/export interface ApiAdapter \{([\s\S]*?)\n\}/)?.[1] ?? '').matchAll(
      /^\s*(\w+)\?\s*\(/gm
    ),
  ].map((m) => m[1]);

  it('les méthodes optionnelles sont repérées', () => {
    expect(optionalMethods).toEqual(
      expect.arrayContaining([
        'fetchFacets',
        'describeFieldTypes',
        'supportsServerWhere',
        'translateWhere',
        'joinWhere',
        'escapeSearchTerm',
        'buildBboxWhere',
      ])
    );
  });

  it('toute méthode optionnelle est appelée en ?. côté composant', () => {
    const offenders: string[] = [];
    for (const path of perimeterFiles()) {
      const lines = stripComments(readFileSync(path, 'utf8')).split('\n');
      lines.forEach((text, idx) => {
        for (const m of optionalMethods) {
          // Appel direct `x.methode(` ou forcé `x.methode!(` ; `x.methode?.(`
          // est le seul appel admis — un adaptateur tiers peut ne pas l'avoir
          if (new RegExp(`\\.${m}!?\\s*\\(`).test(text)) {
            offenders.push(`${relative(CORE, path)}:${idx + 1} ${m} — ${text.trim()}`);
          }
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
