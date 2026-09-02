# Référentiel des actions — lexique, hiérarchie, AppActionBar

> **Source unique** pour les lots de l'epic UX #546. Toute chaîne d'interface qui nomme une
> action, toute barre d'action, toute modale de confirmation se réfère à ce document.
> Il découle de l'audit [`audit-ergonomique-2026-09.md`](audit-ergonomique-2026-09.md) (§6)
> et des arbitrages du 2026-09-02 consignés sur l'epic #546.
>
> Statut : **normatif** à partir du lot 3 (#540), qui rend le lint de libellés bloquant.

## 0. Arbitrages qui dérogent à l'audit

| # | Point | Décision |
|---|---|---|
| 1 | Périmètre du lexique | **Cœur de 14 actions + extensions par app** (§2). Pas de lexique fermé : les libellés de formulaires, d'onglets ou de navigation ne sont pas des « actions ». |
| 2 | Lint | Le lint (extension de `npm run check:accents`) est **bloquant** sur les accents manquants et sur une **liste de formes proscrites** (§3). Pas de liste blanche. |
| 3 | Navigation | **Pas de regroupement des entrées de niveau 1** ni de refonte des tools du header (§6.5 / A3 / A4 / A5 de l'audit hors périmètre). |
| 4 | Apps conversationnelles | Dans Assistant IA et Studio IA, **le geste primaire reste l'envoi du chat**. L'AppActionBar porte les actions sur l'artefact ; pas de « Générer » primaire. |
| 5 | Nœuds Pipeline (B6) | Libellés **français** + nom du composant en `<code>` (§7). |
| 6 | Onboarding | Le `TourService` unique existe déjà (`packages/shared/src/ui/product-tour.ts`) ; « Visite guidée » est son seul point d'entrée. |

## 1. Vocabulaire

- **Action** : un bouton (ou un lien stylé bouton) qui *fait* quelque chose sur l'objet en cours.
  Naviguer vers une page n'est pas une action ; un onglet n'est pas une action.
- **Geste** : l'intention utilisateur derrière l'action (« produire le rendu », « persister »).
  Un geste a **un seul** libellé, quelle que soit l'app.
- **Objet en cours** : ce que l'éditeur manipule — un graphique, une carte, un tableau de bord,
  un pipeline, un extrait de code, une connexion.
- **Variante** : la classe DSFR — `primaire` (`fr-btn`), `secondaire` (`fr-btn--secondary`),
  `tertiaire` (`fr-btn--tertiary`), `tertiaire sans contour` (`fr-btn--tertiary-no-outline`).
- **Marque** : « **Charts builder** » désigne l'application, « **dsfr-data** » la bibliothèque
  de composants. Aucun autre nom (« ChartsBuilder », « DSFR Chart », « Builder IA ») dans l'UI.

## 2. Lexique canonique

### 2.1 Cœur (14 actions, communes à toutes les apps)

| Geste | Libellé unique | Variante | Icône DSFR | Remplace |
|---|---|---|---|---|
| Produire le rendu à partir d'une configuration | **Générer** | primaire | `fr-icon-play-line` | `Générer le graphique`, `Exécuter` (Carto) |
| Exécuter du code ou un flux saisi par l'utilisateur | **Exécuter** | primaire | `fr-icon-play-line` | `Executer` (Playground, Pipeline) |
| Persister l'objet en cours | **Enregistrer** | primaire | `fr-icon-save-line` | `Sauvegarder`, `Sauvegarder config` |
| Ajouter l'objet à la collection personnelle | **Ajouter aux favoris** | secondaire | `fr-icon-star-line` | `Favoris` (action), `Garder en favori`, `Sauvegarder en favori(s)` |
| Copier le code d'intégration | **Copier le code** | secondaire | `fr-icon-clipboard-line` | `Copier` (contexte code), `Obtenir le code` |
| Repartir d'une base vierge | **Nouveau** | tertiaire | `fr-icon-add-line` | `Repartir de zéro` |
| Annuler les modifications en cours, revenir à l'état de départ | **Réinitialiser** | tertiaire | `fr-icon-refresh-line` | `Reinitialiser` |
| Recharger les données depuis leur source | **Actualiser** | tertiaire | `fr-icon-refresh-line` | `Rafraîchir` |
| Ouvrir l'objet dans une autre app | **Ouvrir dans ▾** | secondaire (menu) | `fr-icon-external-link-line` | `Playground`, `Pipeline`, `Ouvrir dans Dashboard`, `Utiliser dans le Builder` |
| Sortir un fichier | **Exporter ▾** | secondaire (menu) | `fr-icon-download-line` | `Exporter`, `Export CSV`, `Exporter HTML`, `Exporter vers Grist`, `PNG`, `JPG`, `Image` |
| Charger un fichier | **Importer** | secondaire | `fr-icon-upload-line` | — |
| Détruire | **Supprimer** | primaire *danger* (dans la confirmation) · icône seule dans les listes | `fr-icon-delete-bin-line` | `Retirer`, `Effacer` (objet) |
| Voir en grand | **Plein écran** | tertiaire | `fr-icon-fullscreen-line` | `Aperçu` (bouton Dashboard) |
| Lancer la visite | **Visite guidée** | tertiaire sans contour | `fr-icon-question-line` | `Visite guidee`, `?` |

Notes :

- **Générer** vs **Exécuter** : *Générer* quand l'utilisateur a rempli une configuration (formulaire,
  panneaux) et que l'app produit le rendu ; *Exécuter* quand l'utilisateur a écrit lui-même le
  code (Playground) ou assemblé un flux (Pipeline). Les deux partagent l'icône « play ».
- **Nouveau** vs **Réinitialiser** : *Nouveau* crée un objet vierge (Carto, Dashboard) ;
  *Réinitialiser* ramène l'objet en cours à son état de départ (Playground : recharger l'exemple ;
  Assistant IA : vider le formulaire de configuration).
