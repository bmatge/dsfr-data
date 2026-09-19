/**
 * Les trois selects croises du playground (source x pipeline x sortie).
 *
 * Ils FILTRENT le catalogue, ils ne generent rien. Une valeur d'axe qui ne
 * mene a aucun exemple compte tenu des deux autres filtres est DESACTIVEE
 * plutot que laissee cliquable : l'utilisateur ne peut pas tomber sur une
 * liste vide, et ce qui est desactive dit du meme coup ce que le catalogue
 * ne couvre pas encore.
 *
 * AUCUN select ne charge quoi que ce soit. Choisir un axe ne fait que
 * restreindre la liste ; seul le bouton « Voir l'exemple » charge le code.
 * C'est ce qui evite qu'en posant trois criteres on declenche deux
 * chargements intermediaires, chacun avec sa demande de confirmation — et
 * c'est aussi ce qui empeche le selecteur d'afficher un exemple pendant que
 * l'editeur en contient un autre.
 *
 * Le tout vit dans un VOLET LATERAL ancre sur la colonne de code, ouvert par
 * une bascule unique dans la barre d'actions. Ferme, le volet porte `inert` :
 * ses quatre selects et ses deux boutons sortent alors de l'ordre de
 * tabulation et de l'arbre accessible, au lieu d'etre seulement hors ecran.
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
  voir: HTMLButtonElement;
  volet: HTMLElement;
  bascule: HTMLButtonElement;
  fermer: HTMLButtonElement;
  compteur: HTMLElement | null;
  compteurVolet: HTMLElement | null;
}

export interface SelecteurExemples {
  /** Id de l'exemple actuellement SELECTIONNE (pas forcement celui charge). */
  courant(): string;
  /** Signale quel exemple est charge dans l'editeur, pour l'etat du bouton. */
  marquerCharge(id: string): void;
  /** Ouvre ou ferme le volet (true = ouvrir, sans argument = bascule). */
  basculer(ouvrir?: boolean): void;
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
    voir: document.getElementById('voir-exemple-btn') as HTMLButtonElement,
    volet: document.getElementById('volet-exemples') as HTMLElement,
    bascule: document.getElementById('volet-btn') as HTMLButtonElement,
    fermer: document.getElementById('volet-fermer') as HTMLButtonElement,
    compteur: document.getElementById('compteur-exemples'),
    compteurVolet: document.getElementById('compteur-volet'),
  };
  if (
    !els.source ||
    !els.pipeline ||
    !els.output ||
    !els.exemple ||
    !els.voir ||
    !els.volet ||
    !els.bascule ||
    !els.fermer
  )
    return null;
  const e = els as Elements;

  /** Exemple effectivement present dans l'editeur. */
  let idCharge = '';

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

    const filtre = retenus.length !== catalogue.length;
    if (e.compteur)
      e.compteur.textContent = filtre
        ? `${retenus.length}/${catalogue.length}`
        : `${catalogue.length}`;
    if (e.compteurVolet) {
      e.compteurVolet.textContent = filtre
        ? `${retenus.length} sur ${catalogue.length}`
        : `${catalogue.length} exemples`;
    }

    if (!retenus.length) return null;
    const garde = retenus.some((m) => m.id === precedent) ? precedent : retenus[0].id;
    e.exemple.value = garde;
    return garde;
  }

  /**
   * Le bouton passe en appel a l'action quand la selection s'ecarte de ce qui
   * est charge, et redevient discret une fois les deux alignes : il dit donc
   * s'il reste quelque chose a faire.
   */
  function majBouton(): void {
    const aJour = e.exemple.value === idCharge;
    e.voir.classList.toggle('fr-btn--secondary', aJour);
    e.voir.setAttribute(
      'title',
      aJour ? "Recharger l'exemple selectionne" : "Charger l'exemple selectionne dans l'editeur"
    );
  }

  function surChangementFiltre(): void {
    majDisponibilites();
    majListe();
    majBouton();
  }

  let ouvert = false;

  function basculer(vers?: boolean): void {
    ouvert = vers ?? !ouvert;
    e.volet.classList.toggle('pg-volet--ouvert', ouvert);
    e.bascule.setAttribute('aria-expanded', String(ouvert));
    // `inert` sort tout le volet du focus et de l'arbre accessible quand il
    // est ferme : un volet hors ecran mais tabulable est un piege au clavier.
    if (ouvert) e.volet.removeAttribute('inert');
    else e.volet.setAttribute('inert', '');
    // Le focus suit l'ouverture, et revient a la bascule a la fermeture.
    if (ouvert) e.source.focus();
    else if (e.volet.contains(document.activeElement)) e.bascule.focus();
  }

  for (const select of [e.source, e.pipeline, e.output]) {
    select.addEventListener('change', surChangementFiltre);
  }
  e.exemple.addEventListener('change', majBouton);
  e.voir.addEventListener('click', () => onSelect(e.exemple.value));
  e.bascule.addEventListener('click', () => basculer());
  e.fermer.addEventListener('click', () => basculer(false));
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && ouvert) basculer(false);
  });

  majDisponibilites();
  majListe();
  majBouton();

  return {
    courant: () => e.exemple.value,
    marquerCharge(id: string): void {
      idCharge = id;
      majBouton();
    },
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
      majBouton();
    },
    basculer,
  };
}
