/**
 * Comparaison : ce que la page MONTRE contre ce que l'oracle RECALCULE.
 *
 * Un écart à la précision affichée est un échec. Le résultat n'est pas un
 * booléen mais un `Constat` : valeur lib, valeur oracle, écart, nombre de
 * valeurs comparées — c'est ce qui rend le rapport lisible, et c'est aussi ce
 * qu'on veut voir quand un contrôle tombe.
 */
import type { CheckMode, Expect, Row } from './manifest.js';
import {
  cleAttendu,
  type Attendu,
  type AttenduTexte,
  type AttenduTextes,
  type AttenduUrls,
} from './expected.js';
import type {
  ObservationChart,
  ObservationClasses,
  ObservationFacette,
  ObservationKpi,
  ObservationLegende,
  ObservationListe,
  ObservationTexte,
} from './observe.js';
import { closeEnough, parseCsv, parseDisplayedNumber, roundTo, toNum, toRgb } from './compute.js';

export interface Constat {
  domaine: string;
  controle: string;
  mode: CheckMode;
  /** Lignes brutes dont l'oracle est parti. */
  rawRows: number;
  /** `kpi:k-total`, `rows:q-academie`… */
  observation: string;
  /** Ce que la page montre, rendu court. */
  lib: string;
  /** Ce que l'oracle recalcule, rendu court. */
  oracle: string;
  /** Écart numérique le plus parlant, ou `null` si la comparaison est textuelle. */
  ecart: number | null;
  /** Nombre de valeurs effectivement comparées — un contrôle à 0 ne prouve rien. */
  comparaisons: number;
  ok: boolean;
  /** Vide si le contrôle passe ; sinon la première divergence, en toutes lettres. */
  message: string;
}

export type Observation =
  | ObservationKpi
  | Array<Record<string, unknown>>
  | ObservationChart
  | ObservationListe
  | ObservationLegende[]
  | ObservationClasses
  | ObservationFacette[]
  | ObservationTexte
  | string[]
  | string
  | null;

interface Contexte {
  domaine: string;
  controle: string;
  mode: CheckMode;
  rawRows: number;
}

function nombre(v: number | null): string {
  return v === null ? '—' : String(Math.round(v * 1e6) / 1e6);
}

/** Tolérance des comparaisons ligne à ligne : six décimales, pas l'égalité binaire. */
const DECIMALES_LIGNES = 6;

/**
 * Compare une observation à son attendu. `expect` donne la forme, `attendu` les
 * chiffres, `observation` ce que la page a rendu.
 */