- **Ouvrir dans ▾** et **Exporter ▾** sont des menus : leur libellé est fixe, ce sont les entrées
  du menu qui varient par app (§2.3).
- **Supprimer** en liste (favoris, lignes, nœuds) est un bouton icône avec `aria-label="Supprimer"`
  ou `"Supprimer <objet>"` ; le libellé visible « Supprimer » n'apparaît que dans la confirmation.

### 2.2 Extensions par app

Actions propres à une app, absentes du cœur. Elles suivent les mêmes règles de variante et
sont les seules admises en plus du cœur.

| App | Libellé | Variante | Geste |
|---|---|---|---|
| Sources | **Nouvelle connexion** | primaire | créer une connexion à une source distante |
| Sources | **Créer une source manuelle** · **Joindre deux sources** | secondaire | créer une source locale / une jointure |
| Sources | **Aperçu** (ligne de liste) | tertiaire | ouvrir l'aperçu d'une source dans le panneau |
| Assistant IA · Studio IA | **Envoyer** | primaire (zone de chat) | envoyer le message — geste primaire de l'app |
| Assistant IA · Studio IA | **Effacer la conversation** | tertiaire | vider l'historique du chat |
| Assistant IA | **Ajouter un paramètre** | tertiaire | ajouter une ligne au formulaire de configuration |
| Assistant IA | **Sonder les capacités** | tertiaire | interroger le gateway Albert |
| Playground | **Ajouter des dépendances** | tertiaire | injecter les balises CSS/JS nécessaires |
| Pipeline | **Ajouter une étape ▾** | secondaire (menu) | insérer un nœud (voir §7 pour les entrées) |
| Pipeline | **Réorganiser** · **Recentrer** | tertiaire | actions de canevas |
| Dashboard | **Ouvrir** | secondaire | charger un tableau de bord enregistré |
| Dashboard | **Ajouter une ligne** · **Ajouter une source** | secondaire | actions de composition |
| Favoris | **Partager** · **Renommer** | secondaire · icône | partage de lien, renommage |
| Favoris | **Révoquer le lien** | secondaire | supprimer un lien de partage |
| Admin | **Révoquer les sessions** | secondaire | déconnecter un utilisateur |
| Suivi | *(aucune)* | — | Exporter ▾ + Actualiser suffisent |

Toute nouvelle extension s'ajoute à ce tableau **dans la PR qui l'introduit**.

