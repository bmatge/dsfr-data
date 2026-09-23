/* eslint-disable */
/**
 * FICHIER GENERE — NE PAS EDITER A LA MAIN.
 *
 * Registre des reperes de l'app dashboard (#997, ADR-143).
 * Source : les attributs data-repere / data-zone / data-attribut / data-prerequis
 * du balisage (index.html, src/widget-config.ts, src/grid.ts), enrichis par
 * packages/core/custom-elements.json et apps/dashboard/src/assistant/reperes.config.ts.
 * Regenerer : npm run build:reperes. Controle bloquant : npm run check:reperes.
 */
import type { Repere, RegistreReperes } from '@dsfr-data/shared';

export const REPERES = [
  {"id":"dashboard.actions","genre":"zone","libelle":"Barre d'actions","element":"app-action-bar","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.actions.assistant","genre":"controle","libelle":"Assistant","element":"button","zone":"dashboard.actions","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.actions.diagnostic","genre":"controle","libelle":"Diagnostic","element":"button","zone":"dashboard.actions","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.actions.enregistrer","genre":"controle","libelle":"Enregistrer","element":"button","zone":"dashboard.actions","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.actions.exporter","genre":"controle","libelle":"Exporter la page HTML","element":"button","zone":"dashboard.actions","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.actions.nouveau","genre":"controle","libelle":"Nouveau","element":"button","zone":"dashboard.actions","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.actions.ouvrir","genre":"controle","libelle":"Ouvrir","element":"button","zone":"dashboard.actions","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.actions.plein-ecran","genre":"controle","libelle":"Plein écran","element":"button","zone":"dashboard.actions","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.actions.visite","genre":"controle","libelle":"Visite guidée","element":"button","zone":"dashboard.actions","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.bibliotheque","genre":"zone","libelle":"Bibliothèque de widgets","element":"div","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.bibliotheque.graphique","genre":"controle","libelle":"Widget graphique","element":"div","zone":"dashboard.bibliotheque","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.bibliotheque.kpi","genre":"controle","libelle":"Widget KPI","element":"div","zone":"dashboard.bibliotheque","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.bibliotheque.tableau","genre":"controle","libelle":"Widget tableau","element":"div","zone":"dashboard.bibliotheque","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.bibliotheque.texte","genre":"controle","libelle":"Widget texte","element":"div","zone":"dashboard.bibliotheque","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.canevas","genre":"zone","libelle":"Tableau de bord","element":"main","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.canevas.ajouter-ligne","genre":"controle","libelle":"Ajouter une ligne","element":"button","zone":"dashboard.canevas","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.canevas.grille","genre":"zone","libelle":"Grille du tableau de bord","element":"div","zone":"dashboard.canevas","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.canevas.grille.ajouter-cellule","genre":"controle","libelle":"Ajouter une cellule","element":"button","zone":"dashboard.canevas.grille","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/src/grid.ts"]},
  {"id":"dashboard.canevas.grille.retirer-cellule","genre":"controle","libelle":"Retirer une cellule","element":"button","zone":"dashboard.canevas.grille","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/src/grid.ts"]},
  {"id":"dashboard.canevas.grille.supprimer-ligne","genre":"controle","libelle":"Supprimer la ligne","element":"button","zone":"dashboard.canevas.grille","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/src/grid.ts"]},
  {"id":"dashboard.canevas.modeles","genre":"controle","libelle":"Modèles de tableau de bord","element":"select","zone":"dashboard.canevas","attributs":[],"prerequis":[],"synonymes":["template","gabarit","modèle"],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.canevas.onglet-apercu","genre":"controle","libelle":"Aperçu","element":"button","zone":"dashboard.canevas","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.canevas.onglet-code","genre":"controle","libelle":"Code","element":"button","zone":"dashboard.canevas","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.canevas.onglet-json","genre":"controle","libelle":"JSON","element":"button","zone":"dashboard.canevas","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.canevas.titre","genre":"controle","libelle":"Titre du tableau de bord","element":"input","zone":"dashboard.canevas","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.enregistrement","genre":"zone","libelle":"Enregistrer le tableau de bord","element":"div","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.enregistrement.annuler","genre":"controle","libelle":"Annuler","element":"button","zone":"dashboard.enregistrement","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.enregistrement.confirmer","genre":"controle","libelle":"Enregistrer","element":"button","zone":"dashboard.enregistrement","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.enregistrement.description","genre":"controle","libelle":"Description (optionnelle)","element":"textarea","zone":"dashboard.enregistrement","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.enregistrement.fermer","genre":"controle","libelle":"Fermer","element":"button","zone":"dashboard.enregistrement","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.enregistrement.nom","genre":"controle","libelle":"Nom","element":"input","zone":"dashboard.enregistrement","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.grille","genre":"zone","libelle":"Grille","element":"div","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.grille.colonnes","genre":"controle","libelle":"Colonnes par défaut","element":"select","zone":"dashboard.grille","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.grille.espacement","genre":"controle","libelle":"Espacement","element":"select","zone":"dashboard.grille","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.sources","genre":"zone","libelle":"Sources","element":"div","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.sources.ajouter","genre":"controle","libelle":"Ajouter une source","element":"button","zone":"dashboard.sources","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.widget","genre":"zone","libelle":"Configurer le widget","element":"div","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.widget.annuler","genre":"controle","libelle":"Annuler","element":"button","zone":"dashboard.widget","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.widget.appliquer","genre":"controle","libelle":"Appliquer","element":"button","zone":"dashboard.widget","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.widget.fermer","genre":"controle","libelle":"Fermer","element":"button","zone":"dashboard.widget","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/index.html"]},
  {"id":"dashboard.widget.graphique","genre":"zone","libelle":"Réglages du graphique","element":"div","zone":"dashboard.widget","attributs":[],"prerequis":["widget-graphique"],"synonymes":[],"sources":["apps/dashboard/src/widget-config.ts"]},
  {"id":"dashboard.widget.graphique.champ-x","genre":"controle","libelle":"Champ pour les étiquettes (axe X)","element":"input","zone":"dashboard.widget.graphique","attributs":[{"tag":"dsfr-data-chart","nom":"label-field","description":"Chemin vers le champ label"}],"prerequis":["widget-graphique"],"synonymes":["axe x","abscisse","catégories","étiquettes"],"sources":["apps/dashboard/src/widget-config.ts"]},
  {"id":"dashboard.widget.graphique.champ-y","genre":"controle","libelle":"Champ pour les valeurs (axe Y)","element":"input","zone":"dashboard.widget.graphique","attributs":[{"tag":"dsfr-data-chart","nom":"value-field","description":"Chemin vers le champ valeur. Alias inline `champ:Libellé` (#668) : `value-field=\"Panier_moyen:Panier moyen\"` affiche « Panier moyen » dans la légende à la place du nom technique. Un `name` explicite prime sur l'alias. Un `:` littéral dans un chemin ou un libellé s'échappe en `%3A` (escapeColonValue)."}],"prerequis":["widget-graphique"],"synonymes":["axe y","ordonnée","valeur","mesure"],"sources":["apps/dashboard/src/widget-config.ts"]},
  {"id":"dashboard.widget.graphique.palette","genre":"controle","libelle":"Palette de couleurs","element":"select","zone":"dashboard.widget.graphique","attributs":[{"tag":"dsfr-data-chart","nom":"selected-palette","description":"Palette de couleurs"}],"prerequis":["widget-graphique"],"synonymes":["couleurs","palette"],"sources":["apps/dashboard/src/widget-config.ts"]},
  {"id":"dashboard.widget.graphique.type","genre":"controle","libelle":"Type de graphique","element":"select","zone":"dashboard.widget.graphique","attributs":[{"tag":"dsfr-data-chart","nom":"type","description":"Type de graphique DSFR"}],"prerequis":["widget-graphique"],"synonymes":[],"sources":["apps/dashboard/src/widget-config.ts"]},
  {"id":"dashboard.widget.kpi","genre":"zone","libelle":"Réglages du KPI","element":"div","zone":"dashboard.widget","attributs":[],"prerequis":["widget-kpi"],"synonymes":[],"sources":["apps/dashboard/src/widget-config.ts"]},
  {"id":"dashboard.widget.kpi.format","genre":"controle","libelle":"Format","element":"select","zone":"dashboard.widget.kpi","attributs":[{"tag":"dsfr-data-kpi","nom":"format","description":"Format d'affichage : nombre (défaut), pourcentage, euro, decimal, compact (14 785 684 → « 14,8 M »), date (chaîne ISO → « 09/09/2026 », #667). Les décimales passent par `decimals`, jamais par le format (`euro:3` est refusé et affiché comme erreur de configuration, #665)."}],"prerequis":["widget-kpi"],"synonymes":[],"sources":["apps/dashboard/src/widget-config.ts"]},
  {"id":"dashboard.widget.kpi.icone","genre":"controle","libelle":"Icône","element":"input","zone":"dashboard.widget.kpi","attributs":[{"tag":"dsfr-data-kpi","nom":"icone","description":""}],"prerequis":["widget-kpi"],"synonymes":[],"sources":["apps/dashboard/src/widget-config.ts"]},
  {"id":"dashboard.widget.kpi.libelle","genre":"controle","libelle":"Label","element":"input","zone":"dashboard.widget.kpi","attributs":[{"tag":"dsfr-data-kpi","nom":"label","description":"Libellé affiché sous le chiffre (et sous les `lines`)"}],"prerequis":["widget-kpi"],"synonymes":[],"sources":["apps/dashboard/src/widget-config.ts"]},
  {"id":"dashboard.widget.kpi.valeur","genre":"controle","libelle":"Valeur","element":"input","zone":"dashboard.widget.kpi","attributs":[{"tag":"dsfr-data-kpi","nom":"valeur","description":""}],"prerequis":["widget-kpi"],"synonymes":["indicateur","chiffre clé","calcul"],"sources":["apps/dashboard/src/widget-config.ts"]},
  {"id":"dashboard.widget.tableau","genre":"zone","libelle":"Réglages du tableau","element":"div","zone":"dashboard.widget","attributs":[],"prerequis":["widget-tableau"],"synonymes":[],"sources":["apps/dashboard/src/widget-config.ts"]},
  {"id":"dashboard.widget.tableau.colonnes","genre":"controle","libelle":"Colonnes","element":"input","zone":"dashboard.widget.tableau","attributs":[{"tag":"dsfr-data-list","nom":"colonnes","description":""}],"prerequis":["widget-tableau"],"synonymes":[],"sources":["apps/dashboard/src/widget-config.ts"]},
  {"id":"dashboard.widget.tableau.recherche","genre":"controle","libelle":"Recherche activée","element":"input","zone":"dashboard.widget.tableau","attributs":[{"tag":"dsfr-data-list","nom":"recherche","description":""}],"prerequis":["widget-tableau"],"synonymes":[],"sources":["apps/dashboard/src/widget-config.ts"]},
  {"id":"dashboard.widget.tableau.tri","genre":"controle","libelle":"Tri activé","element":"input","zone":"dashboard.widget.tableau","attributs":[{"tag":"dsfr-data-list","nom":"tri","description":""}],"prerequis":["widget-tableau"],"synonymes":[],"sources":["apps/dashboard/src/widget-config.ts"]},
  {"id":"dashboard.widget.texte","genre":"zone","libelle":"Réglages du texte","element":"div","zone":"dashboard.widget","attributs":[],"prerequis":["widget-texte"],"synonymes":[],"sources":["apps/dashboard/src/widget-config.ts"]},
  {"id":"dashboard.widget.texte.contenu","genre":"controle","libelle":"Contenu HTML","element":"textarea","zone":"dashboard.widget.texte","attributs":[],"prerequis":["widget-texte"],"synonymes":[],"sources":["apps/dashboard/src/widget-config.ts"]},
  {"id":"dashboard.widget.texte.style","genre":"controle","libelle":"Style","element":"select","zone":"dashboard.widget.texte","attributs":[],"prerequis":["widget-texte"],"synonymes":[],"sources":["apps/dashboard/src/widget-config.ts"]},
  {"id":"dashboard.widget.titre","genre":"controle","libelle":"Titre du widget","element":"input","zone":"dashboard.widget","attributs":[],"prerequis":[],"synonymes":[],"sources":["apps/dashboard/src/widget-config.ts"]},
] as const satisfies readonly Repere[];

/** Identifiant de repere de l'app : enumeration fermee (outil montrer(), #1003). */
export type RepereId = (typeof REPERES)[number]['id'];

export const REGISTRE: RegistreReperes = {
  app: "dashboard",
  prefixe: "dashboard",
  reperes: REPERES,
};
