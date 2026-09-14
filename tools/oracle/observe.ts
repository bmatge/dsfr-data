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

/** Une classe est un habillage : on lit la liste, pas une couleur calculée. */
export interface ObservationClasses {
  /** Classes de l'élément désigné, dans l'ordre du DOM. */
  classes: string[];
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

/**
 * Textes RENDUS par les éléments que `selecteur` désigne dans le composant :
 * lignes secondaires d'un KPI, tendance, valeurs d'un podium, cellules d'un
 * `dsfr-data-display`. Les espaces sont normalisés comme un lecteur les voit.
 */
export function lireTextes({ id, selecteur }: { id: string; selecteur: string }): string[] | null {
  const hote = document.getElementById(id);
  if (!hote) return null;
  const racine: ParentNode = hote.shadowRoot ?? hote;
  const trouves = Array.from(racine.querySelectorAll(selecteur));
  const elements = trouves.length > 0 ? trouves : Array.from(hote.querySelectorAll(selecteur));
  return elements.map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim());
}

/**
 * CLASSES de l'élément désigné : c'est par là qu'un KPI dit « bon »,
 * « attention » ou « critique ». Un habillage qui ne suit pas le chiffre ment
 * autant qu'un chiffre faux, et aucune lecture de valeur ne l'attrape.
 */
export function lireClasses({
  id,
  selecteur,
  pret,
}: {
  id: string;
  selecteur: string;
  /** Tant que ce sélecteur n'a rien, le composant n'a pas fini d'afficher. */
  pret?: string;
}): ObservationClasses | null {
  const hote = document.getElementById(id);
  if (!hote) return null;
  const racine: ParentNode = hote.shadowRoot ?? hote;
  if (pret && !(racine.querySelector(pret) ?? hote.querySelector(pret))) return null;
  const el = racine.querySelector(selecteur) ?? hote.querySelector(selecteur);
  if (!el) return null;
  return { classes: Array.from(el.classList) };
}

/**
 * ATTRIBUT posé sur l'élément DSFR Chart RENDU (résumé d'une carte, bornes
 * d'axes relayées). Même règle que `lireGraphique` : ce qui est passé à
 * l'afficheur, jamais l'état amont.
 *
 * Jamais de repli sur le composant hôte : il porte l'attribut ÉCRIT PAR LA
 * PAGE, et le relire reviendrait à comparer le manifeste à lui-même — un
 * contrôle qui reste vert même quand la lib cesse de relayer la borne.
 */
export function lireAttribut({ id, attribut }: { id: string; attribut: string }): string | null {
  const hote = document.getElementById(id);
  if (!hote) return null;
  for (const candidat of Array.from(hote.querySelectorAll('*'))) {
    if (/-chart$/.test(candidat.tagName.toLowerCase())) {
      return candidat.getAttribute(attribut);
    }
  }
  return null;
}

/**
 * Couleurs des PASTILLES de légende (`span.legend_dot`) que DSFR Chart rend à
 * côté du graphique, telles que le navigateur les calcule.
 */
export function lirePastilles(id: string): string[] | null {
  const hote = document.getElementById(id);
  if (!hote) return null;
  return Array.from(hote.querySelectorAll('.legend_dot')).map((dot) => {
    const el = dot as HTMLElement;
    const calcule =
      typeof getComputedStyle === 'function' ? getComputedStyle(el).backgroundColor : '';
    return calcule || el.style.backgroundColor || '';
  });
}

/**
 * Contenu du FICHIER CSV que l'export du composant produit — pas le tableau
 * dont il part : c'est le fichier qu'un lecteur ouvrira.
 *
 * Le téléchargement est intercepté au plus près du navigateur
 * (`URL.createObjectURL` et le clic de l'ancre), le temps d'un clic sur le
 * bouton, puis rendu tel qu'il était : rien ne sort de la page, rien n'y reste
 * modifié.
 */
export async function lireExportCsv(id: string): Promise<string | null> {
  const hote = document.getElementById(id);
  if (!hote) return null;
  const racine: ParentNode = hote.shadowRoot ?? hote;
  const bouton = Array.from(racine.querySelectorAll('button')).find((b) =>
    /csv/i.test(b.textContent ?? '')
  );
  if (!bouton) return null;

  const objetUrl = URL as unknown as {
    createObjectURL: (b: Blob) => string;
    revokeObjectURL: (u: string) => void;
  };
  const creerOrigine = objetUrl.createObjectURL;
  const revoquerOrigine = objetUrl.revokeObjectURL;
  const clicOrigine = HTMLAnchorElement.prototype.click;
  const captures: Blob[] = [];
  objetUrl.createObjectURL = (blob: Blob): string => {
    captures.push(blob);
    return 'blob:verification-des-donnees';
  };
  objetUrl.revokeObjectURL = (): void => {};
  HTMLAnchorElement.prototype.click = function neRienTelecharger(): void {};
  try {
    bouton.click();
  } finally {
    objetUrl.createObjectURL = creerOrigine;
    objetUrl.revokeObjectURL = revoquerOrigine;
    HTMLAnchorElement.prototype.click = clicOrigine;
  }
  return captures.length === 0 ? null : await captures[0].text();
}
