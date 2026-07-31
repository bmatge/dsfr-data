# Démo métier 7 — Un article d'actu sur RappelConso, dataviz intégrées dans Drupal

> **Durée cible** : 2 min 55 · **Persona** : rédacteur web d'un site institutionnel · **Apps** : Sources + Builder + Drupal 11
> **Données** : `rappelconso-v2-gtin-trie` (DGCCRF) sur data.economie.gouv.fr — ~17 500 fiches de rappel
> **CMS de démonstration** : https://drupal11.lab.miweb.run (instance VibeLab)

## Scénario

« On me confie le jeu de données RappelConso de la DGCCRF et on me demande un article d'actualité sur ce dispositif. Je crée quelques dataviz — un chiffre clé et une répartition par catégorie — et je les intègre directement dans mon article Drupal. »

Le message éditorial : depuis son lancement, RappelConso a publié **plus de 17 500 rappels de produits**, dont **près de 8 sur 10 concernent l'alimentation**.

## Prérequis (avant tournage)

- Instance Charts builder lancée ; instance Drupal 11 accessible (drupal11.lab.miweb.run), compte contributeur connecté.
- ⚠️ Drupal : vérifier qu'un format de texte autorisant le HTML complet (« Full HTML » ou équivalent) est actif pour le corps des articles, et que les balises `<script>`/composants personnalisés ne sont pas filtrées — sinon activer le format ou passer par un bloc HTML brut. **Répéter l'intégration avant le tournage.**
- Page du jeu de données ouverte dans un onglet : `https://data.economie.gouv.fr/explore/dataset/rappelconso-v2-gtin-trie/`.
- Article Drupal pré-rédigé (titre + 2 paragraphes) en brouillon, avec deux emplacements réservés pour les dataviz.
- Les deux snippets générés pendant la démo peuvent être pré-copiés dans un presse-papiers multiple en secours.

---

## Séquence 1 — Le sujet et les données (0:00 – 0:30)

| | |
|---|---|
| 🖥️ **Écran** | Page du dataset RappelConso sur data.economie.gouv.fr : titre, description DGCCRF, onglet tableau. Copie de l'URL depuis la barre d'adresse. |
| 🖱️ **Actions** | 1. Parcourir 5 s la page du jeu de données (scroll sur le tableau : `date_publication`, `categorie_produit`, `motif_rappel`…). 2. Copier l'URL de la page. |
| 🎙️ **Voix off** | « Produits contaminés, jouets dangereux, airbags défectueux : depuis 2021, tous les rappels de produits sont publiés sur RappelConso. La DGCCRF ouvre ces données sur data.economie.gouv.fr — plus de 17 000 fiches. Mon article d'actualité doit raconter ce dispositif, chiffres à l'appui. Je copie simplement l'adresse de la page. » |

## Séquence 2 — Brancher la source (0:30 – 1:00)

| | |
|---|---|
| 🖥️ **Écran** | App **Sources** : **« Nouvelle connexion »**, collage de l'URL, **« Continuer »** → **« Plateforme détectée : OpenDataSoft. Tout est prêt — enregistrez pour récupérer les données. »** Nom `RappelConso`, **« Tester et sauvegarder »**. Aperçu rapide des colonnes. |
| 🖱️ **Actions** | 1. Ouvrir **Sources** → **« Nouvelle connexion »**. 2. Coller l'URL de la page → **« Continuer »**. 3. Nommer `RappelConso` → **« Tester et sauvegarder »**. 4. Cliquer la connexion, onglet **« Aperçu »** : pointer `categorie_produit` et `date_publication`. 5. **« Utiliser dans le Builder »**. |
| 🎙️ **Voix off** | « Dans Charts builder, je colle l'URL de la page : plateforme OpenDataSoft détectée, configuration déduite, connexion testée. L'aperçu me montre la matière : catégorie de produit, motif du rappel, date de publication. Tout ce qu'il faut pour deux visualisations : un chiffre clé, et une répartition. » |

## Séquence 3 — Dataviz 1 : le chiffre clé (1:00 – 1:25)

| | |
|---|---|
| 🖥️ **Écran** | Builder : type **« KPI »**, agrégation **« Comptage »**, style et unité configurés. **« Générer le graphique »** → grande tuile « ~17 500 » ; onglet **« Code généré »** → **« Copier le code »**. |
| 🖱️ **Actions** | 1. Type de graphique : **« KPI »**. 2. Agrégation : **« Comptage »**. 3. Dans **« Apparence »** : titre `Rappels publiés depuis 2021`, **« Style KPI »** : Info, **« Unité »** : `rappels`. 4. **« Générer le graphique »**. 5. Onglet **« Code généré »** → **« Copier le code »**, garder le snippet de côté. |
| 🎙️ **Voix off** | « Première dataviz : le chiffre qui pose le sujet. Un composant KPI, un comptage sur l'ensemble des fiches — plus de 17 500 rappels publiés. Je génère, je copie le code : premier widget prêt. » |

