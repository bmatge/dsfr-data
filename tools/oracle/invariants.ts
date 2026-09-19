/**
 * LES INVARIANTS (#881) : une propriété que les lignes ÉMISES par la
 * bibliothèque doivent tenir face aux lignes BRUTES.
 *
 * Deux temps, comme pour les valeurs. D'abord la RÉFÉRENCE, calculée depuis
 * les lignes brutes du contrôle (`referenceInvariant`) — la somme brute d'une
 * colonne, le nombre de lignes brutes, le nombre de lignes brutes sans valeur.
 * Elle vit dans l'attendu (`ExpectedCheck.invariants`), donc dans
 * `out/expected.json` en mode vivant, et ne pèse que quelques nombres. Puis
 * l'ÉVALUATION (`evaluerInvariants`), sur ce que la page montre, contre cette
 * référence — jamais contre l'attendu recalculé par le pipeline, sinon
 * l'invariant ne dirait rien de plus que la valeur.
 *
 * Un invariant EN ATTENTE (`skip`) est évalué et rendu, mais ne fait pas
 * tomber le contrôle : c'est la troncature silencieuse de `max-records`
 * (AM-002), que la bibliothèque ne dit pas encore.
 */
import type { Expect, Invariant, Row } from './manifest.js';
import { JEU_PRINCIPAL } from './manifest.js';
import type { Observation } from './compare.js';
import type { ObservationDiagnostic } from './observe.js';
import { absent, closeEnough, parseDisplayedNumber, toNum } from './compute.js';

/** La référence d'un invariant : ce que les lignes BRUTES disent. */
export interface AttenduInvariant {
  invariant: Invariant;
  reference: {
    /** Somme brute du champ (`sum-preserved`). */
    sum?: number | null;
    /** Nombre de lignes brutes (`count-preserved`, `not-truncated`). */
    count?: number;
    /** Lignes brutes sans valeur pour le champ (`null-group`, `null-stays-null`). */
    nullCount?: number;
    /** Lignes brutes avec valeur (`null-group`). */
    nonNullCount?: number;
    /** Clés des lignes brutes sans valeur, quand `key` est donné (`null-stays-null`). */
    nullKeys?: string[];
  };
}

/** Un ou plusieurs jeux bruts, empilés. */
function lignesBrutes(datasets: Record<string, Row[]>, from: string | string[] | undefined): Row[] {
  const noms = from === undefined ? [JEU_PRINCIPAL] : Array.isArray(from) ? from : [from];
  const out: Row[] = [];
  for (const nom of noms) {
    const jeu = datasets[nom];
    if (!jeu) throw new Error(`invariant : jeu « ${nom} » absent du feed`);
    out.push(...jeu);
  }
  return out;
}

const cleDe = (row: Row, key: string | string[]): string =>
  (Array.isArray(key) ? key : [key]).map((k) => String(row[k] ?? '')).join(' | ');

/** La référence d'un invariant, depuis les lignes brutes du contrôle. */
export function referenceInvariant(
  inv: Invariant,
  datasets: Record<string, Row[]>
): AttenduInvariant {
  switch (inv.kind) {
    case 'sum-preserved': {
      const nums = lignesBrutes(datasets, inv.from)
        .map((r) => toNum(r[inv.field]))
        .filter((n): n is number => n !== null);
      return {
        invariant: inv,
        reference: { sum: nums.length === 0 ? null : nums.reduce((a, b) => a + b, 0) },
      };
    }
    case 'count-preserved':
    case 'not-truncated':
      return { invariant: inv, reference: { count: lignesBrutes(datasets, inv.from).length } };
    case 'count-equals':
      return { invariant: inv, reference: {} };
    case 'null-group': {
      const brutes = lignesBrutes(datasets, inv.from);
      const nulls = brutes.filter((r) => absent(r[inv.field])).length;
      return {
        invariant: inv,
        reference: { nullCount: nulls, nonNullCount: brutes.length - nulls },
      };
    }
    case 'bounded':
      return { invariant: inv, reference: {} };
    case 'null-stays-null': {
      const brutes = lignesBrutes(datasets, inv.from);
      const champ = inv.rawField ?? inv.field;
      const sansValeur = brutes.filter((r) => absent(r[champ]));
      return {
        invariant: inv,
        reference: {
          nullCount: sansValeur.length,
          ...(inv.key ? { nullKeys: sansValeur.map((r) => cleDe(r, inv.key!)) } : {}),
        },
      };
    }
  }
}

