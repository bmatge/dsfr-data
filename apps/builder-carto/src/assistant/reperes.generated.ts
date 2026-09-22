/* eslint-disable */
/**
 * FICHIER GENERE — NE PAS EDITER A LA MAIN.
 *
 * Registre des reperes de l'app builder-carto (#997, ADR-143).
 * Source : les attributs data-repere / data-zone / data-attribut / data-prerequis
 * du balisage (index.html, src/main.ts), enrichis par
 * packages/core/custom-elements.json et apps/builder-carto/src/assistant/reperes.config.ts.
 * Regenerer : npm run build:reperes. Controle bloquant : npm run check:reperes.
 */
import type { Repere, RegistreReperes } from '@dsfr-data/shared';

export const REPERES = [
  {"id":"carto.couches","genre":"zone","libelle":"Couches de données","element":"section","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/builder-carto/index.html"]},
  {"id":"carto.elements","genre":"zone","libelle":"Éléments de la couche","element":"section","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/builder-carto/index.html"]},
  {"id":"carto.elements.clic","genre":"zone","libelle":"Au clic sur un élément","element":"div","zone":"carto.elements","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/builder-carto/src/main.ts"]},
  {"id":"carto.elements.clic.popup-mode","genre":"controle","libelle":"Comportement au clic","element":"select","zone":"carto.elements.clic","attributs":[{"tag":"dsfr-data-map-popup","nom":"mode","description":"Mode d'affichage : `popup` (bulle sur la carte), `modal`, `panel-right`, `panel-left`."}],"prerequis":["couche-active"],"synonymes":["fiche","popup","infobulle","panneau latéral","au clic"],"sources":["apps/builder-carto/src/main.ts"]},
  {"id":"carto.elements.clic.popup-template","genre":"controle","libelle":"Template","element":"textarea","zone":"carto.elements.clic","attributs":[{"tag":"dsfr-data-map-layer","nom":"popup-template","description":"Template du contenu de la popup, avec substitution de champs. Ex: `\"{nom} — {val} kW\"`."}],"prerequis":[],"synonymes":[],"sources":["apps/builder-carto/src/main.ts"]},
  {"id":"carto.elements.clic.popup-width","genre":"controle","libelle":"Largeur du panneau","element":"input","zone":"carto.elements.clic","attributs":[{"tag":"dsfr-data-map-popup","nom":"width","description":"Largeur du panneau lateral (modes `panel-*`). Bornée à la largeur de la carte : sur un écran étroit le panneau l'occupe entièrement au lieu de déborder."}],"prerequis":[],"synonymes":[],"sources":["apps/builder-carto/src/main.ts"]},
  {"id":"carto.elements.clic.title-field","genre":"controle","libelle":"Champ titre","element":"input","zone":"carto.elements.clic","attributs":[{"tag":"dsfr-data-map-popup","nom":"title-field","description":"Champ utilise comme titre du panneau ou de la modale."}],"prerequis":[],"synonymes":[],"sources":["apps/builder-carto/src/main.ts"]},
  {"id":"carto.elements.clic.tooltip-field","genre":"controle","libelle":"Champ affiché en infobulle","element":"input","zone":"carto.elements.clic","attributs":[{"tag":"dsfr-data-map-layer","nom":"tooltip-field","description":"Champ affiché au survol de l'élément."}],"prerequis":[],"synonymes":[],"sources":["apps/builder-carto/src/main.ts"]},
] as const satisfies readonly Repere[];

/** Identifiant de repere de l'app : enumeration fermee (outil montrer(), #1003). */
export type RepereId = (typeof REPERES)[number]['id'];

export const REGISTRE: RegistreReperes = {
  app: "builder-carto",
  prefixe: "carto",
  reperes: REPERES,
};
