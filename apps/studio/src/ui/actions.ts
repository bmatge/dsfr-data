/**
 * Studio IA - Actions sur l'artefact, reprises de l'ancien Assistant IA
 * (#1081) : ajouter aux favoris, ouvrir dans le Playground, exporter l'aperçu
 * en image. Toutes partent du code que l'usager copierait (`currentExportHtml`),
 * jamais d'une sonde de diagnostic.
 */

import {
  exportPreviewImage,
  ImageExportError,
  IMAGE_EXPORT_MESSAGES,
  loadFromStorage,
  navigateTo,
  promptDialog,
  saveToStorage,
  STORAGE_KEYS,
  toastError,
  toastSuccess,
  toastWarning,
} from '@dsfr-data/shared';
import { state } from '../state.js';
import { currentExportHtml } from './preview.js';

/** Favori tel que l'app Favoris le lit (`sourceApp`, colonne serveur `source_app`). */
export interface FavoriStudio {
  id: string;
  name: string;
  code: string;
  chartType: string;
  sourceApp: 'studio';
  createdAt: string;
}

/** Clé de passation du code vers le Playground (convention des apps, §passations). */
export const CLE_CODE_PLAYGROUND = 'playground-code';

const DOCUMENT_VIDE = "Le document est vide : composez d'abord un tableau de bord.";

/**
 * Type retenu pour la vignette des Favoris : le type du bloc unique quand le
 * document n'en compte qu'un, sinon « dashboard ».
 */
export function typeDeFavori(): string {
  const widgets = state.document.widgets;
  if (widgets.length === 1) {
    const w = widgets[0];
    if (w.type === 'chart' && 'chart' in w.config) {
      const chart = (w.config as { chart?: { type?: string } }).chart;
      if (chart?.type) return chart.type;
    }
    return w.type;
  }
  return 'dashboard';
}

/** Ajoute le code de la page aux favoris, sous un nom choisi. Rend le favori, ou null. */
export async function ajouterAuxFavoris(
  demanderNom: (defaut: string) => Promise<string | null> = (defaut) =>
    promptDialog('Nom du favori :', defaut, { label: 'Nom' })
): Promise<FavoriStudio | null> {
  const code = currentExportHtml();
  if (!code) {
    toastWarning(DOCUMENT_VIDE);
    return null;
  }
  const nom = (await demanderNom(state.document.name || 'Mon tableau de bord'))?.trim();
  if (!nom) return null;
  const favori: FavoriStudio = {
    id: crypto.randomUUID(),
    name: nom,
    code,
    chartType: typeDeFavori(),
    sourceApp: 'studio',
    createdAt: new Date().toISOString(),
  };
  const favoris = loadFromStorage<unknown[]>(STORAGE_KEYS.FAVORITES, []);
  favoris.unshift(favori);
  saveToStorage(STORAGE_KEYS.FAVORITES, favoris);
  toastSuccess(`« ${nom} » ajouté aux favoris.`);
  return favori;
}

/** Confie le code au Playground et y navigue (retour possible vers le Studio). */
export function ouvrirDansPlayground(naviguer: typeof navigateTo = navigateTo): boolean {
  const code = currentExportHtml();
  if (!code) {
    toastWarning(DOCUMENT_VIDE);
    return false;
  }
  try {
    sessionStorage.setItem(CLE_CODE_PLAYGROUND, code);
  } catch {
    toastError('Impossible de transmettre le code au Playground (stockage indisponible).');
    return false;
  }
  naviguer('playground', { from: 'studio' });
  return true;
}

/** Exporte l'aperçu (l'iframe, comme le Builder et l'ancien Assistant) en image. */
export async function exporterImage(format: 'png' | 'jpg'): Promise<void> {
  try {
    if (state.document.widgets.length === 0) throw new ImageExportError('empty');
    const frame = document.getElementById('preview-frame') as HTMLIFrameElement | null;
    if (!frame) throw new ImageExportError('iframe-inaccessible');
    await exportPreviewImage(frame, format, state.document.name || 'tableau-de-bord');
  } catch (err) {
    if (err instanceof ImageExportError) toastError(IMAGE_EXPORT_MESSAGES[err.reason]);
    else throw err;
  }
}
