/**
 * Total repete par entite : la note que l'APPLICATION garantit (#1123).
 *
 * Le signal est donne au modele (inspect_data et contexte de donnees du
 * prompt), mais le banc a montre qu'il l'ignore : 0/2 sur « Aides
 * nationales » meme avec le fait sous les yeux. Le fait est calcule, pas
 * devine : quand le tour a pose des blocs et que la reponse ne nomme pas la
 * colonne, la boucle ajoute elle-meme une phrase a la reponse.
 *
 * Ce qui est tu :
 *   - les colonnes deja nommees dans la reponse ou dans un message precedent
 *     de l'assistant (le modele l'a dit : on ne le repete pas) ;
 *   - les coordonnees d'une couche de carte (latField / lonField) : repetees
 *     par entite, c'est normal.
 */

import { constantColumnsByEntity, type ConstantColumn, type Row } from '@dsfr-data/shared';
import type { DashboardData, Field } from '../state.js';

/** Minuscules sans accents, apostrophes unifiees : comparaison par `includes`. */
function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .toLowerCase();
}

/** Champs de coordonnees des couches de carte du document. */
function coordonnees(doc: DashboardData): Set<string> {
  const champs = new Set<string>();
  for (const w of doc.widgets) {
    if (w.type !== 'map') continue;
    for (const couche of w.config.layers ?? []) {
      if (couche.latField) champs.add(couche.latField);
      if (couche.lonField) champs.add(couche.lonField);
    }
  }
  return champs;
}

/** Colonnes a signaler : repetees par entite, ni coordonnees ni deja dites. */
export function colonnesASignaler(
  doc: DashboardData,
  data: Row[],
  fields: Field[],
  dejaDit: readonly string[]
): ConstantColumn[] {
  if (doc.widgets.length === 0) return [];
  const exclues = coordonnees(doc);
  const texte = normaliser(dejaDit.join('\n'));
  return constantColumnsByEntity(data, fields).filter(
    (c) => !exclues.has(c.field) && !texte.includes(normaliser(c.field))
  );
}

/** Phrase ajoutee a la reponse (vide s'il n'y a rien a dire). */
export function noteTotalRepete(colonnes: readonly ConstantColumn[]): string {
  if (colonnes.length === 0) return '';
  const phrases = colonnes.map(
    (c) =>
      `« ${c.field} » est constant pour chaque « ${c.entity} » : c'est une valeur de l'entité, répétée sur chacune de ses lignes — ne la lisez pas comme une valeur propre à chaque ligne et ne la sommez pas.`
  );
  return `À noter : ${phrases.join(' ')}`;
}