export function comparer(
  ctx: Contexte,
  expect: Expect,
  attendu: Attendu,
  observation: Observation
): Constat {
  const base = {
    ...ctx,
    observation: cleAttendu(expect),
    ecart: null as number | null,
    comparaisons: 0,
    ok: false,
    lib: '—',
    oracle: '—',
    message: '',
  };

  if (observation === null || observation === undefined) {
    return { ...base, message: `rien à observer pour #${expect.id} dans la page` };
  }

  switch (attendu.kind) {
    case 'kpi': {
      const obs = observation as ObservationKpi;
      const want = attendu.value;
      const lib = obs.value;
      // Valeur non chiffrée (date, #667) : c'est le TEXTE qui est comparé.
      if (attendu.texte !== undefined) {
        if (attendu.texte === null) {
          return { ...base, lib: obs.text || '—', message: `l'oracle ne calcule aucun texte` };
        }
        const ok = obs.text === attendu.texte;
        return {
          ...base,
          lib: obs.text,
          oracle: attendu.texte,
          comparaisons: 1,
          ok,
          message: ok ? '' : `affiché « ${obs.text} », recalculé « ${attendu.texte} »`,
        };
      }
      if (want === null) {
        return {
          ...base,
          lib: obs.text || '—',
          message: `l'oracle ne calcule aucune valeur (lignes brutes vides ?)`,
        };
      }
      if (lib === null) {
        return {
          ...base,
          lib: obs.text || '—',
          oracle: nombre(want),
          message: `valeur affichée illisible : « ${obs.text} »`,
        };
      }
      const arrondi = roundTo(want, attendu.decimals);
      const chiffreOk = closeEnough(lib, arrondi, attendu.decimals);
      // Le motif garde la FORME fr-FR (« 12,5 % », « 1 749 € », « 14,8 M ») :
      // le bon nombre dans la mauvaise unité reste un chiffre faux à l'écran.
      // `pattern` vient du manifeste de l'oracle, versionné dans le dépôt :
      // `detect-non-literal-regexp` est un faux positif (#843).
      // eslint-disable-next-line security/detect-non-literal-regexp
      const formeOk = attendu.pattern === undefined || new RegExp(attendu.pattern).test(obs.text);
      return {
        ...base,
        lib: obs.text,
        oracle: nombre(arrondi),
        ecart: lib - arrondi,
        comparaisons: attendu.pattern === undefined ? 1 : 2,
        ok: chiffreOk && formeOk,
        message: !chiffreOk
          ? `affiché ${obs.text} (${lib}), recalculé ${nombre(arrondi)} — écart ${nombre(lib - arrondi)}`
          : formeOk
            ? ''
            : `le chiffre est juste mais la forme ne l'est pas : « ${obs.text} » ne vérifie pas /${attendu.pattern}/`,
      };
    }

    case 'rows': {
      const e = expect as Extract<Expect, { kind: 'rows' }>;
      const obs = observation as Array<Record<string, unknown>>;
      return comparerTableau(base, attendu.rows, obs, e.key, e.columns);
    }

    case 'list': {
      const e = expect as Extract<Expect, { kind: 'list' }>;
      const obs = observation as ObservationListe;
      return comparerListe(base, attendu.rows, obs, e.columns, e.decimals);
    }

    case 'chart': {
      const obs = observation as ObservationChart;
      return comparerGraphique(base, attendu.labels, attendu.series, obs);
    }

    case 'legend': {
      const obs = observation as ObservationLegende[];
      return comparerLegende(base, attendu.classes, obs);
    }

    case 'texts':
      return comparerTextes(base, attendu, observation as string[]);

    case 'class': {
      const obs = observation as ObservationClasses;
      const presentes = new Set(obs.classes);
      const intruse = attendu.concurrentes.find((c) => presentes.has(c));
      const ok = presentes.has(attendu.classe) && intruse === undefined;
      return {
        ...base,
        lib: obs.classes.join(' ') || '—',
        oracle: attendu.classe,
        comparaisons: 1 + attendu.concurrentes.length,
        ok,
        message: ok
          ? ''
          : intruse !== undefined
            ? `classe « ${intruse} » appliquée alors que la valeur ${nombre(attendu.valeur)} appelle « ${attendu.classe} »`
            : `« ${attendu.classe} » attendue pour ${nombre(attendu.valeur)}, classes rendues : ${obs.classes.join(' ') || '(aucune)'}`,
      };
    }

    case 'attr': {
      const brut = observation as string | null;
      const e = expect as Extract<Expect, { kind: 'attr' }>;
      if (brut === null) {
        return { ...base, message: `attribut « ${e.attr} » absent de l'élément rendu` };
      }
      if (attendu.literal !== null) {
        const ok = brut.trim() === attendu.literal;
        return {
          ...base,
          lib: brut,
          oracle: attendu.literal,
          comparaisons: 1,
          ok,
          message: ok ? '' : `${e.attr} = « ${brut} », attendu « ${attendu.literal} »`,
        };
      }
      if (attendu.value === null) {
        return { ...base, lib: brut, message: `l'oracle ne calcule aucune valeur pour ${e.attr}` };
      }
      const lu = parseDisplayedNumber(brut);
      const arrondi = roundTo(attendu.value, attendu.decimals);
      const ok = lu !== null && closeEnough(lu, arrondi, attendu.decimals);
      return {
        ...base,
        lib: brut,
        oracle: nombre(arrondi),
        ecart: lu === null ? null : lu - arrondi,
        comparaisons: 1,
        ok,
        message: ok ? '' : `${e.attr} = ${brut}, recalculé ${nombre(arrondi)}`,
      };
    }

    case 'csv':
      return comparerCsv(base, attendu.lignes, observation as string);

    case 'dots':
      return comparerPastilles(base, attendu.couleurs, observation as string[]);
    case 'facets': {
      const e = expect as Extract<Expect, { kind: 'facets' }>;
      const obs = observation as ObservationFacette[];
      return comparerFacettes(base, attendu.values, obs, e.group);
    }

    case 'text': {
      const obs = observation as ObservationTexte;
      return comparerTexte(base, attendu, obs);
    }

    case 'urls': {
      const obs = observation as string[];
      return comparerUrls(base, attendu, obs);
    }
  }
}

