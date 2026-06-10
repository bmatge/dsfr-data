# Audit UX — chartsbuilder.matge.com

**Date** : 2026-05-26
**Auditeur** : UX auditor (Claude, mode agent)
**Périmètre** : Hub (`/`), Sources (`/apps/sources/`), Builder (`/apps/builder/`)
**Personas** : Marie (P1, chargée comm web, novice dataviz) & Sami (P2, data analyst expert)

---

## 1. Résumé exécutif

L'application est globalement bien structurée et conforme DSFR. Le Builder dispose d'une vraie qualité pédagogique (visite guidée 5 étapes, progress indicator dans l'aperçu, tooltips d'aide riches sur les contrôles clés, validation actionable). Le **mode avancé** caché derrière un toggle est une bonne idée de progressive disclosure.

Cependant, le **double usage P1 / P2 n'est pas tenu** sur plusieurs points-clés :

1. **Critique — Le test de connexion API est silencieux.** Quand l'URL est invalide (404), aucun message d'erreur ; quand elle est valide mais paginée à l'infini, l'app boucle jusqu'à 100 pages sans bouton stop ni preview rapide. Marie est bloquée à coup sûr, Sami perd patience. Cf. §5 / §5-Critique-2.
2. **Critique — Jargon technique non protégé pour P1.** "Endpoint JSON", "Bearer xxx", "En-têtes", "Chemin JSON", "DataBox", "ODSQL/colon", "sequentialAscending", `<dsfr-data-query>` exposés en clair dans l'UI. Aucun mode "URL simple" auto-détectant. Marie décroche à l'écran "Nouvelle connexion API".
3. **Majeur — Filtres mode avancé en DSL textuel.** Le mode avancé n'offre qu'un input texte avec la syntaxe `champ:operateur:valeur`. Sami doit lire la doc des opérateurs ; Marie ne s'en sortira jamais. Manque d'un constructeur de filtres visuel (3 dropdowns).
4. **Majeur — Pas d'édition d'une source manuelle.** Une fois sauvegardée, une typo dans une cellule oblige à supprimer la source et recommencer. Le CSS prévoit un `.edit-source-btn` mais le code JS ne l'implémente pas.
5. **Majeur — Absence de catalogue de sources publiques.** Le hub promet "API OpenDataSoft, Tabular (data.gouv.fr), Melodi (INSEE), Grist". L'app Sources n'offre que deux types ("Grist" et "API REST/JSON"), sans templates pré-remplis. Marie qui n'a pas d'URL toute prête est démunie.

**Verdict** : l'app est **prête pour Sami** moyennant quelques ajustements d'ergonomie (feedback, constructeur de filtres). Elle ne l'est **pas pour Marie** sans un mode "débutant" qui (a) masque le jargon, (b) propose un catalogue de sources prédéfinies, (c) ajoute des aperçus visuels (palettes, types de graphique), (d) donne du feedback à chaque action.

Sept points sont aussi à corriger de façon transverse : **les accents français manquent systématiquement** dans tout le code interface (libellés, tooltips, validations) — "donnees", "categorie", "agreger", "previsualiser", "Genere", "Apercu". Cela donne une impression d'amateurisme dérangeante sur un produit qui se présente "conforme DSFR".

---

## 2. Méthodologie

- Lecture préalable de `CLAUDE.md`, `apps/sources/index.html`, `apps/builder/index.html`, `apps/builder/src/ui/help-texts.ts`.
- Navigation live sur le site avec un viewport Chrome 1400×698 desktop.
- Parcours simulé Marie (novice) : création d'une source manuelle JSON simple → builder → graphique en barres → copie du code.
- Parcours simulé Sami (expert) : connexion API tabular-api.data.gouv.fr, exploration du mode avancé, palette personnalisée, code généré.
- Inspection du code source quand le comportement nécessitait vérification (édition source manuelle, limites de pagination).

