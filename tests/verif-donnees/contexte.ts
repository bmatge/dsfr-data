/**
 * Contrôles DÉTERMINISTES du contexte, des facettes, de la recherche et de l'URL.
 *
 * Ce que ce domaine vérifie n'est pas un rendu figé : c'est le chiffre qui
 * SUIT UN GESTE. Un filtre vient de l'utilisateur, traverse le contexte, part
 * vers N sources, revient en lignes, et finit en KPI, en liste ou en tag.
 * L'ordre des événements y compte — d'où le navigateur, et non un DOM simulé.
 *
 * La page rend un balisage `dsfr-data-*` et l'on lit ce qu'elle AFFICHE ;
 * l'oracle repart des mêmes lignes brutes et recalcule en tableaux nus. Le
 * `pipeline` d'un `expect` décrit ce que la page DOIT montrer après le geste
 * — jamais comment la lib s'y prend.
 *
 * Les bornes de date dynamiques (`today`, `current-month`, `current-year`,
 * `last-n-days`) sont jouées sous HORLOGE FIXE, au 1er juin 2026 à 00 h 30
 * heure de Paris : à cet instant, la date UTC est encore le 31 mai. Un
 * `current-month` calculé en UTC filtre alors le mois PRÉCÉDENT pendant que
 * le tag affiche « mois en cours » — c'est le défaut de la revue du
 * 2026-09-13, et c'est la mutation qui garde ce lot.
 *
 * Chaque contrôle a été vérifié EN ÉCHEC sur un défaut injecté dans la lib
 * (`tools/oracle/README.md`, « prouver une mutation »).
 */
import type { Check, Manifest, Step } from '../../tools/oracle/manifest.js';
import {
  BUDGETS,
  DATASET_BUDGETS,
  DATASET_CONTEXTE,
  ETABLISSEMENTS,
  HOTE_ODS_CONTEXTE,
  urlContexte,
} from './fixtures-contexte.js';

/** Instant fixe des contrôles à borne dynamique : le 1er juin 2026, 00 h 30 à Paris. */
const HORLOGE = { now: '2026-06-01T00:30:00+02:00', timezone: 'Europe/Paris' } as const;

/** Les deux jeux, sous les noms que les `expects` leur donnent. */
const JEUX = { main: ETABLISSEMENTS, budgets: BUDGETS };

/**
 * Source ODS : c'est la seule qui accepte un `where` de contexte. Une source
 * en mode URL refuse les commandes adapter (#288) — un filtre de contexte y
 * serait perdu, et le contrôle vert.
 */
function sourceOds(id: string, dataset: string = DATASET_CONTEXTE): string {
  return `
  <dsfr-data-source id="${id}" api-type="opendatasoft" base-url="${HOTE_ODS_CONTEXTE}"
    dataset-id="${dataset}" fetch-mode="export" max-records="500"></dsfr-data-source>`;
}

/** Source en tableau nu : ce que filtrent les facettes et la recherche CLIENT. */
function sourceUrl(id: string): string {
  return `
  <dsfr-data-source id="${id}" url="${urlContexte('etablissements')}"></dsfr-data-source>`;
}

function kpiCount(id: string, source: string, label = 'Lignes'): string {
  return `
  <dsfr-data-kpi id="${id}" source="${source}" value="count" format="nombre" label="${label}"></dsfr-data-kpi>`;
}

function kpiSomme(id: string, source: string, champ = 'population'): string {
  return `
  <dsfr-data-kpi id="${id}" source="${source}" value="${champ}:sum" format="nombre" label="Total"></dsfr-data-kpi>`;
}

/** Liste déroulante de régions, dans l'ordre du jeu. */
const REGIONS = ['Occitanie', 'Bretagne', 'Normandie', "Provence-Alpes-Côte d'Azur"];

function selectRegions(id: string, multiple = false): string {
  const options = REGIONS.map((r) => `<option value="${r}">${r}</option>`).join('');
  return `
  <label for="${id}">Région</label>
  <select id="${id}"${multiple ? ' multiple' : ''}>
    ${multiple ? '' : '<option value="">Toutes</option>'}${options}
  </select>`;
}

/** Le couple d'observations le plus parlant d'un filtre : combien, et combien de population. */
function attendCompteEtSomme(pipeline: Step[]) {
  return [
    { kind: 'kpi' as const, id: 'k-n', agg: 'count' as const, pipeline },
    { kind: 'kpi' as const, id: 'k-pop', agg: 'sum' as const, field: 'population', pipeline },
  ];
}

/** Un filtre de date : une étape de filtre par borne. */
function entre(debut?: string, fin?: string): Step[] {
  const filters = [];
  if (debut !== undefined) filters.push({ field: 'date', op: 'gte' as const, value: debut });
  if (fin !== undefined) filters.push({ field: 'date', op: 'lt' as const, value: fin });
  return [{ op: 'filter', filters }];
}