/**
 * Les URL appelées contre le verdict énoncé. `comparaisons` vaut le nombre
 * d'URL RETENUES : un contrôle qui n'en retient aucune ne prouve rien, et le
 * spec refuse déjà un constat à zéro comparaison.
 */
function comparerUrls(base: Base, attendu: AttenduUrls, appelees: string[]): Constat {
  const retenues = attendu.among ? appelees.filter((u) => u.includes(attendu.among!)) : appelees;
  const porteuses = retenues.filter((u) => u.includes(attendu.contains));
  const derniere = retenues[retenues.length - 1] ?? '';
  const lib =
    `${porteuses.length}/${retenues.length} URL portent « ${attendu.contains} »` +
    (retenues.length > 0
      ? ` (dernière : ${derniere.includes(attendu.contains) ? 'oui' : 'non'})`
      : '');
  const oracle = `${attendu.verdict} « ${attendu.contains} »${attendu.among ? ` parmi « ${attendu.among} »` : ''}`;

  if (retenues.length === 0) {
    return {
      ...base,
      lib: 'aucune URL retenue',
      oracle,
      message: attendu.among
        ? `aucune URL appelée ne porte « ${attendu.among} » — le contrôle ne juge rien`
        : `aucune URL appelée — le contrôle ne juge rien`,
    };
  }

  const ok =
    attendu.verdict === 'none'
      ? porteuses.length === 0
      : attendu.verdict === 'some'
        ? porteuses.length > 0
        : attendu.verdict === 'all'
          ? porteuses.length === retenues.length
          : attendu.verdict === 'last'
            ? derniere.includes(attendu.contains)
            : !derniere.includes(attendu.contains);

  return {
    ...base,
    lib,
    oracle,
    comparaisons: retenues.length,
    ok,
    message: ok ? '' : `attendu « ${attendu.verdict} » — dernière URL retenue : ${derniere}`,
  };
}

type Base = Omit<Constat, never>;

function comparerTableau(
  base: Base,
  attendues: Row[],
  observees: Array<Record<string, unknown>>,
  key: string | string[],
  columns: string[]
): Constat {
  const champsCle = Array.isArray(key) ? key : [key];
  const cleDe = (row: Record<string, unknown>): string =>
    champsCle.map((f) => String(row[f] ?? '')).join(' | ');
  const lib = `${observees.length} lignes`;
  const oracle = `${attendues.length} lignes × ${columns.length} col.`;
  if (observees.length !== attendues.length) {
    return {
      ...base,
      lib,
      oracle,
      ecart: observees.length - attendues.length,
      message: `${observees.length} lignes rendues, ${attendues.length} recalculées`,
    };
  }
  let comparaisons = 0;
  for (let i = 0; i < attendues.length; i++) {
    const cleAttendue = cleDe(attendues[i]);
    const cleObservee = cleDe(observees[i]);
    comparaisons++;
    if (cleAttendue !== cleObservee) {
      return {
        ...base,
        lib,
        oracle,
        comparaisons,
        message: `ligne ${i} : clé « ${cleObservee} » rendue, « ${cleAttendue} » recalculée`,
      };
    }
    for (const col of columns) {
      comparaisons++;
      const w = toNum(attendues[i][col]);
      const o = toNum(observees[i][col]);
      if (w === null && o === null) continue;
      if (w === null || o === null || !closeEnough(o, w, DECIMALES_LIGNES)) {
        return {
          ...base,
          lib,
          oracle,
          comparaisons,
          ecart: w !== null && o !== null ? o - w : null,
          message: `ligne ${i} (${cleAttendue}) / ${col} : lib ${nombre(o)}, oracle ${nombre(w)}`,
        };
      }
    }
  }
  return { ...base, lib, oracle, comparaisons, ok: true };
}

