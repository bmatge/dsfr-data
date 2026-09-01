# Audit ergonomique — navigation & boutons d'action
## ChartsBuilder / dsfr-data — `chartsbuilder.miweb.run` (Aperçu 0.18.0)

> Document destiné à être passé directement à Claude Code comme brief de refonte.
> Chaque constat est numéroté, tracé (page + sélecteur), noté en sévérité, et suivi d'une décision à implémenter.
> Les sections **§6 Spécification cible** et **§7 Plan d'implémentation** sont la partie exécutable.

---

## 1. Méthode et périmètre

Audit réalisé le 1er septembre 2026, en navigation réelle sur l'application déployée, viewport 1440×900 puis 375×812, **en session non authentifiée** (les listes de sources/favoris sont donc vides ; les captures fournies par le commanditaire en session connectée complètent l'analyse).

Pages parcourues et instrumentées (extraction DOM de tous les `button`, `a.fr-btn`, `[role=button]`, avec classe DSFR, taille, position absolue, conteneur parent) :

| # | Entrée de nav | URL | `<title>` réel |
|---|---|---|---|
| 1 | Accueil | `/index.html` | `Charts builder — Accueil` |
| 2 | Sources | `/apps/sources/index.html` | `dsfr-data — Gestion des sources de données` |
| 3 | Assistant IA | `/apps/builder-ia/index.html` | `dsfr-data — Builder IA` |
| 4 | Studio IA | `/apps/studio/index.html` | `dsfr-data — Studio IA` |
| 5 | Créer un graphique | `/apps/builder/index.html` | `dsfr-data — Generateur de graphiques` |
| 6 | Créer une carte | `/apps/builder-carto/index.html` | `Générateur de cartes - dsfr-data` |
| 7 | Créer un tableau | `/apps/dashboard/index.html` | `Visual Dashboard Editor - dsfr-data` |
| 8 | Playground | `/apps/playground/index.html` | `dsfr-data — Playground` |
| 9 | Pipeline | `/apps/pipeline-helper/index.html` | `dsfr-data — Flux de données` |
| 10 | Suivi | `/apps/monitoring/index.html` | `Monitoring - dsfr-data` |
| 11 | Admin | `/apps/admin/index.html` | `Administration - dsfr-data` |
| — | Favoris (header) | `/apps/favorites/index.html` | `dsfr-data — Mes favoris` |
| — | Guide (header) | `/guide/guide.html` | `Guide utilisateur - dsfr-data` |
| — | Specs (header) | `/specs/index.html` | `Composants - dsfr-data` |

Le header, la nav, le skiplink et le footer sont **injectés au runtime** par le bundle (`assets/index-*.js`) : ils sont donc mutualisés, ce qui est une bonne base — toutes les corrections de navigation se font en un seul point.

---

## 2. Synthèse exécutive

L'application souffre principalement d'un **problème de constance**, pas de fonctionnalités manquantes. Le même geste utilisateur (« produire le résultat », « enregistrer », « copier le code ») change de nom, de couleur, de taille et de coin d'écran selon l'app. Concrètement, un utilisateur qui apprend le Builder ne sait pas réutiliser Carto ou Pipeline.

**Les 10 problèmes à traiter en priorité :**

| # | Problème | Sévérité | Lot |
|---|---|---|---|
| 1 | L'action principale change d'emplacement dans **5 zones différentes** selon l'app | 🔴 Critique | 2 |
| 2 | Le même geste porte **6 libellés** (Générer / Exécuter / Executer / Sauvegarder / Enregistrer / Envoyer) | 🔴 Critique | 3 |
| 3 | Aucun **état actif** dans la navigation (`aria-current` absent partout) | 🔴 Critique | 1 |
| 4 | « Créer un tableau » ouvre un **éditeur de tableau de bord** ; « Tableau » est par ailleurs un type de graphique | 🔴 Critique | 1 |
| 5 | Les onglets d'aperçu ont **4 jeux de libellés** ; sur Dashboard « Aperçu » est un bouton, ailleurs un onglet | 🟠 Majeur | 4 |
| 6 | La **confirmation destructive** de Favoris est le bouton le moins visible de la modale | 🟠 Majeur | 6 |
| 7 | **~25 classes de boutons maison** hors DSFR, sans états focus/disabled garantis | 🟠 Majeur | 5 |
| 8 | **Bug responsive** : la toolbar Dashboard sort de l'écran à 375px (`Nouveau` à x = −96px) | 🟠 Majeur | 8 |
| 9 | **6 systèmes d'aide** concurrents (popover auto, bouton visite, `?`, modale bloquante, bandeau, `help-btn`) | 🟠 Majeur | 7 |
| 10 | Accents manquants sur ~15 libellés (« Executer », « Reinitialiser », « Generateur »…) | 🟡 Modéré | 3 |

---

## 3. Cartographie de l'existant

### 3.1 Où se trouve l'action principale de chaque page