## Séquence 4 — Dataviz 2 : la répartition par catégorie (1:25 – 1:55)

| | |
|---|---|
| 🖥️ **Écran** | Builder : type **« Camembert »**, étiquettes `categorie_produit`, valeur en comptage, tri décroissant. Génération : l'alimentation écrase les autres parts. **« Copier le code »**. |
| 🖱️ **Actions** | 1. Type : **« Camembert »**. 2. **« Étiquettes »** : `categorie_produit` — libellé `Catégorie`. 3. Agrégation : **« Comptage »**, **« Ordre »** : **« Décroissant »**. 4. Titre : `Rappels par catégorie de produit` ; sous-titre : `Source : RappelConso — DGCCRF`. 5. Palette : **« Couleurs distinctes par catégorie »**. 6. **« Générer le graphique »** — survoler la part « alimentation ». 7. **« Copier le code »**. |
| 🎙️ **Voix off** | « Deuxième dataviz : qui est concerné ? Un camembert des rappels par catégorie de produit. Le résultat parle de lui-même : l'alimentation représente près de huit rappels sur dix — treize mille cinq cents fiches à elle seule. Voilà l'angle de mon article. Je copie ce deuxième fragment. » |

## Séquence 5 — Intégrer dans l'article Drupal (1:55 – 2:40)

| | |
|---|---|
| 🖥️ **Écran** | Drupal 11 (drupal11.lab.miweb.run), édition de l'article en brouillon. Passage du corps en mode d'édition HTML (bouton **« Source »** de CKEditor, format de texte « Full HTML »). Collage du snippet KPI après le premier paragraphe, du camembert après le second. **« Enregistrer »** → l'article publié affiche les deux dataviz interactives. |
| 🖱️ **Actions** | 1. Ouvrir l'article en modification dans Drupal. 2. Vérifier le format de texte (« Full HTML »), basculer l'éditeur en mode **« Source »**. 3. Coller le snippet KPI à l'emplacement 1, le snippet camembert à l'emplacement 2. 4. Cliquer sur **« Enregistrer »**. 5. Faire défiler l'article publié : le chiffre clé puis le camembert se chargent et s'affichent ; survoler une part du camembert. |
| 🎙️ **Voix off** | « Direction mon site sous Drupal. Pas de module à installer : les widgets Charts builder sont de simples fragments HTML. J'ouvre mon article, je passe l'éditeur en mode source, je colle chaque fragment à sa place, j'enregistre. Et voilà : mon article d'actualité affiche un chiffre clé et un graphique interactifs, aux couleurs du Design System de l'État — et comme ils interrogent l'API de la DGCCRF en direct, ils resteront à jour au fil des prochains rappels, sans retoucher l'article. » |

## Séquence 6 — Conclusion (2:40 – 2:55)

| | |
|---|---|
| 🖥️ **Écran** | Plan large de l'article publié, scroll lent du titre au camembert. Fondu de fin. |
| 🖱️ **Actions** | Scroll de relecture. |
| 🎙️ **Voix off** | « Un jeu de données public, deux dataviz, un article enrichi — sans écrire une ligne de code, et sans dépendance côté CMS. Charts builder s'intègre partout où l'on peut coller du HTML : Drupal, WordPress, ou un site statique. » |

---

## Plan B / variantes

- Si le format « Full HTML » n'est pas disponible sur l'instance Drupal : utiliser un champ/bloc « HTML brut » ou le module d'insertion de code, et le préciser en voix off (« selon la configuration de votre CMS »).
- Troisième dataviz possible si le rythme le permet (+20 s) : **courbe des rappels par mois** (étiquettes `date_publication` tronquée au mois via le mode avancé, comptage) — sinon la garder pour une capture d'écran de fin.
- Chiffres de secours pour la voix off (vérifiés en juillet 2026) : 17 566 fiches au total ; alimentation 13 570 (77 %) ; bébés-enfants 1 217 ; maison-habitat 589.
- Si data.economie.gouv.fr est lent : les deux snippets pré-générés en prérequis permettent de tourner la séquence Drupal indépendamment.
