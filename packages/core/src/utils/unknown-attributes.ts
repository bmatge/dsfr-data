/**
 * Les échecs de nommage se voient — volet 2 : l'attribut inconnu du bundle
 * CHARGÉ (#727).
 *
 * Une page peut être écrite juste, contre une documentation juste, et ne rien
 * faire : le bundle servi est antérieur à l'attribut. Le custom element ignore
 * en silence tout attribut qu'il ne déclare pas — aucune erreur, aucune trace.
 * Le banc d'essai a vécu quatre versions mineures de retard sans s'en
 * apercevoir.
 *
 * Pourquoi au RUNTIME, alors qu'un lint statique existe déjà
 * (`packages/shared/src/debug/lint-markup.ts`, outil MCP
 * `diagnose_widget_code`) : celui-là compare au manifeste du DÉPÔT. Il
 * confirmera que `fill-field` est un attribut valide — c'est vrai dans le
 * dépôt, et faux dans la page. Seul `observedAttributes`, lu sur la classe
 * réellement enregistrée, dit ce que la bibliothèque chargée sait faire.
 *
 * Deux sorties, volontairement dissociées :
 *
 * - **Le marqueur DOM `data-dsfr-unknown-attrs` est posé partout**, sans
 *   condition. Il ne coûte rien, il est lisible dans l'inspecteur, et c'est
 *   lui que relit le volet Diagnostic — y compris le bundle autonome
 *   `dsfr-data.debug.js`, dont toute la raison d'être est de diagnostiquer
 *   une page qu'on ne contrôle pas. Même doctrine que
 *   `data-dsfr-config-error`.
 * - **Le message console est réservé au développement.** Un avertissement par
 *   composant sur un site public serait du bruit dans la console d'un
 *   visiteur, qui n'y peut rien.
 */

/** Attribut porteur du diagnostic, relu par `snapshotGraph` côté collecteur. */
export const UNKNOWN_ATTRS_MARKER = 'data-dsfr-unknown-attrs';

/**
 * Attributs globaux du HTML : légitimes sur n'importe quel élément, y compris
 * un custom element, et donc jamais déclarés par un composant.
 *
 * La liste de `lint-markup.ts` (`id`, `class`, `style`, `data-`) suffit à un
 * fragment de code d'exemple ; elle est très incomplète pour du DOM réel, où
 * `slot`, `hidden`, `tabindex`, `role`, `title`, `lang` et `part` arrivent
 * couramment sur un composant intégré dans une page gouvernementale.
 *
 * Source : la liste des attributs globaux du HTML vivant, complétée des
 * attributs de Shadow DOM (`part`, `exportparts`, `slot`) et de `popover`.
 */
const ATTRS_GLOBAUX = new Set([
  'accesskey',
  'autocapitalize',
  'autocorrect',
  'autofocus',
  'class',
  'contenteditable',
  'dir',
  'draggable',
  'enterkeyhint',
  'exportparts',
  'hidden',
  'id',
  'inert',
  'inputmode',
  'is',
  'itemid',
  'itemprop',
  'itemref',
  'itemscope',
  'itemtype',
  'lang',
  'nonce',
  'part',
  'popover',
  'role',
  'slot',
  'spellcheck',
  'style',
  'tabindex',
  'title',
  'translate',
  'writingsuggestions',
]);

/**
 * Préfixes légitimes, par famille.
 *
 * Les trois premiers sont du HTML : données libres, ARIA, gestionnaires en
 * ligne. Les suivants sont les directives des frameworks hôtes qui SURVIVENT
 * dans le DOM — le point important, car un gabarit compilé en amont (React,
 * Lit, Vue avec build) n'en laisse aucune trace, tandis qu'un gabarit lu dans
 * le document lui-même (Vue « in-DOM », Angular, Alpine, htmx, Svelte, Astro)
 * les dépose tels quels sur la balise. Les signaler ferait crier au loup sur
 * du code parfaitement valide.
 */
const PREFIXES_LEGITIMES = [
  'data-', // données libres (et, par ricochet, Stimulus, Turbo, Alpine `data-x-`)
  'aria-', // ARIA
  'x-', // Alpine.js
  'v-', // Vue, directives
  'hx-', // htmx
  'ng-', // Angular, forme historique
  'bind-', // Angular, forme canonique de [prop]
  'ref-', // Angular, forme canonique de #ref
  'client:', // Astro, directives d'hydratation
  'bind:', // Svelte
  'on:', // Svelte
  'use:', // Svelte
  'class:', // Svelte
  'style:', // Svelte
  'transition:', // Svelte
  'animate:', // Svelte
  'let:', // Svelte
  'wire:', // Livewire
];