const CHECKS: Check[] = [
  // ---------------------------------------------------------------------
  // dsfr-data-context + dsfr-data-context-filter : les opérateurs
  // ---------------------------------------------------------------------
  {
    id: 'ctx-eq',
    mode: 'deterministic',
    origin:
      '#229 — le filtre le plus simple : une région choisie dans une liste, diffusée par le contexte à sa source, et les deux chiffres qui en découlent.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceOds('s-eq')}
  <dsfr-data-context id="ctx" sources="s-eq">
    <dsfr-data-context-filter field="region" operator="eq" ui="ui-region" label="Région">
    </dsfr-data-context-filter>
  </dsfr-data-context>
  ${selectRegions('ui-region')}
  ${kpiCount('k-n', 's-eq')}${kpiSomme('k-pop', 's-eq')}`,
    actions: [{ kind: 'select', selector: '#ui-region', value: 'Occitanie' }],
    expects: attendCompteEtSomme([
      { op: 'filter', filters: [{ field: 'region', op: 'eq', value: 'Occitanie' }] },
    ]),
  },

  {
    id: 'ctx-in-multiselect',
    mode: 'deterministic',
    origin:
      '#229 — `in` alimenté par une sélection multiple : les valeurs arrivent jointes par `|`, et le résultat doit être un OU, pas une intersection vide.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceOds('s-in')}
  <dsfr-data-context id="ctx" sources="s-in">
    <dsfr-data-context-filter field="region" operator="in" ui="ui-region" label="Région">
    </dsfr-data-context-filter>
  </dsfr-data-context>
  ${selectRegions('ui-region', true)}
  ${kpiCount('k-n', 's-in')}${kpiSomme('k-pop', 's-in')}`,
    actions: [{ kind: 'select', selector: '#ui-region', values: ['Occitanie', 'Bretagne'] }],
    expects: attendCompteEtSomme([
      { op: 'filter', filters: [{ field: 'region', op: 'in', values: ['Occitanie', 'Bretagne'] }] },
    ]),
  },

  {
    id: 'ctx-in-virgule',
    mode: 'deterministic',
    origin:
      '#231, ADR-031 — le même `in` saisi au clavier, valeurs séparées par une virgule : c’est la forme lisible que porte l’URL.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceOds('s-in2')}
  <dsfr-data-context id="ctx" sources="s-in2">
    <dsfr-data-context-filter field="region" operator="in" ui="ui-region" label="Région">
    </dsfr-data-context-filter>
  </dsfr-data-context>
  <label for="ui-region">Régions</label><input id="ui-region" type="text">
  ${kpiCount('k-n', 's-in2')}${kpiSomme('k-pop', 's-in2')}`,
    actions: [{ kind: 'fill', selector: '#ui-region', value: 'Occitanie,Normandie' }],
    expects: attendCompteEtSomme([
      {
        op: 'filter',
        filters: [{ field: 'region', op: 'in', values: ['Occitanie', 'Normandie'] }],
      },
    ]),
  },

  {
    id: 'ctx-between',
    mode: 'deterministic',
    origin:
      '#229 — `between` sur deux contrôles de date : la borne basse est incluse, la haute EXCLUE. Le jeu porte une ligne sur chacune des deux bornes.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceOds('s-btw')}
  <dsfr-data-context id="ctx" sources="s-btw">
    <dsfr-data-context-filter field="date" operator="between" ui="ui-min ui-max" label="Période">
    </dsfr-data-context-filter>
  </dsfr-data-context>
  <label for="ui-min">Début</label><input id="ui-min" type="date">
  <label for="ui-max">Fin</label><input id="ui-max" type="date">
  ${kpiCount('k-n', 's-btw')}${kpiSomme('k-pop', 's-btw')}`,
    actions: [
      { kind: 'fill', selector: '#ui-min', value: '2026-03-01' },
      { kind: 'fill', selector: '#ui-max', value: '2026-05-01' },
    ],
    expects: attendCompteEtSomme(entre('2026-03-01', '2026-05-01')),
  },

  {
    id: 'ctx-lt-day-after',
    mode: 'deterministic',
    origin:
      '#230 — `lt-day-after` : « jusqu’au 15 mars inclus » se délègue en `< 16 mars`. Le jeu porte une ligne au 15 et une au 16 : une borne fausse d’un jour se voit.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceOds('s-lda')}
  <dsfr-data-context id="ctx" sources="s-lda">
    <dsfr-data-context-filter field="date" operator="lt-day-after" ui="ui-jour" label="Jusqu’au">
    </dsfr-data-context-filter>
  </dsfr-data-context>
  <label for="ui-jour">Jusqu’au</label><input id="ui-jour" type="date">
  ${kpiCount('k-n', 's-lda')}${kpiSomme('k-pop', 's-lda')}`,
    actions: [{ kind: 'fill', selector: '#ui-jour', value: '2026-03-15' }],
    expects: attendCompteEtSomme(entre(undefined, '2026-03-16')),
  },

  {
    id: 'ctx-year-of',
    mode: 'deterministic',
    origin:
      '#230, #646 — `year-of` : une année nue devient la plage [1er janvier, 1er janvier suivant). Le jeu porte le 31 décembre et le 10 janvier qui l’encadrent.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceOds('s-yo')}
  <dsfr-data-context id="ctx" sources="s-yo">
    <dsfr-data-context-filter field="date" operator="year-of" ui="ui-annee" label="Année">
    </dsfr-data-context-filter>
  </dsfr-data-context>
  <label for="ui-annee">Année</label><input id="ui-annee" type="text">
  ${kpiCount('k-n', 's-yo')}${kpiSomme('k-pop', 's-yo')}`,
    actions: [{ kind: 'fill', selector: '#ui-annee', value: '2025' }],
    expects: attendCompteEtSomme(entre('2025-01-01', '2026-01-01')),
  },

  {
    id: 'ctx-month-of',
    mode: 'deterministic',
    origin:
      '#230 — `month-of` : un mois devient la plage [1er du mois, 1er du suivant). Le jeu porte le 31 mars et le 2 avril.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceOds('s-mo')}
  <dsfr-data-context id="ctx" sources="s-mo">
    <dsfr-data-context-filter field="date" operator="month-of" ui="ui-mois" label="Mois">
    </dsfr-data-context-filter>
  </dsfr-data-context>
  <label for="ui-mois">Mois</label><input id="ui-mois" type="month">
  ${kpiCount('k-n', 's-mo')}${kpiSomme('k-pop', 's-mo')}`,
    actions: [{ kind: 'fill', selector: '#ui-mois', value: '2026-03' }],
    expects: attendCompteEtSomme(entre('2026-03-01', '2026-04-01')),
  },

  {
    id: 'ctx-default-today',
    mode: 'deterministic',
    origin:
      '#682 — `default="today"` résolu au montage dans le fuseau LOCAL : à 00 h 30 à Paris le 1er juin, le jour civil est le 1er juin, pas le 31 mai.',
    feed: { kind: 'fixture', datasets: JEUX },
    clock: HORLOGE,
    markup: `${sourceOds('s-today')}
  <dsfr-data-context id="ctx" sources="s-today">
    <dsfr-data-context-filter field="date" operator="eq" ui="ui-jour" default="today" label="Jour">
    </dsfr-data-context-filter>
  </dsfr-data-context>
  <label for="ui-jour">Jour</label><input id="ui-jour" type="date">
  ${kpiCount('k-n', 's-today')}${kpiSomme('k-pop', 's-today')}`,
    expects: attendCompteEtSomme([
      { op: 'filter', filters: [{ field: 'date', op: 'eq', value: '2026-06-01' }] },
    ]),
  },

  {
    id: 'ctx-default-first-of-month',
    mode: 'deterministic',
    origin:
      '#682 — `default="first-of-month"` : le 1er du mois en cours, jour civil local, écrit dans le contrôle puis émis par le chemin normal.',
    feed: { kind: 'fixture', datasets: JEUX },
    clock: HORLOGE,
    markup: `${sourceOds('s-fom')}
  <dsfr-data-context id="ctx" sources="s-fom">
    <dsfr-data-context-filter field="date" operator="gte" ui="ui-jour" default="first-of-month"
      label="Depuis"></dsfr-data-context-filter>
  </dsfr-data-context>
  <label for="ui-jour">Depuis</label><input id="ui-jour" type="date">
  ${kpiCount('k-n', 's-fom')}${kpiSomme('k-pop', 's-fom')}`,
    expects: attendCompteEtSomme(entre('2026-06-01')),
  },

  {
    id: 'ctx-current-month',
    mode: 'deterministic',
    origin:
      '#682, revue du 2026-09-13 — `current-month` en JOUR CIVIL LOCAL. À 00 h 30 à Paris le 1er juin, l’UTC est encore le 31 mai : une borne calculée en UTC filtre mai pendant que le tag affiche « mois en cours ».',
    feed: { kind: 'fixture', datasets: JEUX },
    clock: HORLOGE,
    markup: `${sourceOds('s-cm')}
  <dsfr-data-context id="ctx" sources="s-cm">
    <dsfr-data-context-filter field="date" operator="current-month" ui="ui-cm" label="Période">
    </dsfr-data-context-filter>
  </dsfr-data-context>
  <div class="fr-checkbox-group">
    <input type="checkbox" id="ui-cm" checked><label for="ui-cm">Mois en cours</label>
  </div>
  ${kpiCount('k-n', 's-cm')}${kpiSomme('k-pop', 's-cm')}`,
    expects: attendCompteEtSomme(entre('2026-06-01', '2026-07-01')),
  },

  {
    id: 'ctx-current-year-scolaire',
    mode: 'deterministic',
    origin:
      '#735 — `current-year` avec `year-start-month="9"` : l’année en cours au 1er juin 2026 est 2025-2026, soit [1er septembre 2025, 1er septembre 2026).',
    feed: { kind: 'fixture', datasets: JEUX },
    clock: HORLOGE,
    markup: `${sourceOds('s-cy')}
  <dsfr-data-context id="ctx" sources="s-cy">
    <dsfr-data-context-filter field="date" operator="current-year" year-start-month="9"
      ui="ui-cy" label="Année scolaire"></dsfr-data-context-filter>
  </dsfr-data-context>
  <div class="fr-checkbox-group">
    <input type="checkbox" id="ui-cy" checked><label for="ui-cy">Année en cours</label>
  </div>
  ${kpiCount('k-n', 's-cy')}${kpiSomme('k-pop', 's-cy')}`,
    expects: attendCompteEtSomme(entre('2025-09-01', '2026-09-01')),
  },

  {
    id: 'ctx-last-n-days',
    mode: 'deterministic',
    origin:
      '#230, #682 — `last-n-days="7"` au 1er juin : la borne basse est le 25 mai, jour civil local. Le jeu porte une ligne au 24 et une au 25.',
    feed: { kind: 'fixture', datasets: JEUX },
    clock: HORLOGE,
    markup: `${sourceOds('s-lnd')}
  <dsfr-data-context id="ctx" sources="s-lnd">
    <dsfr-data-context-filter field="date" operator="last-n-days" ui="ui-jours" label="Depuis">
    </dsfr-data-context-filter>
  </dsfr-data-context>
  <label for="ui-jours">Jours</label><input id="ui-jours" type="text" value="7">
  ${kpiCount('k-n', 's-lnd')}${kpiSomme('k-pop', 's-lnd')}`,
    expects: attendCompteEtSomme(entre('2026-05-25')),
  },

  // ---------------------------------------------------------------------
  // Plusieurs sources, plusieurs filtres
  // ---------------------------------------------------------------------
  {
    id: 'ctx-deux-sources',
    mode: 'deterministic',
    origin:
      '#229, ADR-031 — le fan-out : UN filtre, DEUX sources cibles, deux jeux différents. Chacune doit répondre sur ses propres lignes.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceOds('s-etab')}${sourceOds('s-budg', DATASET_BUDGETS)}
  <dsfr-data-context id="ctx" sources="s-etab s-budg">
    <dsfr-data-context-filter field="region" operator="eq" ui="ui-region" label="Région">
    </dsfr-data-context-filter>
  </dsfr-data-context>
  ${selectRegions('ui-region')}
  ${kpiCount('k-n', 's-etab')}${kpiSomme('k-montant', 's-budg', 'montant')}`,
    actions: [{ kind: 'select', selector: '#ui-region', value: 'Occitanie' }],
    expects: [
      {
        kind: 'kpi',
        id: 'k-n',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'region', op: 'eq', value: 'Occitanie' }] }],
      },
      {
        kind: 'kpi',
        id: 'k-montant',
        agg: 'sum',
        field: 'montant',
        from: 'budgets',
        pipeline: [{ op: 'filter', filters: [{ field: 'region', op: 'eq', value: 'Occitanie' }] }],
      },
    ],
  },

  {
    id: 'ctx-champ-absent-805',
    mode: 'deterministic',
    origin:
      '#805 — un champ absent d’UNE des cibles : cette source est exclue du filtre et garde toutes ses lignes, les autres sont filtrées. Pas un HTTP 400, pas une source vidée.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceOds('s-etab')}${sourceOds('s-budg', DATASET_BUDGETS)}
  <dsfr-data-context id="ctx" sources="s-etab s-budg">
    <dsfr-data-context-filter field="categorie" operator="eq" ui="ui-cat" label="Catégorie">
    </dsfr-data-context-filter>
  </dsfr-data-context>
  <label for="ui-cat">Catégorie</label>
  <select id="ui-cat">
    <option value="">Toutes</option><option value="Lycée">Lycée</option>
    <option value="École">École</option><option value="Collège">Collège</option>
  </select>
  ${kpiCount('k-n', 's-etab')}${kpiCount('k-budg', 's-budg', 'Budgets')}`,
    actions: [{ kind: 'select', selector: '#ui-cat', value: 'Lycée' }],
    expects: [
      {
        kind: 'kpi',
        id: 'k-n',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'categorie', op: 'eq', value: 'Lycée' }] }],
      },
      // La source sans la colonne garde TOUTES ses lignes : aucune étape.
      { kind: 'kpi', id: 'k-budg', agg: 'count', from: 'budgets' },
    ],
  },

  {
    id: 'ctx-deux-filtres-and',
    mode: 'deterministic',
    origin:
      'ADR-031 — deux filtres, deux ÉMETTEURS : leurs clauses se combinent en ET sur la source. Une clé d’émetteur partagée ferait gagner le dernier arrivé, et l’ordre des balises HTML déciderait du chiffre.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceOds('s-and')}
  <dsfr-data-context id="ctx" sources="s-and">
    <dsfr-data-context-filter field="region" operator="eq" ui="ui-region" label="Région">
    </dsfr-data-context-filter>
    <dsfr-data-context-filter field="categorie" operator="eq" ui="ui-cat" label="Catégorie">
    </dsfr-data-context-filter>
  </dsfr-data-context>
  ${selectRegions('ui-region')}
  <label for="ui-cat">Catégorie</label>
  <select id="ui-cat">
    <option value="">Toutes</option><option value="Lycée">Lycée</option>
    <option value="École">École</option><option value="Collège">Collège</option>
  </select>
  ${kpiCount('k-n', 's-and')}${kpiSomme('k-pop', 's-and')}`,
    actions: [
      { kind: 'select', selector: '#ui-region', value: 'Occitanie' },
      { kind: 'select', selector: '#ui-cat', value: 'Lycée' },
    ],
    expects: attendCompteEtSomme([
      {
        op: 'filter',
        filters: [
          { field: 'region', op: 'eq', value: 'Occitanie' },
          { field: 'categorie', op: 'eq', value: 'Lycée' },
        ],
      },
    ]),
  },

  // ---------------------------------------------------------------------
  // Les SILENCES (#878) — un chiffre faux, plausible, et aucune erreur
  // ---------------------------------------------------------------------
  {
    id: 'ctx-sources-separateur-virgule',
    mode: 'deterministic',
    origin:
      '#878, cas 1 du 18/09 (banc, viz/barometre-france-num-v2) — `sources` attend des ids séparés par des ESPACES ; écrit avec une virgule, `sources="s-etab,s-budg"` est UN id qui ne désigne aucune source du document, le contexte ne filtre plus rien et les sommes portent sur tout le jeu. Le KPI doit montrer la somme FILTRÉE, et la bibliothèque doit DIRE qu’un id de `sources` ne désigne rien (cousin de #805 et de #772 — dont l’utilitaire de séparateur suspect ne couvre pas `sources`).',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceOds('s-etab')}${sourceOds('s-budg', DATASET_BUDGETS)}
  <dsfr-data-context id="ctx" sources="s-etab,s-budg">
    <dsfr-data-context-filter field="region" operator="eq" ui="ui-region" label="Région">
    </dsfr-data-context-filter>
  </dsfr-data-context>
  ${selectRegions('ui-region')}
  ${kpiSomme('k-pop', 's-etab')}${kpiSomme('k-montant', 's-budg', 'montant')}`,
    actions: [{ kind: 'select', selector: '#ui-region', value: 'Occitanie' }],
    expects: [
      {
        kind: 'kpi',
        id: 'k-pop',
        agg: 'sum',
        field: 'population',
        pipeline: [{ op: 'filter', filters: [{ field: 'region', op: 'eq', value: 'Occitanie' }] }],
      },
      {
        kind: 'kpi',
        id: 'k-montant',
        agg: 'sum',
        field: 'montant',
        from: 'budgets',
        pipeline: [{ op: 'filter', filters: [{ field: 'region', op: 'eq', value: 'Occitanie' }] }],
      },
      // Le jour où la bibliothèque parle, elle doit dire QUOI : l'id fautif.
      { kind: 'diagnostic', id: 'ctx', expect: 'warning', contains: 's-etab,s-budg' },
    ],
    skip: 'DÉFAUT (#878, cas 1) — `sources="s-etab,s-budg"` est accepté sans un mot : `_validate()` ne vérifie que la non-vacuité, `sourceIds` découpe sur les espaces, et la commande part vers un id que personne n’écoute. Mesuré le 2026-09-19 : k-pop lib 38 350 / oracle 13 550 (population, Occitanie), k-montant lib 14 000 / oracle 5 000 ; diagnostic : aucun marqueur, aucun message console. Attendu : les sommes filtrées, ET un message nommant l’id « s-etab,s-budg » qui ne désigne aucune `dsfr-data-source` du document (piste : étendre l’utilitaire de #772 à `sources`, virgule suspecte). Issue à ouvrir par la supervision.',
  },

  {
    id: 'ctx-sources-separateur-espace',
    mode: 'deterministic',
    origin:
      '#878 — le même balisage écrit JUSTE (`sources="s-etab s-budg"`) : les deux sommes suivent le filtre, et la bibliothèque se tait. C’est le témoin du précédent, et le contrôle du lecteur de silences dans l’autre sens — un avertissement qui partirait sur un balisage correct serait un faux positif.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceOds('s-etab')}${sourceOds('s-budg', DATASET_BUDGETS)}
  <dsfr-data-context id="ctx" sources="s-etab s-budg">
    <dsfr-data-context-filter field="region" operator="eq" ui="ui-region" label="Région">
    </dsfr-data-context-filter>
  </dsfr-data-context>
  ${selectRegions('ui-region')}
  ${kpiSomme('k-pop', 's-etab')}${kpiSomme('k-montant', 's-budg', 'montant')}`,
    actions: [{ kind: 'select', selector: '#ui-region', value: 'Occitanie' }],
    expects: [
      {
        kind: 'kpi',
        id: 'k-pop',
        agg: 'sum',
        field: 'population',
        pipeline: [{ op: 'filter', filters: [{ field: 'region', op: 'eq', value: 'Occitanie' }] }],
      },
      {
        kind: 'kpi',
        id: 'k-montant',
        agg: 'sum',
        field: 'montant',
        from: 'budgets',
        pipeline: [{ op: 'filter', filters: [{ field: 'region', op: 'eq', value: 'Occitanie' }] }],
      },
      { kind: 'diagnostic', id: 'ctx', expect: 'silence' },
    ],
  },

  // ---------------------------------------------------------------------
  // URL
  // ---------------------------------------------------------------------
  {
    id: 'ctx-url-params',
    mode: 'deterministic',
    origin:
      '#231, ADR-031 — une URL portant un paramètre pré-remplit le contrôle d’UI, qui émet par le MÊME chemin qu’un clic. Rien n’est injecté dans un where.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceOds('s-url')}
  <dsfr-data-context id="ctx" sources="s-url" url-sync>
    <dsfr-data-context-filter field="region" operator="eq" ui="ui-region" label="Région">
    </dsfr-data-context-filter>
  </dsfr-data-context>
  ${selectRegions('ui-region')}
  ${kpiCount('k-n', 's-url')}${kpiSomme('k-pop', 's-url')}`,
    actions: [{ kind: 'goto', value: '?region=Bretagne' }],
    expects: attendCompteEtSomme([
      { op: 'filter', filters: [{ field: 'region', op: 'eq', value: 'Bretagne' }] },
    ]),
  },

  {
    id: 'ctx-url-deux-navigations',
    mode: 'deterministic',
    origin:
      '#231 — le contrôle en DEUX navigations : on filtre, la synchro d’URL écrit, on recharge cette URL, et les chiffres doivent être exactement les mêmes. Une URL qui ne dit pas tout le filtre se voit ici, et nulle part ailleurs.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceOds('s-nav')}
  <dsfr-data-context id="ctx" sources="s-nav" url-sync>
    <dsfr-data-context-filter field="region" operator="eq" ui="ui-region" label="Région">
    </dsfr-data-context-filter>
    <dsfr-data-context-filter field="categorie" operator="eq" ui="ui-cat" label="Catégorie">
    </dsfr-data-context-filter>
  </dsfr-data-context>
  ${selectRegions('ui-region')}
  <label for="ui-cat">Catégorie</label>
  <select id="ui-cat">
    <option value="">Toutes</option><option value="Lycée">Lycée</option>
    <option value="École">École</option><option value="Collège">Collège</option>
  </select>
  ${kpiCount('k-n', 's-nav')}${kpiSomme('k-pop', 's-nav')}`,
    actions: [
      { kind: 'select', selector: '#ui-region', value: 'Occitanie' },
      { kind: 'select', selector: '#ui-cat', value: 'Lycée' },
      // Sans valeur : on recharge l'URL que la synchro vient d'écrire.
      { kind: 'goto' },
    ],
    expects: attendCompteEtSomme([
      {
        op: 'filter',
        filters: [
          { field: 'region', op: 'eq', value: 'Occitanie' },
          { field: 'categorie', op: 'eq', value: 'Lycée' },
        ],
      },
    ]),
  },

  // ---------------------------------------------------------------------
  // Libellés affichés
  // ---------------------------------------------------------------------
  {
    id: 'ctx-value-libelle',
    mode: 'deterministic',
    origin:
      '#742 — `dsfr-data-context-value` interpole la valeur courante du filtre dans une phrase. Le libellé attendu n’est pas écrit à la main : c’est la région la plus représentée du jeu, recalculée.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceOds('s-val')}
  <dsfr-data-context id="ctx" sources="s-val">
    <dsfr-data-context-filter field="region" operator="eq" ui="ui-region" label="Région">
    </dsfr-data-context-filter>
  </dsfr-data-context>
  ${selectRegions('ui-region')}
  <h2><dsfr-data-context-value id="v-titre" for="ctx"
    template="Résultats pour {{region}}" fallback="Résultats pour toute la France">
  </dsfr-data-context-value></h2>
  ${kpiCount('k-n', 's-val')}`,
    actions: [{ kind: 'select', selector: '#ui-region', value: 'Occitanie' }],
    expects: [
      {
        kind: 'text',
        id: 'v-titre',
        prefix: 'Résultats pour ',
        column: 'region',
        pipeline: [
          { op: 'group-by', by: 'region', columns: { n: { agg: 'count' } } },
          { op: 'order-by', column: 'n', dir: 'desc' },
          { op: 'limit', n: 1 },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-n',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'region', op: 'eq', value: 'Occitanie' }] }],
      },
    ],
  },

  {
    id: 'ctx-tags-libelle',
    mode: 'deterministic',
    origin:
      '#232 — `dsfr-data-context-tags` affiche « libellé : valeur » pour chaque filtre actif. Le tag doit dire CE QUI EST FILTRÉ, sinon il rassure à tort.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceOds('s-tags')}
  <dsfr-data-context id="ctx" sources="s-tags">
    <dsfr-data-context-filter field="region" operator="eq" ui="ui-region" label="Région">
    </dsfr-data-context-filter>
  </dsfr-data-context>
  ${selectRegions('ui-region')}
  <dsfr-data-context-tags id="t-ctx" for="ctx" clear-all></dsfr-data-context-tags>
  ${kpiCount('k-n', 's-tags')}`,
    actions: [{ kind: 'select', selector: '#ui-region', value: 'Occitanie' }],
    expects: [
      {
        kind: 'text',
        id: 't-ctx',
        selector: '.fr-tag',
        prefix: 'Région : ',
        column: 'region',
        pipeline: [
          { op: 'group-by', by: 'region', columns: { n: { agg: 'count' } } },
          { op: 'order-by', column: 'n', dir: 'desc' },
          { op: 'limit', n: 1 },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-n',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'region', op: 'eq', value: 'Occitanie' }] }],
      },
    ],
  },

  // ---------------------------------------------------------------------
  // dsfr-data-facets
  // ---------------------------------------------------------------------
  {
    id: 'facettes-comptes-client',
    mode: 'deterministic',
    origin:
      '#421 — les COMPTEURS affichés à côté de chaque valeur, et leur ordre (tri par fréquence décroissante). Un compteur est une promesse : « cocher ceci laissera ce nombre de lignes ».',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceUrl('s-fc')}
  <dsfr-data-facets id="f-region" source="s-fc" fields="region" labels="region:Région">
  </dsfr-data-facets>
  ${kpiCount('k-n', 'f-region')}`,
    expects: [
      {
        kind: 'facets',
        id: 'f-region',
        group: 'Région',
        valueColumn: 'region',
        countColumn: 'n',
        pipeline: [
          { op: 'group-by', by: 'region', columns: { n: { agg: 'count' } } },
          { op: 'order-by', column: 'n', dir: 'desc' },
        ],
      },
      { kind: 'kpi', id: 'k-n', agg: 'count' },
    ],
  },

  {
    id: 'facettes-tri-alpha',
    mode: 'deterministic',
    origin:
      '#645, #741 — `sort="region:alpha:asc"` : une facette se range par ordre alphabétique quand ce sont des noms, pas par fréquence. L’ORDRE AFFICHÉ fait partie du contrôle.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceUrl('s-fa')}
  <dsfr-data-facets id="f-region" source="s-fa" fields="region" labels="region:Région"
    sort="region:alpha:asc"></dsfr-data-facets>`,
    expects: [
      {
        kind: 'facets',
        id: 'f-region',
        group: 'Région',
        valueColumn: 'region',
        countColumn: 'n',
        pipeline: [
          { op: 'group-by', by: 'region', columns: { n: { agg: 'count' } } },
          { op: 'order-by', column: 'region', dir: 'asc' },
        ],
      },
    ],
  },

  {
    id: 'facettes-poids',
    mode: 'deterministic',
    origin:
      '#739 — `weight-field="effectif"` : le compteur annonce la SOMME d’une mesure, pas un nombre de lignes. Le tri par compteur porte alors sur cette somme.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceUrl('s-fp')}
  <dsfr-data-facets id="f-region" source="s-fp" fields="region" labels="region:Région"
    weight-field="effectif"></dsfr-data-facets>`,
    expects: [
      {
        kind: 'facets',
        id: 'f-region',
        group: 'Région',
        valueColumn: 'region',
        countColumn: 'n',
        pipeline: [
          { op: 'group-by', by: 'region', columns: { n: { agg: 'sum', field: 'effectif' } } },
          { op: 'order-by', column: 'n', dir: 'desc' },
        ],
      },
    ],
  },

  {
    id: 'facettes-selection-aval',
    mode: 'deterministic',
    origin:
      '#421 — cocher une valeur : le compteur annoncé doit être EXACTEMENT le nombre de lignes qui restent en aval, KPI et tableau compris.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceUrl('s-fs')}
  <dsfr-data-facets id="f-region" source="s-fs" fields="region" labels="region:Région">
  </dsfr-data-facets>
  ${kpiCount('k-n', 'f-region')}${kpiSomme('k-pop', 'f-region')}
  <dsfr-data-query id="q-cat" source="f-region" group-by="categorie"
    aggregate="population:sum:pop" order-by="pop:desc"></dsfr-data-query>
  <dsfr-data-list id="l-cat" source="q-cat"
    columns="categorie:Catégorie, pop:Population"></dsfr-data-list>`,
    actions: [{ kind: 'click', selector: '#f-region label:has-text("Occitanie")' }],
    expects: [
      {
        kind: 'kpi',
        id: 'k-n',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'region', op: 'eq', value: 'Occitanie' }] }],
      },
      {
        kind: 'kpi',
        id: 'k-pop',
        agg: 'sum',
        field: 'population',
        pipeline: [{ op: 'filter', filters: [{ field: 'region', op: 'eq', value: 'Occitanie' }] }],
      },
      {
        kind: 'list',
        id: 'l-cat',
        columns: [{ column: 'categorie' }, { column: 'pop', numeric: true }],
        pipeline: [
          { op: 'filter', filters: [{ field: 'region', op: 'eq', value: 'Occitanie' }] },
          {
            op: 'group-by',
            by: 'categorie',
            columns: { pop: { agg: 'sum', field: 'population' } },
          },
          { op: 'order-by', column: 'pop', dir: 'desc' },
        ],
      },
    ],
  },

  {
    id: 'facettes-croisees',
    mode: 'deterministic',
    origin:
      '#421 — deux facettes : cocher dans l’une recalcule les compteurs de l’autre, mais PAS les siens (une facette ne se filtre pas elle-même, sinon elle n’afficherait plus qu’une valeur).',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceUrl('s-fx')}
  <dsfr-data-facets id="f-deux" source="s-fx" fields="categorie,region"
    labels="categorie:Catégorie | region:Région"></dsfr-data-facets>
  ${kpiCount('k-n', 'f-deux')}`,
    actions: [{ kind: 'click', selector: '#f-deux label:has-text("École")' }],
    expects: [
      {
        kind: 'facets',
        id: 'f-deux',
        group: 'Région',
        valueColumn: 'region',
        countColumn: 'n',
        pipeline: [
          { op: 'filter', filters: [{ field: 'categorie', op: 'eq', value: 'École' }] },
          { op: 'group-by', by: 'region', columns: { n: { agg: 'count' } } },
          { op: 'order-by', column: 'n', dir: 'desc' },
        ],
      },
      {
        kind: 'facets',
        id: 'f-deux',
        group: 'Catégorie',
        valueColumn: 'categorie',
        countColumn: 'n',
        pipeline: [
          { op: 'group-by', by: 'categorie', columns: { n: { agg: 'count' } } },
          { op: 'order-by', column: 'n', dir: 'desc' },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-n',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'categorie', op: 'eq', value: 'École' }] }],
      },
    ],
  },

  {
    id: 'facettes-disjonctives',
    mode: 'deterministic',
    origin:
      '#421 — `disjunctive="region"` : deux valeurs cochées dans le MÊME champ font un OU. Sans disjonction, la seconde remplacerait la première, et le chiffre serait celui d’une seule région.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceUrl('s-fd')}
  <dsfr-data-facets id="f-region" source="s-fd" fields="region" labels="region:Région"
    disjunctive="region"></dsfr-data-facets>
  ${kpiCount('k-n', 'f-region')}${kpiSomme('k-pop', 'f-region')}`,
    actions: [
      { kind: 'click', selector: '#f-region label:has-text("Occitanie")' },
      { kind: 'click', selector: '#f-region label:has-text("Bretagne")' },
    ],
    expects: attendCompteEtSomme([
      { op: 'filter', filters: [{ field: 'region', op: 'in', values: ['Occitanie', 'Bretagne'] }] },
    ]),
  },

  {
    id: 'facettes-serveur',
    mode: 'deterministic',
    origin:
      '#676, #680 — `server-facets` : les valeurs et les compteurs viennent de l’API, pas des lignes chargées. Ils doivent dire la même chose que le recalcul sur les lignes brutes.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceOds('s-fsrv')}
  <dsfr-data-facets id="f-srv" source="s-fsrv" server-facets fields="region,categorie"
    labels="region:Région | categorie:Catégorie"></dsfr-data-facets>`,
    expects: [
      {
        kind: 'facets',
        id: 'f-srv',
        group: 'Région',
        valueColumn: 'region',
        countColumn: 'n',
        pipeline: [
          { op: 'group-by', by: 'region', columns: { n: { agg: 'count' } } },
          { op: 'order-by', column: 'n', dir: 'desc' },
        ],
      },
      {
        kind: 'facets',
        id: 'f-srv',
        group: 'Catégorie',
        valueColumn: 'categorie',
        countColumn: 'n',
        pipeline: [
          { op: 'group-by', by: 'categorie', columns: { n: { agg: 'count' } } },
          { op: 'order-by', column: 'n', dir: 'desc' },
        ],
      },
    ],
  },

  {
    id: 'facettes-url-params-bornes',
    mode: 'deterministic',
    origin:
      '#773 — `url-params` ne lit QUE les paramètres qui portent le nom d’une facette effective. Un paramètre homonyme d’une colonne quelconque du jeu ne doit rien filtrer : l’URL d’un site hôte n’appartient pas au composant.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceUrl('s-fu')}
  <dsfr-data-facets id="f-region" source="s-fu" fields="region" labels="region:Région"
    url-params></dsfr-data-facets>
  ${kpiCount('k-n', 'f-region')}`,
    actions: [{ kind: 'goto', value: '?region=Bretagne&categorie=Lyc%C3%A9e' }],
    expects: [
      {
        kind: 'kpi',
        id: 'k-n',
        agg: 'count',
        pipeline: [{ op: 'filter', filters: [{ field: 'region', op: 'eq', value: 'Bretagne' }] }],
      },
    ],
  },

  // ---------------------------------------------------------------------
  // dsfr-data-search
  // ---------------------------------------------------------------------
  {
    id: 'recherche-accents',
    mode: 'deterministic',
    origin:
      'Une recherche saisie SANS accent doit trouver les libellés qui en portent — « sete » trouve « École de Sète ». C’est la moitié des saisies réelles.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceUrl('s-ra')}
  <dsfr-data-search id="r-lib" source="s-ra" fields="libelle" debounce="0" min-length="0"
    label="Rechercher un établissement"></dsfr-data-search>
  ${kpiCount('k-n', 'r-lib')}${kpiSomme('k-pop', 'r-lib')}`,
    actions: [{ kind: 'fill', selector: '#r-lib input', value: 'sete' }],
    expects: attendCompteEtSomme([
      {
        op: 'filter',
        filters: [{ field: 'libelle', op: 'contains', value: 'sete', fold: true }],
      },
    ]),
  },

  {
    id: 'recherche-compte',
    mode: 'deterministic',
    origin:
      '#728 — le compteur de `count` annonce le nombre de résultats. Un compteur qui ne suit pas la saisie est pire qu’un compteur absent.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceUrl('s-rc')}
  <dsfr-data-search id="r-lib" source="s-rc" fields="libelle" debounce="0" min-length="0"
    count label="Rechercher un établissement"></dsfr-data-search>
  ${kpiCount('k-n', 'r-lib')}`,
    actions: [{ kind: 'fill', selector: '#r-lib input', value: 'ecole' }],
    expects: [
      {
        kind: 'text',
        id: 'r-lib',
        selector: '.dsfr-data-search-count',
        numeric: true,
        agg: 'count',
        pipeline: [
          {
            op: 'filter',
            filters: [{ field: 'libelle', op: 'contains', value: 'ecole', fold: true }],
          },
        ],
      },
      {
        kind: 'kpi',
        id: 'k-n',
        agg: 'count',
        pipeline: [
          {
            op: 'filter',
            filters: [{ field: 'libelle', op: 'contains', value: 'ecole', fold: true }],
          },
        ],
      },
    ],
  },

  {
    id: 'recherche-serveur',
    mode: 'deterministic',
    origin:
      '#285 — `server-search` : le terme part à l’API (`search("…")`) et c’est elle qui répond. Les lignes reçues doivent être celles que le terme désigne, ni plus ni moins.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceOds('s-rs')}
  <dsfr-data-search id="r-srv" source="s-rs" fields="libelle" server-search debounce="0"
    min-length="0" label="Rechercher un établissement"></dsfr-data-search>
  ${kpiCount('k-n', 's-rs')}${kpiSomme('k-pop', 's-rs')}`,
    actions: [{ kind: 'fill', selector: '#r-srv input', value: 'lycee' }],
    expects: attendCompteEtSomme([
      {
        op: 'filter',
        filters: [{ field: 'libelle', op: 'contains', value: 'lycee', fold: true }],
      },
    ]),
  },

  {
    id: 'recherche-contexte',
    mode: 'deterministic',
    origin:
      '#678, ADR-104 — une recherche enregistrée auprès d’un contexte devient un filtre `contains` diffusé à toutes ses cibles, et son tag apparaît avec les autres.',
    feed: { kind: 'fixture', datasets: JEUX },
    markup: `${sourceOds('s-rx')}
  <dsfr-data-context id="ctx" sources="s-rx"></dsfr-data-context>
  <dsfr-data-search id="r-ctx" source="s-rx" context="ctx" fields="libelle" debounce="0"
    min-length="0" label="Rechercher un établissement"></dsfr-data-search>
  ${kpiCount('k-n', 's-rx')}${kpiSomme('k-pop', 's-rx')}`,
    actions: [{ kind: 'fill', selector: '#r-ctx input', value: 'blagnac' }],
    expects: attendCompteEtSomme([
      { op: 'filter', filters: [{ field: 'libelle', op: 'contains', value: 'blagnac' }] },
    ]),
  },
];

export const CONTEXTE: Manifest = { domain: 'contexte', checks: CHECKS };
