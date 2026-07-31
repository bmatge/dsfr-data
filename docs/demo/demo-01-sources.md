# Démo 1 — Créer des sources de données

> **Durée cible** : 2 min 55 · **App** : `apps/sources` · **URL** : `/apps/sources/index.html` (nav « Sources »)

## Objectif de la vidéo

Montrer les deux façons de brancher des données dans Charts builder : une **source manuelle** (saisie directe) et une **connexion à une API publique** par simple copier-coller d'URL, avec détection automatique de la plateforme. Terminer sur le pont vers le Builder.

## Prérequis (avant tournage)

- Instance lancée (`npm run dev` → http://localhost:5173) ou instance de démo.
- État vierge (ou presque) de la page Sources pour montrer l'écran « 3 façons de commencer ».
- Visite guidée déjà vue (elle se lance au premier chargement — la passer avant le tournage).
- URL à coller préparée dans le presse-papiers : page du jeu de données **Industrie du futur** sur data.economie.gouv.fr (OpenDataSoft).
- Trois lignes de données prêtes pour la saisie manuelle (ex. `region` / `budget` : Île-de-France 120, Bretagne 85, Occitanie 97).

---

## Séquence 1 — Introduction (0:00 – 0:20)

| | |
|---|---|
| 🖥️ **Écran** | Page d'accueil Charts builder, puis clic sur la tuile **« Sources »**. L'app s'ouvre : sidebar des connexions à gauche, zone d'exploration à droite avec l'écran **« 3 façons de commencer »** (Données manuelles, API publique, Grist). |
| 🖱️ **Actions** | Naviguer vers **« Sources »**. Laisser 3 s sur l'écran d'accueil de l'app. |
| 🎙️ **Voix off** | « Tout graphique commence par des données. Dans Charts builder, l'outil Sources centralise leur connexion. Trois façons de commencer : saisir des données manuelles, brancher une API publique, ou connecter un document Grist. Nous allons voir les deux premières. » |

## Séquence 2 — Créer une source manuelle (0:20 – 1:05)

| | |
|---|---|
| 🖥️ **Écran** | Clic sur **« Créer une source manuelle »** dans la sidebar. La modale **« Nouvelle source manuelle »** s'ouvre : champ **« Nom de la source »**, trois onglets **« Tableau »**, **« Coller JSON »**, **« Importer CSV »**. |
| 🖱️ **Actions** | 1. Cliquer sur **« Créer une source manuelle »**. 2. Saisir le nom : `Budget par région`. 3. Rester sur l'onglet **« Tableau »** : nommer deux colonnes (`region`, `budget`), cliquer deux fois sur **« Ajouter une ligne »**, remplir les 3 lignes préparées. 4. Montrer d'un survol rapide les onglets **« Coller JSON »** et **« Importer CSV »**. 5. Cliquer sur **« Sauvegarder »** → toast « Source “Budget par région” ajoutée. ». La carte apparaît dans **« Jeux de données locaux »**. |
| 🎙️ **Voix off** | « Premier cas : j'ai mes chiffres sous la main. Je crée une source manuelle, je la nomme, et je saisis mes données directement dans le tableau — je pourrais aussi coller du JSON ou importer un fichier CSV. Je sauvegarde : la source apparaît dans mes jeux de données locaux, stockée dans le navigateur, prête à alimenter un graphique. » |

## Séquence 3 — Connecter une API publique par détection d'URL (1:05 – 2:00)

| | |
|---|---|
| 🖥️ **Écran** | Clic sur **« Nouvelle connexion »**. Modale **« Nouvelle connexion »**, étape 1 : champ **« Adresse du jeu de données »** avec son texte d'aide (« Collez l'URL d'une page de données… la configuration est déduite automatiquement »). Après **« Continuer »** : étape 2 avec le message **« Plateforme détectée : OpenDataSoft. Tout est prêt — enregistrez pour récupérer les données. »**, champ **« Nom de la connexion »**, bloc **« Paramètres avancés »** replié. |
| 🖱️ **Actions** | 1. Cliquer sur **« Nouvelle connexion »**. 2. Coller l'URL de la page du jeu « Industrie du futur » (data.economie.gouv.fr). 3. Cliquer sur **« Continuer »** → montrer le message de détection. 4. Saisir le nom : `Industrie du futur`. 5. Déplier 2 s **« Paramètres avancés »** (URL des données pré-remplie, emplacement des données déduit), replier. 6. Cliquer sur **« Tester et sauvegarder »** → le bouton passe à « Test en cours… », puis la carte apparaît dans la sidebar avec son statut de connexion. |
| 🎙️ **Voix off** | « Deuxième cas : les données sont déjà en ligne. Je copie simplement l'adresse de la page du jeu de données — ici, le programme Industrie du futur sur data.economie.gouv.fr — et je la colle. Charts builder reconnaît la plateforme automatiquement : OpenDataSoft, Tabular de data.gouv.fr, l'INSEE, Grist ou n'importe quelle API JSON. Tout est pré-configuré ; les paramètres avancés restent accessibles si besoin. "Tester et sauvegarder" : la connexion est réellement vérifiée avant d'être enregistrée — pas de mauvaise surprise plus tard. » |

## Séquence 4 — Explorer et prévisualiser les données (2:00 – 2:35)

| | |
|---|---|
| 🖥️ **Écran** | Clic sur la carte de la connexion → l'explorateur s'ouvre à droite, onglet **« Aperçu »** : tableau des 20 premières lignes et bandeau de métadonnées (nombre de lignes, typage des colonnes, ex. « 8 texte · 3 nombre »). Barre d'action au-dessus. |
| 🖱️ **Actions** | 1. Cliquer sur la connexion `Industrie du futur` dans la sidebar. 2. Parcourir l'aperçu (scroll horizontal léger). 3. Pointer le bandeau de métadonnées. 4. Cliquer sur **« En faire un jeu en ligne »** → la carte apparaît dans **« Jeux de données en ligne »**. 5. Montrer le bouton **« Rafraîchir »**. |
| 🎙️ **Voix off** | « Un clic sur la connexion, et j'explore les données : aperçu des premières lignes, types de colonnes détectés — texte, nombre, géographie. J'en fais un jeu de données en ligne : il reste relié à l'API et pourra être rafraîchi à tout moment, contrairement au jeu local qui fige une copie. » |

## Séquence 5 — Vers le Builder (2:35 – 2:55)

| | |
|---|---|
| 🖥️ **Écran** | Barre d'action de l'aperçu : boutons **« Utiliser dans le Builder »**, **« Garder en favori »**, **« Exporter vers Grist »**. Clic sur **« Utiliser dans le Builder »** → l'app Builder s'ouvre avec la source présélectionnée. Fondu de fin. |
| 🖱️ **Actions** | Survoler les trois boutons d'action, puis cliquer sur **« Utiliser dans le Builder »**. Laisser 2 s sur le Builder ouvert. |
| 🎙️ **Voix off** | « Mes sources sont prêtes. Depuis l'aperçu, je peux les garder en favori, les exporter vers Grist… ou passer directement à la suite : "Utiliser dans le Builder" ouvre le générateur de graphiques avec la source déjà sélectionnée. C'est l'objet de la prochaine vidéo. » |

---

## Plan B / variantes

- Si data.economie.gouv.fr est indisponible au tournage, utiliser une URL Tabular (tabular-api.data.gouv.fr, jeu « Répertoire national des élus ») — même parcours de détection.
- Fonctions coupables si dépassement : séquence 4 réduite (sans « En faire un jeu en ligne »), survol des boutons d'action raccourci.
- Bonus hors chrono (si version longue un jour) : **« Joindre deux sources »** (jointure avec aperçu live) et l'**import/export global** JSON de la sidebar.
