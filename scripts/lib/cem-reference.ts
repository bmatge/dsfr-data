/**
 * Rendu de la section « reference » d'un composant a partir du custom-elements
 * manifest (issue #512). Partie PURE, sans I/O : `scripts/build-skills-reference.ts`
 * l'utilise pour ecrire le module genere, et
 * `tests/apps/builder-ia/skills-reference.test.ts` pour verifier que le module
 * commite est bien aligne sur le manifeste.
 *
 * Point cle : les evenements du pipeline ne sont pas ecrits a la main. Ils sont
 * derives du mixin porte par le composant (`TransformerMixin` /
 * `SourceSubscriberMixin`), que le manifeste enregistre. Un composant qui change
 * de mixin voit sa reference suivre toute seule.
 */

// ---------------------------------------------------------------------------
// Types minimaux du custom-elements manifest (schema v2)
// ---------------------------------------------------------------------------

interface CemType {
  text?: string;
}

interface CemAttribute {
  name: string;
  type?: CemType;
  default?: string;
  description?: string;
  deprecated?: string | boolean;
  fieldName?: string;
}

interface CemMember {
  kind: 'field' | 'method';
  name: string;
  privacy?: 'public' | 'private' | 'protected';
  static?: boolean;
  description?: string;
  deprecated?: string | boolean;
  return?: { type?: CemType };
  parameters?: Array<{ name: string; type?: CemType; optional?: boolean }>;
}

interface CemEvent {
  name: string;
  type?: CemType;
  description?: string;
}

export interface CemDeclaration {
  kind: string;
  name: string;
  tagName?: string;
  description?: string;
  attributes?: CemAttribute[];
  members?: CemMember[];
  events?: CemEvent[];
  slots?: Array<{ name: string; description?: string }>;
  cssProperties?: Array<{ name: string; description?: string; default?: string }>;
  mixins?: Array<{ name: string }>;
}

export interface CemManifest {
  modules: Array<{ declarations?: CemDeclaration[] }>;
}

// ---------------------------------------------------------------------------
// Roles du pipeline — derives du mixin, pas ecrits a la main
// ---------------------------------------------------------------------------

type PipelineRole = 'transformer' | 'display' | 'standalone';

function roleOf(decl: CemDeclaration): PipelineRole {
  const mixins = (decl.mixins ?? []).map((m) => m.name);
  if (mixins.includes('TransformerMixin')) return 'transformer';
  if (mixins.includes('SourceSubscriberMixin')) return 'display';
  return 'standalone';
}

/**
 * Bloc « evenements du pipeline » deduit du role.
 *
 * Source de verite : `packages/core/src/utils/data-bridge.ts` (DATA_EVENTS et
 * les interfaces de payload) + `transformer-mixin.ts` / `source-subscriber.ts`.
 * Les evenements sont emis sur `document` (pas sur l'element), donc l'ecoute se
 * fait par `document.addEventListener` avec un filtre sur `detail.sourceId`.
 */
function pipelineEvents(role: PipelineRole): string[] {
  const listen = [
    '| `dsfr-data-loaded` | `{ sourceId, data }` | ecoute | Nouvelles donnees publiees par la source designee par `source`. |',
    '| `dsfr-data-error` | `{ sourceId, error }` | ecoute | Erreur amont. |',
    '| `dsfr-data-loading` | `{ sourceId }` | ecoute | Chargement amont demarre. |',
  ];
  const emitTransformed = [
    '| `dsfr-data-loaded` | `{ sourceId, data }` | emis | Donnees transformees, re-emises sous l’`id` de CE composant (c’est cet `id` que l’aval met dans son `source`). |',
    '| `dsfr-data-error` | `{ sourceId, error }` | emis | Erreur amont ou de transformation, sous l’`id` de ce composant. |',
    '| `dsfr-data-loading` | `{ sourceId }` | emis | Chargement amont relaye vers l’aval. |',
    '| `dsfr-data-source-command` | `{ sourceId, page?, where?, whereKey?, orderBy?, groupBy?, aggregate? }` | emis | Commande de pagination / filtre / tri envoyee a la source AMONT — soit originee par ce composant, soit relayee depuis l’aval. |',
  ];

  if (role === 'transformer') return [...listen, ...emitTransformed];
  if (role === 'display') return listen;
  return [];
}

const ROLE_LABEL: Record<PipelineRole, string> = {
  transformer:
    'transformateur (`TransformerMixin`) — consomme `source`, re-emet sous son propre `id`, relaie les commandes vers l’amont',
  display:
    'affichage (`SourceSubscriberMixin`) — feuille du pipeline : consomme `source`, n’emet pas de donnees',
  standalone:
    'autonome — n’utilise pas les mixins d’abonnement du pipeline (voir les evenements ci-dessous)',
};

// ---------------------------------------------------------------------------
// Rendu markdown
// ---------------------------------------------------------------------------

/** Neutralise les pipes pour ne pas casser les tableaux markdown. */
function cell(text: string | undefined, fallback = '—'): string {
  if (!text) return fallback;
  return (
    text
      .replace(/\s*\n\s*/g, ' ')
      .replace(/\|/g, '\\|')
      .trim() || fallback
  );
}

function fmtDefault(raw: string | undefined): string {
  if (raw === undefined) return '—';
  const v = raw.trim();
  if (v === "''" || v === '""' || v === '``') return '`""` (vide)';
  return '`' + v.replace(/\|/g, '\\|') + '`';
}

/**
 * Description d'un attribut, avec la depreciation mise en avant : un agent qui
 * genere du HTML ne doit pas proposer un alias deprecie.
 */