### 2.3 Entrées des menus par app

| App | Ouvrir dans ▾ | Exporter ▾ |
|---|---|---|
| Builder (Créer un graphique) | Playground · Pipeline · Tableau de bord | Image PNG · Image JPG |
| Carto (Créer une carte) | Playground · Pipeline | Image PNG · Image JPG |
| Dashboard (Créer un tableau de bord) | — | Page HTML · Image PNG · Image JPG |
| Assistant IA | Playground · Pipeline · Tableau de bord | Image PNG · Image JPG |
| Studio IA | Tableau de bord | Image PNG · Image JPG |
| Playground | Pipeline · Tableau de bord | Image PNG · Image JPG |
| Pipeline | Playground | — |
| Sources | Builder (« Utiliser dans le Builder » devient l'entrée *Builder*) | Grist · JSON |
| Favoris | Builder · Playground | JSON |
| Suivi | — | CSV |

Les entrées se nomment par la **destination** (nom de l'app cible) ou le **format** (nom du
fichier produit), jamais par un verbe.

### 2.4 Onglets du panneau d'aperçu

`Aperçu` · `Code` · `Données` · `JSON` — les deux derniers optionnels selon l'app, dans cet
ordre. Remplace `Code généré`, `Données brutes`, `Design`. Aucune action dans le tablist (lot 4).

## 3. Formes proscrites

Ces chaînes ne doivent plus apparaître dans une chaîne d'interface (contenu de balise, `title`,
`aria-label`, `textContent` posé par script). La liste alimente le lint du lot 3 ; elle est
appliquée mot entier, sensible à la casse quand indiqué.

| Forme proscrite | Remplacer par | Motif |
|---|---|---|
| `Sauvegarder`, `Sauvegarder config`, `Sauvegarder en favori(s)` | Enregistrer · Ajouter aux favoris | B2 |
| `Garder en favori` | Ajouter aux favoris | B2 |
| `Obtenir le code` | Copier le code | B2 |
| `Générer le graphique`, `Générer la carte` | Générer | B2 |
| `Repartir de zéro` | Nouveau | B2 |
| `Rafraîchir` | Actualiser | B2 |
| `Export CSV`, `Exporter HTML`, `Exporter vers Grist` | Exporter ▾ (entrée CSV / Page HTML / Grist) | B2 |
| `Ouvrir dans Dashboard`, `Utiliser dans le Builder` | Ouvrir dans ▾ (entrée) | C3 |
| `+ Deps` | Ajouter des dépendances | B2 |
| `Executer`, `Reinitialiser`, `Reorganiser`, `Visite guidee`, `Ajouter un parametre`, `Detail utilisateur`, `Generateur`, `Bibliotheque`, `Revoquer`, `Reference`, `generee` | forme accentuée | F1 |
| `Visual Dashboard Editor`, `Builder IA`, `ChartsBuilder`, `ChartBuilder`, `DSFR Chart` (comme nom du produit) | Charts builder / nom de page | F2 |

Règles non lintables, vérifiées en revue :

- `Favoris` seul désigne **la page**, jamais l'action (B3).
- `Copier` seul est admis hors contexte code (« Copier le lien ») ; pour le code, c'est
  toujours `Copier le code`.
- `Aperçu` est un onglet ou une action de liste, jamais un bouton « plein écran » (C2).
- `Effacer` seul est proscrit : `Effacer la conversation`, ou `Supprimer` pour un objet.
- `×` n'est jamais un nom accessible : tout bouton de fermeture est `fr-btn--close` avec le
  texte « Fermer » (B8/E4).

## 4. Règles de hiérarchie

1. **Une action primaire par écran**, jamais deux (Pipeline avait `Exécuter` + `Code`).
2. Une action jugée principale n'est **jamais** en secondaire ni tertiaire (Studio IA).
3. `fr-btn--tertiary-no-outline` est réservé aux **liens de navigation** et à `Visite guidée` ;
   jamais pour une action d'écriture ni pour une confirmation destructive.
4. **Une même action porte la même variante partout** (`Exporter ▾` : secondaire sur Sources,
   Favoris, Suivi, Dashboard).
