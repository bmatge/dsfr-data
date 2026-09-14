/**
 * Les tableaux de bord EXPORTÉS du lot (#765, #810).
 *
 * SEUL fichier de la vérification des données autorisé à importer la
 * bibliothèque, et pour une raison précise : ce qu'il contrôle n'est pas un
 * balisage qu'on écrit, c'est celui que `generateDashboardHTML` PRODUIT — les
 * sources dédiées, l'agrégat serveur d'un KPI, les cibles d'un bloc de
 * filtres. Recopier ce balisage à la main reviendrait à contrôler la copie.
 * La dérogation est inscrite dans `tests/oracle/guard.test.ts`, nommément, et
 * ne couvre que `packages/shared/src/dashboard/`.
 *
 * Rien du CALCUL ne passe par là : l'oracle recalcule toujours depuis les
 * lignes brutes, en tableaux nus, sans rien emprunter à la lib.
 */
import { generateDashboardHTML } from '../../packages/shared/src/dashboard/export-html.js';
import type {
  DashboardData,
  DashboardSource,
  Widget,
} from '../../packages/shared/src/dashboard/model.js';
import type { ChartConfig } from '../../packages/shared/src/dashboard/chart-config.js';

import { DATASET, HOTE_ODS, HOTE_TABULAR, RESSOURCE_TABULAR } from './fixtures.js';

/** Id de la source partagée des documents du lot. */
export const ID_SOURCE = 'src-verif';

/** La source telle que le Studio l'enregistre, pour l'une ou l'autre API. */
export function sourceDu(api: 'ods' | 'tabular'): DashboardSource {
  if (api === 'ods') {
    return {
      id: ID_SOURCE,
      name: 'Jeu de vérif (ODS)',
      provider: 'opendatasoft',
      apiUrl: `${HOTE_ODS}/api/explore/v2.1/catalog/datasets/${DATASET}/records`,
      resourceIds: { datasetId: DATASET },
    };
  }
  return {
    id: ID_SOURCE,
    name: 'Jeu de vérif (Tabular)',
    provider: 'tabular',
    apiUrl: `${HOTE_TABULAR}/api/resources/${RESSOURCE_TABULAR}/data/`,
    resourceIds: { resourceId: RESSOURCE_TABULAR },
  };
}

/** Un widget `chart` de l'assistant (`fromBuilder`), tel que le Studio l'enregistre. */
export function widget(id: string, chart: ChartConfig, rang: number): Widget {
  return {
    id,
    title: chart.title ?? id,
    position: { row: rang, col: 0 },
    type: 'chart',
    config: { fromBuilder: true, chart, sourceId: ID_SOURCE },
  };
}

/** Le document complet, à une source et N widgets. */
export function document_(nom: string, api: 'ods' | 'tabular', widgets: Widget[]): DashboardData {
  return {
    id: 'verif-l1',
    name: nom,
    description: '',
    createdAt: null,
    updatedAt: null,
    layout: { columns: 1, gap: 'fr-grid-row--gutters' },
    sources: [sourceDu(api)],
    widgets,
  };
}

/**
 * Donne un `id` aux composants d'affichage de la page exportée, pour que les
 * lecteurs d'observation puissent les désigner.
 *
 * L'export ne met d'`id` que sur les sources et les queries : un
 * `<dsfr-data-kpi>` ou un `<dsfr-data-chart>` n'en porte pas, il se reconnaît
 * à la source qu'il lit. Le script tourne AVANT le chargement de la
 * bibliothèque (son module est différé) : les composants ne sont pas encore
 * rehaussés, et poser un attribut `id` ne change rien à ce qu'ils calculent —
 * on nomme ce qu'on observe, on ne touche pas à ce qu'on mesure.
 */
export function nommer(paires: Array<[selecteur: string, id: string]>): string {
  const table = JSON.stringify(paires);
  return `
  <script>
    for (const [selecteur, id] of ${table}) {
      const el = document.querySelector(selecteur);
      if (el) el.id = id;
      else console.warn('verif : aucun element pour ' + selecteur);
    }
  </script>`;
}

/**
 * Remplit un contrôle d'UI d'un bloc de filtres AVANT le montage.
 *
 * Le script est un `<script>` classique posé après le corps exporté : il
 * s'exécute pendant l'analyse du document, donc avant le module différé qui
 * définit les composants. Quand `dsfr-data-context-filter` se monte, il trouve
 * son contrôle déjà rempli et applique son filtre immédiatement — le PREMIER
 * chiffre affiché est donc le chiffre filtré. Un clic simulé après coup
 * laisserait une fenêtre où la page montre le total non filtré, et un contrôle
 * qui observe la page dans cette fenêtre-là mesurerait le mauvais chiffre.
 */
export function preremplir(idControle: string, valeur: string): string {
  return `
  <script>
    const controle = document.getElementById(${JSON.stringify(idControle)});
    if (controle) controle.value = ${JSON.stringify(valeur)};
    else console.warn('verif : controle de filtre introuvable');
  </script>`;
}

/**
 * Le CORPS de la page exportée, prêt à être rendu par le harnais de
 * vérification.
 *
 * Pourquoi le corps et non la page entière : l'en-tête d'un export appelle le
 * DSFR, DSFR Chart et la bibliothèque sur des CDN, et le faux réseau du mode
 * déterministe refuse — à raison — tout hôte qu'il ne sert pas. La page de
 * fixture charge la bibliothèque depuis la SOURCE du dépôt et DSFR Chart depuis
 * `node_modules` : ce sont les mêmes composants, servis hors ligne. Ce que le
 * contrôle éprouve, ce sont les balises `dsfr-data-*` que l'export a écrites —
 * et elles sont dans le corps, intactes.
 */
export function corpsExporte(dashboard: DashboardData): string {
  const page = generateDashboardHTML(dashboard);
  const debut = page.indexOf('<body>');
  const fin = page.lastIndexOf('</body>');
  if (debut === -1 || fin === -1)
    throw new Error('export sans corps : generateDashboardHTML a changé de forme');
  const corps = page.slice(debut + '<body>'.length, fin);
  // Le module DSFR de fin de corps est purement cosmetique et vient d'un CDN :
  // le garder ferait compter une fuite reseau sans rien apporter au controle.
  return corps.replace(/<script[^>]+src="https?:[^"]*"[^>]*><\/script>/g, '');
}
