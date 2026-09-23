/**
 * Règle 6 de `check:reperes` (#1013, ADR-143) : une visite guidée ne cite que
 * des repères du registre.
 *
 * Les étapes des visites (`packages/shared/src/tour/tour-configs.ts`,
 * `apps/builder/src/ui/tour.ts`) désignent leur cible par `repere: '<id>'`.
 * Fonctions PURES : elles reçoivent le contenu des fichiers et les registres
 * extraits, ne lisent rien sur le disque (le script `build-reperes.ts` fait
 * les lectures ; `tests/reperes/tours.test.ts` les appelle sur des fixtures).
 *
 * Lecture par un parcours caractère par caractère, sans expression régulière :
 * commentaires et chaînes sont sautés (un `repere:` cité dans un commentaire
 * n'est pas une étape), et la valeur d'une propriété `repere` doit être un
 * littéral — un repère calculé échapperait au contrôle.
 */

import type { FichierSource, Probleme } from './reperes-extract';

/** Propriétés `repere` lues dans un fichier de visites. */
export interface ReperesCites {
  /** Valeurs littérales, dans l'ordre du fichier. */
  litteraux: string[];
  /** Nombre de propriétés `repere` dont la valeur n'est pas un littéral. */
  nonLitteraux: number;
}

const estIdent = (c: string | undefined): boolean =>
  c !== undefined &&
  ((c >= 'a' && c <= 'z') ||
    (c >= 'A' && c <= 'Z') ||
    (c >= '0' && c <= '9') ||
    c === '_' ||
    c === '$');

const estEspace = (c: string | undefined): boolean =>
  c === ' ' || c === '\t' || c === '\n' || c === '\r';

/** Fin (exclue) de la chaîne ouverte en `i` par `quote`. */
function finDeChaine(src: string, i: number, quote: string): number {
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === '\\') {
      j += 2;
      continue;
    }
    if (src[j] === quote) return j + 1;
    j++;
  }
  return src.length;
}

/** Les propriétés `repere: …` d'un source TS, hors commentaires et chaînes. */
export function reperesDesVisites(src: string): ReperesCites {
  const out: ReperesCites = { litteraux: [], nonLitteraux: 0 };
  const MOT = 'repere';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      const fin = src.indexOf('\n', i);
      i = fin === -1 ? src.length : fin + 1;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const fin = src.indexOf('*/', i + 2);
      i = fin === -1 ? src.length : fin + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      i = finDeChaine(src, i, c);
      continue;
    }
    if (
      c === 'r' &&
      src.startsWith(MOT, i) &&
      !estIdent(src[i - 1]) &&
      !estIdent(src[i + MOT.length])
    ) {
      let j = i + MOT.length;
      while (estEspace(src[j])) j++;
      if (src[j] === '?') j++;
      if (src[j] === ':') {
        j++;
        while (estEspace(src[j])) j++;
        const q = src[j];
        if (q === "'" || q === '"') {
          const fin = finDeChaine(src, j, q);
          out.litteraux.push(src.slice(j + 1, fin - 1));
          i = fin;
          continue;
        }
        // Une annotation de type (`repere?: string`) n'est pas une étape.
        if (!src.startsWith('string', j)) out.nonLitteraux++;
      }
      i = j;
      continue;
    }
    i++;
  }
  return out;
}

/**
 * Vérifie les visites contre les registres extraits : chaque repère cité doit
 * appartenir au registre de l'app dont il porte le préfixe.
 *
 * @param registres préfixe d'app (`carto`) → identifiants de son registre.
 */
export function verifierVisites(
  fichiers: readonly FichierSource[],
  registres: ReadonlyMap<string, ReadonlySet<string>>
): Probleme[] {
  const problemes: Probleme[] = [];
  for (const f of fichiers) {
    const { litteraux, nonLitteraux } = reperesDesVisites(f.contenu);
    if (nonLitteraux > 0) {
      problemes.push({
        fichier: f.chemin,
        message: `${nonLitteraux} etape(s) de visite dont le repere n'est pas un litteral (« repere: '<id>' » attendu)`,
      });
    }
    for (const id of litteraux) {
      const prefixe = id.split('.')[0];
      const ids = registres.get(prefixe);
      if (!ids) {
        problemes.push({
          fichier: f.chemin,
          message: `visite citant « ${id} » : aucune app n'a de registre de prefixe « ${prefixe} »`,
        });
      } else if (!ids.has(id)) {
        problemes.push({
          fichier: f.chemin,
          message: `visite citant « ${id} », absent du registre`,
        });
      }
    }
  }
  return problemes;
}