| Page | Action « produire le résultat » | Zone d'écran | Coordonnées @1440 | Variante DSFR | Taille |
|---|---|---|---|---|---|
| Accueil | `Créer un graphique` | Hero, colonne gauche | 120, 507 | primaire | `--lg` |
| Sources | `Nouvelle connexion` | En-tête de page, **droite** | 963, 209 | primaire | `--sm` |
| Assistant IA | `Envoyer` | Bas du **panneau gauche** | 663, 814 | *custom* `chat-send-btn` | — |
| Studio IA | `Enregistrer` | Toolbar dans le **panneau droit** | 606, 244 | **secondaire** ⚠️ | `--sm` |
| Créer un graphique | `Générer le graphique` | **Pied du panneau gauche** | 16, 823 | primaire | md |
| Créer une carte | `Exécuter` | **Topbar, extrême droite** | 1313, 182 | *custom* `carto-btn` | — |
| Créer un tableau | `Sauvegarder` | Toolbar, droite | 855, 188 | primaire | `--sm` |
| Playground | `Executer` | Toolbar éditeur, **extrême gauche** | 8, 238 | primaire | `--sm` |
| Pipeline | `Executer` + `Code` | Toolbar, extrême droite | 1344 / 1392, 181 | primaire ×2 ⚠️ | md |
| Suivi | `Actualiser` | Dans une carte, droite | 1182, 675 | tertiaire | `--sm` |
| Favoris | `Exporter` / `Importer` | En-tête de page, droite | 1075 / 1189, 211 | secondaire | `--sm` |

**Lecture :** 5 zones distinctes (hero, en-tête de page, topbar droite, pied de panneau gauche, panneau droit), 3 tailles, 3 variantes. Aucun utilisateur ne peut construire de modèle mental stable.

### 3.2 Barres d'action relevées, par page

```
ACCUEIL          [hero] Créer un graphique (primaire lg) · Démarrer avec l'IA (secondaire lg)
SOURCES          [head droite] Exporter (tertiary-no-outline sm) · Importer · Nouvelle connexion (primaire sm)
                 [corps] Créer une source manuelle (custom sources-link-btn) · Joindre deux sources (custom)
                 [panneau latéral] Utiliser dans le Builder (primaire sm) · En faire un jeu en ligne ·
                                   En faire un jeu local · Garder en favori · Exporter vers Grist · Rafraîchir (5× secondaire sm)
ASSISTANT IA     [panneau config] Ajouter un parametre (tertiary sm) · Sauvegarder config (secondaire sm) ·
                                  Reinitialiser (tertiary sm) · Sonder les capacités (tertiary sm)
                 [chat] Effacer (custom) · Envoyer (custom)
                 [tablist aperçu] Aperçu | Code | Données  + Playground · Favoris (custom, DANS le tablist)
STUDIO IA        [chat] Effacer (custom) · Envoyer (custom)
                 [tablist aperçu] Aperçu | Code | JSON
                 [toolbar interne aperçu] Enregistrer (secondaire sm) · Ouvrir dans Dashboard (tertiary sm)
BUILDER          [panneau config haut] Visite guidee (tertiary-no-outline sm)
                 [grille] 11 × chart-type-btn (custom) · 8 × help-btn (custom 20×20)
                 [pied panneau] Générer le graphique (primaire md) · Copier (secondaire md)
                 [tablist aperçu] Aperçu | Code généré | Données brutes + Playground · Favoris (custom)
CARTO            [topbar droite] Obtenir le code (custom carto-btn) · Exécuter (custom carto-btn)
                 [panneaux] Ajouter (carto-link-btn) · Repartir de zéro (carto-icon-btn 22×25) ·
                            Replier le panneau (carto-icon-btn) · Masquer la couche (carto-icon-btn)
                 [modale bloquante à l'arrivée] 3 × carto-choice
DASHBOARD        [toolbar droite] Nouveau · Ouvrir · Sauvegarder (PRIMAIRE) · Exporter HTML (tertiary) · Aperçu (secondaire) — tous sm
                 [onglets] Design | Code généré | JSON (custom vde-tab)
                 [canevas] Ajouter une ligne (custom) · 3 × row-control-btn (custom)
                 [sidebar] Ajouter une source (secondaire sm)
PLAYGROUND       [toolbar gauche] Executer (primaire sm) · Reinitialiser · + Deps · Copier · Favoris · Pipeline (5× secondaire sm)
PIPELINE         [toolbar unique, 12 boutons md] Source · Normalize · Query · Join · Search · Facets · Sortie (7× secondaire)
                                                  Supprimer · Reorganiser · Recentrer (3× tertiary)
                                                  Executer · Code (2× PRIMAIRE)
                 [gauche] ? (tertiary sm)
SUIVI            [dans une carte] Export CSV (secondaire sm) · Actualiser (tertiary sm)
ADMIN            [fr-tabs natifs] Utilisateurs | Journal d'audit | Statistiques
FAVORIS          [head droite] Exporter (secondaire sm) · Importer (secondaire sm)
                 [panneau latéral] Copier le code (primaire sm) · Builder · Playground · Partager (secondaire) · supprimer (icône)
                 [modale suppression] Annuler (secondaire md) · Supprimer (tertiary-no-outline md) ⚠️ inversion
HEADER (global)  Guide · Specs · Favoris · Connexion/Mon espace — 4 × tertiary-no-outline
NAV (global)     Accueil · Sources · Assistant IA · Studio IA · Créer un graphique · Créer une carte ·
                 Créer un tableau · Playground · Pipeline · Suivi · Admin  (11 entrées, aucun état actif)
```

---

## 4. Constats détaillés

### A — Navigation globale

**A1 · Aucun état actif dans la navigation — 🔴 Critique**
Sur les 14 pages, aucun `.fr-nav__link` ne porte `aria-current="page"` ni de classe active. L'utilisateur n'a aucun repère sur sa position, et un lecteur d'écran non plus.
→ *Correction :* le composant de nav injecté doit comparer `location.pathname` à chaque `href` et poser `aria-current="page"`. C'est une correction en un seul point (nav mutualisée).
*Réf. RGAA 12.x / DSFR « Navigation principale ».*

