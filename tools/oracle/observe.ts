/**
 * Lecteurs d'OBSERVATION : ce que la page montre vraiment.
 *
 * Chaque lecteur est une fonction AUTONOME — aucune référence à une valeur de
 * module, pas d'import — parce que Playwright la sérialise pour l'exécuter
 * dans la page (`page.evaluate(lireKpi, id)`). C'est aussi ce qui les rend
 * éprouvables sur un DOM minimal sous happy-dom
 * (`tests/oracle/observe.test.ts`) : la même fonction, les deux fois.
 *
 * Corollaire assumé : la lecture d'un nombre fr-FR est réécrite dans chaque
 * lecteur plutôt qu'importée de `compute.ts`. Une fonction qui capture un
 * symbole de module devient `undefined is not a function` dans la page, sans
 * rien dire de plus.
 *
 * Règle commune : on lit ce qui est AFFICHÉ ou ce qui est réellement passé au
 * composant d'affichage, jamais l'état interne qui a servi à le produire. Pour
 * un graphique, ce sont donc les attributs de l'élément DSFR Chart rendu, pas
 * le cache amont.
 */

export interface ObservationKpi {
  /** Texte brut de `.dsfr-data-kpi__value`, unité et suffixe compris. */
  text: string;
  /** Le nombre qu'un lecteur humain y lit, ou `null` si illisible. */
  value: number | null;
}

export interface ObservationChart {
  /** Tag de l'élément DSFR Chart rendu (`bar-chart`, `line-chart`, …). */
  tag: string;
  /** Libellés de l'axe des catégories, tels que passés à l'élément. */
  labels: string[];
  /** Une série par dataset, dans l'ordre. */
  series: Array<Array<number | null>>;
  /** Noms de séries (attribut `name`), tels que passés à l'élément. */
  names: string[];
}

export interface ObservationLegende {
  color: string;
  label: string;
  from: number | null;
  to: number | null;
}

export interface ObservationListe {
  headers: string[];
  rows: string[][];
}

/**
 * Valeur AFFICHÉE d'un `dsfr-data-kpi` : le texte de `.dsfr-data-kpi__value`
 * (le composant rend en shadow DOM ; le repli sur la lumière sert au DOM
 * minimal des tests unitaires) et le nombre qu'on y lit.
 */
export function lireKpi(id: string): ObservationKpi {
  const hote = document.getElementById(id);
  if (!hote) return { text: '', value: null };
  const racine: ParentNode = hote.shadowRoot ?? hote;
  const el =
    racine.querySelector('.dsfr-data-kpi__value') ?? hote.querySelector('.dsfr-data-kpi__value');
  const text = (el?.textContent ?? '').trim();
  const nettoye = text
    .replace(/[\u202f\u00a0\s]/g, '')
    .replace(/[^0-9,.\-\u2212]/g, '')
    .replace('\u2212', '-')
    .replace(',', '.');
  const n = nettoye === '' || nettoye === '-' ? NaN : Number(nettoye);
  return { text, value: Number.isFinite(n) ? n : null };
}

/**
 * Lignes du CACHE DE DONNÉES d'un id — ce que le composant a émis à ses
 * lecteurs (query, normalize, join, pivot, concat). La page expose
 * `window.__verif.getDataCache`, posé par la fixture.
 */
export function lireCache(id: string): Array<Record<string, unknown>> | null {
  const w = window as unknown as { __verif?: { getDataCache?: (i: string) => unknown } };
  const brut = w.__verif?.getDataCache?.(id);
  return Array.isArray(brut) ? (brut as Array<Record<string, unknown>>) : null;
}

/**
 * Ce qui est RÉELLEMENT passé à l'élément DSFR Chart rendu : ses attributs
 * `x`, `y` et `name`, pas le cache amont. Un graphique qui affiche autre chose
 * que ce qu'il a reçu est exactement ce qu'un contrôle doit voir.
 *
 * DSFR Chart enveloppe : `x` vaut `[[…labels]]` et `y` `[[…série1], […série2]]`.
 * Le dépaquetage est fait ici, une bonne fois.
 */
