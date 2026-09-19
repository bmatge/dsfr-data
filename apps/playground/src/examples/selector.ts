/**
 * Les trois selects croises du playground (source x pipeline x sortie).
 *
 * Ils FILTRENT le catalogue, ils ne generent rien. Une valeur d'axe qui ne
 * mene a aucun exemple compte tenu des deux autres filtres est DESACTIVEE
 * plutot que laissee cliquable : l'utilisateur ne peut pas tomber sur une
 * liste vide, et ce qui est desactive dit du meme coup ce que le catalogue
 * ne couvre pas encore.
 */

import {
  catalogue,
  filtrer,
  LIBELLES_PIPELINE,
  LIBELLES_SORTIE,
  LIBELLES_SOURCE,
  type AxePipeline,
  type AxeSortie,
  type AxeSource,
  type ExempleMeta,
} from './catalogue.js';

const TOUTES = '';

interface Elements {
  source: HTMLSelectElement;
  pipeline: HTMLSelectElement;
  output: HTMLSelectElement;
  exemple: HTMLSelectElement;
  compteur: HTMLElement | null;
}

export interface SelecteurExemples {
  /** Id de l'exemple courant. */
  courant(): string;
  /**
   * Pointe le selecteur sur un exemple, en relachant les filtres qui le
   * masqueraient (cas d'un `?example=` en URL).
   */
  pointerSur(id: string): void;
}

function valeurOuNull<T extends string>(select: HTMLSelectElement): T | null {
  return select.value === TOUTES ? null : (select.value as T);
}

function remplirAxe(
  select: HTMLSelectElement,
  libelles: ReadonlyArray<[string, string]>,
  libelleToutes: string
): void {
  select.innerHTML = '';
  const toutes = document.createElement('option');
  toutes.value = TOUTES;
  toutes.textContent = libelleToutes;
  select.append(toutes);
  for (const [valeur, libelle] of libelles) {
    const option = document.createElement('option');
    option.value = valeur;
    option.textContent = libelle;
    select.append(option);
  }
}

export function initSelecteurExemples(onSelect: (id: string) => void): SelecteurExemples | null {
  const els: Partial<Elements> = {
    source: document.getElementById('filtre-source') as HTMLSelectElement,
    pipeline: document.getElementById('filtre-pipeline') as HTMLSelectElement,
    output: document.getElementById('filtre-sortie') as HTMLSelectElement,
    exemple: document.getElementById('example-select') as HTMLSelectElement,
    compteur: document.getElementById('compteur-exemples'),
  };
  if (!els.source || !els.pipeline || !els.output || !els.exemple) return null;
  const e = els as Elements;

  remplirAxe(e.source, LIBELLES_SOURCE, 'Toutes les sources');
  remplirAxe(e.pipeline, LIBELLES_PIPELINE, 'Tous les pipelines');
  remplirAxe(e.output, LIBELLES_SORTIE, 'Toutes les sorties');

  /**
   * Desactive les valeurs d'un axe qui ne mènent nulle part, les deux autres
   * filtres restant tels quels.
   */
  function majDisponibilites(): void {
    const s = valeurOuNull<AxeSource>(e.source);
    const p = valeurOuNull<AxePipeline>(e.pipeline);
    const o = valeurOuNull<AxeSortie>(e.output);

    const marquer = (select: HTMLSelectElement, compte: (valeur: string) => number): void => {
      for (const option of Array.from(select.options)) {
        if (option.value === TOUTES) continue;
        option.disabled = compte(option.value) === 0;
      }
    };

    marquer(e.source, (v) => filtrer(v as AxeSource, p, o).length);
    marquer(e.pipeline, (v) => filtrer(s, v as AxePipeline, o).length);
    marquer(e.output, (v) => filtrer(s, p, v as AxeSortie).length);
  }

  /** Repeuple le select des exemples ; renvoie l'id finalement selectionne. */
  function majListe(idSouhaite?: string): string | null {
    const retenus: ExempleMeta[] = filtrer(
      valeurOuNull<AxeSource>(e.source),
      valeurOuNull<AxePipeline>(e.pipeline),
      valeurOuNull<AxeSortie>(e.output)
    );

    const precedent = idSouhaite ?? e.exemple.value;
    e.exemple.innerHTML = '';
    for (const meta of retenus) {
      const option = document.createElement('option');
      option.value = meta.id;
      option.textContent = meta.title;
      e.exemple.append(option);
    }

    if (e.compteur) {
      e.compteur.textContent =
        retenus.length === catalogue.length
          ? `${catalogue.length} exemples`
          : `${retenus.length} sur ${catalogue.length} exemples`;
    }

    if (!retenus.length) return null;
    const garde = retenus.some((m) => m.id === precedent) ? precedent : retenus[0].id;
    e.exemple.value = garde;
    return garde;
  }

  function surChangementFiltre(): void {
    majDisponibilites();
    const precedent = e.exemple.value;
    const id = majListe();
    if (id && id !== precedent) onSelect(id);
  }

  for (const select of [e.source, e.pipeline, e.output]) {
    select.addEventListener('change', surChangementFiltre);
  }
  e.exemple.addEventListener('change', () => onSelect(e.exemple.value));

  majDisponibilites();
  majListe();

  return {
    courant: () => e.exemple.value,
    pointerSur(id: string): void {
      if (!catalogue.some((m) => m.id === id)) return;
      // Les filtres courants masqueraient peut-etre cet exemple : on les
      // relache plutot que d'ignorer la demande.
      if (
        !filtrer(
          valeurOuNull<AxeSource>(e.source),
          valeurOuNull<AxePipeline>(e.pipeline),
          valeurOuNull<AxeSortie>(e.output)
        ).some((m) => m.id === id)
      ) {
        e.source.value = TOUTES;
        e.pipeline.value = TOUTES;
        e.output.value = TOUTES;
        majDisponibilites();
      }
      majListe(id);
    },
  };
}