**A2 · Header non collant — 🟠 Majeur**
`getComputedStyle(.fr-header).position === "relative"`. Sur Builder (panneau de config très long), Sources et Guide, la navigation et le bouton « Mon espace » disparaissent au défilement, alors que l'usage est éditorial et multi-écrans.
→ *Correction :* `position: sticky; top: 0; z-index: 750;` sur `.fr-header`, avec compensation du scroll interne des panneaux.

**A3 · Deux systèmes de navigation concurrents — 🟠 Majeur**
`fr-nav` porte 11 destinations applicatives ; `fr-header__tools-links` en porte 4 de nature hétérogène : **Guide** et **Specs** (documentation), **Favoris** (destination applicative de plein droit), **Connexion / Mon espace** (compte). « Favoris » est donc la seule app rangée hors de la nav.
→ *Correction :* tools = compte + aide uniquement (`Aide` regroupant Guide et Specs, `Mon espace`). Favoris rejoint la nav dans le groupe « Outils ».

**A4 · Navigation plate à 11 entrées, taxonomie mixte — 🟠 Majeur**
La barre mélange trois registres : des verbes (« Créer un graphique / une carte / un tableau »), des noms d'outils (« Playground », « Pipeline », « Studio IA », « Assistant IA ») et des fonctions (« Sources », « Suivi », « Admin »). Rien n'indique qu'Assistant IA et Créer un graphique produisent le même artefact par deux chemins.
→ *Correction :* regroupement en 4 menus (voir §6.5).

**A5 · « Assistant IA » vs « Studio IA » indiscernables — 🟠 Majeur**
Les libellés ne disent pas ce qui les sépare ; les titres internes utilisent d'ailleurs un troisième nom (« Builder IA »). En pratique : Assistant IA = **un** graphique par conversation ; Studio IA = **un tableau de bord complet** par conversation.
→ *Correction :* « Graphique par IA » et « Tableau de bord par IA », ou conserver les noms + baseline explicite dans le menu déroulant.

**A6 · « Créer un tableau » → éditeur de tableau de bord — 🔴 Critique**
L'entrée pointe vers `/apps/dashboard/`, dont le `<title>` est « Visual Dashboard Editor », dont le H2 est « Mon tableau de bord » et dont les widgets sont KPI / Graphique / Tableau / Texte. Or « Tableau » désigne aussi un **type de graphique** dans le Builder (11ᵉ tuile de la grille de types), et « Créer un tableau » suggère naturellement un tableau de données.
→ *Correction :* renommer l'entrée « **Créer un tableau de bord** », le `<title>` « Charts builder — Tableaux de bord », et vérifier qu'un chemin explicite existe pour « je veux juste un tableau de données » (= Builder, type Tableau).

**A7 · Pas de fil d'Ariane — 🟡 Modéré**
Aucun `.fr-breadcrumb`. Or les parcours sont en aller-retour entre apps (Builder → Playground → Favoris → Builder ; Sources → « Utiliser dans le Builder » ; Studio → « Ouvrir dans Dashboard »). L'utilisateur perd le fil de l'objet qu'il manipule.
→ *Correction :* fil d'Ariane sur les pages « plein cadre » (Sources, Favoris, Suivi, Admin, Guide) +, sur les éditeurs, un rappel du contexte d'origine (« ← Revenir au Builder ») quand on arrive via un lien inter-app.

**A8 · Trois conventions de `<title>`, quatre noms de produit — 🟡 Modéré**
Conventions observées : `Charts builder — Accueil`, `dsfr-data — Playground`, `Monitoring - dsfr-data`. Noms de marque : **Charts builder** (header), **dsfr-data** (titres), **DSFR Chart** (lien footer), **ChartsBuilder** (domaine).
→ *Correction :* `Charts builder — <Nom de page>` partout, tiret cadratin, produit d'abord. Réserver « dsfr-data » au nom de la bibliothèque, jamais à l'application.

**A9 · H1 absent sur 6 pages — 🟠 Majeur (RGAA)**
Aucun `<h1>` sur : Builder, Assistant IA, Studio IA, Playground, Dashboard, Specs. Le skiplink « Contenu » fonctionne (`#main-content` bien présent au runtime), mais l'utilisateur atterrit sur une zone sans titre.
→ *Correction :* un `<h1>` par page, visuellement discret si nécessaire (`fr-sr-only` proscrit si évitable — préférer un titre de zone de travail visible).

### B — Boutons d'action : emplacements et hiérarchie

**B1 · L'action principale n'a pas d'ancrage stable — 🔴 Critique**
Voir §3.1. Cinq zones pour un même rôle. Trois apps sur six placent déjà la barre d'action en **haut à droite** (Carto, Dashboard, Pipeline) : c'est la convention à généraliser.
→ *Correction :* composant `AppActionBar` unique, ancré en haut à droite de la zone de travail, adopté par les 6 éditeurs (§6.2).

**B2 · Six libellés pour un même geste — 🔴 Critique**

| Geste | Libellés observés | Pages |
|---|---|---|
| Produire le rendu | `Générer le graphique`, `Exécuter`, `Executer` | Builder, Carto, Playground, Pipeline |
| Persister | `Sauvegarder`, `Enregistrer`, `Sauvegarder config`, `Garder en favori` | Dashboard, Studio, Assistant IA, Sources |
| Mettre en favori | `Favoris`, `Garder en favori` | Builder, Assistant IA, Playground, Sources |
| Copier | `Copier`, `Copier le code` | Builder, Playground, Pipeline, Favoris |
| Repartir de zéro | `Nouveau`, `Reinitialiser`, `Repartir de zéro`, `Effacer` | Dashboard, Playground, Carto, chat |

