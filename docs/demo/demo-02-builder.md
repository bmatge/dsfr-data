# Démo 2 — Utiliser le Builder

> **Durée cible** : 2 min 50 · **App** : `apps/builder` · **URL** : `/apps/builder/index.html` (nav « Créer un graphique »)

## Objectif de la vidéo

Montrer qu'en moins de trois minutes, on passe d'un jeu de données à un graphique DSFR prêt à intégrer : choix de la source, type de graphique, configuration des axes, génération, copie du code.

## Prérequis (avant tournage)

- Instance lancée (`npm run dev` → http://localhost:5173) ou instance de démo.
- Une source **« Industrie du futur »** (API OpenDataSoft data.economie.gouv.fr) déjà créée dans Sources (cf. [démo 1](demo-01-sources.md)) — la vidéo 2 ne re-montre pas la création.
- Visite guidée déjà vue (ou désactivée) pour qu'elle ne se déclenche pas à l'ouverture.
- Onglet **« Aperçu »** actif, panneau de gauche déplié sur « Source de données ».

---

## Séquence 1 — Introduction (0:00 – 0:20)

| | |
|---|---|
| 🖥️ **Écran** | Page d'accueil Charts builder. Survol de la carte **« Créer un graphique »**, clic. L'app Builder s'ouvre : configuration à gauche, aperçu à droite avec l'état vide guidé (« Charger une source de données », « Choisir un type de graphique »…). |
| 🖱️ **Actions** | Depuis l'accueil, cliquer sur **« Créer un graphique »**. Laisser 2 s sur l'écran d'accueil du Builder. |
| 🎙️ **Voix off** | « Le Builder de Charts builder, c'est le générateur visuel de graphiques. À gauche, la configuration pas à pas ; à droite, l'aperçu en temps réel. Aucune ligne de code à écrire : on configure, on génère, on copie. » |

## Séquence 2 — Choisir la source de données (0:20 – 0:45)

| | |
|---|---|
| 🖥️ **Écran** | Section **« Source de données »** en haut du panneau gauche. Le menu déroulant **« Source »** affiche « — Choisir — ». Zoom léger sur la section. |
| 🖱️ **Actions** | Ouvrir le menu **« Source »**, sélectionner la source **« Industrie du futur »**. Les champs disponibles se chargent automatiquement dans les sélecteurs (pas de bouton à cliquer). Montrer d'un geste de souris le lien **« Nouvelle »** qui renvoie vers l'app Sources. |
| 🎙️ **Voix off** | « Première étape : les données. Je choisis une source déjà connectée — ici, les bénéficiaires du programme Industrie du futur, publiés sur data.economie.gouv.fr. Dès la sélection, le Builder interroge l'API et découvre les champs disponibles. Si la source n'existe pas encore, le lien "Nouvelle" ouvre l'outil Sources. » |

## Séquence 3 — Choisir le type de graphique (0:45 – 1:05)

| | |
|---|---|
| 🖥️ **Écran** | Section **« Type de graphique »** : grille de 11 vignettes — Barres, Barres H, Lignes, Camembert, Anneau, Radar, Nuage, Jauge, KPI, Carte, Tableau. |
| 🖱️ **Actions** | Balayer la grille au survol (1–2 s), puis cliquer sur **« Barres »**. |
| 🎙️ **Voix off** | « Deuxième étape : le type de visualisation. Onze types sont disponibles, tous conformes au Design System de l'État : barres, lignes, camembert, radar, jauge, KPI, carte départementale, tableau… Je pars sur un graphique en barres. » |

## Séquence 4 — Configurer les données (1:05 – 1:40)

| | |
|---|---|
| 🖥️ **Écran** | Section **« Configuration des données »**. Sélecteurs **« Étiquettes (axe horizontal) »** et **« Valeur à mesurer (Série 1) »**, puis le select **« Si plusieurs lignes par catégorie, agréger par »**. |
| 🖱️ **Actions** | 1. Dans **« Étiquettes (axe horizontal) »**, choisir `nom_region`. 2. Dans **« Valeur à mesurer (Série 1) »**, choisir `nombre_beneficiaires`. 3. Dans **« Si plusieurs lignes par catégorie, agréger par »**, laisser **« Somme »** (montrer le badge d'agrégation suggérée). 4. Dans **« Ordre »**, choisir **« Décroissant »**. Survoler sans l'activer la bascule **« Mode avancé (filtres & requêtes) »**. |
| 🎙️ **Voix off** | « Troisième étape : je relie les données au graphique. En abscisse, la région ; en valeur, le nombre de bénéficiaires. Comme il y a plusieurs lignes par région, le Builder propose de lui-même une agrégation — je garde la somme — et je trie par ordre décroissant. Pour aller plus loin, un mode avancé permet filtres, regroupements et agrégations multiples. » |

## Séquence 5 — Apparence et génération (1:40 – 2:10)

| | |
|---|---|
| 🖥️ **Écran** | Section **« Apparence »** : champs **« Titre »**, **« Sous-titre / Source »**, sélecteur **« Palette de couleurs »** avec nuanciers. Puis clic sur le grand bouton **« Générer le graphique »** ; le graphique en barres apparaît dans l'onglet **« Aperçu »** à droite. |
| 🖱️ **Actions** | 1. Saisir le titre : `Bénéficiaires Industrie du futur par région`. 2. Sous-titre : `Source : data.economie.gouv.fr`. 3. Ouvrir **« Palette de couleurs »**, choisir **« Couleurs distinctes par catégorie »**. 4. Cliquer sur **« Générer le graphique »**. Laisser l'animation du graphique se jouer 3 s, survoler une barre pour montrer l'infobulle. |
| 🎙️ **Voix off** | « Je soigne l'habillage : un titre, la mention de la source, et une palette DSFR — ici, couleurs distinctes par catégorie. Un clic sur "Générer le graphique"… et voilà. Le graphique est rendu à droite, interactif, avec les infobulles au survol, exactement tel qu'il s'affichera sur votre site. » |

## Séquence 6 — Récupérer le code (2:10 – 2:40)

| | |
|---|---|
| 🖥️ **Écran** | Panneau de droite : bascule sur l'onglet **« Code généré »**. Le snippet HTML complet s'affiche avec la mention « Copiez ce code pour l'intégrer dans votre page : ». Montrer aussi 2 s l'onglet **« Données brutes »**. |
| 🖱️ **Actions** | 1. Cliquer sur l'onglet **« Code généré »**. 2. Faire défiler brièvement le code. 3. Cliquer sur **« Copier le code »** → toast « Code copié dans le presse-papiers ». 4. Clic rapide sur l'onglet **« Données brutes »** puis retour à **« Aperçu »**. |
| 🎙️ **Voix off** | « Le résultat, c'est un simple fragment HTML autonome : les composants dsfr-data, les liens vers les styles et scripts nécessaires — pas d'iframe, pas de dépendance à installer. "Copier le code", et il ne reste qu'à le coller dans n'importe quelle page web. L'onglet Données brutes permet au passage de vérifier ce que renvoie l'API. » |

## Séquence 7 — Conclusion et ouvertures (2:40 – 2:50)

| | |
|---|---|
| 🖥️ **Écran** | Retour sur l'onglet **« Aperçu »**. Survol des deux boutons d'action **« Playground »** et **« Favoris »** en haut à droite du panneau d'aperçu. |
| 🖱️ **Actions** | Survoler **« Playground »** (infobulle « Ouvrir dans le Playground ») puis **« Favoris »** (infobulle « Sauvegarder en favoris »). Ne pas cliquer. |
| 🎙️ **Voix off** | « Envie d'aller plus loin ? Le bouton Playground ouvre le code dans l'éditeur interactif, et le bouton Favoris sauvegarde le graphique pour le retrouver plus tard. Ce sont les sujets des prochaines vidéos. » |

---

## Plan B / variantes

- Si l'API data.economie.gouv.fr est lente au tournage, utiliser une source manuelle préparée à l'avance (mêmes champs).
- Version courte (2 min) : couper la séquence 7 et le passage « Données brutes ».
- Pour illustrer la richesse sans rallonger : après la séquence 5, changer le type en **« Camembert »** et regénérer (≈ 10 s) — optionnel.
