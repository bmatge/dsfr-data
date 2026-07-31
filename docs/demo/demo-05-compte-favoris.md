# Démo 5 — Créer un compte et utiliser les favoris

> **Durée cible** : 2 min 55 · **Apps** : en-tête commun (`auth-modal`) + `apps/favorites` · **URL favoris** : `/apps/favorites/index.html`

## Objectif de la vidéo

Montrer la création d'un compte (avec vérification par email), puis le cycle de vie d'un favori : sauvegarde depuis le Builder, consultation dans l'app Favoris, réédition, partage public par lien anonyme — et la synchronisation multi-appareils apportée par le compte.

## Prérequis (avant tournage)

- Instance en **mode serveur** (backend + base de données actifs) : le bouton **« Connexion »** n'apparaît dans l'en-tête que si un backend est détecté.
- Une adresse email de démo accessible à l'écran (boîte mail ouverte dans un second onglet) pour montrer l'email de vérification. ⚠️ Ne pas utiliser une adresse personnelle réelle.
- Un graphique prêt à générer dans le Builder (source « Industrie du futur », type Barres — cf. démo 2) pour la séquence de sauvegarde en favori.
- Aucune session ouverte (déconnecté), et un compte qui n'existe pas encore pour cette adresse. Note : le **premier** utilisateur d'une instance devient admin et est connecté immédiatement sans email de vérification — pour montrer le parcours standard, l'instance doit déjà avoir au moins un compte.

---

## Séquence 1 — Créer son compte (0:00 – 0:50)

| | |
|---|---|
| 🖥️ **Écran** | N'importe quelle page de l'app, en-tête visible. Clic sur **« Connexion »** → la modale s'ouvre avec les onglets **« Connexion »** / **« Inscription »**. Bascule sur **« Inscription »** : champs **« Nom d'affichage »**, **« Email »**, **« Mot de passe »** (aide : « 8 caractères minimum, 1 majuscule, 1 minuscule, 1 chiffre »). Si le SSO est activé sur l'instance, un bouton « Se connecter avec… » apparaît au-dessus du formulaire, séparé par « — ou — ». |
| 🖱️ **Actions** | 1. Cliquer sur **« Connexion »** dans l'en-tête. 2. Choisir l'onglet **« Inscription »**. 3. Remplir : nom d'affichage `Camille Demo`, email de démo, mot de passe conforme. 4. Cliquer sur **« S'inscrire »**. 5. Basculer sur l'onglet boîte mail : ouvrir l'email de vérification, cliquer le lien. 6. Revenir sur l'app, se connecter via l'onglet **« Connexion »** (**« Se connecter »**). L'en-tête affiche désormais le menu **« Mon espace »**. |
| 🎙️ **Voix off** | « Jusqu'ici, tout était stocké dans le navigateur. Pour retrouver son travail partout, on crée un compte. Un nom, un email, un mot de passe robuste — et sur les instances qui le proposent, la connexion peut aussi passer par le SSO de votre organisation. Je valide mon adresse depuis l'email reçu, je me connecte : le menu "Mon espace" confirme que je suis identifiée. À partir de maintenant, mes sources, favoris et tableaux de bord sont synchronisés sur le serveur — je les retrouverai depuis n'importe quel poste. » |

## Séquence 2 — Sauvegarder un favori depuis le Builder (0:50 – 1:25)

| | |
|---|---|
| 🖥️ **Écran** | App Builder, graphique « Bénéficiaires Industrie du futur par région » généré. Clic sur le bouton étoile **« Favoris »** en haut du panneau d'aperçu → dialogue **« Sauvegarder en favoris »**, champ **« Nom du favori »** (placeholder « Ex : Population par région 2024 »). |
| 🖱️ **Actions** | 1. Ouvrir le Builder, générer le graphique préparé (raccourci de tournage : état déjà prêt, un seul clic sur **« Générer le graphique »**). 2. Cliquer sur le bouton **« Favoris »** (étoile). 3. Nommer : `Bénéficiaires par région`. 4. Cliquer sur **« Sauvegarder »** → toast « Graphique “Bénéficiaires par région” ajouté à vos favoris. » ; l'étoile devient pleine. |
| 🎙️ **Voix off** | « Direction le Builder. Mon graphique est généré ; plutôt que de copier le code tout de suite, je le mets de côté : un clic sur l'étoile, un nom, et il rejoint mes favoris. L'étoile pleine me confirme la sauvegarde — et comme je suis connectée, le favori part aussitôt sur le serveur. » |