→ *Correction :* lexique canonique unique (§6.1), appliqué par un lint de libellés.

**B3 · « Favoris » = trois choses différentes — 🟠 Majeur**
1. Lien du header → **destination** (la page Mes favoris).
2. Bouton dans la barre d'onglets du Builder et de l'Assistant IA → **action** (ajouter aux favoris).
3. Bouton de la toolbar du Playground → **action**, mais rendu en `fr-btn--secondary` au milieu d'actions d'édition.
Même mot, deux verbes opposés (naviguer vs enregistrer).
→ *Correction :* l'action devient « **Ajouter aux favoris** » avec icône étoile ; « Favoris » reste réservé à la destination.

**B4 · Hiérarchie visuelle incohérente — 🟠 Majeur**
- **Studio IA** : aucune action primaire sur la page. L'action la plus importante (`Enregistrer`) est en `fr-btn--secondary`, la suivante (`Ouvrir dans Dashboard`) en `tertiary`.
- **Pipeline** : deux boutons primaires côte à côte (`Executer`, `Code`) — l'utilisateur ne sait pas lequel est l'action nominale.
- **Sources** : `Exporter` en `tertiary-no-outline` (lu comme un lien) ; sur **Favoris**, le même `Exporter` est en `secondary`. Même action, deux poids.
- **Playground** : 1 primaire + 5 secondaires strictement identiques alignés → mur de boutons sans hiérarchie interne.
→ *Correction :* règle « 1 primaire par écran, max 3 secondaires visibles, le reste en menu Plus » (§6.3).

**B5 · Toolbar Pipeline : trois familles sémantiques dans un seul groupe — 🟠 Majeur**
`.pipeline-toolbar .fr-btns-group` contient 12 boutons : 7 « ajouter un nœud » (Source, Normalize, Query, Join, Search, Facets, Sortie), 3 actions de canevas (Supprimer, Reorganiser, Recentrer), 2 actions de sortie (Executer, Code). Aucun séparateur, aucun groupe ARIA. `Supprimer` est adjacent à `Recentrer` et à `Executer` → risque de clic destructeur.
→ *Correction :* trois groupes visuellement séparés (`role="group"` + `aria-label`), les ajouts de nœuds passant idéalement dans une palette latérale ou un menu « + Ajouter une étape ».

**B6 · Nœuds de pipeline en anglais dans une UI française — 🟡 Modéré**
`Normalize`, `Query`, `Join`, `Search`, `Facets` cohabitent avec `Source` et `Sortie`.
→ *Correction :* soit tout en français (Normaliser, Requêter, Joindre, Rechercher, Facettes), soit assumer les noms techniques de la lib et les marquer comme tels (`<code>`), mais pas un mélange.

**B7 · Actions destructives mal traitées — 🟠 Majeur**
- Modale de suppression d'un favori : `Annuler` en `fr-btn--secondary`, `Supprimer` en `fr-btn--tertiary-no-outline`. **L'action de confirmation destructive est le bouton le moins visible de la modale** — inversion de la hiérarchie attendue.
- `Supprimer` dans la toolbar Pipeline en `tertiary`, sans confirmation apparente, entre deux actions bénignes.
- `Supprimer la ligne`, `Retirer une cellule`, `Supprimer la colonne`, `Supprimer la ligne` (Dashboard, Sources) : boutons icône `custom`, pas de confirmation.
→ *Correction :* composant `ConfirmDialog` unique ; la confirmation destructive est un bouton **primaire** avec traitement « danger », `Annuler` en secondaire, focus initial sur `Annuler`.

**B8 · Fermeture de modale : cinq implémentations — 🟡 Modéré**
`modal-close` avec « × » comme texte visible (Sources, Builder, Dashboard) ; `fr-btn--close` « Fermer » (DSFR, header) ; `code-modal__header` « Fermer » tertiary (Pipeline) ; `preview-modal-header` « Fermer » secondary (Dashboard) ; `fav-panel__close` (Favoris). Le « × » comme seul nom accessible est non conforme.
→ *Correction :* `fr-btn--close` DSFR partout, nom accessible « Fermer ».

**B9 · Tailles mélangées — 🟡 Modéré**
`--lg` (Accueil), md (Pipeline, Builder footerbar, modales Dashboard), `--sm` (Sources, Dashboard toolbar, Playground, Favoris, Suivi), plus des boutons hors échelle (`carto-btn`, `chat-send-btn`). Pipeline mélange md et sm dans la même vue.
→ *Correction :* `--sm` pour toute barre d'outils d'éditeur, md pour formulaires et modales, `--lg` réservé au hero de l'accueil.

**B10 · ~25 classes de boutons hors DSFR — 🟠 Majeur (dette)**
Relevé : `carto-btn`, `carto-icon-btn`, `carto-link-btn`, `carto-choice`, `carto-source-choose`, `carto-panel__header-toggle`, `chart-type-btn`, `help-btn`, `filters-zone__mode`, `preview-panel-tab`, `preview-panel-action-btn`, `vde-tab`, `row-control-btn`, `add-row-btn`, `widget-action-btn`, `sources-link-btn`, `chat-send-btn`, `chat-suggestion`, `chat-header__clear`, `sample-dataset-card`, `explorer-tab`, `col-remove-btn`, `modal-close`, `onboarding__dismiss`, `tour-popover-{close,skip,disable,next}`, `fav-panel__{rename,close,delete}`.
Conséquence : états `:focus-visible`, `:disabled`, `:hover` et contrastes non garantis, et divergence progressive avec le DSFR — problématique pour un produit dont l'argument est justement la conformité DSFR.
→ *Correction :* soit rebasculer sur `fr-btn*`, soit définir 3 primitives internes documentées (`app-btn--icon`, `app-tab`, `app-card-choice`) qui **héritent des tokens DSFR** et sont testées.