export function lireGraphique(id: string): ObservationChart | null {
  const hote = document.getElementById(id);
  if (!hote) return null;
  let el: Element | null = null;
  for (const candidat of Array.from(hote.querySelectorAll('*'))) {
    if (/-chart$/.test(candidat.tagName.toLowerCase())) {
      el = candidat;
      break;
    }
  }
  if (!el) return null;

  const lire = (nom: string): unknown => {
    const brut = el!.getAttribute(nom);
    if (brut === null) return null;
    try {
      return JSON.parse(brut);
    } catch {
      return brut;
    }
  };

  const aplatirUnNiveau = (v: unknown): unknown[] => {
    if (!Array.isArray(v)) return [];
    if (v.length === 1 && Array.isArray(v[0])) return v[0] as unknown[];
    return v;
  };

  const x = lire('x');
  const labels = aplatirUnNiveau(x).map((v) => String(v));

  const y = lire('y');
  let series: Array<Array<number | null>> = [];
  if (Array.isArray(y)) {
    const enSeries = Array.isArray(y[0]) ? (y as unknown[][]) : [y as unknown[]];
    series = enSeries.map((serie) =>
      serie.map((v) => {
        if (v === null || v === undefined || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      })
    );
  }

  const nomBrut = lire('name');
  const names = Array.isArray(nomBrut)
    ? nomBrut.map((v) => String(v))
    : typeof nomBrut === 'string' && nomBrut !== ''
      ? [nomBrut]
      : [];

  return { tag: el.tagName.toLowerCase(), labels, series, names };
}

/**
 * Entrées de légende d'une couche de carte — l'API publique
 * `getLegendEntries()` de `dsfr-data-map-layer` (#685), c'est-à-dire ce que
 * `dsfr-data-map-legend` affiche.
 */
export function lireLegende(id: string): ObservationLegende[] | null {
  const el = document.getElementById(id) as
    (HTMLElement & { getLegendEntries?: () => unknown }) | null;
  if (!el || typeof el.getLegendEntries !== 'function') return null;
  const brut = el.getLegendEntries();
  if (!Array.isArray(brut)) return null;
  return brut.map((e) => {
    const entree = e as { color?: unknown; label?: unknown; from?: unknown; to?: unknown };
    const nombre = (v: unknown): number | null => {
      if (typeof v !== 'number' || !Number.isFinite(v)) return null;
      return v;
    };
    return {
      color: String(entree.color ?? ''),
      label: String(entree.label ?? ''),
      from: nombre(entree.from),
      to: nombre(entree.to),
    };
  });
}

/**
 * Lignes du TABLEAU rendu par `dsfr-data-list` : en-têtes et cellules, texte
 * tel qu'affiché. La colonne de sélection (`refine-on-click`) et la ligne
 * « aucune donnée » sont écartées — elles ne portent pas de chiffre.
 */
export function lireListe(id: string): ObservationListe | null {
  const hote = document.getElementById(id);
  if (!hote) return null;
  const racine: ParentNode = hote.shadowRoot ?? hote;
  const table = racine.querySelector('table') ?? hote.querySelector('table');
  if (!table) return null;

  const texte = (el: Element): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

  const headers = Array.from(table.querySelectorAll('thead th'))
    .filter((th) => !th.classList.contains('dsfr-data-list__select-head'))
    .map(texte);

  const rows: string[][] = [];
  for (const tr of Array.from(table.querySelectorAll('tbody tr'))) {
    const cells = Array.from(tr.querySelectorAll('td')).filter(
      (td) =>
        !td.classList.contains('dsfr-data-list__select-cell') &&
        !td.classList.contains('dsfr-data-list__empty')
    );
    if (cells.length === 0) continue;
    rows.push(cells.map(texte));
  }
  return { headers, rows };
}

/** Un groupe de facettes tel qu'il est AFFICHÉ : son libellé, ses valeurs, ses compteurs. */
export interface ObservationFacette {
  /** Libellé affiché du groupe (légende du fieldset, ou label de la liste). */
  group: string;
  /** Valeurs affichées, dans l'ordre où elles sont rendues. */
  values: Array<{ value: string; count: number | null }>;
}

/**
 * Valeurs et COMPTEURS affichés par une `dsfr-data-facets` — ce qu'un
 * lecteur voit à côté de chaque case, pas l'état interne qui l'a produit.
 *
 * Les deux formes rendues par le composant sont lues : le fieldset de cases
 * à cocher / boutons radio (libellé + `.dsfr-data-facets__count`) et la liste
 * déroulante (`data-field`, option « valeur (compteur) »). L'option « Tous »
 * et le fieldset sans légende d'un panneau déroulant ne sont pas des valeurs.
 */
export function lireFacettes(id: string): ObservationFacette[] | null {
  const hote = document.getElementById(id);
  if (!hote) return null;
  const racine: ParentNode = hote.shadowRoot ?? hote;

  const texte = (el: Element | null): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const nombre = (brut: string): number | null => {
    const nettoye = brut
      .replace(/[\u202f\u00a0\s]/g, '')
      .replace(/[^0-9,.\-−]/g, '')
      .replace('−', '-')
      .replace(',', '.');
    if (nettoye === '' || nettoye === '-') return null;
    const n = Number(nettoye);
    return Number.isFinite(n) ? n : null;
  };

  const groupes: ObservationFacette[] = [];

  for (const fieldset of Array.from(racine.querySelectorAll('fieldset'))) {
    const legende = fieldset.querySelector('legend');
    if (!legende) continue;
    const values: ObservationFacette['values'] = [];
    for (const element of Array.from(fieldset.querySelectorAll('.fr-fieldset__element'))) {
      const input = element.querySelector('input[type="checkbox"], input[type="radio"]');
      const label = element.querySelector('label');
      if (!input || !label) continue;
      const compteur = label.querySelector('.dsfr-data-facets__count');
      const clone = label.cloneNode(true) as HTMLElement;
      for (const bruit of Array.from(
        clone.querySelectorAll('.dsfr-data-facets__count, .fr-sr-only, .fr-hint-text')
      )) {
        bruit.remove();
      }
      const valeur = (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (valeur === '' || valeur === 'Tous') continue;
      values.push({ value: valeur, count: compteur ? nombre(texte(compteur)) : null });
    }
    if (values.length > 0) groupes.push({ group: texte(legende), values });
  }

  for (const bloc of Array.from(racine.querySelectorAll('[data-field]'))) {
    const select = bloc.querySelector('select');
    if (!select) continue;
    const values: ObservationFacette['values'] = [];
    for (const option of Array.from(select.querySelectorAll('option'))) {
      if ((option.getAttribute('value') ?? '') === '') continue;
      const brut = texte(option);
      const avecCompteur = /^(.*)\s\(([^()]*)\)$/.exec(brut);
      values.push(
        avecCompteur
          ? { value: avecCompteur[1].trim(), count: nombre(avecCompteur[2]) }
          : { value: brut, count: null }
      );
    }
    if (values.length > 0) groupes.push({ group: texte(bloc.querySelector('label')), values });
  }

  return groupes;
}

/** Un texte affiché, et le nombre qu'un lecteur y lit s'il y en a un. */
export interface ObservationTexte {
  text: string;
  value: number | null;
}

/**
 * Le TEXTE affiché par un élément, ou par un élément qu'il contient
 * (`selector`) : libellé d'un `dsfr-data-context-value`, tag d'un
 * `dsfr-data-context-tags`, compteur d'une `dsfr-data-search`.
 *
 * Les blancs sont normalisés — l'espace insécable d'un tag DSFR et le retour
 * à la ligne d'un gabarit Lit ne sont pas des différences visibles.
 */
export function lireTexte(cible: { id: string; selector?: string }): ObservationTexte | null {
  const hote = document.getElementById(cible.id);
  if (!hote) return null;
  const racine: ParentNode = hote.shadowRoot ?? hote;
  const el = cible.selector
    ? (racine.querySelector(cible.selector) ?? hote.querySelector(cible.selector))
    : hote;
  if (!el) return null;
  const text = (el.textContent ?? '')
    .replace(/[\u202f\u00a0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const nettoye = text
    .replace(/[\u202f\u00a0\s]/g, '')
    .replace(/[^0-9,.\-−]/g, '')
    .replace('−', '-')
    .replace(',', '.');
  const n = nettoye === '' || nettoye === '-' ? NaN : Number(nettoye);
  return { text, value: Number.isFinite(n) ? n : null };
}
