/**
 * Conformite des appels d'outils au schema DECLARE (#1112, critere
 * « aucune option hors schema »).
 *
 * La validation du Studio (`document.ts`) ne refuse pas une propriete inconnue :
 * elle l'ignore. Un modele qui ecrit `popupTemplate` sur un chart, ou
 * `cluster:"ville"`, passe donc sans bruit — et c'est precisement la derive
 * que #1109 a constatee (options lues dans les skills, absentes des outils).
 * On relit ici chaque appel contre le schema des outils ENVOYE au modele,
 * sans rien reinterpreter : proprietes inconnues (`additionalProperties:
 * false`), valeurs hors `enum`, type, proprietes requises.
 *
 * Sous-ensemble de JSON Schema limite a ce que les outils du Studio emploient
 * (schemas plats, sans oneOf, pour le decodage guide vLLM).
 */

export interface NoeudSchema {
  type?: string;
  enum?: readonly unknown[];
  properties?: Readonly<Record<string, NoeudSchema>>;
  items?: NoeudSchema;
  required?: readonly string[];
  additionalProperties?: boolean;
}

/** Outil tel que declare dans le corps de la requete (forme OpenAI). */
export interface OutilDeclare {
  type?: string;
  function?: { name?: string; parameters?: NoeudSchema };
}

function typeDe(valeur: unknown): string {
  if (valeur === null) return 'null';
  if (Array.isArray(valeur)) return 'array';
  if (typeof valeur === 'number') return Number.isInteger(valeur) ? 'integer' : 'number';
  return typeof valeur;
}

function typeConforme(attendu: string, valeur: unknown): boolean {
  const reel = typeDe(valeur);
  if (attendu === 'number') return reel === 'number' || reel === 'integer';
  return attendu === reel;
}

/** Ecarts d'une valeur a son schema, avec leur chemin (`blocks[0].layers[0].cluster`). */
export function ecartsAuSchema(valeur: unknown, schema: NoeudSchema, chemin: string): string[] {
  const ecarts: string[] = [];
  if (schema.enum && !schema.enum.includes(valeur)) {
    ecarts.push(`${chemin} = ${JSON.stringify(valeur)} hors enum (${schema.enum.join(' | ')})`);
    return ecarts;
  }
  if (schema.type && !typeConforme(schema.type, valeur)) {
    ecarts.push(`${chemin} : ${typeDe(valeur)} au lieu de ${schema.type}`);
    return ecarts;
  }
  if (schema.type === 'array' && Array.isArray(valeur) && schema.items) {
    valeur.forEach((element, i) => {
      ecarts.push(...ecartsAuSchema(element, schema.items as NoeudSchema, `${chemin}[${i}]`));
    });
  }
  if (schema.type === 'object' && valeur && typeof valeur === 'object' && !Array.isArray(valeur)) {
    const objet = valeur as Record<string, unknown>;
    const proprietes = schema.properties ?? {};
    for (const requise of schema.required ?? []) {
      if (!(requise in objet)) ecarts.push(`${chemin}.${requise} requis, absent`);
    }
    for (const [cle, sous] of Object.entries(objet)) {
      const sousSchema = Object.prototype.hasOwnProperty.call(proprietes, cle)
        ? proprietes[cle]
        : undefined;
      if (!sousSchema) {
        if (schema.additionalProperties === false) {
          ecarts.push(`${chemin}.${cle} : option inconnue du schéma`);
        }
        continue;
      }
      ecarts.push(...ecartsAuSchema(sous, sousSchema, `${chemin}.${cle}`));
    }
  }
  return ecarts;
}

/** Appel d'outil tel que le modele l'a emis. */
export interface AppelOutil {
  nom: string;
  /** Arguments bruts (chaine JSON), avant tout traitement. */
  brut: string;
}

/**
 * Ecarts d'un appel a la declaration de l'outil : outil non declare, JSON
 * illisible, ou arguments hors schema. Liste vide = conforme.
 */
export function ecartsDeLAppel(appel: AppelOutil, outils: readonly OutilDeclare[]): string[] {
  const declare = outils.find((o) => o.function?.name === appel.nom);
  if (!declare?.function) return [`outil « ${appel.nom} » non déclaré`];
  let args: unknown;
  try {
    args = JSON.parse(appel.brut || '{}');
  } catch {
    return [`${appel.nom} : arguments JSON illisibles`];
  }
  const schema = declare.function.parameters;
  if (!schema) return [];
  return ecartsAuSchema(args, schema, appel.nom);
}