**Limites** :
- Le mécanisme de capture d'écran disque du tool MCP Chrome n'a pas permis d'exporter les screenshots vers le dossier `screenshots/`. Les captures ont été examinées en live ; le rapport décrit les écrans observés au lieu de les illustrer.
- Pas de test sur mobile (le rendu mobile a été aperçu involontairement avec un viewport de 346 px mais n'est pas dans le périmètre demandé).
- L'app builder-IA, dashboard, playground, favorites, monitoring sont hors périmètre.
- Pas d'évaluation WCAG/RGAA (hors périmètre).

---

## 3. Personas rappelés

- **P1 — Marie** : chargée de comm web ministérielle, à l'aise CMS, néophyte dataviz. Veut produire un graphique simple à partir d'un fichier/URL fourni, et coller le code dans son CMS.
- **P2 — Sami** : data analyst, SQL/Python OK. Veut un widget DSFR sans monter une stack front. Veut accès aux filtres complexes, palette custom, code modifiable.

---

## 4. Page d'accueil (Hub) — `/`

### Constat général

La home a un hero clair avec un grand titre "Créez des visualisations conformes au Design System de l'État", deux CTA ("Créer un graphique" / "Démarrer avec l'IA"), une bande de 3 étapes (01 CONNECTER / 02 CONFIGURER / 03 EXPORTER), et un panneau de prévisualisation qui fait défiler 4 exemples de composants (KPI / Podium / Liste / Carte du monde). En dessous, une grille de 9 outils.

Globalement très propre, on identifie immédiatement la fonction du produit.

### Sévérité : Suggestion

#### S-H-1 — La grille "Tous les outils" expose trop d'options pour P1
- **Pages** : Hub
- **Persona** : P1
- **Observation** : Sous "Tous les outils — 9 modules · démarrez par le plus proche de votre besoin", on a 9 cards en 3 colonnes : Sources, Assistant IA, Créer un graphique (badge "Populaire"), Créer une carte, Créer un tableau, Playground, Pipeline, Suivi, Admin.
- **Pourquoi** : Marie qui veut juste "faire un graphique" voit 9 boutons. "Pipeline", "Suivi", "Admin", "Playground" sont des éléments outillage qui ne la concernent pas. Le badge "Populaire" sur "Créer un graphique" est trop discret pour orienter.
- **Recommandation** : Soit segmenter en 2 grilles ("Pour créer" / "Pour gérer"), soit n'afficher que les modules de création par défaut et masquer le reste derrière "Outils avancés (Playground, Pipeline, Suivi, Admin)".

#### S-H-2 — La carousel d'exemples chevauche les composants en mobile
- **Pages** : Hub
- **Persona** : les deux
- **Observation** : Sur un viewport étroit (≈ 346 px), la carousel "Indicateurs clés" se superpose visuellement à la carte du monde (les valeurs "144,6" / "74,8" / "99,26" apparaissent par-dessus le rendu monde). Le défilement entre slots ne masque pas correctement les composants précédents.
- **Pourquoi** : impression de bug. Marie qui découvre le produit sur un téléphone perd confiance.
- **Recommandation** : revoir le `display: none` ou `visibility: hidden` sur `.chart-slot:not([data-active="true"])` — le CSS actuel utilise `opacity: 0 + pointer-events: none` mais semble ne pas appliquer `visibility: hidden` correctement sur certains slots.

#### S-H-3 — "BETA 0.7.0" comme badge à côté du titre principal peut effrayer
- **Pages** : Hub (header)
- **Persona** : P1
- **Observation** : Dans le header DSFR de toutes les pages, le badge orange "BETA 0.7.0" est visible.
- **Pourquoi** : pour Marie sur un site officiel, le label "BETA" suggère "instable / je ne dois pas l'utiliser en prod". Pour Sami, c'est rassurant.
- **Recommandation** : remplacer "BETA" par "Aperçu" (moins technique) ou conserver mais ajouter un tooltip "Outil en évolution, vos exports restent stables".

#### S-H-4 — La promesse de sources "Huwise/ODS, Tabular, Melodi" n'est pas tenue dans Sources
- **Pages** : Hub → Sources
- **Persona** : P1
- **Observation** : Le lead de la home dit : "Connectez vos sources (API OpenDataSoft, Tabular (data.gouv.fr), Melodi (INSEE), Grist, ou données manuelles)". Mais une fois sur Sources, on n'a que deux choix : "Grist" ou "API REST/JSON". Pas de catalogue ni de templates pour OpenDataSoft, Tabular, Melodi.
- **Pourquoi** : Marie cherche "Comment ajouter Tabular ?" → ne trouve pas. Pour Sami c'est OK car il sait passer par "API REST/JSON" avec la bonne URL.
- **Recommandation** : ajouter dans la modale "Nouvelle connexion" un 3ᵉ choix "Source publique connue" qui liste : data.gouv.fr (Tabular), OpenDataSoft (instance par défaut + champ instance), INSEE Melodi. Avec une recherche dans le catalogue.

---

## 5. Page Sources — `/apps/sources/`

### Constat général

Layout en colonne gauche (Connexions + Mes sources + Exporter/Importer) et zone droite (explorateur + aperçu). Une visite guidée en 3 étapes se déclenche au premier accès. Trois modes pour créer une source manuelle (Tableau / Coller JSON / Importer CSV). Une modale "Joindre deux sources" pour les jointures.

### Sévérité : Critique

#### C-S-1 — "Tester et sauvegarder" ne donne **aucun feedback** quand l'URL échoue
- **Pages** : Sources → modale Nouvelle connexion (API)
- **Personas** : les deux
- **Observation reproductible** : avec l'URL `https://tabular-api.data.gouv.fr/api/resources/64fec43d-1edd-449d-89b4-44dc8e8a0b54/data/` (qui retourne 404), le bouton "Tester et sauvegarder" ne montre :
  - aucun loader / spinner,
  - aucun changement d'état du bouton (texte fixe "Tester et sauvegarder"),
  - aucun toast d'erreur,
  - aucun message dans le DOM.
  La modale reste figée. Pas d'erreur console capturée non plus.
- **Pourquoi** : Marie reclique 3 fois, croit que c'est cassé, abandonne. Sami se demande s'il est connecté ou non.
- **Recommandation** :
  1. Pendant le test : disabler le bouton + texte "Test en cours..." + spinner.
  2. À l'échec : toast d'erreur DSFR avec le code HTTP et un message actionnable ("L'URL n'a pas répondu (404). Vérifiez l'orthographe ou que la ressource existe.").
  3. À la réussite : toast vert "Connexion testée. 12 enregistrements détectés. Sauvegardée." puis fermer la modale.

#### C-S-2 — Pagination automatique sans plafond visible (boucle jusqu'à 100 pages)
- **Pages** : Sources → exploration d'une source API
- **Personas** : les deux
- **Observation reproductible** : avec une URL paginée comme `https://www.data.gouv.fr/api/2/datasets/?page_size=10`, l'app affiche "Chargement... (page 12)" puis "Chargement... (page 42)" puis continue. Le code (`apps/sources/src/connections/api-explorer.ts:53`) plafonne à 100 pages, sans :
  - bouton "Stop",
  - estimation du temps restant,
  - aperçu rapide après la première page,
  - choix initial "Charger 1 page" vs "Tout charger".
- **Pourquoi** : Marie attend 30+ secondes sans comprendre. Sami n'a aucun contrôle. Sur des APIs publiques avec des centaines de milliers d'objets, l'expérience est désastreuse.
- **Recommandation** :
  1. Charger uniquement la première page par défaut + bouton "Charger plus".
  2. Si la pagination est détectée, afficher une bannière "X enregistrements chargés (page Y/N). [Charger tout] [Limiter à N pages]".
  3. Bouton "Stop" toujours visible pendant un chargement.
  4. Plafond par défaut = 5 pages (plus que largement suffisant pour l'aperçu).

### Sévérité : Majeur

#### M-S-1 — Jargon technique dans la modale "Nouvelle connexion API"
- **Pages** : Sources → Nouvelle connexion → API REST/JSON
- **Persona** : P1
- **Observation** : tous les libellés exposent du jargon dev :
  - **"URL de l'API"** + hint **"URL complète de l'endpoint JSON (ex: https://api.example.com/data)"** → "endpoint" = jargon.
  - **"Méthode HTTP"** avec choix GET/POST → jargon HTTP.
  - **"En-têtes (optionnel)"** + hint **'Format JSON. Ex: {"Authorization": "Bearer xxx"}'** → "Authorization", "Bearer", "JSON" = jargon empilé.
  - **"Chemin vers les données (optionnel)"** + hint **"Chemin JSON vers le tableau de données (ex: data.items, results)"** → jargon dotted-path.
- **Pourquoi** : Marie qui veut juste coller une URL pleine de données ne peut pas faire la différence entre "URL complète de l'endpoint JSON" et "URL de la page web". Elle ne sait pas ce que "Bearer" veut dire.
- **Recommandation** :
  1. Mode "URL simple" par défaut : un seul champ "URL des données" avec auto-détection (GET, content-type JSON, scan des clés pour trouver le tableau de données).
  2. Toggle "Options avancées" qui révèle Méthode HTTP, En-têtes, Chemin vers les données — réservé à Sami.
  3. Remplacer "endpoint JSON" par "page d'API qui renvoie des données" dans le hint.
  4. Pour les en-têtes : un éditeur clé/valeur (deux inputs) plutôt qu'un JSON brut.

#### M-S-2 — Pas de catalogue de sources publiques (data.gouv, OpenDataSoft, INSEE Melodi)
- **Pages** : Sources → Nouvelle connexion
- **Personas** : P1 surtout
- **Observation** : on n'a que deux types ("Grist" / "API REST/JSON"). Pas de raccourci pour data.gouv.fr ni OpenDataSoft ni Melodi, alors que les adapters du `packages/core` les supportent nativement et que la home les promet.
- **Pourquoi** : Marie qui a "un dataset data.gouv qu'on lui a recommandé" ne sait pas quel type choisir, ni l'URL exacte à mettre. Les utilisateurs ne connaissent pas les endpoints exacts par cœur.
- **Recommandation** : ajouter un type "Catalogue public" avec :
  - data.gouv.fr (recherche par nom de dataset → résolution automatique de l'URL Tabular),
  - opendatasoft.com et instances ministérielles (avec liste préremplie : data.economie.gouv.fr, data.education.gouv.fr...),
  - INSEE Melodi.

#### M-S-3 — Impossible d'éditer une source manuelle après création
- **Pages** : Sources → Mes sources
- **Persona** : P1
- **Observation** : une fois une source manuelle créée via le mode Tableau / JSON / CSV, on peut la sélectionner et la supprimer, mais **pas l'éditer**. Le CSS `.edit-source-btn` existe dans `apps/sources/src/styles/sources.css:338` mais aucun code TypeScript ne le crée ni ne le gère.
- **Pourquoi** : Marie tape "12 000" au lieu de "120 000", elle doit refaire toute la source.
- **Recommandation** : ajouter une icône crayon à côté de l'icône poubelle de chaque source. Au clic : rouvrir la modale "Nouvelle source manuelle" pré-remplie en mode édition.

#### M-S-4 — La modale "Joindre deux sources" expose la sémantique SQL sans pédagogie
- **Pages** : Sources → Joindre deux sources
- **Persona** : P1
- **Observation** : les labels sont :
  - **"Source gauche (principale)"** / **"Source droite"** → vocabulaire SQL pur,
  - **"Cle de jointure"** + hint **"Si les noms different : champ_gauche=champ_droite"** → cryptique,
  - **"Type de jointure"** : Left / Inner / Right / Full → terme SQL,
  - **"Prefixe des champs droite (en cas de collision)"** + hint **'Evite les conflits de noms : "budget" → "right_budget"'** → cryptique.
- **Pourquoi** : Marie ne sait pas la différence entre Left et Inner.
- **Recommandation** :
  1. Remplacer Left/Inner/Right/Full par des descriptions :
     - Left → "Garder toutes les lignes de la source A, compléter avec B si possible (recommandé)",
     - Inner → "Garder uniquement les lignes présentes dans A et dans B",
     - etc.
  2. Renommer "Cle de jointure" → "Colonne commune aux deux sources (ex : code_dept)".
  3. Renommer "Source gauche / droite" → "Source A (principale) / Source B".

### Sévérité : Mineur

#### m-S-1 — La visite guidée se déclenche sans connexion existante
- **Pages** : Sources, premier accès
- **Persona** : les deux
- **Observation** : la step 3/3 "Explorer et previsualiser" dit "Selectionnez une connexion pour parcourir ses tables..." alors qu'il n'y a aucune connexion. Le tour devient théorique.
- **Recommandation** : conditionner les steps à l'état réel (skip step 3 si zéro connexion) ou changer le wording en "Une fois une connexion ajoutée, vous pourrez parcourir...".

#### m-S-2 — "Rafraîchir" sur une source manuelle n'a pas de sens
- **Pages** : Sources → preview d'une source manuelle
- **Persona** : P1
- **Observation** : le bouton "Rafraîchir" est affiché à droite du titre même pour les sources manuelles, alors qu'il n'y a aucune source distante à rafraîchir.
- **Recommandation** : masquer le bouton pour les sources de type `manual`.

#### m-S-3 — Le badge "Manuel" en violet ne suit pas la sémantique DSFR
- **Pages** : Sources → Mes sources (sidebar)
- **Persona** : Sami
- **Observation** : les badges (Manuel violet, API bleu, Grist vert) sont cohérents entre eux mais le violet n'est pas une couleur DSFR officielle.
- **Recommandation** : utiliser des badges DSFR officiels (`fr-badge--info`, `fr-badge--new`...).

#### m-S-4 — Pas de feedback à la sauvegarde de connexion réussie
- **Pages** : Sources → Nouvelle connexion → Tester et sauvegarder
- **Personas** : les deux
- **Observation** : à la réussite, la modale se ferme et l'aperçu se charge sans toast/notification disant "connexion sauvegardée".
- **Recommandation** : toast vert DSFR "Connexion 'Mon nom' ajoutée."

---

## 6. Page Builder — `/apps/builder/`

### Constat général

C'est la page la plus aboutie de l'app. Layout en deux panneaux : config à gauche (sections collapsibles avec résumé), aperçu/code/données à droite. Visite guidée 5 étapes. Empty state avec checklist progressive (✓ verts pour les étapes complétées). Tooltips d'aide riches sur les contrôles clés. Mode avancé optionnel.

### Sévérité : Critique

#### C-B-1 — "Sauvegarder en favoris" est silencieux, l'utilisateur ne sait pas si c'est fait
- **Pages** : Builder → header du preview panel → bouton "Favoris" (icône étoile)
- **Personas** : les deux
- **Observation reproductible** : on clique sur "Favoris" après un graphique généré. Aucune notification visible. L'icône étoile ne change pas. Le seul indice est le compteur "Favoris 1" qui apparaît dans la nav header globale — mais beaucoup d'utilisateurs ne le verront pas.
- **Pourquoi** : Marie clique 3 fois (et crée 3 favoris), Sami ne sait pas si c'est sauvegardé.
- **Recommandation** : toast "Graphique ajouté aux favoris. [Voir mes favoris]" + transformation de l'icône étoile en étoile pleine.

### Sévérité : Majeur

#### M-B-1 — Le mode avancé n'a pas de constructeur de filtres visuel
- **Pages** : Builder → Configuration des données → Mode avancé activé
- **Persona** : les deux (mais surtout P1)
- **Observation** : Une fois le toggle "Mode avance (filtres & requetes)" activé, on découvre :
  - un input texte **"Filtres"** avec hint **"Format : champ:operateur:valeur (separes par virgule)"** et placeholder `Ex: region:eq:Bretagne, population:gte:10000`,
  - un accordéon "Operateurs disponibles" qui liste `eq`, `neq`, `gt/gte`, `lt/lte`, `contains`, `in`, `isnull/isnotnull`,
  - deux inputs texte **"Regroupement personnalise"** et **"Agregations multiples"** avec d'autres mini-DSL.
- **Pourquoi** : c'est un **mini-DSL** que l'utilisateur doit apprendre par cœur. Sami va le tolérer ; Marie va abandonner. Aucune autocomplétion sur les noms de champs.
- **Recommandation** :
  1. Construire un mini formulaire visuel "Et / Ou" + 3 selects par règle (champ / opérateur en langage naturel / valeur). Mode debutant.
  2. Garder l'input texte en parallèle, en mode "Power user" (toggle).
  3. Autocompléter les noms de champs disponibles dans la source.
  4. Renommer les opérateurs : `eq` → "égal à", `gt` → "supérieur à", etc.

#### M-B-2 — "Habillage DataBox" : le label est obscur
- **Pages** : Builder → section "Habillage DataBox"
- **Persona** : P1
- **Observation** : la section s'appelle "Habillage DataBox" et contient une checkbox "Activer la DataBox DSFR". Le tooltip d'aide explique correctement : "Encadre le graphique dans une boite avec titre, source, date et boutons (telechargement, plein ecran). C'est le style officiel DSFR pour presenter des donnees." Mais le **label** ne dit rien.
- **Pourquoi** : Marie passe sa souris sans cliquer sur "(?)", voit "DataBox" et ne sait pas si c'est ce qu'elle veut. C'est le nom interne du composant qui fuite.
- **Recommandation** : renommer la section en **"Cadre officiel DSFR (titre, source, téléchargement)"** ; conserver "DataBox" en sous-titre technique pour Sami si besoin.

#### M-B-3 — La palette "sequentialAscending" est exposée brute
- **Pages** : Builder → résumé de la section Apparence (quand collapsée)
- **Persona** : les deux
- **Observation** : quand on change le type de graphique en "Carte", la palette par défaut devient "sequentialAscending" et ce nom apparaît tel quel dans le résumé de la section Apparence (à droite du titre). Dans le dropdown "Palette de couleurs", les options sont : "Bleu France", "Categorielle", "Sequentielle ↑", "Sequentielle ↓", "Divergente ↑", "Divergente ↓", "Neutre".
- **Pourquoi** : "sequentialAscending" est le nom de la variable interne, qui leak. Et même les noms français ("Sequentielle ↑") sont du jargon dataviz.
- **Recommandation** :
  1. Dans le résumé : mapper sur le label affiché ("Séquentielle ↑").
  2. Pour chaque option, ajouter un **swatch visuel** de 5-7 couleurs (mini-aperçu).
  3. Mots plus parlants pour P1 : "Dégradé clair → foncé", "Comparaison de catégories", "Du froid au chaud".

#### M-B-4 — La section "Configuration des données" mélange labels jargon et labels accessibles
- **Pages** : Builder → Configuration des données
- **Persona** : P1
- **Observation** :
  - "Axe X / Catégories" + hint "Le champ pour les etiquettes (ex : region, annee)" → mix "Axe X" (math) + "Catégories" + "etiquettes" (jargon dataviz).
  - "Axe Y / Valeurs (Série 1)" + hint "Le champ numerique a mesurer (ex : population, budget)" → idem.
  - "Si plusieurs lignes par categorie, agreger par" → **excellent, pédagogique, en langage naturel**.
  - "Trier par" / "Ordre" → OK.
- **Pourquoi** : on a deux niveaux de qualité de rédaction. Quand Marie tombe sur "Axe X / Catégories", elle ne sait pas s'il faut chercher quelque chose d'horizontal ou de typologique.
- **Recommandation** : harmoniser sur le niveau "naturel" (qui est déjà la meilleure pratique de l'app) :
  - "Axe X / Catégories" → **"À regrouper par"** ou **"Étiquettes (axe horizontal)"**.
  - "Axe Y / Valeurs (Série 1)" → **"Valeur à mesurer"** (avec "Série 1" en muted, n'apparaît qu'à partir de la 2e série).

#### M-B-5 — Le code généré utilise `<bar-chart>` (DSFR Chart externe) au lieu de `<dsfr-data-chart>`
- **Pages** : Builder → onglet "Code genere" (pour le type bar)
- **Persona** : P2
- **Observation** : le code généré inclut `<bar-chart id="chart" x='...' y='...' name='["population"]' selected-palette="default">` qui est le composant DSFR Chart officiel, et non `<dsfr-data-chart>` annoncé dans le `CLAUDE.md`. Trois CDN sont chargés en parallèle : `@gouvfr/dsfr`, `@gouvfr/dsfr-chart`, et `dsfr-data`.
- **Pourquoi** : pour Sami qui copie le code, c'est trois dépendances CDN à charger pour un graphique en barres simple — alourdi inutilement. Pour Marie, c'est invisible mais l'embed sera plus lourd.
- **Recommandation** : si `<dsfr-data-chart>` couvre déjà le type bar, l'utiliser et retirer la dépendance `@gouvfr/dsfr-chart`. À défaut, documenter clairement quand on dépend de l'un ou l'autre.

#### M-B-6 — Toutes les sections collapsibles sont fermées par défaut
- **Pages** : Builder → sidebar config
- **Persona** : P1
- **Observation** : seule "Source de donnees" est ouverte au chargement. Type, Configuration, Apparence, DataBox, Accessibilité — tout est fermé. L'utilisateur doit cliquer sur chaque section pour la révéler. Le progress indicator "à compléter" en orange aide mais reste passif.
- **Pourquoi** : Marie qui a une source pré-sélectionnée ne sait pas qu'il faut ensuite ouvrir "Type" puis "Configuration".
- **Recommandation** : ouvrir automatiquement la section suivante quand la précédente est complétée. Ou ouvrir toutes les sections par défaut et utiliser un design d'accordéon "scroll-spy" comme dans Stripe.

### Sévérité : Mineur

#### m-B-1 — La visite guidée mentionne des "cartes d'exemple" qui n'existent pas
- **Pages** : Builder → tour étape 1/5
- **Persona** : les deux
- **Observation** : le tooltip 1/5 dit "Commencez ici : choisissez une source de donnees existante, ou cliquez sur une des cartes d'exemple pour essayer tout de suite." Or aucune "carte d'exemple" n'apparaît dans la sidebar — il n'y a qu'un select.
- **Recommandation** : ajouter de vraies cartes d'exemple (3-4 datasets démos pré-configurés) ou retirer cette mention.

#### m-B-2 — "Validation" affiche "axe Y" plutôt que le libellé visible
- **Pages** : Builder → bas du panneau quand l'axe Y n'est pas sélectionné
- **Persona** : P1
- **Observation** : message "Il manque : le champ numerique (axe Y)." Or à l'écran, le label affiché est "Axe Y / Valeurs (Série 1)".
- **Recommandation** : harmoniser → "Il manque : le champ Valeurs (Série 1)" et lier (cliquable) au control.

#### m-B-3 — Le bouton "Generer le graphique" en bas reste séparé de l'action immédiate
- **Pages** : Builder
- **Persona** : les deux
- **Observation** : Une fois tous les champs renseignés, l'aperçu se génère **automatiquement** (vu en live : changer le champ Y fait apparaître le graphique sans cliquer sur "Generer"). Le bouton "Generer le graphique" en bas semble donc redondant — ou alors il déclenche un autre comportement qui n'est pas évident.
- **Recommandation** : soit retirer le bouton (l'aperçu se met à jour en temps réel), soit clarifier "Régénérer / Valider / Exporter".

#### m-B-4 — Pas de retour visuel sur "Copier le code"
- **Pages** : Builder → onglet "Code genere" → bouton "Copier le code"
- **Personas** : les deux
- **Observation** : non testé en live (réservé pour focus). À vérifier : le bouton change-t-il en "Copié ✓" pendant 2s ?
- **Recommandation** : si pas fait, ajouter feedback "Copié dans le presse-papier ✓" pendant 2 secondes.

#### m-B-5 — Le résumé en haut de section "Type de graphique" affiche "Barres verticales" mais le bouton actif est "Barres"
- **Pages** : Builder → section "Type de graphique" collapsée
- **Persona** : P2 (cohérence)
- **Observation** : header du résumé : "Barres verticales". Bouton sélectionné dans la grille : "Barres". Disparité mineure.
- **Recommandation** : aligner les deux libellés.

#### m-B-6 — Carte départementale : pas de validation si la source n'a pas de codes département
- **Pages** : Builder → type "Carte" + source sans champ ressemblant à un code INSEE
- **Persona** : P1
- **Observation** : on peut sélectionner "Carte départementale" avec une source qui contient des noms de régions ("Île-de-France"...) mais pas de codes département. Le select "Code departement" reste vide, sans message expliquant que "votre source ne contient pas de codes INSEE — la carte ne fonctionnera pas".
- **Recommandation** : détecter et afficher un warning "Cette source ne contient pas de champ ressemblant à un code département (01-95, 2A, 2B, 971-976). Convertissez vos noms en codes ou choisissez un autre type de graphique."

---

## 7. Recommandations transverses

### T-1 — Accents français manquants partout dans l'UI
- **Severité** : Majeur (transverse)
- **Constat** : les labels, hints, tooltips, validations sont systématiquement écrits **sans accents** : "donnees", "categorie", "agreger", "Genere", "Apercu", "Telechargement", "Cle", "ecran", "previsualiser". Le code `apps/builder/src/ui/help-texts.ts` utilise ` ` (espace insécable) mais pas `é` pour les `é`, ce qui est probablement un choix d'encodage volontaire (éviter de stocker des accents dans les sources TS) mais qui se voit à l'écran.
- **Pour Marie & Sami** : cela donne une impression d'amateurisme inattendue sur un produit qui se présente comme conforme DSFR / République Française.
- **Recommandation** : autoriser et utiliser les accents UTF-8 dans tous les fichiers `.ts`/`.html`. Passer le contenu existant dans un script `unidecode` inverse ou laisser les accents au clair (les éditeurs modernes les gèrent).

### T-2 — Adopter une stratégie de progressive disclosure "Débutant / Avancé" globale
- **Recommandation** : un toggle global "Mode débutant ↔ Mode expert" en haut du Builder et dans la modale Nouvelle connexion qui :
  - en mode débutant : masque "Méthode HTTP", "En-têtes", "Chemin", "Mode avancé", "Habillage DataBox", "Normalisation", "Facettes", "Mode de génération"
  - en mode débutant : utilise les libellés "naturels" (cf. M-B-4) et les opérateurs en français
  - en mode expert : tout dévoile, ajoute les noms techniques entre parenthèses

### T-3 — Feedback systématique pour chaque action longue ou ambiguë
- **Constat** : "Tester et sauvegarder", "Generer le graphique", "Copier le code", "Sauvegarder en favoris", "Rafraîchir" — toutes ces actions souffrent du même problème de non-feedback.
- **Pattern à appliquer partout** :
  - Avant : disabler + spinner + texte d'état ("Test en cours...").
  - Pendant : pas d'autre action possible.
  - Après succès : toast vert DSFR de 3s.
  - Après échec : toast rouge DSFR avec message actionnable.
  - Pour les actions de copie/sauvegarde : changer brièvement le texte du bouton ("Copié ✓").

### T-4 — Glossaire inline / Aide contextuelle
- **Constat** : les boutons (?) sont déjà présents et excellents quand on les voit. Mais ils sont **discrets** (icône grise petite à côté du label). Marie peut ne pas voir qu'ils existent.
- **Recommandation** :
  - dans la visite guidée, montrer un exemple de (?)
  - en mode débutant, **toujours afficher** les hints longs (plutôt que de réserver à un hover)
  - ajouter un lien "Glossaire" dans le header (DataBox, Facette, Normalisation, Agrégation, etc.)

### T-5 — Aperçus visuels pour les choix
- **Palettes** : ajouter des swatches.
- **Types de graphique** : les icônes actuelles sont OK ; ajouter au survol un mini-rendu avec données factices.
- **Type de jointure** : ajouter un mini schéma Venn pour Inner/Left/Right/Full.

### T-6 — Valeurs par défaut intelligentes
- **Constat** : sur la source "Test population région" (5 lignes, 2 champs `region` + `population`), l'app détecte bien `region` comme axe X (bon !), mais laisse l'axe Y vide alors qu'il n'y a qu'un seul champ numérique disponible.
- **Recommandation** : si un seul champ numérique → le présélectionner. Si plusieurs candidats → afficher tous, le 1er présélectionné.

### T-7 — Empty state et onboarding plus visuel
- **Constat** : la visite guidée actuelle est en pop-tooltip (5 étapes pour le Builder, 3 pour Sources). Texte uniquement. Pas d'illustration.
- **Recommandation** : ajouter des micro-animations ou des screenshots en miniature dans chaque étape de la visite, pour Marie qui apprend mieux en visuel.

### T-8 — Nommer les composants internes dans le code généré (pour P2)
- **Constat** : le code généré utilise `<bar-chart>` (DSFR Chart externe) ; Sami qui veut customiser ce code va chercher la doc. Le commentaire en haut dit "Graphique genere avec dsfr-data Builder" mais ne pointe pas vers la doc des composants.
- **Recommandation** : ajouter en commentaire une URL : `<!-- Doc des attributs : https://chartsbuilder.matge.com/specs/bar-chart -->`.

---

## 8. Tableau récapitulatif

| Code | Sévérité | Page | Persona | Titre |
|------|----------|------|---------|-------|
| C-S-1 | Critique | Sources | Les deux | "Tester et sauvegarder" silencieux |
| C-S-2 | Critique | Sources | Les deux | Pagination 100 pages sans stop |
| C-B-1 | Critique | Builder | Les deux | "Favoris" silencieux |
| M-S-1 | Majeur | Sources | P1 | Jargon "endpoint / Bearer / JSON" |
| M-S-2 | Majeur | Sources | P1 | Pas de catalogue sources publiques |
| M-S-3 | Majeur | Sources | P1 | Pas d'édition source manuelle |
| M-S-4 | Majeur | Sources | P1 | Jointures avec termes SQL bruts |
| M-B-1 | Majeur | Builder | Les deux | Filtres en DSL textuel |
| M-B-2 | Majeur | Builder | P1 | Label "Habillage DataBox" obscur |
| M-B-3 | Majeur | Builder | Les deux | Palette "sequentialAscending" brut |
| M-B-4 | Majeur | Builder | P1 | "Axe X/Y" jargon math |
| M-B-5 | Majeur | Builder | P2 | Code généré avec dépendance externe |
| M-B-6 | Majeur | Builder | P1 | Toutes sections fermées par défaut |
| T-1 | Majeur (transverse) | Toutes | Les deux | Accents français absents |
| S-H-1 | Suggestion | Hub | P1 | 9 outils, trop pour la home |
| S-H-2 | Suggestion | Hub | Les deux | Carousel chevauche en mobile |
| S-H-3 | Suggestion | Hub | P1 | Badge "BETA" anxiogène |
| S-H-4 | Suggestion | Hub | P1 | Promesse de sources non tenue |
| m-S-1..4 | Mineur | Sources | Mixed | Tour vide / Rafraîchir / Badge / Feedback |
| m-B-1..6 | Mineur | Builder | Mixed | Cartes exemples / Validation / Generer / Copier / Cohérence / Map |

---

## Annexes : captures examinées en live

Le tool MCP Chrome utilisé pour cet audit n'a pas pu écrire les screenshots sur disque (le flag `save_to_disk` est ignoré dans cette session). Les écrans suivants ont été examinés visuellement en direct dans le browser piloté :

1. **Hub desktop 1400×698** : hero + grille des 9 outils.
2. **Hub mobile 346 px** : bug de chevauchement carousel KPI / carte du monde.
3. **Sources, première visite** : tour guidé 3/3 ("Connecter une base de donnees", "Creer une source manuelle", "Explorer et previsualiser").
4. **Sources, modale "Nouvelle source manuelle"** : 3 onglets Tableau / Coller JSON / Importer CSV.
5. **Sources, modale "Nouvelle connexion"** : choix Grist (par défaut) / API REST/JSON.
6. **Sources, modale "Nouvelle connexion → API"** : champs URL, Méthode HTTP, En-têtes, Chemin vers les données.
7. **Sources, modale "Joindre deux sources"** : Source gauche/droite, Cle de jointure, Type, Préfixe.
8. **Sources, source manuelle créée** : "Test population région — 5 lignes" en sidebar avec badge violet "Manuel".
9. **Sources, exploration d'une source** : aperçu tableau région/population + actions "Utiliser dans le Builder / Exporter vers Grist / Rafraîchir".
10. **Sources, connexion API en cours** : "Chargement... (page 12)" puis "(page 42)" sans stop.
11. **Builder, première visite** : tour guidé 5/5.
12. **Builder, vue d'ensemble** : sidebar 6 sections + preview avec checklist progressive.
13. **Builder, Type de graphique** : grille 11 types (Barres, Barres H, Lignes, Camembert, Anneau, Radar, Nuage, Jauge, KPI, Carte, Tableau).
14. **Builder, Configuration des données mode simple** : Axe X/Y avec auto-détection région.
15. **Builder, tooltip "Si plusieurs lignes par categorie, agreger par"** : très bonne pédagogie.
16. **Builder, Mode avancé activé** : filtres en DSL textuel + accordéon opérateurs.
17. **Builder, graphique généré "Mon graphique"** : 5 barres OK + autoscroll.
18. **Builder, onglet Code généré** : code HTML avec 3 CDN + `<bar-chart>` + `<dsfr-data-a11y>`.
19. **Builder, section "Habillage DataBox"** : checkbox "Activer la DataBox DSFR" + tooltip explicatif.
20. **Builder, section "Accessibilite"** : 3 checkboxes (composant / tableau / téléchargement CSV) + description optionnelle.
21. **Builder, modale "Aperçu des données"** : "5 enregistrement(s), 2 champs — apercu des 20 premiers".
22. **Builder, type "Carte" sélectionné** : "Code departement" affiché avec hint "Code INSEE (01-95, 2A, 2B, 971-976)".
