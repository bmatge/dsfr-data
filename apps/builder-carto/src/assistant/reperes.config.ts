/**
 * Repères de l'interface carto (#997, #1002, epic #992, ADR-143).
 *
 * Lu par `npm run build:reperes` / `check:reperes`, qui génèrent
 * `reperes.generated.ts` à côté. Contrat : `ReperesConfig` dans
 * `packages/shared/src/ui/reperes-types.ts`.
 *
 * Zones de réglage : les panneaux et l'onglet Code de `index.html`, puis les
 * sous-zones rendues par les gabarits de `main.ts` (un gabarit rendu par
 * `innerHTML` n'a pas d'ancêtre lexical : c'est sa propre sous-zone qui le
 * soumet à la règle « tout contrôle porte un repère »). Les contrôles rendus
 * hors de toute sous-zone (lignes de couche, section Données, panneau Carte,
 * `popupFieldsHtml`…) échappent à cette règle lexicale : c'est
 * `tests/apps/builder-carto/reperes-completude.test.ts`, qui REND les panneaux,
 * qui les couvre.
 *
 * Hors zones : l'écran d'accueil « D'où viennent vos données ? »
 * (`renderOnboard`), qui n'est pas un réglage.
 */
import type { ReperesConfig } from '@dsfr-data/shared';

const config: ReperesConfig = {
  app: 'builder-carto',
  prefixe: 'carto',
  sources: ['index.html', 'src/main.ts'],
  zonesDeReglage: [
    'carto.actions',
    'carto.carte',
    'carto.carte.encarts',
    'carto.carte.avancees',
    'carto.couches',
    'carto.couches.liste',
    'carto.couches.composition',
    'carto.elements',
    'carto.elements.representation',
    'carto.elements.couleur',
    'carto.elements.clic',
    'carto.elements.temps',
    'carto.elements.avancees',
    'carto.code',
  ],
  exceptions: [
    {
      cible: 'button.carto-panel__header-arrow',
      raison:
        'Flèche de repli du panneau Couches : doublon du bouton de titre (carto.couches.plier), même action.',
    },
  ],
  helpers: [{ fonction: 'fieldInput', parametre: 'repere' }],
  prerequis: 'src/assistant/prerequis.ts',
  constats: ['packages/shared/src/debug/constats-carto.ts'],
  // Relevés par #1012 et la recette de #1016 : une phrase courante qui ne
  // trouvait rien, ou menait ailleurs (« mode sombre » → mode de l'animation).
  synonymes: {
    'carto.elements.clic.popup-mode': ['fiche', 'popup', 'infobulle', 'panneau latéral', 'au clic'],
    'carto.elements.clic.popup-fields': ['champs de la fiche', 'contenu de la fiche'],
    'carto.elements.cluster': ['regrouper les points', 'clustering', 'grappes de points'],
    'carto.elements.remplissage-champ': ['colorer les zones', 'colorer selon une valeur'],
    'carto.carte.fond': ['mode sombre', 'fond sombre', 'fond clair'],
    'carto.carte.drom': ['outre-mer', 'drom en vignettes'],
    'carto.couches.composition.composer': [
      'trop de points',
      'rendu tronqué',
      'agréger par département',
      'agréger par région',
      'choroplèthe par département',
    ],
  },
};

export default config;