function comparerListe(
  base: Base,
  attendues: Row[],
  obs: ObservationListe,
  columns: Array<{ column: string; numeric?: boolean }>,
  decimals = DECIMALES_LIGNES
): Constat {
  const lib = `${obs.rows.length} lignes rendues`;
  const oracle = `${attendues.length} lignes recalculées`;
  if (obs.rows.length !== attendues.length) {
    return {
      ...base,
      lib,
      oracle,
      ecart: obs.rows.length - attendues.length,
      message: `${obs.rows.length} lignes dans le tableau, ${attendues.length} recalculées`,
    };
  }
  let comparaisons = 0;
  for (let i = 0; i < attendues.length; i++) {
    for (let c = 0; c < columns.length; c++) {
      comparaisons++;
      const cellule = obs.rows[i][c] ?? '';
      const attendue = attendues[i][columns[c].column];
      if (columns[c].numeric) {
        const o = parseDisplayedNumber(cellule);
        const w = toNum(attendue);
        if (w === null && o === null) continue;
        if (w === null || o === null || !closeEnough(o, w, decimals)) {
          return {
            ...base,
            lib,
            oracle,
            comparaisons,
            ecart: w !== null && o !== null ? o - w : null,
            message: `ligne ${i} / ${columns[c].column} : affiché « ${cellule} » (${nombre(o)}), recalculé ${nombre(w)}`,
          };
        }
        continue;
      }
      if (cellule !== String(attendue ?? '')) {
        return {
          ...base,
          lib,
          oracle,
          comparaisons,
          message: `ligne ${i} / ${columns[c].column} : affiché « ${cellule} », recalculé « ${String(attendue ?? '')} »`,
        };
      }
    }
  }
  return { ...base, lib, oracle, comparaisons, ok: true };
}

function comparerGraphique(
  base: Base,
  labels: string[],
  series: Array<Array<number | null>>,
  obs: ObservationChart
): Constat {
  const lib = `${obs.tag} : ${obs.labels.length} points × ${obs.series.length} série(s)`;
  const oracle = `${labels.length} points × ${series.length} série(s)`;
  if (obs.labels.length !== labels.length) {
    return {
      ...base,
      lib,
      oracle,
      ecart: obs.labels.length - labels.length,
      message: `${obs.labels.length} libellés passés au graphique, ${labels.length} recalculés`,
    };
  }
  let comparaisons = 0;
  for (let i = 0; i < labels.length; i++) {
    comparaisons++;
    if (obs.labels[i] !== labels[i]) {
      return {
        ...base,
        lib,
        oracle,
        comparaisons,
        message: `point ${i} : libellé « ${obs.labels[i]} » passé au graphique, « ${labels[i]} » recalculé`,
      };
    }
  }
  if (obs.series.length < series.length) {
    return {
      ...base,
      lib,
      oracle,
      comparaisons,
      message: `${obs.series.length} série(s) passée(s) au graphique, ${series.length} recalculée(s)`,
    };
  }
  for (let s = 0; s < series.length; s++) {
    for (let i = 0; i < series[s].length; i++) {
      comparaisons++;
      const w = series[s][i];
      const o = obs.series[s][i] ?? null;
      if (w === null && o === null) continue;
      if (w === null || o === null || !closeEnough(o, w, DECIMALES_LIGNES)) {
        return {
          ...base,
          lib,
          oracle,
          comparaisons,
          ecart: w !== null && o !== null ? o - w : null,
          message: `série ${s}, point ${i} (${labels[i]}) : graphique ${nombre(o)}, oracle ${nombre(w)}`,
        };
      }
    }
  }
  return { ...base, lib, oracle, comparaisons, ok: true };
}

