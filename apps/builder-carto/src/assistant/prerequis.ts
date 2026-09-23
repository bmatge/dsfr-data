/**
 * Prérequis de l'interface carto (#997, #1002, ADR-143 §5) : règles nommées,
 * citées par `data-prerequis` dans le balisage. Un prérequis manquant n'est
 * jamais un refus : l'assistant montre d'abord le repère qui le lève.
 *
 * `check:reperes` lit ce fichier STATIQUEMENT (sans l'importer) : les clés de
 * `PREREQUIS` et leur `repereQuiLeve` doivent rester des littéraux. Tout
 * prérequis cité sans règle ici, ou dont le repère qui le lève est absent du
 * registre, fait échouer la CI.
 *
 * Toutes les règles portent sur la couche ACTIVE (celle que règle le panneau
 * Éléments) ; sans couche active, aucune n'est remplie.
 */
import type { PrerequisParId } from '@dsfr-data/shared';
import type { CartoState, LayerConfig } from '../state.js';

function coucheActive(etat: CartoState): LayerConfig | undefined {
  return etat.layers.find((l) => l.id === etat.activeLayerId);
}

export const PREREQUIS = {
  'couche-active': {
    message: "Avant de régler l'affichage des éléments, sélectionnez une couche.",
    repereQuiLeve: 'carto.couches.liste',
    verifier: (etat) => coucheActive(etat) !== undefined,
  },
  'couche-source': {
    message: "Cette couche n'a pas encore de données : choisissez-les d'abord.",
    repereQuiLeve: 'carto.couches.source',
    verifier: (etat) => Boolean(coucheActive(etat)?.source),
  },
  'couche-interactive': {
    message: "Cette couche est décorative : désactivez l'option dans Options avancées.",
    repereQuiLeve: 'carto.elements.avancees.no-interactive',
    verifier: (etat) => {
      const couche = coucheActive(etat);
      return couche !== undefined && !couche.noInteractive;
    },
  },
  'zones-avec-geometrie': {
    message:
      'Les zones se dessinent à partir de contours : indiquez le champ géographique de la couche.',
    repereQuiLeve: 'carto.couches.geo-field',
    verifier: (etat) => (coucheActive(etat)?.geoField ?? '').trim() !== '',
  },
  /**
   * L'encart « Composer par échelle » (#1021) n'existe que sur une couche de
   * données, ni agrégée ni déjà composée, dont un champ de code département
   * ou région a été détecté. Le constat « jeu tronqué » vise une couche
   * précise : si ce n'est pas la couche active, c'est elle qu'il faut choisir.
   * Le dépassement du plafond, lui, n'est pas dans l'état (total rapporté
   * par l'aperçu) : le constat qui cite ce repère l'a déjà établi.
   */
  'composition-proposee': {
    message:
      'La composition par échelle se propose sur une couche de points dont les données portent un code département ou région : sélectionnez cette couche.',
    repereQuiLeve: 'carto.couches.liste',
    verifier: (etat) => {
      const couche = coucheActive(etat);
      return (
        couche !== undefined &&
        Boolean(couche.source) &&
        !couche.agregat &&
        couche.territoire !== null &&
        !etat.layers.some((l) => l.agregat?.depuis === couche.id)
      );
    },
  },
  'popup-champs': {
    message: 'Choisissez les champs à afficher dans la fiche.',
    repereQuiLeve: 'carto.elements.clic.popup-fields',
    verifier: (etat) => (coucheActive(etat)?.popupFields ?? '').trim() !== '',
  },
} satisfies PrerequisParId<CartoState>;