/**
 * Premiers caractères qui marquent une liaison de gabarit plutôt qu'un
 * attribut : `[prop]` et `(event)` d'Angular, `*ngIf` structurel, `#ref`,
 * `:prop` et `@event` de Vue, `.prop` et `?attr` de Lit rendus côté hôte,
 * `_ngcontent-…` d'Angular. Aucun attribut de la bibliothèque ne commence par
 * l'un d'eux.
 */
const PREMIERS_CARACTERES_DE_LIAISON = new Set(['[', '(', '*', '#', ':', '@', '.', '?', '_', '$']);

/**
 * Gestionnaire d'événement en ligne : `onclick`, `onpointerdown`…
 *
 * Un simple préfixe `on` serait trop large — `dsfr-data-join` a un attribut
 * qui s'appelle exactement `on`, et une faute de frappe dessus doit se voir.
 */
const GESTIONNAIRE_EN_LIGNE = /^on[a-z]{3,}$/;

function estLegitime(name: string): boolean {
  if (ATTRS_GLOBAUX.has(name)) return true;
  if (PREMIERS_CARACTERES_DE_LIAISON.has(name[0])) return true;
  if (GESTIONNAIRE_EN_LIGNE.test(name)) return true;
  return PREFIXES_LEGITIMES.some((p) => name.startsWith(p));
}

/**
 * Hôtes de développement.
 *
 * `import.meta.env.DEV` ne suffirait pas : il vaut `false` dans le bundle
 * publié, celui-là même que charge une page de banc d'essai servie en
 * statique — exactement le cas que ce contrôle existe pour couvrir. On lit
 * donc l'hôte, plus deux entrées explicites pour les cas qu'il ne couvre pas.
 */
const HOTES_DEV = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]', '']);

function enDeveloppement(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as Window & { DSFR_DATA_DEV?: boolean; dsfrDataDebug?: unknown };
  // Interrupteur explicite, et présence du bundle autonome de diagnostic :
  // dans les deux cas quelqu'un a demandé à voir.
  if (w.DSFR_DATA_DEV === true) return true;
  if (w.dsfrDataDebug) return true;
  const { hostname, protocol } = window.location;
  if (protocol === 'file:') return true;
  return HOTES_DEV.has(hostname) || hostname.endsWith('.local') || hostname.endsWith('.localhost');
}

/**
 * Un message par couple balise + attribut, pour toute la durée de la page.
 *
 * Une page qui répète le même graphique quarante fois répéterait sinon
 * quarante fois la même ligne, et la console deviendrait le bruit qu'on
 * apprend à replier.
 */
const dejaSignales = new Set<string>();

/** Remet le compteur d'avertissements à zéro (tests). */
export function resetUnknownAttributeWarnings(): void {
  dejaSignales.clear();
}

/**
 * Compare les attributs présents sur l'élément à ceux que la classe chargée
 * déclare, pose le marqueur DOM et avertit en développement.
 *
 * Appelé par `SourceSubscriberMixin` et `TransformerMixin` en
 * `connectedCallback` : les attributs de la balise ouvrante sont tous posés à
 * ce moment, pour un élément écrit dans le document comme pour un élément
 * construit puis inséré. Un attribut ajouté APRÈS l'insertion échappe au
 * contrôle — c'est le prix d'un contrôle qui ne coûte rien au reste du cycle.
 *
 * @returns les attributs inconnus, dans l'ordre du document.
 */
export function checkUnknownAttributes(el: HTMLElement): string[] {
  const classe = el.constructor as unknown as { observedAttributes?: string[] };
  const observes = classe.observedAttributes;
  // Une classe qui ne déclare rien n'apprend rien : mieux vaut se taire que
  // de déclarer inconnu l'ensemble du balisage.
  if (!Array.isArray(observes) || observes.length === 0) return [];
  const connus = new Set(observes.map((a) => a.toLowerCase()));

  const inconnus: string[] = [];
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    if (connus.has(name) || estLegitime(name)) continue;
    inconnus.push(name);
  }

  if (inconnus.length === 0) {
    el.removeAttribute(UNKNOWN_ATTRS_MARKER);
    return [];
  }

  el.setAttribute(UNKNOWN_ATTRS_MARKER, inconnus.join(', '));

  if (enDeveloppement()) {
    const tag = el.tagName.toLowerCase();
    for (const name of inconnus) {
      const cle = `${tag} ${name}`;
      if (dejaSignales.has(cle)) continue;
      dejaSignales.add(cle);
      console.warn(
        `${tag}: attribut "${name}" inconnu de la version chargée de dsfr-data — ` +
          `il sera ignoré en silence. Vérifiez l'orthographe, ou mettez la bibliothèque à jour.`
      );
    }
  }

  return inconnus;
}