function comparerTextes(base: Base, attendu: AttenduTextes, obs: string[]): Constat {
  const lib = `${obs.length} texte(s)`;
  const oracle = `${attendu.valeurs.length} valeur(s)`;
  if (obs.length !== attendu.valeurs.length) {
    return {
      ...base,
      lib,
      oracle,
      ecart: obs.length - attendu.valeurs.length,
      message: `${obs.length} élément(s) rendu(s), ${attendu.valeurs.length} recalculé(s)`,
    };
  }
  // Même manifeste versionné (#843).
  // eslint-disable-next-line security/detect-non-literal-regexp
  const motif = attendu.pattern === undefined ? null : new RegExp(attendu.pattern);
  let comparaisons = 0;
  for (let i = 0; i < obs.length; i++) {
    const texte = obs[i];
    const w = attendu.valeurs[i];
    comparaisons++;
    if (attendu.numeric) {
      const lu = parseDisplayedNumber(texte);
      const attendue = typeof w === 'number' ? w : null;
      if (attendue === null && lu === null) continue;
      if (attendue === null || lu === null || !closeEnough(lu, attendue, attendu.decimals)) {
        return {
          ...base,
          lib,
          oracle,
          comparaisons,
          ecart: attendue !== null && lu !== null ? lu - attendue : null,
          message: `élément ${i} : affiché « ${texte} » (${nombre(lu)}), recalculé ${nombre(attendue)}`,
        };
      }
    } else if (texte !== String(w ?? '')) {
      return {
        ...base,
        lib,
        oracle,
        comparaisons,
        message: `élément ${i} : affiché « ${texte} », recalculé « ${String(w ?? '')} »`,
      };
    }
    if (motif !== null) {
      comparaisons++;
      if (!motif.test(texte)) {
        return {
          ...base,
          lib,
          oracle,
          comparaisons,
          message: `élément ${i} : « ${texte} » ne vérifie pas la forme /${attendu.pattern}/`,
        };
      }
    }
  }
  return { ...base, lib, oracle, comparaisons, ok: true };
}

function comparerCsv(base: Base, attendues: string[][], texte: string): Constat {
  const lues = parseCsv(texte);
  const lib = `${Math.max(0, lues.length - 1)} ligne(s) exportée(s)`;
  const oracle = `${Math.max(0, attendues.length - 1)} ligne(s) recalculée(s)`;
  // Le BOM UTF-8 du fichier n'est pas observable ici : `Blob.text()` décode en
  // UTF-8 et le retire. `parseCsv` l'enlèverait de toute façon — ce qui est
  // comparé, ce sont les cellules.
  if (lues.length !== attendues.length) {
    return {
      ...base,
      lib,
      oracle,
      ecart: lues.length - attendues.length,
      message: `${lues.length} ligne(s) dans le fichier, ${attendues.length} recalculée(s) (en-tête comprise)`,
    };
  }
  let comparaisons = 0;
  for (let i = 0; i < attendues.length; i++) {
    if (lues[i].length !== attendues[i].length) {
      return {
        ...base,
        lib,
        oracle,
        comparaisons,
        message: `ligne ${i} : ${lues[i].length} cellule(s), ${attendues[i].length} recalculée(s)`,
      };
    }
    for (let c = 0; c < attendues[i].length; c++) {
      comparaisons++;
      if (lues[i][c] !== attendues[i][c]) {
        return {
          ...base,
          lib,
          oracle,
          comparaisons,
          message: `ligne ${i}, cellule ${c} : « ${lues[i][c]} » exportée, « ${attendues[i][c]} » recalculée`,
        };
      }
    }
  }
  return { ...base, lib, oracle, comparaisons, ok: true };
}

function comparerPastilles(base: Base, attendues: Array<string | null>, obs: string[]): Constat {
  const lib = `${obs.length} pastille(s)`;
  const oracle = `${attendues.length} modalité(s)`;
  if (obs.length !== attendues.length) {
    return {
      ...base,
      lib,
      oracle,
      ecart: obs.length - attendues.length,
      message: `${obs.length} pastille(s) de légende, ${attendues.length} modalité(s) recalculée(s)`,
    };
  }
  let comparaisons = 0;
  for (let i = 0; i < attendues.length; i++) {
    const w = attendues[i];
    // Modalité non citée par color-map : la palette DSFR garde la main, il n'y
    // a rien à comparer — mais la pastille doit exister, ce qui est déjà lu.
    if (w === null) continue;
    comparaisons++;
    const veut = toRgb(w);
    const a = toRgb(obs[i]);
    if (veut === null || a === null || veut !== a) {
      return {
        ...base,
        lib,
        oracle,
        comparaisons,
        message: `pastille ${i} : rendue « ${obs[i]} », déclarée « ${w} »`,
      };
    }
  }
  return { ...base, lib, oracle, comparaisons, ok: true };
}

