/**
 * Vocabulaire des blocs donne au modele, ENGENDRE depuis le schema des outils
 * (#1109).
 *
 * Constat du 2026-09-24 (« Aides nationales ») : le Studio a annonce un volet
 * `dsfr-data-map-popup`, puis `popup-template` et `cluster`, qu'aucun de ses
 * outils ne savait ecrire — il les tenait des skills, qui decrivent la LIB
 * entiere. Le prompt ne cite donc plus d'option de memoire : il liste ce que
 * `BLOCK_SPEC_SCHEMA` accepte, c'est-a-dire exactement ce que la validation
 * des appels (`document.ts`) laisse passer. Une option ajoutee au schema
 * apparait ici sans autre geste ; une option retiree disparait.
 */

import { BLOCK_SPEC_SCHEMA } from '../document.js';
import { CHARGER_SOURCE_URL_TOOL, listerFormatsReconnus } from '../source-url.js';

/** Forme minimale d'un noeud de JSON Schema, telle qu'on la parcourt ici. */
interface NoeudSchema {
  type?: string;
  enum?: readonly string[];
  description?: string;
  properties?: Readonly<Record<string, NoeudSchema>>;
  items?: NoeudSchema;
  required?: readonly string[];
}

/** Resume d'une option : type, valeurs permises, description. */
function decrireOption(nom: string, noeud: NoeudSchema, requis: boolean): string {
  const valeurs = noeud.enum ? ` = ${noeud.enum.join(' | ')}` : '';
  const type = noeud.enum
    ? ''
    : noeud.type === 'array'
      ? ` (liste${noeud.items?.type === 'object' ? " d'objets" : ''})`
      : noeud.type && noeud.type !== 'string'
        ? ` (${noeud.type === 'integer' ? 'entier' : noeud.type === 'boolean' ? 'booléen' : noeud.type === 'object' ? 'objet' : noeud.type})`
        : '';
  const obligatoire = requis ? ' [obligatoire]' : '';
  const description = noeud.description ? ` — ${noeud.description}` : '';
  return `- ${nom}${valeurs}${type}${obligatoire}${description}`;
}

/** Objet imbrique d'une option (config d'un chart, couches d'une carte). */
function objetImbrique(noeud: NoeudSchema): NoeudSchema | null {
  if (noeud.type === 'object' && noeud.properties) return noeud;
  if (noeud.type === 'array' && noeud.items?.type === 'object' && noeud.items.properties) {
    return noeud.items;
  }
  return null;
}

/** Une section par objet : ses options, puis ses objets imbriques. */
function decrireObjet(titre: string, noeud: NoeudSchema, sections: string[]): void {
  const requis = new Set(noeud.required ?? []);
  const lignes: string[] = [];
  const imbriques: Array<[string, NoeudSchema]> = [];
  for (const [nom, enfant] of Object.entries(noeud.properties ?? {})) {
    lignes.push(decrireOption(nom, enfant, requis.has(nom)));
    const objet = objetImbrique(enfant);
    if (objet) imbriques.push([nom, objet]);
  }
  sections.push(`${titre}\n${lignes.join('\n')}`);
  for (const [nom, objet] of imbriques) {
    decrireObjet(`Options de « ${nom} » :`, objet, sections);
  }
}

/**
 * Le vocabulaire complet, pret a inserer dans le prompt. Les noms d'options
 * y sont ceux du schema (camelCase), jamais les attributs HTML des composants.
 */
export function describeBlockVocabulary(): string {
  const sections: string[] = [];
  decrireObjet(
    "Options d'un bloc (add_blocks, update_block) :",
    BLOCK_SPEC_SCHEMA as unknown as NoeudSchema,
    sections
  );
  return sections.join('\n\n');
}

/** Tous les noms d'options du schema des blocs, a toute profondeur. */
export function blockOptionNames(): Set<string> {
  const noms = new Set<string>();
  const parcourir = (noeud: NoeudSchema): void => {
    for (const [nom, enfant] of Object.entries(noeud.properties ?? {})) {
      noms.add(nom);
      const objet = objetImbrique(enfant);
      if (objet) parcourir(objet);
    }
  };
  parcourir(BLOCK_SPEC_SCHEMA as unknown as NoeudSchema);
  return noms;
}

/**
 * L'outil `charger_source_url` (#1140), decrit depuis SON schema : ses
 * parametres sont ceux que la boucle lit, et les formats reconnus viennent de
 * la reconnaissance partagee avec l'app Sources — rien n'est recopie ici.
 */
export function describeSourceUrlTool(): string {
  const { name, description, parameters } = CHARGER_SOURCE_URL_TOOL.function;
  const sections: string[] = [];
  decrireObjet(
    `${name} — ${description}\nParamètres :`,
    parameters as unknown as NoeudSchema,
    sections
  );
  return `${sections.join('\n\n')}\nFormats d'URL reconnus :\n${listerFormatsReconnus()}`;
}
