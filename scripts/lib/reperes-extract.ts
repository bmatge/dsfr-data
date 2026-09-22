/**
 * Extraction des reperes d'interface (#997, epic #992, ADR-143) — fonctions
 * PURES : elles recoivent le contenu des fichiers et le manifeste, ne lisent
 * rien sur le disque. Le script `scripts/build-reperes.ts` fait les lectures ;
 * les tests (`tests/reperes/`) appellent ces fonctions sur des fixtures.
 *
 * Meme doctrine que `build-specs-tables.ts` (#757) et la reference des skills
 * (#512) : l'interface devient une donnee GENEREE depuis le balisage, et un
 * `--check` bloquant refuse toute derive.
 *
 * Controles (`problemes`, bloquants) :
 *   1. un controle d'une zone de reglage n'a pas de repere (sauf exception
 *      declaree, avec sa raison) ;
 *   2. un `data-attribut` n'existe pas dans le custom-elements manifest ;
 *   3. un prerequis cite n'a pas de regle dans le `prerequis.ts` de l'app (et
 *      le `repereQuiLeve` d'une regle doit exister) ;
 *   4. (script) le registre commite n'est pas le rendu exact de l'extraction ;
 *   5. un repere cite par un constat n'existe pas dans le registre.
 * Plus les erreurs de format : valeur dynamique (`data-repere="${…}"` hors
 * helper declare, ou `data-repere-libelle="${…}"`), identifiant mal forme, hors prefixe ou trop court, zone
 * parente absente, repere hors de sa zone, repere sans libelle, doublon
 * contradictoire, synonyme orphelin, zone de reglage introuvable.
 */

import type {
  AttributRepere,
  GenreRepere,
  Repere,
  ReperesConfig,
} from '../../packages/shared/src/ui/reperes-types';
import type { CemManifest } from './cem-reference';
import {
  BALISE_APPEL,
  ancetres,
  corpsDeFonction,
  correspond,
  fragmentsTs,
  lireElements,
  lireObjetExporte,
  nettoyer,
  type Element,
} from './reperes-lexer';

export interface FichierSource {
  /** Chemin relatif a la racine du depot : `apps/builder-carto/index.html`. */
  chemin: string;
  contenu: string;
}

export interface Probleme {
  fichier: string;
  message: string;
}

export interface EntreesExtraction {
  config: ReperesConfig;
  /** Fichiers balises (`config.sources`, resolus). */
  sources: readonly FichierSource[];
  manifest: CemManifest;
  /** Contenu de `config.prerequis`, si declare et present. */
  prerequis?: FichierSource;
  /** Contenu des fichiers `config.constats` presents. */
  constats?: readonly FichierSource[];
}

export interface ResultatExtraction {
  reperes: Repere[];
  problemes: Probleme[];
  /** Avertissements non bloquants. */
  avertissements: Probleme[];
}

/** Controles soumis a la regle « porte un repere ». */
export const CONTROLES = new Set(['input', 'select', 'textarea', 'button']);

const FORME_ID = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;
const FORME_PREREQUIS = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FORME_ATTRIBUT = /^([a-z][a-z0-9-]*):([a-z][a-z0-9-]*)$/;

/** Segments minimum par genre : `carto.elements` (zone), `carto.elements.popup-mode` (controle). */
export const SEGMENTS_MIN: Record<GenreRepere, number> = { zone: 2, controle: 3 };

/** Zone d'un repere : son identifiant prive du dernier segment (ou rien pour une zone de 1er niveau). */
export function zoneDe(id: string, genre: GenreRepere): string | undefined {
  const segments = id.split('.');
  const parent = segments.slice(0, -1);
  return parent.length >= SEGMENTS_MIN.zone || genre === 'controle' ? parent.join('.') : undefined;
}

// ---------------------------------------------------------------------------
// Manifeste
// ---------------------------------------------------------------------------