function comparerLegende(
  base: Base,
  classes: Array<{ from: number | null; to: number | null }>,
  obs: ObservationLegende[]
): Constat {
  const lib = `${obs.length} classe(s)`;
  const oracle = `${classes.length} classe(s)`;
  if (obs.length !== classes.length) {
    return {
      ...base,
      lib,
      oracle,
      ecart: obs.length - classes.length,
      message: `${obs.length} entrées de légende, ${classes.length} classes recalculées`,
    };
  }
  let comparaisons = 0;
  for (let i = 0; i < classes.length; i++) {
    for (const borne of ['from', 'to'] as const) {
      comparaisons++;
      const w = classes[i][borne];
      const o = obs[i][borne];
      if (w === null && o === null) continue;
      if (w === null || o === null || !closeEnough(o, w, DECIMALES_LIGNES)) {
        return {
          ...base,
          lib,
          oracle,
          comparaisons,
          ecart: w !== null && o !== null ? o - w : null,
          message: `classe ${i} / ${borne} : légende ${nombre(o)}, oracle ${nombre(w)} (« ${obs[i].label} »)`,
        };
      }
    }
  }
  return { ...base, lib, oracle, comparaisons, ok: true };
}

function comparerFacettes(
  base: Base,
  attendues: Array<{ value: string; count: number | null }>,
  observes: ObservationFacette[],
  groupe: string
): Constat {
  const obs = observes.find((g) => g.group === groupe);
  if (!obs) {
    return {
      ...base,
      lib: observes.map((g) => g.group).join(' | ') || '—',
      oracle: `${attendues.length} valeur(s)`,
      message: `aucun groupe de facettes intitulé « ${groupe} » dans la page`,
    };
  }
  const lib = `${obs.values.length} valeur(s) affichée(s)`;
  const oracle = `${attendues.length} valeur(s) recalculée(s)`;
  if (obs.values.length !== attendues.length) {
    return {
      ...base,
      lib,
      oracle,
      ecart: obs.values.length - attendues.length,
      message:
        `${obs.values.length} valeurs affichées (${obs.values.map((v) => v.value).join(', ')}), ` +
        `${attendues.length} recalculées (${attendues.map((v) => v.value).join(', ')})`,
    };
  }
  let comparaisons = 0;
  for (let i = 0; i < attendues.length; i++) {
    comparaisons++;
    if (obs.values[i].value !== attendues[i].value) {
      return {
        ...base,
        lib,
        oracle,
        comparaisons,
        message:
          `rang ${i} : valeur « ${obs.values[i].value} » affichée, ` +
          `« ${attendues[i].value} » recalculée (l'ordre affiché fait partie du contrôle)`,
      };
    }
    comparaisons++;
    const w = attendues[i].count;
    const o = obs.values[i].count;
    if (w === null && o === null) continue;
    if (w === null || o === null || !closeEnough(o, w, DECIMALES_LIGNES)) {
      return {
        ...base,
        lib,
        oracle,
        comparaisons,
        ecart: w !== null && o !== null ? o - w : null,
        message: `« ${attendues[i].value} » : compteur affiché ${nombre(o)}, recalculé ${nombre(w)}`,
      };
    }
  }
  return { ...base, lib, oracle, comparaisons, ok: true };
}

function comparerTexte(base: Base, attendu: AttenduTexte, obs: ObservationTexte): Constat {
  if (attendu.value !== null || attendu.text === null) {
    const want = attendu.value;
    if (want === null) {
      return { ...base, lib: obs.text || '—', message: `l'oracle ne calcule aucune valeur` };
    }
    if (obs.value === null) {
      return {
        ...base,
        lib: obs.text || '—',
        oracle: nombre(want),
        message: `aucun nombre lisible dans « ${obs.text} »`,
      };
    }
    const arrondi = roundTo(want, attendu.decimals);
    const ok = closeEnough(obs.value, arrondi, attendu.decimals);
    return {
      ...base,
      lib: obs.text,
      oracle: nombre(arrondi),
      ecart: obs.value - arrondi,
      comparaisons: 1,
      ok,
      message: ok ? '' : `affiché « ${obs.text} » (${obs.value}), recalculé ${nombre(arrondi)}`,
    };
  }
  const ok = obs.text === attendu.text;
  return {
    ...base,
    lib: obs.text || '—',
    oracle: attendu.text,
    comparaisons: 1,
    ok,
    message: ok ? '' : `affiché « ${obs.text} », recalculé « ${attendu.text} »`,
  };
}