/**
 * Les LIGNES que l'observation porte, quel que soit le genre d'attente : les
 * lignes du cache pour `rows`, les cellules relues pour `list`, les points
 * pour `chart`, les valeurs pour `facets`, et une ligne `{ value }` pour un
 * KPI ou un texte. C'est sur elles que les invariants s'évaluent.
 */
export function lignesEmises(expect: Expect, observation: Observation): Row[] | null {
  if (observation === null || observation === undefined) return null;
  switch (expect.kind) {
    case 'rows':
      return observation as Row[];
    case 'kpi':
    case 'text':
      return [{ value: (observation as { value: number | null }).value }];
    case 'list': {
      const obs = observation as { rows: string[][] };
      return obs.rows.map((cellules) => {
        const row: Row = {};
        expect.columns.forEach((c, i) => {
          row[c.column] = c.numeric ? parseDisplayedNumber(cellules[i] ?? '') : (cellules[i] ?? '');
        });
        return row;
      });
    }
    case 'chart': {
      const obs = observation as { labels: string[]; series: Array<Array<number | null>> };
      return obs.labels.map((label, i) => {
        const row: Row = { [expect.labelColumn]: label };
        expect.valueColumns.forEach((col, s) => (row[col] = obs.series[s]?.[i] ?? null));
        return row;
      });
    }
    case 'texts': {
      // Une observation par élément désigné, donc une LIGNE par élément : c'est
      // ce qui rend `count-equals` lisible sur un composant de structure
      // (cinq instances pour cinq lignes répétées, #891), et `sum-preserved`
      // sur la colonne que ces textes affichent. `scale` est défait : la
      // référence, elle, est dans l'unité des lignes brutes.
      const textes = observation as string[];
      return textes.map((t) => {
        const brut = expect.numeric ? parseDisplayedNumber(t) : t;
        const valeur =
          expect.numeric && expect.scale && typeof brut === 'number' ? brut / expect.scale : brut;
        return { [expect.column]: valeur } as Row;
      });
    }
    case 'facets': {
      const groupe = (
        observation as Array<{
          group: string;
          values: Array<{ value: string; count: number | null }>;
        }>
      ).find((g) => g.group === expect.group);
      if (!groupe) return null;
      return groupe.values.map((v) => ({
        [expect.valueColumn]: v.value,
        [expect.countColumn]: v.count,
      }));
    }
    default:
      return null;
  }
}

/** Le verdict d'UN invariant : tenu, ou la première violation en toutes lettres. */
export interface VerdictInvariant {
  /** Nom court, pour le rapport : `sum-preserved:valeur`. */
  nom: string;
  ok: boolean;
  /** Ce que la page montre, rendu court. */
  lib: string;
  /** Ce que les lignes brutes disent, rendu court. */
  brut: string;
  /** Nombre de valeurs mises en regard. */
  comparaisons: number;
  message: string;
  /** Invariant en attente : sa raison — rendu, jamais bloquant. */
  attente?: string;
}

const n6 = (v: number | null | undefined): string =>
  v === null || v === undefined ? '—' : String(Math.round(v * 1e6) / 1e6);

/**
 * Évalue les invariants d'une attente sur ce que la page a montré.
 * `diagnostics` n'est lu que par `not-truncated`, et n'est demandé que quand
 * l'attente en porte un.
 */