export function indexerAttributs(manifest: CemManifest): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const mod of manifest.modules) {
    for (const decl of mod.declarations ?? []) {
      if (!decl.tagName || !decl.attributes) continue;
      const attrs = new Map<string, string>();
      for (const a of decl.attributes) {
        attrs.set(a.name, (a.description ?? '').replace(/\s+/g, ' ').trim());
      }
      out.set(decl.tagName, attrs);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Lecture des fichiers
// ---------------------------------------------------------------------------

interface Fragment {
  chemin: string;
  elements: Element[];
  /** Nom du helper dont le corps contient ce fragment, s'il y en a un. */
  helper?: string;
}

function fragmentsDe(f: FichierSource, config: ReperesConfig): Fragment[] {
  if (f.chemin.endsWith('.html')) return [{ chemin: f.chemin, elements: lireElements(f.contenu) }];
  const helpers = config.helpers ?? [];
  const corps = helpers
    .map((h) => ({ nom: h.fonction, plage: corpsDeFonction(f.contenu, h.fonction) }))
    .filter((x): x is { nom: string; plage: [number, number] } => x.plage !== null);
  return fragmentsTs(f.contenu, helpers).map(({ html, debut }) => ({
    chemin: f.chemin,
    elements: lireElements(html),
    helper: corps.find((c) => debut >= c.plage[0] && debut < c.plage[1])?.nom,
  }));
}

const liste = (v: string) => v.split(/\s+/).filter(Boolean);

// ---------------------------------------------------------------------------
// Libelles
// ---------------------------------------------------------------------------

interface IndexLibelles {
  /** `<label for="x">` -> texte direct du label. */
  labelsFor: Map<string, string>;
  /** id -> texte de l'element (pour aria-labelledby). */
  textesParId: Map<string, string>;
}

function indexerLibelles(fragments: Fragment[]): IndexLibelles {
  const labelsFor = new Map<string, string>();
  const textesParId = new Map<string, string>();
  for (const { elements } of fragments) {
    for (const el of elements) {
      const id = el.attrs.get('id');
      if (id && !id.dynamique && id.valeur) {
        const t = nettoyer(el.texte);
        if (t && !textesParId.has(id.valeur)) textesParId.set(id.valeur, t);
      }
      if (el.tag !== 'label') continue;
      const pour = el.attrs.get('for');
      if (!pour || pour.dynamique || !pour.valeur) continue;
      const t = nettoyer(el.texteDirect) || nettoyer(el.texte);
      if (t && !labelsFor.has(pour.valeur)) labelsFor.set(pour.valeur, t);
    }
  }
  return { labelsFor, textesParId };
}

const TITRES = new Set(['legend', 'summary', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

function libelleDe(elements: Element[], el: Element, idx: IndexLibelles, zone: boolean): string {
  const attr = (n: string) => {
    const a = el.attrs.get(n);
    return a && !a.dynamique ? a.valeur.trim() : '';
  };
  if (el.tag === BALISE_APPEL) return attr('data-appel-libelle');
  // Controle repete (un par couche, par couleur…) dont le nom accessible est
  // dynamique : le libelle de la FAMILLE est donne en litteral, en premier.
  if (attr('data-repere-libelle')) return attr('data-repere-libelle');
  const id = attr('id');
  if (id && idx.labelsFor.has(id)) return idx.labelsFor.get(id)!;
  if (attr('aria-label')) return attr('aria-label');
  const parIds = liste(attr('aria-labelledby'))
    .map((x) => idx.textesParId.get(x) ?? '')
    .filter(Boolean);
  if (parIds.length) return parIds.join(' ');
  if (!zone) {
    const labelParent = ancetres(elements, el).find((a) => a.tag === 'label');
    if (labelParent) {
      const t = nettoyer(labelParent.texteDirect);
      if (t) return t;
    }
    if (el.tag === 'button' || el.tag === 'a' || el.tag === 'summary') {
      const t = nettoyer(el.texte);
      if (t) return t;
    }
  } else {
    // Zone : premier titre descendant (legend, summary, h1-h6).
    const titre = elements.find(
      (d) => TITRES.has(d.tag) && ancetres(elements, d).some((a) => a.index === el.index)
    );
    if (titre) {
      const t = nettoyer(titre.texte);
      if (t) return t;
    }
  }
  return attr('title');
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

interface Brouillon {
  repere: Omit<Repere, 'sources' | 'synonymes'>;
  synonymes: string[];
  sources: Set<string>;
  signature: string;
  /** Zone ancetre lexicale, pour la regle « repere hors de sa zone ». */
  zoneLexicale?: string;
}

/**
 * Extrait les reperes d'une app et verifie les regles 1, 2, 3 et 5.
 * La regle 4 (registre perime) compare le rendu a un fichier : elle revient au
 * script, qui seul lit le disque.
 */
export function extraireReperes(entrees: EntreesExtraction): ResultatExtraction {
  const { config, manifest } = entrees;
  const problemes: Probleme[] = [];
  const avertissements: Probleme[] = [];
  const fichierConfig = `apps/${config.app}/src/assistant/reperes.config.ts`;
  const attributs = indexerAttributs(manifest);
  const fragments = entrees.sources.flatMap((f) => fragmentsDe(f, config));
  const libelles = indexerLibelles(fragments);
  const prefixe = `${config.prefixe}.`;

  // Balise rendue par chaque helper (celle qui porte le data-repere recu en parametre)
  const baliseHelper = new Map<string, string>();
  for (const fr of fragments) {
    if (!fr.helper) continue;
    for (const el of fr.elements) {
      if (el.attrs.get('data-repere')?.dynamique) baliseHelper.set(fr.helper, el.tag);
    }
  }
  for (const h of config.helpers ?? []) {
    if (!baliseHelper.has(h.fonction)) {
      problemes.push({
        fichier: fichierConfig,
        message: `helper « ${h.fonction} » : aucun data-repere="\${…}" dans son corps (fonction introuvable ou non balisee)`,
      });
    }
  }

  // Prerequis declares (lecture statique de prerequis.ts)
  let reglesPrerequis: Map<string, { repereQuiLeve?: string }> | null = null;
  if (config.prerequis) {
    if (!entrees.prerequis) {
      problemes.push({
        fichier: `apps/${config.app}/${config.prerequis}`,
        message: 'module des prerequis declare dans reperes.config.ts mais introuvable',
      });
    } else {
      reglesPrerequis = lireObjetExporte(entrees.prerequis.contenu, 'PREREQUIS');
      if (!reglesPrerequis) {
        problemes.push({
          fichier: entrees.prerequis.chemin,
          message: 'aucun « export const PREREQUIS = { … } » lisible',
        });
      }
    }
  }

  const brouillons = new Map<string, Brouillon>();
  const idsHtml = new Set<string>();
  const exceptionsUtilisees = new Set<string>();

  for (const { chemin, elements, helper } of fragments) {
    for (const el of elements) {
      const idHtml = el.attrs.get('id');
      if (idHtml && !idHtml.dynamique) idsHtml.add(`#${idHtml.valeur}`);
      const rep = el.attrs.get('data-repere');
      const zon = el.attrs.get('data-zone');
      const appel = el.tag === BALISE_APPEL;

      // Dans le corps d'un helper declare, le repere recu en parametre est tolere :
      // ce sont ses SITES D'APPEL qui portent le litteral.
      if (helper && rep?.dynamique) continue;

      // --- regle 1 : controle sans repere dans une zone de reglage
      const estControle =
        appel || (CONTROLES.has(el.tag) && el.attrs.get('type')?.valeur !== 'hidden');
      if (estControle && !rep) {
        const dansZone = [el, ...ancetres(elements, el)].some((a) =>
          config.zonesDeReglage.some((z) => designe(a, z))
        );
        if (dansZone) {
          const exception = config.exceptions.find((x) => correspond(el, x.cible));
          if (exception) exceptionsUtilisees.add(exception.cible);
          else {
            problemes.push({
              fichier: chemin,
              message: `controle sans repere dans une zone de reglage : ${decrire(el)}`,
            });
          }
        }
      }

      if (!rep && !zon) continue;
      if (rep && zon) {
        problemes.push({
          fichier: chemin,
          message: `${decrire(el)} porte a la fois data-repere et data-zone`,
        });
        continue;
      }
      const genre: GenreRepere = rep ? 'controle' : 'zone';
      const marque = (rep ?? zon)!;
      const nomMarque = rep ? 'data-repere' : 'data-zone';
      if (marque.dynamique) {
        problemes.push({
          fichier: chemin,
          message: `${nomMarque} dynamique refuse (${decrire(el)}) : un repere est un litteral, jamais "\${…}" (sauf dans un helper declare dans reperes.config.ts)`,
        });
        continue;
      }
      const id = marque.valeur;
      if (!FORME_ID.test(id) || !id.startsWith(prefixe)) {
        problemes.push({
          fichier: chemin,
          message: `${nomMarque}="${id}" mal forme : attendu « ${prefixe}segment.segment… » en minuscules`,
        });
        continue;
      }
      if (id.split('.').length < SEGMENTS_MIN[genre]) {
        problemes.push({
          fichier: chemin,
          message: `${nomMarque}="${id}" trop court : ${
            genre === 'controle'
              ? `un controle a au moins trois segments (« ${prefixe}<zone>.<controle> »)`
              : `une zone a au moins deux segments (« ${prefixe}<zone> »)`
          }`,
        });
        continue;
      }

      if (el.attrs.get('data-repere-libelle')?.dynamique) {
        problemes.push({
          fichier: chemin,
          message: `${id} : data-repere-libelle dynamique refuse (le libelle d'une famille est un litteral)`,
        });
      }

      // Attributs pilotes (regle 2)
      const attrsRepere: AttributRepere[] = [];
      const brutAttr = el.attrs.get('data-attribut');
      if (brutAttr?.dynamique) {
        problemes.push({ fichier: chemin, message: `${id} : data-attribut dynamique refuse` });
      } else if (brutAttr) {
        for (const ref of liste(brutAttr.valeur)) {
          const m = FORME_ATTRIBUT.exec(ref);
          if (!m) {
            problemes.push({
              fichier: chemin,
              message: `${id} : data-attribut « ${ref} » mal forme, attendu « tag:attribut »`,
            });
            continue;
          }
          const description = attributs.get(m[1])?.get(m[2]);
          if (description === undefined) {
            problemes.push({
              fichier: chemin,
              message: `${id} : data-attribut « ${ref} » absent du manifeste (packages/core/custom-elements.json)`,
            });
            continue;
          }
          attrsRepere.push({ tag: m[1], nom: m[2], description });
        }
      }

      // Prerequis (regle 3)
      const prerequis: string[] = [];
      const brutPre = el.attrs.get('data-prerequis');
      if (brutPre?.dynamique) {
        problemes.push({ fichier: chemin, message: `${id} : data-prerequis dynamique refuse` });
      } else if (brutPre) {
        for (const p of liste(brutPre.valeur)) {
          if (!FORME_PREREQUIS.test(p)) {
            problemes.push({ fichier: chemin, message: `${id} : prerequis « ${p} » mal forme` });
            continue;
          }
          if (!reglesPrerequis?.has(p)) {
            problemes.push({
              fichier: chemin,
              message: `${id} : prerequis « ${p} » sans regle dans ${
                config.prerequis
                  ? `apps/${config.app}/${config.prerequis}`
                  : 'prerequis.ts (non declare dans reperes.config.ts)'
              }`,
            });
            continue;
          }
          prerequis.push(p);
        }
      }

      const libelle = libelleDe(elements, el, libelles, genre === 'zone');
      if (!libelle) {
        problemes.push({
          fichier: chemin,
          message: `${id} : aucun libelle (label for, aria-label, aria-labelledby, texte ou title)`,
        });
      }
      const zoneLexicale = ancetres(elements, el)
        .map((a) => a.attrs.get('data-zone'))
        .find((z) => z && !z.dynamique)?.valeur;
      const zone = zoneDe(id, genre);
      const element = appel
        ? (baliseHelper.get(el.attrs.get('data-appel-fonction')?.valeur ?? '') ?? 'input')
        : el.tag;

      const repere: Brouillon['repere'] = {
        id,
        genre,
        libelle,
        element,
        ...(zone ? { zone } : {}),
        attributs: attrsRepere,
        prerequis,
      };
      const signature = JSON.stringify(repere);
      const deja = brouillons.get(id);
      if (!deja) {
        brouillons.set(id, {
          repere,
          synonymes: [],
          sources: new Set([chemin]),
          signature,
          zoneLexicale,
        });
      } else if (deja.signature !== signature) {
        problemes.push({
          fichier: chemin,
          message: `${id} pose deux fois avec des definitions differentes (deja dans ${[...deja.sources].join(', ')}) : meme libelle, memes attributs et prerequis attendus`,
        });
      } else {
        deja.sources.add(chemin);
      }
      if (zoneLexicale !== undefined && zoneLexicale !== zone) {
        problemes.push({
          fichier: chemin,
          message: `${id} hors de sa zone : pose dans data-zone="${zoneLexicale}", son identifiant le range dans ${zone ? `« ${zone} »` : 'aucune zone'}`,
        });
      }
    }
  }

  // Zone parente de chaque repere : elle doit exister comme data-zone
  for (const b of brouillons.values()) {
    const z = b.repere.zone;
    if (!z) continue;
    const parent = brouillons.get(z);
    if (!parent || parent.repere.genre !== 'zone') {
      problemes.push({
        fichier: [...b.sources][0],
        message: `${b.repere.id} : sa zone « ${z} » n'est posee nulle part (data-zone="${z}" attendu)`,
      });
    }
  }

  // Zones de reglage declarees mais introuvables
  for (const z of config.zonesDeReglage) {
    const trouvee = z.startsWith('#') ? idsHtml.has(z) : brouillons.get(z)?.repere.genre === 'zone';
    if (!trouvee) {
      problemes.push({
        fichier: fichierConfig,
        message: `zone de reglage « ${z} » introuvable dans les sources`,
      });
    }
  }
  for (const x of config.exceptions) {
    if (!x.raison.trim()) {
      problemes.push({ fichier: fichierConfig, message: `exception « ${x.cible} » sans raison` });
    }
    if (!exceptionsUtilisees.has(x.cible)) {
      avertissements.push({
        fichier: fichierConfig,
        message: `exception « ${x.cible} » sans objet : aucun controle sans repere ne la sollicite`,
      });
    }
  }

  // Synonymes
  for (const [id, syns] of Object.entries(config.synonymes ?? {})) {
    const b = brouillons.get(id);
    if (!b) {
      problemes.push({
        fichier: fichierConfig,
        message: `synonymes declares pour « ${id} », absent du registre`,
      });
      continue;
    }
    b.synonymes = [...syns];
  }

  // Ordre des cles fixe : c'est lui qui est serialise dans le registre.
  const reperes: Repere[] = [...brouillons.values()]
    .map((b) => ({
      id: b.repere.id,
      genre: b.repere.genre,
      libelle: b.repere.libelle,
      element: b.repere.element,
      ...(b.repere.zone ? { zone: b.repere.zone } : {}),
      attributs: b.repere.attributs,
      prerequis: b.repere.prerequis,
      synonymes: b.synonymes,
      sources: [...b.sources].sort(),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const ids = new Set(reperes.map((r) => r.id));

  // Prerequis : le repere qui leve chaque regle existe
  if (reglesPrerequis && entrees.prerequis) {
    for (const [nom, regle] of reglesPrerequis) {
      if (!regle.repereQuiLeve) {
        problemes.push({
          fichier: entrees.prerequis.chemin,
          message: `prerequis « ${nom} » sans repereQuiLeve litteral`,
        });
      } else if (!ids.has(regle.repereQuiLeve)) {
        problemes.push({
          fichier: entrees.prerequis.chemin,
          message: `prerequis « ${nom} » : le repere qui le leve (« ${regle.repereQuiLeve} ») est absent du registre`,
        });
      }
    }
  }

  // Regle 5 : reperes cites par les constats
  for (const f of entrees.constats ?? []) {
    for (const id of reperesCites(f.contenu, config.prefixe)) {
      if (!ids.has(id)) {
        problemes.push({
          fichier: f.chemin,
          message: `constat citant « ${id} », absent du registre`,
        });
      }
    }
  }

  return { reperes, problemes, avertissements };
}

/** `#id` designe un element par son id, toute autre valeur un data-zone. */
function designe(el: Element, zone: string): boolean {
  if (zone.startsWith('#')) {
    const id = el.attrs.get('id');
    return !!id && !id.dynamique && `#${id.valeur}` === zone;
  }
  const z = el.attrs.get('data-zone');
  return !!z && !z.dynamique && z.valeur === zone;
}

function decrire(el: Element): string {
  if (el.tag === BALISE_APPEL) {
    const lib = el.attrs.get('data-appel-libelle')?.valeur;
    return `appel de ${el.attrs.get('data-appel-fonction')?.valeur}(${lib ? `« ${lib} »` : ''})`;
  }
  const id = el.attrs.get('id');
  if (id && !id.dynamique && id.valeur) return `<${el.tag} id="${id.valeur}">`;
  const cls = el.attrs.get('class')?.valeur;
  return cls ? `<${el.tag} class="${cls}">` : `<${el.tag}>`;
}

/**
 * Identifiants de reperes cites par un fichier de constats : toute chaine
 * litterale de la forme `<prefixe>.xxx` (les constats designent les reperes
 * qui les corrigent, ADR-143 §3).
 */
export function reperesCites(src: string, prefixe: string): string[] {
  const out = new Set<string>();
  const esc = prefixe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  const re = new RegExp(`(['"\`])(${esc}(?:\\.[a-z0-9-]+)+)\\1`, 'g');
  for (const m of src.matchAll(re)) out.add(m[2]);
  return [...out].sort();
}

// ---------------------------------------------------------------------------
// Rendu du registre
// ---------------------------------------------------------------------------

/** Rendu exact de `apps/<app>/src/assistant/reperes.generated.ts`. */
export function rendreRegistre(config: ReperesConfig, reperes: readonly Repere[]): string {
  const entrees = reperes.map((r) => `  ${JSON.stringify(r)},`).join('\n');
  return `/* eslint-disable */
/**
 * FICHIER GENERE — NE PAS EDITER A LA MAIN.
 *
 * Registre des reperes de l'app ${config.app} (#997, ADR-143).
 * Source : les attributs data-repere / data-zone / data-attribut / data-prerequis
 * du balisage (${config.sources.join(', ')}), enrichis par
 * packages/core/custom-elements.json et apps/${config.app}/src/assistant/reperes.config.ts.
 * Regenerer : npm run build:reperes. Controle bloquant : npm run check:reperes.
 */
import type { Repere, RegistreReperes } from '@dsfr-data/shared';

export const REPERES = [
${entrees}
] as const satisfies readonly Repere[];

/** Identifiant de repere de l'app : enumeration fermee (outil montrer(), #1003). */
export type RepereId = (typeof REPERES)[number]['id'];

export const REGISTRE: RegistreReperes = {
  app: ${JSON.stringify(config.app)},
  prefixe: ${JSON.stringify(config.prefixe)},
  reperes: REPERES,
};
`;
}