**B11 · Pas d'état désactivé / de chargement — 🟡 Modéré**
`Générer le graphique` reste cliquable sans source sélectionnée ; `Exécuter` (Carto) idem. Aucun indicateur de traitement en cours sur les actions IA.
→ *Correction :* `disabled` + `aria-disabled` tant que les prérequis manquent, avec une raison affichée ; état `is-loading` normalisé.

### C — Panneau d'aperçu et onglets

**C1 · Quatre jeux de libellés pour le même composant — 🟠 Majeur**

| Page | Onglets |
|---|---|
| Créer un graphique | `Aperçu` · `Code généré` · `Données brutes` |
| Assistant IA | `Aperçu` · `Code` · `Données` |
| Studio IA | `Aperçu` · `Code` · `JSON` |
| Créer un tableau | `Design` · `Code généré` · `JSON` |

→ *Correction :* `Aperçu` · `Code` · `Données` · `JSON` (les deux derniers optionnels selon l'app), un seul composant.

**C2 · « Aperçu » est un onglet ici et un bouton là — 🟠 Majeur**
Sur Dashboard, `Aperçu` est un **bouton de la toolbar** (ouvre une modale plein écran) alors que le premier onglet s'appelle `Design`. Sur toutes les autres apps, `Aperçu` est le premier onglet. Conflit de signifiant frontal.
→ *Correction :* onglet `Aperçu` sur Dashboard aussi ; le bouton de la toolbar devient `Plein écran` (ou une icône d'agrandissement dans le panneau d'aperçu).

**C3 · Des actions logées dans un tablist — 🟠 Majeur**
Sur Builder et Assistant IA, `Playground` et `Favoris` (`preview-panel-action-btn`) sont des **boutons d'action placés à l'intérieur de la barre d'onglets**. Sur Studio, ils n'existent pas et sont remplacés par une toolbar interne (`Enregistrer`, `Ouvrir dans Dashboard`). Sur Dashboard, ils n'existent pas du tout.
→ *Correction :* les actions sortent du tablist et rejoignent l'`AppActionBar` ; l'ensemble « Ouvrir dans… » devient un menu unique `Ouvrir dans ▾` (Playground · Pipeline · Dashboard) disponible partout.

**C4 · Onglets sans sémantique ARIA — 🟠 Majeur (RGAA)**
`.vde-tab`, `.preview-panel-tab`, `.explorer-tab`, les onglets Carto : ni `role="tablist"`, ni `role="tab"`, ni `aria-selected`, ni navigation aux flèches. Seul Admin utilise les `fr-tabs` natifs.
→ *Correction :* utiliser `fr-tabs` du DSFR, ou implémenter le patron ARIA complet.

### D — Aide et prise en main

**D1 · Six mécaniques d'aide concurrentes — 🟠 Majeur**

| Page | Mécanique |
|---|---|
| Sources, Assistant IA, Dashboard, Playground | Popover de visite guidée **auto-déclenché** (`tour-popover`), avec `Passer` / `Ne plus afficher les visites` / `Suivant` |
| Créer un graphique | Bouton `Visite guidee` en haut du panneau de config + 8 `help-btn` « Aide » (20×20) |
| Créer une carte | **Modale bloquante** d'onboarding à l'arrivée (3 choix) |
| Pipeline | Bouton `?` (tertiary) + bandeau `onboarding` avec `Masquer` |
| Header | Liens `Guide` et `Specs`, sans lien avec ce qui précède |

→ *Correction :* un service unique `TourService`, un point d'entrée unique `Visite guidée` placé au même endroit dans l'`AppActionBar`, jamais auto-déclenché sauf première visite du compte, et un lien « Voir le guide complet » en fin de visite.

**D2 · La modale Carto bloque l'exploration — 🟡 Modéré**
Arriver sur « Créer une carte » impose un choix avant même de voir l'interface.
→ *Correction :* transformer en état vide dans le panneau (empty state), comme le Builder le fait déjà avec ses jeux d'exemple.

### E — Accessibilité (RGAA / WCAG 2.2)

Le footer déclare déjà « Accessibilité : non conforme » — les points ci-dessous sont les plus rentables à corriger.

| Réf. | Constat | Pages | Critère |
|---|---|---|---|
| E1 | `aria-current="page"` absent de la nav | toutes | RGAA 12.x |
| E2 | Onglets custom sans `role=tab/tablist` ni `aria-selected` | Builder, Assistant IA, Studio, Dashboard, Carto, Sources | WCAG 4.1.2 |
| E3 | Cibles < 24×24 px : `help-btn` **20×20** (×5) et **18×18** (×3), `carto-icon-btn` **22×25** (×2), `tour-popover-close` **20×20**, `filters-zone__mode` h=22 | Builder, Carto, tous les popovers | WCAG 2.2 — 2.5.8 |
| E4 | Bouton dont le nom accessible est « × » | Sources, Builder, Dashboard, Carto | WCAG 4.1.2 |
| E5 | `<h1>` absent | Builder, Assistant IA, Studio, Playground, Dashboard, Specs | RGAA 9.1 |
| E6 | Aucune `role="toolbar"` sur les barres d'actions (`vde-toolbar-right`, `pipeline-toolbar`, `editor-toolbar`) → pas de navigation aux flèches | Dashboard, Pipeline, Playground | WCAG 2.1.1 (confort) |
| E7 | Libellés sans accents (voir F1) : altère la restitution vocale | Playground, Pipeline, Assistant IA, Admin, Builder | RGAA 8.x |

### F — Rédactionnel

**F1 · Accents manquants — 🟡 Modéré mais très visible**
Relevé exhaustif : `Executer` (Playground, Pipeline), `Reinitialiser` (Playground, Assistant IA), `Reorganiser`, `Recentrer` (Pipeline), `Visite guidee` (Builder), `Sauvegarder config`, `Ajouter un parametre` (Assistant IA), `Detail utilisateur` (Admin), `Generateur de graphiques` (`<title>` Builder), `Bibliotheque de composants` (Specs), `Revoquer le lien` (Favoris), `Composants` OK, `Journal d'audit` OK.
→ *Correction :* corriger, puis ajouter un script de lint (§7, lot 3) qui refuse toute chaîne d'interface contenant un mot connu sans accent.

**F2 · Marque à quatre noms — 🟡 Modéré**
« Charts builder » / « dsfr-data » / « DSFR Chart » / « ChartsBuilder ». Point sensible au moment de verser la bibliothèque aux communs et de la présenter au SIG/DINUM : le nom du **produit** (l'application) et celui de la **bibliothèque** doivent être distincts et stables.
→ *Correction :* fixer « **Charts builder** » = application, « **dsfr-data** » = bibliothèque de composants, et n'employer que ces deux-là.

### G — Responsive

**G1 · Bug de toolbar Dashboard à 375px — 🟠 Majeur**
Mesures à `vw=375` : `Nouveau` positionné à **x = −96 px** (hors écran, inaccessible), `Ouvrir` à x=11, `Sauvegarder` à x=100, `Exporter HTML` à x=230 **sur deux lignes (h=56 alors que les autres font 32)**, `Aperçu` à x=335. La barre ne passe pas à la ligne et déborde par la gauche.
→ *Correction :* `flex-wrap` + `gap`, ou passage en menu « ⋯ » sous 768px avec `Enregistrer` seul visible.

**G2 · Action principale du Builder sous la ligne de flottaison sur mobile — 🟠 Majeur**
`.builder-footerbar` est en `position: static`, à y≈1070 pour une hauteur d'écran de 812 : `Générer le graphique` n'est pas visible sans défiler tout le panneau de configuration.
→ *Correction :* barre d'action collante en bas d'écran sous 768px (`position: sticky; bottom: 0`), ou adoption de l'`AppActionBar` haute et collante.

**G3 · Header non collant sur mobile non plus** — voir A2.

---

## 5. Ce qui fonctionne bien (à préserver)

- Header, nav, skiplink et footer **mutualisés et injectés au runtime** : toutes les corrections de navigation sont centralisées.
- `#main-content` et le skiplink « Contenu » présents et fonctionnels sur **toutes** les pages testées, y compris les éditeurs.
- Admin utilise correctement les `fr-tabs` natifs — c'est la référence à généraliser.
- Le Builder propose un **état vide utile** (jeux de données d'exemple cliquables) : bon patron, à répliquer sur Carto à la place de la modale bloquante.
- La déclaration d'accessibilité est déjà présente et honnête dans le footer.

---

## 6. Spécification cible

### 6.1 Lexique canonique des actions

| Intention | Libellé unique | Variante | Icône DSFR | Remplace |
|---|---|---|---|---|
| Produire le rendu à partir d'une configuration | **Générer** | primaire | `fr-icon-play-line` | `Générer le graphique`, `Exécuter` (Carto) |
| Exécuter du code saisi par l'utilisateur | **Exécuter** | primaire | `fr-icon-play-line` | `Executer` (Playground, Pipeline) |
| Persister l'objet en cours | **Enregistrer** | primaire | `fr-icon-save-line` | `Sauvegarder`, `Sauvegarder config` |
| Ajouter à la collection personnelle | **Ajouter aux favoris** | secondaire | `fr-icon-star-line` | `Favoris` (action), `Garder en favori` |
| Copier le code d'intégration | **Copier le code** | secondaire | `fr-icon-clipboard-line` | `Copier`, `Obtenir le code` |
| Repartir d'une base vierge | **Nouveau** | tertiaire | `fr-icon-add-line` | `Repartir de zéro`, `Reinitialiser` (Playground) |
| Annuler les modifications en cours | **Réinitialiser** | tertiaire | `fr-icon-refresh-line` | — |
| Recharger les données | **Actualiser** | tertiaire | `fr-icon-refresh-line` | `Rafraîchir` |
| Ouvrir l'objet dans une autre app | **Ouvrir dans ▾** | secondaire (menu) | `fr-icon-external-link-line` | `Playground`, `Pipeline`, `Ouvrir dans Dashboard` |
| Sortir un fichier | **Exporter ▾** | secondaire | `fr-icon-download-line` | `Exporter`, `Export CSV`, `Exporter HTML`, `Exporter vers Grist` |
| Charger un fichier | **Importer** | secondaire | `fr-icon-upload-line` | — |
| Détruire | **Supprimer** | primaire *danger* dans la confirmation | `fr-icon-delete-bin-line` | — |
| Voir en grand | **Plein écran** | tertiaire | `fr-icon-fullscreen-line` | `Aperçu` (bouton Dashboard) |
| Lancer la visite | **Visite guidée** | tertiaire sans contour | `fr-icon-question-line` | `Visite guidee`, `?` |

### 6.2 Composant `AppActionBar`

Une seule barre par app éditeur, **en haut à droite de la zone de travail**, au-dessus du contenu et sous le header.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  <h1 zone de travail>                     [tertiaires] [secondaires] [PRIMAIRE] │
└──────────────────────────────────────────────────────────────────────────────┘
```

Règles :
- `role="toolbar"` + `aria-label="Actions de la page"`, navigation aux flèches ;
- **une seule** action primaire, toujours à l'extrême droite ;
- **3 secondaires maximum** visibles ; au-delà, menu `Plus ▾` (`fr-btn--tertiary` + `fr-icon-more-line`) ;
- les tertiaires (contextuelles : Visite guidée, Réinitialiser, Plein écran) précèdent les secondaires ;
- taille `fr-btn--sm` ;
- `flex-wrap` autorisé ; sous 768px la barre devient collante en bas d'écran avec la seule action primaire + `Plus ▾` ;
- l'action primaire est `disabled` + `aria-disabled` tant que les prérequis manquent, avec l'explication en `aria-describedby`.

Répartition cible par app :

| App | Primaire | Secondaires | Tertiaires |
|---|---|---|---|
| Créer un graphique | Générer | Copier le code · Ajouter aux favoris · Ouvrir dans ▾ | Visite guidée · Réinitialiser |
| Créer une carte | Générer | Copier le code · Ajouter aux favoris · Ouvrir dans ▾ | Visite guidée · Nouveau |
| Créer un tableau de bord | Enregistrer | Ouvrir · Exporter ▾ · Ajouter aux favoris | Visite guidée · Nouveau · Plein écran |
| Assistant IA | Générer | Copier le code · Ajouter aux favoris · Ouvrir dans ▾ | Visite guidée · Effacer la conversation |
| Studio IA | Enregistrer | Copier le code · Ouvrir dans ▾ | Visite guidée · Effacer la conversation |
| Playground | Exécuter | Copier le code · Ajouter aux favoris · Ouvrir dans ▾ | Visite guidée · Réinitialiser · Ajouter des dépendances |
| Pipeline | Exécuter | Copier le code · Ouvrir dans ▾ | Visite guidée · Réorganiser · Recentrer |
| Sources | Nouvelle connexion | Importer · Exporter ▾ | Visite guidée |
| Favoris | — | Importer · Exporter ▾ | — |
| Suivi | — | Exporter ▾ | Actualiser |

### 6.3 Règles de hiérarchie

1. Une action primaire par écran, jamais deux (corrige Pipeline).
2. Une action jugée principale n'est jamais en `secondary` ni `tertiary` (corrige Studio IA).
3. `fr-btn--tertiary-no-outline` est réservé aux **liens de navigation** ; jamais pour une action d'écriture ni pour une confirmation destructive (corrige Sources et la modale Favoris).
4. Une même action porte la même variante partout (corrige `Exporter` : secondaire partout).
5. Trois familles d'actions dans une même barre → trois `role="group"` séparés visuellement (corrige Pipeline).

### 6.4 Composant `PreviewPanel`

Onglets normalisés `Aperçu` · `Code` · `Données` · `JSON` (les deux derniers optionnels), en `fr-tabs` DSFR natifs. **Aucune action dans le tablist** : tout remonte dans l'`AppActionBar`. Un bouton `Plein écran` en tertiaire dans le coin du panneau.

### 6.5 Navigation cible

```
Créer ▾        Graphique · Carte · Tableau de bord
Avec l'IA ▾    Assistant IA (un graphique) · Studio IA (un tableau de bord)
Données ▾      Sources · Pipeline
Mes objets ▾   Favoris · Suivi
Admin
```

Header (tools) : `Aide ▾` (Guide · Composants · Feuille de route) · `Mon espace`.
Ajouts : `aria-current="page"`, header `sticky`, fil d'Ariane sur les pages plein cadre.

---

## 7. Plan d'implémentation

Lots conçus pour être des PR indépendantes et vérifiables. Ordre recommandé.

**Lot 0 — Référentiel (0,5 j)**
`docs/ux/actions.md` : le lexique §6.1, les règles §6.3, la spec `AppActionBar`. Sert de source unique pour les lots suivants.

**Lot 1 — Header & navigation (1 j)** — *point d'entrée : le module qui injecte le header/nav dans `assets/index-*.js`*
- `aria-current="page"` calculé depuis `location.pathname` ;
- `.fr-header { position: sticky; top: 0 }` ;
- regroupement de la nav en 5 entrées (§6.5) ;
- `Favoris` déplacé de `tools` vers la nav, `Guide`+`Specs` fusionnés en `Aide ▾` ;
- « Créer un tableau » → « Créer un tableau de bord » ;
- `<title>` normalisés `Charts builder — <Page>` sur les 14 pages ;
- `<h1>` ajouté sur Builder, Assistant IA, Studio, Playground, Dashboard, Specs ;
- fil d'Ariane sur Sources / Favoris / Suivi / Admin / Guide.
*Vérif :* `aria-current` présent et unique sur les 14 pages ; un seul `h1` par page.

**Lot 2 — `AppActionBar` (2–3 j)**
Créer le composant, puis migrer dans l'ordre : Playground (le plus simple) → Builder → Carto → Dashboard → Pipeline → Studio/Assistant IA. Supprimer `builder-footerbar`, `carto-topbar__actions`, `vde-toolbar-right`, `editor-toolbar`, `studio-toolbar`, `pipeline-toolbar` (partie sortie).
*Vérif :* sur chaque éditeur, un seul `[role=toolbar]`, une seule action primaire, position identique au pixel près.

**Lot 3 — Libellés (0,5 j)**
Appliquer le lexique §6.1 ; corriger les accents (§F1) ; `scripts/check-labels.mjs` qui échoue en CI si une chaîne d'UI contient un libellé hors lexique ou un mot connu sans accent.
*Vérif :* le script passe ; aucune occurrence de `Executer|Reinitialiser|Reorganiser|guidee|parametre|Generateur|Bibliotheque|Detail|Revoquer`.

**Lot 4 — `PreviewPanel` (1,5 j)**
Composant unique, `fr-tabs` natifs, libellés §6.4, actions sorties du tablist, `Aperçu` redevenu un onglet sur Dashboard (`Aperçu` bouton → `Plein écran`).
*Vérif :* `role=tablist/tab/tabpanel` + `aria-selected` présents ; navigation aux flèches ; 4 apps rendent le même composant.

**Lot 5 — Dette de boutons (2 j)**
Remplacer les ~25 classes maison par `fr-btn*` ou par 3 primitives internes documentées héritant des tokens DSFR. Porter toutes les cibles à ≥ 24×24 px (`help-btn`, `carto-icon-btn`, `tour-popover-close`, `filters-zone__mode`). Normaliser les tailles (§B9).
*Vérif :* aucune cible < 24px ; `:focus-visible` visible sur 100 % des boutons ; audit contraste AA.

**Lot 6 — Modales & actions destructives (1 j)**
`ConfirmDialog` unique (confirmation destructive = primaire danger, `Annuler` secondaire, focus initial sur `Annuler`, `Échap` ferme). `fr-btn--close` partout, nom accessible « Fermer ». Confirmation ajoutée sur les suppressions de ligne/colonne/nœud.
*Vérif :* plus aucun bouton dont le nom accessible est « × » ; toute suppression passe par `ConfirmDialog`.

**Lot 7 — Onboarding unifié (1 j)**
`TourService` unique, déclenché par `Visite guidée` dans l'`AppActionBar`, auto-lancé seulement à la première visite du compte, préférence « ne plus afficher » persistée côté compte. Modale Carto → état vide dans le panneau. Bandeau Pipeline supprimé au profit de la visite.
*Vérif :* un seul composant de visite dans le bundle ; aucune modale bloquante à l'arrivée.

**Lot 8 — Responsive (1 j)**
Corriger le débordement de la toolbar Dashboard à 375px ; `AppActionBar` collante en bas sous 768px ; vérifier Builder, Carto, Pipeline, Playground à 375 / 768 / 1024 / 1440.
*Vérif :* aucun bouton avec `x < 0` ou `x + w > innerWidth` ; aucune action primaire hors de la première hauteur d'écran.

---

## 8. Critères d'acceptation (checklist de recette)

**Navigation**
- [ ] `aria-current="page"` présent et unique sur les 14 pages
- [ ] Header `sticky`, visible après 2000 px de défilement sur Builder et Sources
- [ ] Nav regroupée en 5 entrées, « Créer un tableau de bord » corrigé
- [ ] Un `<h1>` unique par page
- [ ] `<title>` au format `Charts builder — <Page>` sur les 14 pages
- [ ] Fil d'Ariane sur les 5 pages plein cadre

**Actions**
- [ ] Un seul `[role=toolbar]` par éditeur, en haut à droite, position identique d'une app à l'autre
- [ ] Exactement une action primaire par écran
- [ ] Les 14 libellés du lexique §6.1 sont les seuls employés
- [ ] `Exporter` a la même variante sur Sources, Favoris et Suivi
- [ ] Aucun accent manquant (script de lint vert)
- [ ] L'action primaire est désactivée avec explication tant que les prérequis manquent

**Aperçu**
- [ ] Un seul composant d'onglets, libellés `Aperçu / Code / Données / JSON`
- [ ] `role=tablist|tab|tabpanel` + `aria-selected` + flèches
- [ ] Aucune action dans le tablist ; `Ouvrir dans ▾` présent sur les 6 éditeurs

**Accessibilité**
- [ ] Aucune cible interactive < 24×24 px
- [ ] Aucun bouton dont le nom accessible est « × »
- [ ] `:focus-visible` visible sur 100 % des boutons, y compris les primitives internes
- [ ] Contrastes AA sur les boutons custom restants

**Destructif**
- [ ] Toute suppression passe par `ConfirmDialog`
- [ ] Dans `ConfirmDialog`, la confirmation est primaire danger et `Annuler` a le focus initial

**Responsive**
- [ ] À 375 / 768 / 1024 / 1440 : aucun bouton hors cadre, aucune barre débordante
- [ ] L'action primaire est atteignable sans défilement sur mobile

---

## 9. Annexe — extraits de mesures brutes

**Toolbar Dashboard @375px (bug G1)**
```
Nouveau        99×32  @ x=-96   ← hors écran
Ouvrir         81×32  @ x=11
Sauvegarder   122×32  @ x=100
Exporter HTML  97×56  @ x=230   ← 2 lignes, casse l'alignement
Aperçu         88×32  @ x=335
```

**Cibles sous 24px (Builder @1440)**
```
Aide 20×20 ×5 · Aide 18×18 ×3 · Mode texte (expert) 123×22
```

**Cibles sous 24px (Carto @1440)**
```
Repartir de zéro 22×25 · Masquer la couche 22×25
```

**Nav (identique sur les 14 pages, aucun `aria-current`)**
```
Accueil · Sources · Assistant IA · Studio IA · Créer un graphique · Créer une carte ·
Créer un tableau · Playground · Pipeline · Suivi · Admin
```

**Header tools (identique partout)**
```
Guide · Specs · Favoris · Connexion (→ « Mon espace » en session connectée)
```
