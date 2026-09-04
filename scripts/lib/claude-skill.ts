/**
 * Rendu de la skill Claude Code « dsfr-data » (export local pour les
 * développeurs, docs/AI-SKILLS.md) à partir des skills du builder-IA.
 *
 * Format : le standard « Agent Skills » lu par Claude Code — un dossier avec
 * un `SKILL.md` (frontmatter `name` / `description` + corps court) et des
 * fichiers de référence chargés à la demande (progressive disclosure). Le
 * corps du SKILL.md est un index : principe du pipeline, table des références
 * avec leurs déclencheurs, règles transverses. Chaque référence reprend le
 * contenu complet de la skill (guide rédigé + référence générée + exemples +
 * pièges), inchangé.
 *
 * Pur (aucun accès disque) : le build écrit les fichiers, le test compare.
 */

export interface SkillLike {
  id: string;
  name: string;
  description: string;
  trigger: string[];
  content: string;
}

export const CLAUDE_SKILL_DIR = 'skills/dsfr-data';

/**
 * Valeurs dépendantes de l'environnement de build (VITE_PROXY_URL,
 * VITE_LIB_URL) présentes dans les exemples des skills. L'export commité doit
 * être identique quel que soit le poste : on les remplace par des repères
 * neutres (docs/AI-SKILLS.md).
 */
export interface SkillEnv {
  /** PROXY_BASE_URL_EMBED de packages/shared (vide en CI, instance locale sinon). */
  proxyBase: string;
  /** LIB_URL de packages/shared (CDN jsdelivr par défaut). */
  libUrl: string;
}

export const LIB_URL_PLACEHOLDER = 'https://VOTRE_INSTANCE/dist';

function neutralize(text: string, env: SkillEnv): string {
  let out = text;
  if (env.proxyBase) out = out.split(env.proxyBase + '/').join('/');
  if (env.libUrl) out = out.split(env.libUrl).join(LIB_URL_PLACEHOLDER);
  return out;
}

/** Ordre de présentation dans l'index : composants du pipeline d'abord. */
const GROUPS: Array<[string, string[]]> = [
  [
    'Pipeline de données (source → transformation → affichage)',
    ['dsfrDataSource', 'dsfrDataQuery', 'dsfrDataNormalize', 'dsfrDataJoin', 'dsfrDataUnpivot'],
  ],
  [
    'Interaction et filtres',
    [
      'dsfrDataFacets',
      'dsfrDataSearch',
      'dsfrDataContext',
      'dsfrDataContextFilter',
      'dsfrDataContextTags',
    ],
  ],
  [
    'Affichage',
    [
      'dsfrDataChart',
      'dsfrDataKpi',
      'dsfrDataKpiGroup',
      'dsfrDataList',
      'dsfrDataDisplay',
      'dsfrDataPodium',
      'dsfrDataMap',
      'dsfrDataA11y',
      'dsfrDataBeacon',
    ],
  ],
  ['APIs et requêtes', ['apiProviders', 'odsql', 'odsApiVersions']],
  [
    'Guides transverses',
    ['compositionPatterns', 'chartTypes', 'dsfrColors', 'dsfrChartNative', 'troubleshooting'],
  ],
  ['Assistant IA (actions JSON du builder-IA)', ['createChartAction', 'reloadDataAction']],
];

function fileName(id: string): string {
  return id.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()).replace(/^-/, '') + '.md';
}