5. **Trois secondaires visibles au maximum** ; au-delà, menu `Plus ▾`
   (`fr-btn--tertiary` + `fr-icon-more-line`).
6. Plusieurs familles d'actions dans une même barre → un `role="group"` + `aria-label` par
   famille, séparés visuellement (Pipeline : ajout d'étapes / canevas / sortie).
7. **Tailles** : `fr-btn--sm` dans toute barre d'outils d'éditeur, taille md dans les formulaires
   et les modales, `fr-btn--lg` réservé au hero de l'accueil.
8. **Cibles** ≥ 24 × 24 px pour tout élément interactif (WCAG 2.5.8), y compris les boutons icône.
9. **Actions destructives** : toujours via `ConfirmDialog` (§8) ; le bouton déclencheur en liste
   est tertiaire ou icône, jamais adjacent à l'action primaire.
10. **État désactivé** : l'action primaire est `disabled` + `aria-disabled="true"` tant que les
    prérequis manquent, avec la raison en `aria-describedby` (« Sélectionnez une source pour
    générer »). Un traitement en cours passe le bouton en état chargement (icône remplacée par
    un spinner, libellé conservé, `aria-busy="true"`).

## 5. Composant `AppActionBar`

Une seule barre par app éditeur, **en haut à droite de la zone de travail**, sous le header et
au-dessus du contenu. Composant `app-action-bar` dans `packages/app-ui` (lot 2, #539).

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  <h1 de la zone de travail>          [tertiaires] [secondaires] [PRIMAIRE]    │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Contrat

- `role="toolbar"` + `aria-label="Actions de la page"` ; navigation aux flèches gauche/droite,
  `Home`/`End`, un seul élément tabbable (roving tabindex).
- **Une seule action primaire**, toujours à l'extrême droite.
- Ordre de gauche à droite : tertiaires (Visite guidée, Réinitialiser, Nouveau, Plein écran…),
  puis secondaires (3 max), puis `Plus ▾` si débordement, puis la primaire.
- Taille `fr-btn--sm` pour tous les boutons.
- Les menus (`Ouvrir dans ▾`, `Exporter ▾`, `Plus ▾`) suivent le patron DSFR
  `fr-translate`/`fr-menu` ou un `role="menu"` complet (flèches, Échap, focus restitué).
- `flex-wrap` autorisé ; **sous 768 px** la barre devient collante en bas d'écran
  (`position: sticky; bottom: 0`) avec la primaire + `Plus ▾` regroupant tout le reste.
- La barre expose `disabled-reason` pour la primaire (§4.10) et `busy` pour l'état chargement.
- Apps conversationnelles : la barre n'a pas de primaire « Générer » ; l'envoi du chat reste le
  geste primaire dans sa zone. Studio IA garde `Enregistrer` comme primaire de la barre.

### 5.2 Répartition cible par app

| App | Primaire | Secondaires (≤ 3) | Tertiaires |
|---|---|---|---|
| Créer un graphique | Générer | Copier le code · Ajouter aux favoris · Ouvrir dans ▾ | Visite guidée · Réinitialiser · Exporter ▾ *(Plus ▾)* |
| Créer une carte | Générer | Copier le code · Ajouter aux favoris · Ouvrir dans ▾ | Visite guidée · Nouveau · Exporter ▾ *(Plus ▾)* |
| Créer un tableau de bord | Enregistrer | Ouvrir · Exporter ▾ · Ajouter aux favoris | Visite guidée · Nouveau · Plein écran |
| Assistant IA | *(envoi du chat)* | Copier le code · Ajouter aux favoris · Ouvrir dans ▾ | Visite guidée · Effacer la conversation · Exporter ▾ *(Plus ▾)* |
| Studio IA | Enregistrer | Copier le code · Ouvrir dans ▾ · Exporter ▾ | Visite guidée · Effacer la conversation |
| Playground | Exécuter | Copier le code · Ajouter aux favoris · Ouvrir dans ▾ | Visite guidée · Réinitialiser · Ajouter des dépendances · Exporter ▾ *(Plus ▾)* |
| Pipeline | Exécuter | Copier le code · Ouvrir dans ▾ · Ajouter une étape ▾ | Visite guidée · Réorganiser · Recentrer |
| Sources | Nouvelle connexion | Importer · Exporter ▾ | Visite guidée |
| Favoris | — | Importer · Exporter ▾ | — |
| Suivi | — | Exporter ▾ | Actualiser |

*(Plus ▾)* : entrées reléguées dans le menu `Plus ▾` quand la barre dépasse 3 secondaires.

### 5.3 Usage (`packages/app-ui`)

Les boutons restent en Light DOM avec leurs ids et leurs écouteurs (ADR-096) ; l'attribut
`slot` donne le rang, le composant déplace, normalise les classes (`fr-btn fr-btn--sm` +
variante du rang) et gère le débordement vers `Plus ▾` et le mode mobile.

```html
<app-action-bar heading="Playground" disabled-reason="">
  <button slot="tertiary" id="tour-btn" data-variant="no-outline" class="fr-icon-question-line fr-btn--icon-left">Visite guidée</button>
  <button slot="tertiary" id="reset-btn" class="fr-icon-refresh-line fr-btn--icon-left">Réinitialiser</button>
  <app-menu slot="tertiary" label="Exporter">
    <button id="export-png-btn">Image PNG</button>
    <button id="export-jpg-btn">Image JPG</button>
  </app-menu>
  <button slot="secondary" id="copy-btn" class="fr-icon-clipboard-line fr-btn--icon-left">Copier le code</button>
  <button slot="secondary" id="save-btn" class="fr-icon-star-line fr-btn--icon-left">Ajouter aux favoris</button>
  <app-menu slot="secondary" label="Ouvrir dans">
    <button id="pipeline-btn">Pipeline</button>
  </app-menu>
  <button slot="primary" id="run-btn" class="fr-icon-play-line fr-btn--icon-left">Exécuter</button>
</app-action-bar>
```

- `heading` → `<h1>` de la zone de travail (remplace le bandeau `.app-page-head` du lot 1).
- `disabled-reason="…"` → primaire `disabled` + `aria-disabled` + raison affichée et reliée par
  `aria-describedby` ; `busy` → `aria-busy` et icône qui tourne ; `max-secondary` (3).
- `bar.addAction(el, rank)` / `bar.removeAction(el)` / `bar.refresh()` pour les boutons créés
  par script ; `menu.addItem(el)` / `menu.takeItems()` côté `<app-menu>`.
- Un `<app-menu>` replié dans `Plus ▾` y verse ses entrées telles quelles (pas de sous-menu).

### 5.4 Primitives de boutons (`packages/app-ui/src/app-primitives.ts`, lot 5)

Tout bouton texte est un `fr-btn*` DSFR (fermetures : `fr-btn--close`, onglets : `fr-tabs`,
puces cliquables : `fr-tag`). Deux besoins n'ont pas d'équivalent DSFR et sont normalisés sur
les tokens du DSFR, avec `:hover`, `:focus-visible` et `:disabled` garantis :

| Primitive | Usage | Variantes |
|---|---|---|
| `app-btn--icon` | bouton icône seule, cible ≥ 32×32 px (`--sm` : 24×24, minimum WCAG 2.5.8). Nom accessible par `title` ou `aria-label`, icône `aria-hidden`. | `--sm`, `--muted` (gris jusqu'au survol), `--danger` |
| `app-card-choice` | carte cliquable : tuile de type de graphique, jeu d'exemple, choix d'onboarding, zone d'ajout. Sélection via `aria-pressed="true"` (ou `.selected`). | `--compact` (colonne centrée), `--dashed` (zone d'ajout), `--featured` |

Les anciennes classes maison (`chart-type-btn`, `sample-dataset-card`, `carto-choice`,
`row-control-btn`…) ne portent plus de style de boîte ; elles restent comme ancres de tests et de
logique. Recette : `e2e/buttons.spec.ts` (aucun bouton hors DSFR/primitives, aucune cible < 24 px,
focus visible au clavier) sur les 14 pages.

### 5.5 Ce que la barre remplace (à supprimer au lot 2)

`builder-footerbar`, `carto-topbar__actions`, `vde-toolbar-right`, `editor-toolbar` (Playground),
`studio-toolbar`, la partie « sortie » de `pipeline-toolbar`, les boutons `preview-panel-action-btn`
du tablist (Playground · Favoris · Image).

## 6. Titres et navigation (lot 1)

- `<title>` : `Charts builder — <Nom de page>` (tiret cadratin, produit d'abord) sur toutes les
  pages de l'application. Les pages de la bibliothèque (specs des composants) gardent
  `dsfr-data`.
- Un `<h1>` unique et visible par page ; sur les éditeurs, c'est le titre de la zone de travail
  porté par l'AppActionBar.
- `aria-current="page"` sur l'entrée de nav active, header `position: sticky`.
- Fil d'Ariane (`fr-breadcrumb`) sur les pages plein cadre : Sources, Favoris, Suivi, Admin, Guide.
- Noms de page canoniques : Accueil · Sources · Assistant IA · Studio IA · Créer un graphique ·
  Créer une carte · Créer un tableau de bord · Playground · Pipeline · Suivi · Admin · Favoris ·
  Guide · Composants · Feuille de route.

## 7. Nœuds Pipeline

Les nœuds portent un **libellé français** et affichent le **nom du composant** en `<code>` dans
la carte du nœud. Les types internes (`source`, `normalize`, `query`…) ne changent pas.

| Type interne | Libellé | Composant affiché |
|---|---|---|
| `source` | Source | `dsfr-data-source` |
| `normalize` | Normaliser | `dsfr-data-normalize` |
| `query` | Requêter | `dsfr-data-query` |
| `join` | Joindre | `dsfr-data-join` |
| `search` | Rechercher | `dsfr-data-search` |
| `facets` | Facettes | `dsfr-data-facets` |
| `a11y` | Accessibilité | `dsfr-data-a11y` |
| `output` | Sortie | *(composant d'affichage choisi)* |

Le menu `Ajouter une étape ▾` liste ces libellés dans cet ordre.

## 8. Confirmation et fermeture (lot 6)

- `ConfirmDialog` unique (consolider `confirmDialog()` de `packages/shared/src/ui/modal.ts`) :
  titre = question, corps = conséquence, bouton de confirmation en **primaire danger** avec le
  verbe de l'action (« Supprimer »), `Annuler` en secondaire, **focus initial sur Annuler**,
  Échap ferme, focus restitué au déclencheur.
- Fermeture de modale : `fr-btn--close` DSFR, texte « Fermer ».
- Suppressions sans filet à équiper : nœud Pipeline, ligne/colonne Dashboard, cellule Sources.

## 9. Lint de libellés (lot 3)

`npm run check:accents` (`scripts/check-french-accents.sh`) devient **bloquant** et vérifie,
sur le contenu des balises HTML (fichiers `.html` et templates embarqués dans les `.ts`) :

1. les mots français sans accent (liste existante, étendue avec §3 ligne F1), dans le contenu
   des balises ;
2. les formes proscrites de §3, dans le contenu des balises **et** dans les valeurs entre
   guillemets (attributs `title`/`aria-label`, littéraux JS) — un libellé posé par script est
   aussi une chaîne d'interface.

Formes proscrites **reportées** tant que l'AppActionBar n'existe pas (lots 2/4), parce qu'elles
deviennent des entrées de menu : `Export CSV`, `Exporter HTML`, `Exporter vers Grist`,
`Ouvrir dans Dashboard`, `Utiliser dans le Builder`. Elles entrent dans le lint avec le lot qui
les remplace.

Les artefacts générés (`skills-reference.generated.ts`, `custom-elements.json`) sont corrigés à
la source (JSDoc, générateur), jamais exclus du lint.

## 10. Checklist de recette (extrait de l'audit §8, partie « Actions »)

- [ ] Un seul `[role=toolbar]` par éditeur, en haut à droite, position identique d'une app à l'autre
- [ ] Exactement une action primaire par écran
- [ ] Seuls les libellés de §2 sont employés pour les actions
- [ ] `Exporter ▾` a la même variante sur Sources, Favoris, Suivi et Dashboard
- [ ] Lint de libellés vert et bloquant
- [ ] L'action primaire est désactivée avec explication tant que les prérequis manquent
