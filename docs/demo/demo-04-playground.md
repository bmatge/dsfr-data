# Démo 4 — Utiliser le Playground

> **Durée cible** : 2 min 50 · **App** : `apps/playground` · **URL** : `/apps/playground/index.html` (tuile « Playground »)

## Objectif de la vidéo

Montrer le Playground comme bac à sable : galerie de plus de 30 exemples prêts à l'emploi, édition du code en direct avec aperçu instantané, et export d'un extrait autonome (« + Deps » puis « Copier »).

## Prérequis (avant tournage)

- Instance lancée (`npm run dev` → http://localhost:5173).
- Visite guidée du Playground déjà vue (4 bulles au premier passage — la passer avant, ou la garder pour la séquence 1 en version rapide).
- Connexion réseau opérationnelle (les exemples appellent data.economie.gouv.fr et tabular-api.data.gouv.fr en direct).

---

## Séquence 1 — Introduction (0:00 – 0:20)

| | |
|---|---|
| 🖥️ **Écran** | Page d'accueil, clic sur la tuile **« Playground »**. L'app s'ouvre en écran scindé : éditeur de code sombre (thème Dracula) à gauche, aperçu rendu à droite — l'exemple « Barres — Fiscalite locale » est chargé et déjà exécuté. |
| 🖱️ **Actions** | Naviguer vers le Playground. Laisser le graphique par défaut s'afficher (2–3 s). |
| 🎙️ **Voix off** | « Le Playground, c'est le bac à sable de Charts builder : un éditeur de code à gauche, le rendu en temps réel à droite. Idéal pour expérimenter, comprendre les composants dsfr-data, ou ajuster finement un code généré par le Builder. » |

## Séquence 2 — La galerie d'exemples (0:20 – 0:50)

| | |
|---|---|
| 🖥️ **Écran** | Menu déroulant **« Charger un exemple : »** ouvert, montrant les catégories : Mode direct, Avec requête (dsfr-data-query), Avec normalisation, Facettes, Jointure multi-sources, Cartes interactives… Sélection de **« KPI — Industrie du futur »**, confirmation « Remplacer le code actuel par cet exemple ? », rendu d'une grille de 4 tuiles KPI. |
| 🖱️ **Actions** | 1. Ouvrir le sélecteur **« Charger un exemple : »**, faire défiler lentement les catégories. 2. Choisir **« KPI — Industrie du futur »**. 3. Valider **« Remplacer le code actuel par cet exemple ? »**. 4. Laisser les KPI se charger. |
| 🎙️ **Voix off** | « Plus de trente exemples prêts à l'emploi, classés par usage : graphiques branchés en direct sur une API, requêtes avec agrégation, nettoyage de données, filtres à facettes, jointures entre deux sources, cartes interactives… Je charge l'exemple KPI : quatre indicateurs calculés à la volée — somme, moyenne, maximum — depuis les données d'Industrie du futur. » |

## Séquence 3 — Éditer le code en direct (0:50 – 1:40)

| | |
|---|---|
| 🖥️ **Écran** | Retour sur l'exemple **« Barres — Fiscalite locale »**. Zoom sur l'éditeur : le composant `<dsfr-data-chart source="data" type="bar" …>`. Modification de `type="bar"` en `type="line"`, puis de `limit="15"` en `limit="30"` dans `<dsfr-data-source>`. À chaque exécution, l'aperçu se met à jour. |
| 🖱️ **Actions** | 1. Recharger l'exemple **« Barres — Fiscalite locale »**. 2. Dans l'éditeur, remplacer `type="bar"` par `type="line"`. 3. Cliquer sur **« Executer »** (ou `Ctrl+Entrée`) → le graphique passe en courbe. 4. Modifier `limit="15"` → `limit="30"`. 5. `Ctrl+Entrée` → la courbe s'étend à 30 communes. 6. Montrer le bouton **« Reinitialiser »** (sans cliquer, ou cliquer pour revenir à l'état initial). |
| 🎙️ **Voix off** | « C'est là que le Playground prend tout son sens : le code est vivant. Les composants dsfr-data se configurent par simples attributs HTML. Je change le type "bar" en "line", j'exécute — Contrôle-Entrée — et le graphique devient une courbe. Je passe la limite de quinze à trente communes, j'exécute à nouveau : l'API est réinterrogée et l'aperçu suit. Pas de compilation, pas de rechargement de page. Et si je me perds, "Réinitialiser" restaure l'exemple d'origine. » |

## Séquence 4 — Exporter un code autonome (1:40 – 2:15)

| | |
|---|---|
| 🖥️ **Écran** | Barre d'outils de l'éditeur : **« Executer »**, **« Reinitialiser »**, **« + Deps »**, **« Copier »**, **« Favoris »**, **« Pipeline »**. Clic sur **« + Deps »** : un bloc de `<link>` et `<script>` (DSFR, Chart.js, dsfr-data) s'ajoute en tête du code. Clic sur **« Copier »** → toast « Code copie dans le presse-papiers ». |
| 🖱️ **Actions** | 1. Cliquer sur **« + Deps »** — montrer le bloc CDN ajouté (le bouton devient **« - Deps »**). 2. Cliquer sur **« Copier »** → toast. 3. Cliquer sur **« - Deps »** pour montrer la bascule inverse. |
| 🎙️ **Voix off** | « Dans le Playground, les bibliothèques DSFR et dsfr-data sont injectées automatiquement. Pour emporter le code ailleurs, le bouton "+ Deps" ajoute les dépendances nécessaires — styles DSFR, Chart.js, la bibliothèque dsfr-data — et l'extrait devient totalement autonome. "Copier", et il est prêt à être collé dans n'importe quelle page de votre site. » |

## Séquence 5 — L'effet waouh : carte interactive (2:15 – 2:40)

| | |
|---|---|
| 🖥️ **Écran** | Sélection de l'exemple **« Carte — 5000 CT avec clustering + panneau »** (catégorie Carte interactive). Une carte Leaflet se charge avec des milliers de points regroupés en clusters ; zoom sur la carte, clic sur un cluster puis un marqueur. |
| 🖱️ **Actions** | 1. Charger l'exemple **« Carte — 5000 CT avec clustering + panneau »**, confirmer. 2. Zoomer/dézoomer sur la carte, cliquer un cluster, ouvrir le panneau d'un marqueur. |
| 🎙️ **Voix off** | « Le Playground, c'est aussi la vitrine des composants avancés. Ici, une carte interactive qui affiche cinq mille collectivités avec regroupement automatique des points — le tout en quelques lignes de HTML déclaratif. » |

## Séquence 6 — Conclusion (2:40 – 2:50)

| | |
|---|---|
| 🖥️ **Écran** | Survol des boutons **« Favoris »** et **« Pipeline »**, puis du lien **« Guide et exemples »**. Fondu de fin. |
| 🖱️ **Actions** | Survoler **« Favoris »** (sauvegarde du code), **« Pipeline »** (visualisation du pipeline de composants) et le lien **« Guide et exemples »**. Ne pas cliquer. |
| 🎙️ **Voix off** | « Chaque expérimentation peut être sauvegardée en favori pour la retrouver plus tard, et le guide en ligne documente tous les composants. À vous de jouer. » |

---

## Plan B / variantes

- Les exemples peuvent être préchargés par URL : `?example=direct-bar`, `?example=direct-kpi` — utile pour enchaîner les prises sans manipuler le sélecteur.
- Si la carte 5000 points est lente au tournage, remplacer la séquence 5 par **« Carte — PIB par pays »** (carte du monde, chargement plus léger).
- Version courte (2 min 15) : couper la séquence 5.