function cell(s: string): string {
  // L'antislash d'abord : sans lui, un `\|` deja present en entree ressortait en
  // `\\|`, ou l'antislash echappe l'antislash et laisse le pipe casser la cellule
  // (alerte CodeQL js/incomplete-sanitization).
  return s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

function renderIndexTable(skills: SkillLike[]): string {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const out: string[] = [];
  const row = (s: SkillLike) =>
    `| [${cell(s.name)}](references/${fileName(s.id)}) | ${cell(s.description)} | ${cell(s.trigger.slice(0, 6).join(', '))} |`;
  for (const [title, ids] of GROUPS) {
    const present = ids.filter((id) => byId.has(id));
    if (present.length === 0) continue;
    out.push(`### ${title}`, '', '| Référence | Quand la lire | Déclencheurs |', '|---|---|---|');
    for (const id of present) {
      out.push(row(byId.get(id)!));
      seen.add(id);
    }
    out.push('');
  }
  const rest = skills.filter((s) => !seen.has(s.id));
  if (rest.length) {
    out.push('### Autres', '', '| Référence | Quand la lire | Déclencheurs |', '|---|---|---|');
    for (const s of rest) out.push(row(s));
    out.push('');
  }
  return out.join('\n');
}

export function renderSkillMd(skills: SkillLike[], version: string): string {
  return `---
name: dsfr-data
description: Génère et corrige du HTML/JS qui utilise les Web Components dataviz dsfr-data (<dsfr-data-source>, query, normalize, facets, search, chart, kpi, list, map, context…). À charger dès qu'il est question de dsfr-data, de DSFR Chart, d'un graphique / carte / tableau / KPI conforme DSFR alimenté par une API (OpenDataSoft, data.gouv, Grist, INSEE Melodi) ou d'un pipeline source → transformation → affichage.
---

# dsfr-data — skill Claude Code

Bibliothèque de Web Components de dataviz conformes au DSFR (Design System de l'État), version
${version}. Cette skill est **générée** par \`npm run build:skills\` depuis les skills du builder-IA
(\`apps/builder-ia/src/skills.ts\` + référence extraite du code) : ne pas l'éditer à la main.

## Principe : un pipeline d'éléments HTML reliés par \`id\` / \`source\`

\`\`\`html
<dsfr-data-source id="src" api-type="opendatasoft"
  base-url="https://data.economie.gouv.fr" dataset-id="mon-dataset"></dsfr-data-source>
<dsfr-data-query id="q" source="src" group-by="region" aggregate="population:sum"></dsfr-data-query>
<dsfr-data-chart source="q" type="bar" label-field="region" value-field="population__sum"></dsfr-data-chart>
\`\`\`

- Une **source** charge les données (API ou données inline), les **transformateurs** (query,
  normalize, join, unpivot, facets, search, context) consomment un \`source\` et ré-émettent sous
  leur propre \`id\`, les **afficheurs** (chart, kpi, list, display, map, podium) sont des feuilles.
- Les alias d'agrégation suivent la convention \`champ__fonction\` (\`population__sum\`).
- Chargement : \`<script type="module" src=".../dsfr-data.esm.js">\` + CSS DSFR et DSFR Chart
  (voir la référence \`compositionPatterns\`).
- Dans les exemples, \`${LIB_URL_PLACEHOLDER}\` désigne l'URL de la bibliothèque (CDN
  \`https://cdn.jsdelivr.net/npm/dsfr-data@0/dist\` ou \`/dist\` de votre instance) et les chemins
  \`/…-proxy/\` sont relatifs à votre instance Charts builder.

## Méthode

1. Identifier le besoin (quelle source, quelle transformation, quel affichage).
2. **Lire la référence** du ou des composants concernés dans \`references/\` avant d'écrire :
   attributs, événements, slots et pièges y sont exhaustifs et générés depuis le code.
3. Vérifier les cas d'erreur listés dans \`troubleshooting\` quand un rendu reste vide.

## Références

${renderIndexTable(skills)}
## Règles transverses

- Ne pas inventer d'attribut : s'en tenir à la table « Attributs » de la référence du composant.
- Un composant qui consomme des données porte toujours \`source="<id amont>"\`.
- Mode dynamique (données rechargées depuis l'API) ou embarqué (données inline) : ne pas mélanger
  les deux sur une même source.
- Accessibilité : coupler un graphique à \`<dsfr-data-a11y>\` (tableau + export) quand la page est
  publique.
`;
}

export function renderReference(skill: SkillLike, env: SkillEnv): string {
  return `# ${skill.name}

> ${skill.description}
>
> Déclencheurs : ${skill.trigger.join(', ')}

${neutralize(skill.content.trim(), env)}
`;
}

/** Table chemin relatif (à CLAUDE_SKILL_DIR) → contenu. */
export function renderClaudeSkill(
  skills: SkillLike[],
  version: string,
  env: SkillEnv
): Map<string, string> {
  const files = new Map<string, string>();
  files.set('SKILL.md', renderSkillMd(skills, version));
  for (const s of skills) files.set(`references/${fileName(s.id)}`, renderReference(s, env));
  return files;
}
