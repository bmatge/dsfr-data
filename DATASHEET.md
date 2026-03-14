# Fiche produit — dsfr-data

## QUOI ? (Le produit)

Bibliotheque de Web Components HTML5 pour integrer des graphiques dynamiques, accessibles et conformes DSFR dans les sites gouvernementaux francais. Le projet se decoupe en **deux couches independantes** :

### Volet 1 — Composants web (pour developpeurs et integrateurs)

Une collection de balises HTML `<dsfr-data-*>` qui s'enchainent de maniere declarative pour former un pipeline de donnees complet :

```
Source de donnees → Nettoyage → Requetage → Visualisation
```

| Composant | Role |
|---|---|
| `<dsfr-data-source>` | Connecter n'importe quelle API REST, charger les donnees |
| `<dsfr-data-normalize>` | Nettoyer : conversion numerique, renommage, trim |
| `<dsfr-data-query>` | Filtrer, trier, regrouper, agreger les donnees |
| `<dsfr-data-facets>` | Ajouter des filtres interactifs (checkbox, select, radio) |
| `<dsfr-data-search>` | Ajouter une recherche plein texte |
| `<dsfr-data-chart>` | Rendre un graphique DSFR (barres, courbes, camembert, carte, radar, jauge...) |
| `<dsfr-data-kpi>` | Afficher un indicateur chiffre avec seuils de couleur |
| `<dsfr-data-list>` | Afficher un tableau avec tri, pagination, export CSV |
| `<dsfr-data-display>` | Template HTML libre pour cartes, fiches, grilles |

**Caracteristiques cles :**

- **Zero JavaScript a ecrire** — tout se configure via des attributs HTML
- **Agnostique** — fonctionne dans Drupal, WordPress, page statique, React, Vue, Angular, n'importe quel environnement HTML
- **Un seul fichier a charger** — ~50 Ko gzippe
- **Connecteurs integres** — OpenDataSoft, Tabular API (data.gouv.fr), Grist, toute API REST
- **DSFR-natif** — utilise les graphiques officiels du Design System de l'Etat, pas une imitation
- **Accessible par defaut** — conforme RGAA/WCAG 2 AA (teste automatiquement via Axe)
- **Responsive par defaut** — herite du comportement DSFR

### Volet 2 — Applications de creation (pour non-developpeurs)

Une suite d'outils web qui permettent de **generer le code HTML du volet 1 sans le connaitre** :

| Application | Pour qui | Ce qu'elle fait |
|---|---|---|
| **Sources** | Tous | Connecter une source de donnees : coller un CSV, saisir un tableau, connecter une API Grist ou REST |
| **Builder** | Communicants | Creer un graphique pas a pas : choisir le type, les champs, les couleurs, voir le resultat en live, copier le code HTML |
| **Builder IA** | Communicants | Decrire en francais ce qu'on veut ("montre-moi les beneficiaires par region en barres") et obtenir le graphique + le code |
| **Playground** | Integrateurs | Editeur de code interactif avec previsualisation temps reel pour ajuster le HTML |
| **Dashboard** | Communicants | Composer un tableau de bord multi-widgets par glisser-deposer |
| **Favoris** | Tous | Sauvegarder et reutiliser ses creations |
| **Monitoring** | Producteurs | Suivre les widgets deployes sur les sites gouvernementaux |

**Le workflow type d'un communicant :**

1. Importer ses donnees (CSV ou connexion API) dans **Sources**
2. Creer son graphique visuellement dans le **Builder** (ou par conversation dans le **Builder IA**)
3. Cliquer sur **"Copier le code"**
4. Coller le bloc HTML dans son CMS
5. Le graphique est en ligne, dynamique, accessible, conforme DSFR

---

## POURQUOI ? (Positionnement strategique)

### Le probleme aujourd'hui

Les sites gouvernementaux illustrent leurs articles de donnees avec :

- Des **captures d'ecran** de tableaux Excel — non accessibles, non interactives, non maintenables
- Des **infographies statiques** realisees par des graphistes — couteuses, obsoletes des que la donnee change
- Des **donnees saisies manuellement** dans le CMS — sources d'erreurs, non synchronisees avec la donnee reelle

### Pourquoi pas Metabase / Superset / Chartsgoug ?

Ces outils repondent a un **besoin different** :

| | Metabase / Superset | dsfr-data |
|---|---|---|
| **Finalite** | Plateforme de BI : exploration, analyse, reporting interne, publication de dashboards autonomes | Composants embarques : integrer un graphique dans une page web existante |
| **Modele** | L'utilisateur va **vers la plateforme** (URL dediee, dashboard pleine page) | Le graphique va **vers le site** de l'utilisateur (balise HTML dans le CMS) |
| **Integration** | iframe isolee — CSS separe, pas d'accessibilite avec la page hote, taille fixe | DOM natif — heritage CSS, arbre d'accessibilite unifie, responsive naturel |
| **Infrastructure** | Serveur dedie (base de donnees, backend, comptes utilisateurs, authentification) | Aucune — un fichier JS charge depuis un CDN |
| **Competences** | Administrateur de plateforme BI + SQL | Copier-coller de HTML |
| **Source de donnees** | Base interne connectee a la plateforme | N'importe quelle API REST publique, directement depuis le navigateur |
| **Conformite DSFR** | Non — design propre a la plateforme | Oui — utilise les composants officiels DSFR |
| **Accessibilite** | Variable, depend de l'outil | RGAA/WCAG 2 AA par construction |
| **Poids** | Application complete embarquee dans l'iframe | ~50 Ko |

**En resume :** Metabase/Superset sont des **plateformes de dataviz**. dsfr-data est une **boite a outils d'integration**. Ce ne sont pas des concurrents, ce sont des outils **complementaires** qui interviennent a des moments differents de la chaine de valeur des donnees publiques.