## Séquence 3 — L'app Favoris (1:25 – 2:05)

| | |
|---|---|
| 🖥️ **Écran** | Navigation vers l'app Favoris. Sidebar **« Mes favoris »** avec compteur, tri (**« Plus recents / Plus anciens / Nom (A-Z) / Par type »**), champ **« Rechercher... »**, boutons **« Exporter »** / **« Importer »**. Clic sur le favori → zone principale : aperçu live du graphique + code. Barre d'actions : **« Playground »**, **« Builder »**, **« Copier le code »**, **« Partager »**, corbeille. |
| 🖱️ **Actions** | 1. Ouvrir l'app **Favoris**. 2. Montrer la liste (nom, type, date, app d'origine) et taper 2 lettres dans **« Rechercher... »**. 3. Sélectionner `Bénéficiaires par région` → aperçu + code. 4. Cliquer sur le crayon **« Renommer »**, corriger le nom, valider. 5. Cliquer sur **« Builder »** → le Builder se rouvre avec toute la configuration restaurée ; revenir aux Favoris. |
| 🎙️ **Voix off** | « L'app Favoris rassemble tout ce que j'ai mis de côté — graphiques du Builder, de l'assistant IA ou du Playground. Je peux trier, rechercher, renommer. Et surtout : un favori n'est pas une image figée. Le bouton Builder restaure l'intégralité de la configuration — source, type, réglages — pour reprendre l'édition exactement où je l'avais laissée. » |

## Séquence 4 — Partager publiquement (2:05 – 2:40)

| | |
|---|---|
| 🖥️ **Écran** | Clic sur **« Partager »** (infobulle « Partager publiquement (lien anonyme) ») → modale **« Partager publiquement »** avec le **« Lien public »** généré, boutons **« Copier »** et **« Revoquer le lien »**. Ouverture du lien dans une fenêtre de navigation privée : la vue publique affiche le graphique, sans compte ni connexion. |
| 🖱️ **Actions** | 1. Cliquer sur **« Partager »**. 2. Dans la modale, cliquer sur **« Copier »**. 3. Coller le lien dans une fenêtre privée → le graphique s'affiche pour un visiteur anonyme. 4. Revenir sur la modale et montrer (sans cliquer) **« Revoquer le lien »**. |
| 🎙️ **Voix off** | « Besoin de montrer le résultat à un collègue avant publication ? Le partage public génère un lien secret et anonyme : la personne voit le graphique sans compte ni installation. Et si le partage n'a plus lieu d'être, on révoque le lien d'un clic. » |

## Séquence 5 — Conclusion (2:40 – 2:55)

| | |
|---|---|
| 🖥️ **Écran** | Retour sur la liste des favoris ; ouverture rapide du menu **« Mon espace »** dans l'en-tête (nom et email affichés, entrées « Mot de passe » et « Se deconnecter »). Fondu de fin. |
| 🖱️ **Actions** | Ouvrir le menu **« Mon espace »**, le laisser affiché 2 s. |
| 🎙️ **Voix off** | « Un compte, des favoris synchronisés, le partage en un lien : Charts builder devient votre espace de travail dataviz. Sources, Builder, assistant IA, Playground, favoris — vous avez maintenant tous les outils en main. » |

---

## Plan B / variantes

- Si l'envoi d'email n'est pas configuré sur l'instance de tournage, filmer le parcours d'inscription jusqu'au message de confirmation, puis enchaîner avec un compte pré-vérifié (coupe au montage) — ne pas montrer d'astuce d'activation manuelle à l'écran.
- La suppression d'un favori (corbeille → modale « Supprimer ce favori ? … Cette action est irreversible. ») peut remplacer la séquence 4 si le partage public n'est pas activé sur l'instance.
- Hors chrono (version longue) : **« Exporter »** / **« Importer »** des favoris en JSON (`dsfr-data-favoris.json`), et l'ouverture d'un favori dans le **Playground**.
- Instance en mode `OIDC_ONLY` : le formulaire local disparaît — cette vidéo suppose une instance avec inscription locale activée.