function describe(item: { description?: string; deprecated?: string | boolean }): string {
  const desc = cell(item.description, '');
  if (item.deprecated) {
    const why = typeof item.deprecated === 'string' ? cell(item.deprecated, '') : '';
    const tail = [why, desc].filter(Boolean).join(' · ');
    return `**DEPRECIE** — ne pas utiliser dans du code neuf${tail ? '. ' + tail : '.'}`;
  }
  return desc || '—';
}

function renderAttributes(decl: CemDeclaration): string {
  const attrs = decl.attributes ?? [];
  if (attrs.length === 0) return '_Aucun attribut._\n';
  const rows = [...attrs]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(
      (a) =>
        `| \`${a.name}\` | \`${cell(a.type?.text, 'string')}\` | ${fmtDefault(a.default)} | ${describe(a)} |`
    );
  return (
    ['| Attribut | Type | Defaut | Description |', '|---|---|---|---|', ...rows].join('\n') + '\n'
  );
}

function renderMethods(decl: CemDeclaration): string {
  const methods = (decl.members ?? []).filter(
    (m) =>
      m.kind === 'method' &&
      !m.static &&
      (m.privacy === undefined || m.privacy === 'public') &&
      !m.name.startsWith('_') &&
      // Cycle de vie Lit / DOM : bruit pour un agent qui genere du HTML.
      ![
        'render',
        'connectedCallback',
        'disconnectedCallback',
        'firstUpdated',
        'updated',
        'willUpdate',
        'createRenderRoot',
        // Hooks des mixins du pipeline : contrat interne composant <-> mixin,
        // sans interet pour qui integre le composant en HTML.
        'onSourceData',
        'onSourceError',
        'onSourceReset',
        'onTransformerData',
      ].includes(m.name)
  );
  if (methods.length === 0) return '';
  const rows = methods
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m) => {
      const params = (m.parameters ?? [])
        .map((p) => `${p.name}${p.optional ? '?' : ''}: ${p.type?.text ?? 'unknown'}`)
        .join(', ');
      const ret = m.return?.type?.text ?? 'void';
      return `| \`${m.name}(${params})\` | \`${cell(ret, 'void')}\` | ${describe(m)} |`;
    });
  return (
    '\n**Methodes publiques**\n\n' +
    ['| Methode | Retour | Description |', '|---|---|---|', ...rows].join('\n') +
    '\n'
  );
}

function renderEvents(decl: CemDeclaration): string {
  const role = roleOf(decl);
  const own = (decl.events ?? []).map((e) => {
    // Le type CEM d'un evenement declare par @fires est toujours `CustomEvent` :
    // sans valeur ajoutee, on laisse la colonne vide, la charge utile est decrite
    // dans le texte du tag.
    const payload =
      e.type?.text && e.type.text !== 'CustomEvent' ? `\`${cell(e.type.text)}\`` : '—';
    return `| \`${e.name}\` | ${payload} | emis | ${cell(e.description)} |`;
  });
  const rows = [...pipelineEvents(role), ...own];
  if (rows.length === 0) return '\n**Evenements** — aucun.\n';
  return (
    '\n**Evenements** (emis sur `document` : ecouter via `document.addEventListener`, filtrer sur `detail.sourceId`)\n\n' +
    ['| Evenement | Payload | Direction | Quand |', '|---|---|---|---|', ...rows].join('\n') +
    '\n'
  );
}

function renderSlotsAndCss(decl: CemDeclaration): string {
  const slots = decl.slots ?? [];
  const css = decl.cssProperties ?? [];
  const parts: string[] = [];
  parts.push(
    slots.length === 0
      ? '\n**Slots** — aucun (le composant rend son propre contenu).\n'
      : '\n**Slots**\n\n' +
          [
            '| Slot | Description |',
            '|---|---|',
            ...slots.map((s) => `| \`${s.name || '(defaut)'}\` | ${cell(s.description)} |`),
          ].join('\n') +
          '\n'
  );
  parts.push(
    css.length === 0
      ? '\n**Variables CSS publiques** — aucune (styler via les variables du DSFR sur le conteneur parent).\n'
      : '\n**Variables CSS publiques**\n\n' +
          [
            '| Variable | Defaut | Description |',
            '|---|---|---|',
            ...css.map(
              (c) => `| \`${c.name}\` | ${fmtDefault(c.default)} | ${cell(c.description)} |`
            ),
          ].join('\n') +
          '\n'
  );
  return parts.join('');
}

export function renderReference(decl: CemDeclaration): string {
  const tag = decl.tagName as string;
  const role = roleOf(decl);
  return [
    `### Reference \`<${tag}>\` (generee depuis le code)`,
    '',
    `**Role pipeline** : ${ROLE_LABEL[role]}.`,
    '',
    '**Attributs**',
    '',
    renderAttributes(decl),
    renderMethods(decl),
    renderEvents(decl),
    renderSlotsAndCss(decl),
  ].join('\n');
}

/**
 * Declarations de custom elements du manifeste, triees par tag name.
 */
export function declarationsOf(manifest: CemManifest): Array<CemDeclaration & { tagName: string }> {
  return manifest.modules
    .flatMap((m) => m.declarations ?? [])
    .filter((d): d is CemDeclaration & { tagName: string } => Boolean(d.tagName))
    .sort((a, b) => a.tagName.localeCompare(b.tagName));
}

/** Table `tag -> markdown de reference`, telle qu'elle est generee. */
export function buildReferences(manifest: CemManifest): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of declarationsOf(manifest)) out[decl.tagName] = renderReference(decl);
  return out;
}