export function evaluerInvariants(
  expect: Expect,
  attendus: AttenduInvariant[],
  observation: Observation,
  diagnostics?: ObservationDiagnostic | null
): VerdictInvariant[] {
  const lignes = lignesEmises(expect, observation);
  return attendus.map(({ invariant: inv, reference: ref }) => {
    const nom = `${inv.kind}${'field' in inv && inv.field ? `:${inv.field}` : ''}`;
    const attente = inv.skip ? { attente: inv.skip } : {};
    if (lignes === null) {
      return {
        nom,
        ok: false,
        lib: '—',
        brut: '—',
        comparaisons: 0,
        message: 'rien à observer',
        ...attente,
      };
    }
    switch (inv.kind) {
      case 'sum-preserved': {
        const nums = lignes.map((r) => toNum(r[inv.field])).filter((n): n is number => n !== null);
        const somme = nums.length === 0 ? null : nums.reduce((a, b) => a + b, 0);
        const ok =
          somme === null || ref.sum === null || ref.sum === undefined
            ? somme === (ref.sum ?? null)
            : closeEnough(somme, ref.sum, 6);
        return {
          nom,
          ok,
          lib: n6(somme),
          brut: n6(ref.sum),
          comparaisons: 1,
          message: ok
            ? ''
            : `somme de « ${inv.field} » émise ${n6(somme)}, brute ${n6(ref.sum)} — écart ${n6((somme ?? 0) - (ref.sum ?? 0))}`,
          ...attente,
        };
      }
      case 'count-preserved': {
        const ok = lignes.length === ref.count;
        return {
          nom,
          ok,
          lib: `${lignes.length} lignes`,
          brut: `${ref.count} lignes`,
          comparaisons: 1,
          message: ok ? '' : `${lignes.length} lignes émises, ${ref.count} brutes`,
          ...attente,
        };
      }
      case 'count-equals': {
        const ok = lignes.length === inv.n;
        return {
          nom,
          ok,
          lib: `${lignes.length} lignes`,
          brut: `${inv.n} attendues`,
          comparaisons: 1,
          message: ok ? '' : `${lignes.length} lignes émises, ${inv.n} attendues`,
          ...attente,
        };
      }
      case 'null-group': {
        const vides = lignes.filter((r) => absent(r[inv.field]));
        const comptes = (rows: Row[]) =>
          inv.count === undefined
            ? null
            : rows.map((r) => toNum(r[inv.count!]) ?? 0).reduce((a, b) => a + b, 0);
        if (inv.expect === 'visible') {
          const compte = comptes(vides);
          const ok =
            vides.length > 0 && (compte === null || closeEnough(compte, ref.nullCount ?? 0, 6));
          return {
            nom,
            ok,
            lib: vides.length === 0 ? 'aucun groupe vide' : `groupe vide : ${n6(compte)}`,
            brut: `${ref.nullCount} lignes brutes sans valeur`,
            comparaisons: 1 + (compte === null ? 0 : 1),
            message: ok
              ? ''
              : vides.length === 0
                ? `aucune ligne à « ${inv.field} » vide alors que ${ref.nullCount} lignes brutes n'en ont pas — le groupe null a disparu ou a été fondu`
                : `le groupe vide compte ${n6(compte)}, ${ref.nullCount} lignes brutes sans valeur`,
            ...attente,
          };
        }
        const total = comptes(lignes);
        const ok =
          vides.length === 0 && (total === null || closeEnough(total, ref.nonNullCount ?? 0, 6));
        return {
          nom,
          ok,
          lib: `${vides.length} groupe(s) vide(s), total ${n6(total)}`,
          brut: `${ref.nonNullCount} lignes brutes avec valeur`,
          comparaisons: 1 + (total === null ? 0 : 1),
          message: ok
            ? ''
            : vides.length > 0
              ? `${vides.length} ligne(s) à « ${inv.field} » vide émise(s) alors que le groupe null doit être exclu`
              : `la somme des comptes vaut ${n6(total)}, ${ref.nonNullCount} lignes brutes avec valeur`,
          ...attente,
        };
      }
      case 'bounded': {
        // Un KPI ou un texte n'a qu'une valeur : c'est elle qu'on borne.
        const champ =
          expect.kind === 'kpi' || expect.kind === 'text' ? 'value' : (inv.field ?? 'value');
        const valeurs = lignes.map((r) => toNum(r[champ])).filter((n): n is number => n !== null);
        const hors = valeurs.filter(
          (v) => (inv.min !== undefined && v < inv.min) || (inv.max !== undefined && v > inv.max)
        );
        const ok = valeurs.length > 0 && hors.length === 0;
        const borne = `[${inv.min ?? '−∞'} ; ${inv.max ?? '+∞'}]`;
        return {
          nom,
          ok,
          lib:
            valeurs.length === 0
              ? 'rien à borner'
              : `${valeurs.length} valeur(s), ${hors.length} hors bornes`,
          brut: borne,
          comparaisons: valeurs.length,
          message: ok
            ? ''
            : valeurs.length === 0
              ? `aucune valeur numérique de « ${champ} » à borner`
              : `${hors.length} valeur(s) hors ${borne} : ${hors.slice(0, 3).map(n6).join(', ')}`,
          ...attente,
        };
      }
      case 'null-stays-null': {
        if (inv.key && ref.nullKeys) {
          const parCle = new Map(lignes.map((r) => [cleDe(r, inv.key!), r]));
          const devenues = ref.nullKeys.filter((k) => {
            const r = parCle.get(k);
            return r !== undefined && !absent(r[inv.field]);
          });
          const ok = devenues.length === 0;
          return {
            nom,
            ok,
            lib: `${devenues.length} absent(s) devenu(s) valeur`,
            brut: `${ref.nullKeys.length} absent(s) en amont`,
            comparaisons: ref.nullKeys.length,
            message: ok
              ? ''
              : `« ${inv.field} » porte une valeur là où l'amont n'en avait pas : ${devenues
                  .slice(0, 3)
                  .map((k) => `${k} → ${n6(toNum(parCle.get(k)![inv.field]))}`)
                  .join(', ')}`,
            ...attente,
          };
        }
        const absents = lignes.filter((r) => absent(r[inv.field])).length;
        const ok = absents >= (ref.nullCount ?? 0);
        return {
          nom,
          ok,
          lib: `${absents} absent(s) en aval`,
          brut: `${ref.nullCount} absent(s) en amont`,
          comparaisons: 1,
          message: ok
            ? ''
            : `${absents} absents en aval pour ${ref.nullCount} en amont : des absences sont devenues des valeurs`,
          ...attente,
        };
      }
      case 'not-truncated': {
        // Sur un KPI, c'est la VALEUR qui compte les lignes (un `count`) ;
        // sur des lignes, leur nombre.
        const recues =
          expect.kind === 'kpi' || expect.kind === 'text'
            ? (toNum(lignes[0]?.value) ?? -1)
            : lignes.length;
        const complet = recues === ref.count;
        // Le premier mot de la bibliothèque, cité : un rapport qui dit « un
        // diagnostic » sans le montrer ne permet pas de juger s'il parle du
        // bon sujet.
        const premier = diagnostics?.configError ?? diagnostics?.console[0]?.text ?? null;
        const dit = premier !== null;
        const ok = complet || dit;
        return {
          nom,
          ok,
          lib: `${recues} lignes, ${dit ? `diagnostic « ${premier.replace(/\s+/g, ' ').slice(0, 90)} »` : 'aucun diagnostic'}`,
          brut: `${ref.count} lignes brutes`,
          comparaisons: 2,
          message: ok
            ? ''
            : `${recues} lignes reçues sur ${ref.count} brutes, et la bibliothèque n'a rien dit — troncature silencieuse`,
          ...attente,
        };
      }
    }
  });
}