### Pourquoi ne pas "juste utiliser Chart.js avec un wrapper" ?

- Chart.js produit un `<canvas>` — **non accessible** (le RGAA exige des alternatives textuelles structurees, pas un bitmap)
- Chart.js n'a pas de mode declaratif HTML — il faut **ecrire du JavaScript**, ce qui exclut les communicants
- Chart.js n'est **pas conforme DSFR** — il faudrait reimplementer les couleurs, typos, tokens, responsive
- DSFR Chart existe justement pour repondre a ces exigences — dsfr-data s'appuie dessus plutot que de reinventer

### La vraie valeur ajoutee

dsfr-data ne reinvente pas les graphiques. Il resout le **dernier kilometre** : comment un agent public non technique transforme une donnee ouverte en graphique conforme, accessible, dynamique et embarque dans son site, **sans dependre d'une plateforme, d'un developpeur ou d'une infra**.

---

## QUI ? (Cibles)

### Utilisateurs directs

- **Redacteurs web / communicants** des sites gouvernementaux (.gouv.fr) — profils non techniques, habitues a travailler dans un CMS (Drupal, WordPress, SPIP), qui ont besoin d'illustrer un article avec un graphique dynamique sans mobiliser un developpeur
- **Integrateurs web** — profils techniques legers (HTML/CSS) qui copient-collent des blocs de code dans des gabarits de pages
- **Producteurs de donnees** — agents publics qui publient des jeux de donnees sur data.gouv.fr ou des portails OpenDataSoft et veulent les valoriser visuellement sur leurs sites

### Beneficiaires indirects

- Les citoyens qui consultent les sites gouvernementaux et accedent a des donnees publiques sous forme lisible, accessible et interactive plutot que sous forme de tableaux Excel ou d'infographies statiques

---

## COMMENT ? (Choix techniques)

| Choix | Justification |
|---|---|
| **Web Components (Lit)** | Standard HTML5 W3C, fonctionne nativement dans tous les navigateurs, independant de tout framework — perennite maximale |
| **DSFR Chart** | Bibliotheque officielle de graphiques du Design System de l'Etat — conformite garantie, pas de reimplementation |
| **Declaratif (HTML uniquement)** | Un communicant qui sait copier-coller du HTML peut integrer un graphique — aucune competence JavaScript requise |
| **Architecture pipeline** | Les composants se chainent comme des briques — chaque composant fait une seule chose bien, on compose selon le besoin |
| **Open source (MIT)** | Reutilisable, auditable, mutualisable entre administrations |
| **TypeScript strict** | Code type, maintenable, avec tests unitaires et E2E |

### Exemple minimal d'integration

```html
<!-- Source de donnees -->
<dsfr-data-source id="data"
  url="https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/mon-dataset/records?limit=100"
  transform="results">
</dsfr-data-source>

<!-- Agregation par region -->
<dsfr-data-query id="q" source="data"
  group-by="nom_region"
  aggregate="nombre_beneficiaires:sum:beneficiaires"
  order-by="beneficiaires:desc" limit="10">
</dsfr-data-query>

<!-- Graphique en barres -->
<dsfr-data-chart source="q" type="bar"
  label-field="nom_region" value-field="beneficiaires"
  titre="Beneficiaires par region">
</dsfr-data-chart>
```

---

## OU ? (Contexte de deploiement)

### Ou s'utilisent les composants (volet 1)

- Sur **n'importe quel site web** : .gouv.fr, collectivites, operateurs publics, sites statiques, CMS
- Aucune infrastructure serveur requise cote deployeur — le composant charge les donnees directement depuis l'API source
- Distribue via CDN (un `<script>` a ajouter) ou via npm pour les projets avec build

### Ou s'utilisent les applications (volet 2)

- En ligne (application web hebergee)
- En auto-heberge (Docker)
- En mode desktop hors-ligne (application Tauri, optionnelle)

### Sources de donnees supportees

| Source | Exemple | Mode |
|---|---|---|
| **API REST generique** | Toute API JSON | Client-side |
| **OpenDataSoft** | data.economie.gouv.fr | Server-side (filtres, agregations, pagination deleguees) |
| **Tabular API** | tabular-api.data.gouv.fr | Server-side (pagination automatique) |
| **Grist** | grist.numerique.gouv.fr | Temps reel (mise a jour quand la donnee Grist change) |
| **Donnees manuelles** | CSV, JSON, saisie tableau | Local (localStorage) |

---

## QUAND ? (Maturite et calendrier)

- **Etat actuel** : v0.2.x — fonctionnel, en production sur plusieurs sites pilotes, en developpement actif
- **Cible** : passage en v1.0 avec stabilisation des APIs composants et gouvernance partagee
- **Modele de contribution** : ouverture aux developpeurs de l'ecosysteme gouvernemental pour maintenance et evolution mutualisees

---

## COMBIEN ? (Cout et ressources)

| Poste | Cout |
|---|---|
| **Bibliotheque** | Gratuit, open source MIT |
| **Integration (CDN)** | Zero infrastructure cote deployeur |
| **Auto-hebergement** | Un conteneur Docker |
| **Maintenance** | Mutualisable entre administrations contributrices |

### Comparaison avec l'alternative plateforme BI

| Poste | Plateforme BI (Metabase/Superset) | dsfr-data |
|---|---|---|
| Infrastructure serveur | Obligatoire (BDD + backend + auth) | Aucune |
| Formation utilisateurs | BI + SQL | Copier-coller HTML |
| Conformite DSFR | Reimplementation necessaire | Native |
| Accessibilite RGAA | A verifier / adapter | Integree par construction |
| Maintenance | Equipe ops dediee | Mutualisee, communautaire |
