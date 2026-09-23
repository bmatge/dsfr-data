/* eslint-disable */
/**
 * FICHIER GENERE — NE PAS EDITER A LA MAIN.
 *
 * Registre des reperes de l'app playground (#997, ADR-143).
 * Source : les attributs data-repere / data-zone / data-attribut / data-prerequis
 * du balisage (index.html), enrichis par
 * packages/core/custom-elements.json et apps/playground/src/assistant/reperes.config.ts.
 * Regenerer : npm run build:reperes. Controle bloquant : npm run check:reperes.
 */
import type { Repere, RegistreReperes } from '@dsfr-data/shared';

export const REPERES = [
  {"id":"playground.actions","genre":"zone","libelle":"Barre d'actions","element":"app-action-bar","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/playground/index.html"]},
  {"id":"playground.actions.assistant","genre":"controle","libelle":"Assistant","element":"button","zone":"playground.actions","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/playground/index.html"]},
  {"id":"playground.actions.copier","genre":"controle","libelle":"Copier le code","element":"button","zone":"playground.actions","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/playground/index.html"]},
  {"id":"playground.actions.dependances","genre":"controle","libelle":"Ajouter des dépendances","element":"button","zone":"playground.actions","attributs":[],"prerequis":[],"synonymes":["cdn","dépendances","page autonome"],"sources":["apps/playground/index.html"]},
  {"id":"playground.actions.diagnostic","genre":"controle","libelle":"Diagnostic","element":"button","zone":"playground.actions","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/playground/index.html"]},
  {"id":"playground.actions.executer","genre":"controle","libelle":"Exécuter","element":"button","zone":"playground.actions","attributs":[],"prerequis":[],"synonymes":["lancer","rendu","exécuter le code"],"sources":["apps/playground/index.html"]},
  {"id":"playground.actions.exemples","genre":"controle","libelle":"Exemples","element":"button","zone":"playground.actions","attributs":[],"prerequis":[],"synonymes":["exemples","modèles","catalogue"],"sources":["apps/playground/index.html"]},
  {"id":"playground.actions.favori","genre":"controle","libelle":"Ajouter aux favoris","element":"button","zone":"playground.actions","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/playground/index.html"]},
  {"id":"playground.actions.jpg","genre":"controle","libelle":"Exporter en JPG","element":"button","zone":"playground.actions","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/playground/index.html"]},
  {"id":"playground.actions.pipeline","genre":"controle","libelle":"Ouvrir dans le Pipeline","element":"button","zone":"playground.actions","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/playground/index.html"]},
  {"id":"playground.actions.png","genre":"controle","libelle":"Exporter en PNG","element":"button","zone":"playground.actions","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/playground/index.html"]},
  {"id":"playground.actions.visite","genre":"controle","libelle":"Visite guidée","element":"button","zone":"playground.actions","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/playground/index.html"]},
  {"id":"playground.apercu","genre":"zone","libelle":"Aperçu","element":"div","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/playground/index.html"]},
  {"id":"playground.editeur","genre":"zone","libelle":"Éditeur de code","element":"div","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/playground/index.html"]},
  {"id":"playground.editeur.code","genre":"controle","libelle":"Code HTML","element":"textarea","zone":"playground.editeur","attributs":[],"prerequis":[],"synonymes":["éditeur","code html","saisir le code"],"sources":["apps/playground/index.html"]},
  {"id":"playground.exemples","genre":"zone","libelle":"Parcourir les exemples","element":"aside","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/playground/index.html"]},
  {"id":"playground.exemples.exemple","genre":"controle","libelle":"Exemple","element":"select","zone":"playground.exemples","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/playground/index.html"]},
  {"id":"playground.exemples.fermer","genre":"controle","libelle":"Fermer le volet","element":"button","zone":"playground.exemples","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/playground/index.html"]},
  {"id":"playground.exemples.pipeline","genre":"controle","libelle":"Pipeline","element":"select","zone":"playground.exemples","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/playground/index.html"]},
  {"id":"playground.exemples.reinitialiser","genre":"controle","libelle":"Réinitialiser","element":"button","zone":"playground.exemples","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/playground/index.html"]},
  {"id":"playground.exemples.sortie","genre":"controle","libelle":"Sortie","element":"select","zone":"playground.exemples","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/playground/index.html"]},
  {"id":"playground.exemples.source","genre":"controle","libelle":"Source","element":"select","zone":"playground.exemples","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/playground/index.html"]},
  {"id":"playground.exemples.voir","genre":"controle","libelle":"Voir l'exemple","element":"button","zone":"playground.exemples","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/playground/index.html"]},
] as const satisfies readonly Repere[];

/** Identifiant de repere de l'app : enumeration fermee (outil montrer(), #1003). */
export type RepereId = (typeof REPERES)[number]['id'];

export const REGISTRE: RegistreReperes = {
  app: "playground",
  prefixe: "playground",
  reperes: REPERES,
};
