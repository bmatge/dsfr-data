# Démo 3 — Utiliser le Builder IA

> **Durée cible** : 2 min 55 · **App** : `apps/builder-ia` · **URL** : `/apps/builder-ia/index.html` (nav « Assistant IA »)

## Objectif de la vidéo

Montrer la création d'un graphique par simple conversation en français avec l'assistant, propulsé par Albert (l'IA souveraine de l'État) : demande en langage naturel, boucle agentique visible (l'IA inspecte les vraies données avant de générer), itération, puis export du code embarquable.

## Prérequis (avant tournage)

- Instance avec la **configuration Albert serveur** active (badge « Albert (serveur) » dans la section « Configuration IA ») — aucun token à saisir à l'écran.
- Source **« Industrie du futur »** (OpenDataSoft, data.economie.gouv.fr) déjà créée dans Sources — champs `nom_region`, `nombre_beneficiaires`, `montant_investissement`.
- Visite guidée déjà vue ; conversation précédente effacée (bouton corbeille « Effacer la conversation »).
- Prompts répétés en amont : les temps de réponse de l'IA varient — prévoir des coupes au montage sur les temps d'attente.

---

## Séquence 1 — Introduction (0:00 – 0:20)

| | |
|---|---|
| 🖥️ **Écran** | Page d'accueil, clic sur **« Assistant IA »**. L'app s'ouvre : à gauche la configuration et le chat **« Assistant graphiques »** avec son message d'accueil (« Sélectionnez une source de données… Décrivez le graphique souhaité en français »), à droite le panneau avec les onglets **« Aperçu »**, **« Code »**, **« Données »** et le message « Discutez avec l'assistant pour créer votre graphique ». |
| 🖱️ **Actions** | Naviguer vers **« Assistant IA »**. Laisser 3 s sur l'interface. |
| 🎙️ **Voix off** | « Et si on créait un graphique simplement en le décrivant ? C'est le Builder IA : un assistant conversationnel propulsé par Albert, l'IA souveraine de l'État. On lui parle en français, il construit le graphique — et il vérifie les données réelles avant de répondre. » |

## Séquence 2 — Charger la source (0:20 – 0:35)

| | |
|---|---|
| 🖥️ **Écran** | Section **« Source de données »** : select **« Source »**, bouton **« Charger »**. Zoom bref sur le badge d'état IA « Albert (serveur) » dans **« Configuration IA »**. |
| 🖱️ **Actions** | 1. Sélectionner la source **« Industrie du futur »** dans **« Source »**. 2. Cliquer sur **« Charger »**. 3. Pointer 2 s le badge « Albert (serveur) ». |
| 🎙️ **Voix off** | « Comme dans le Builder classique, tout part d'une source de données — je charge les bénéficiaires du programme Industrie du futur. L'IA est déjà configurée côté serveur : rien à installer, aucun jeton à saisir. » |

## Séquence 3 — Première demande en langage naturel (0:35 – 1:30)

| | |
|---|---|
| 🖥️ **Écran** | Champ de saisie (placeholder « Decrivez le graphique que vous souhaitez créer... »). Saisie du prompt, envoi. Le chat affiche « Réflexion en cours… » puis les étapes de raisonnement en direct : « J'examine le jeu de données… », « Je vérifie le rendu du graphique… ». Le graphique en barres apparaît dans l'onglet **« Aperçu »**, la réponse de l'assistant s'affiche avec des suggestions cliquables. |
| 🖱️ **Actions** | 1. Taper : `Un diagramme en barres des bénéficiaires par région, top 5.` 2. Appuyer sur **Entrée**. 3. Laisser dérouler les étapes de raisonnement (zoom sur ces libellés). 4. Le graphique se dessine à droite. 5. Montrer le bloc repliable « Raisonnement de l'assistant (N étapes) » et les suggestions (« Changer le type de graphique », « Ajouter des facettes », « Générer le code embarquable »). |
| 🎙️ **Voix off** | « Je décris ce que je veux, en français : "un diagramme en barres des bénéficiaires par région, top cinq". Et regardez ce qui se passe : l'assistant ne devine pas — il travaille. Il examine le jeu de données, vérifie les champs et les valeurs réelles, teste le rendu, et corrige tout seul si quelque chose cloche. Quelques secondes plus tard, le graphique est là : les cinq premières régions, agrégées et triées. Chaque étape du raisonnement reste consultable, et l'assistant me propose déjà des pistes pour continuer. » |

## Séquence 4 — Itérer par la conversation (1:30 – 2:10)

| | |
|---|---|
| 🖥️ **Écran** | Nouvelle saisie dans le chat. Le graphique de l'aperçu se transforme en camembert. Deuxième itération : ajout d'un filtre. |
| 🖱️ **Actions** | 1. Taper : `Passe en camembert` (ou cliquer la suggestion **« Changer le type de graphique »** puis préciser). 2. Envoi → l'aperçu devient un camembert. 3. Taper : `Reviens en barres et montre plutôt le montant d'investissement par région`. 4. Envoi → le graphique se met à jour. |
| 🎙️ **Voix off** | « La conversation continue, le graphique suit. "Passe en camembert" — c'est fait. "Reviens en barres et montre plutôt le montant d'investissement" — l'assistant garde le contexte de tout l'échange et reconfigure le graphique à chaque tour. Pas de formulaire, pas de documentation à lire : on affine par le dialogue, comme avec un collègue. » |

## Séquence 5 — Générer et récupérer le code (2:10 – 2:45)

| | |
|---|---|
| 🖥️ **Écran** | Clic sur la suggestion **« Générer le code embarquable »**. Bascule sur l'onglet **« Code »** : le snippet HTML complet s'affiche. Clic sur **« Copier le code »** → toast « Code copie dans le presse-papiers ! ». Survol du bouton « Ouvrir dans le Playground ». |
| 🖱️ **Actions** | 1. Cliquer sur la suggestion **« Générer le code embarquable »**. 2. Ouvrir l'onglet **« Code »**, faire défiler le snippet. 3. Cliquer sur **« Copier le code »**. 4. Survoler le bouton d'ouverture dans le Playground. Jeter un œil rapide à l'onglet **« Données »**. |
| 🎙️ **Voix off** | « Dernière étape : "génère le code embarquable". L'assistant produit le fragment HTML autonome — composants dsfr-data, styles et scripts inclus — identique à celui du Builder classique. Je le copie, ou je l'ouvre dans le Playground pour le retoucher à la main. L'onglet Données permet de contrôler ce que renvoie l'API. » |

## Séquence 6 — Conclusion (2:45 – 2:55)

| | |
|---|---|
| 🖥️ **Écran** | Vue d'ensemble de l'app : le chat avec l'historique de la conversation à gauche, le graphique final à droite. Fondu de fin. |
| 🖱️ **Actions** | Dézoomer / plan large. |
| 🎙️ **Voix off** | « Du langage naturel au widget prêt à publier, en moins de trois minutes — et avec une IA hébergée en France. C'est le Builder IA de Charts builder. » |

---

## Plan B / variantes

- Prompts de rechange validés par les tests : `barres population par region`, `kpi prix moyen dans le departement 48` (selon la source chargée).
- Si l'IA est lente, couper les attentes au montage en gardant à l'écran les étapes de raisonnement (elles font partie de la démonstration).
- Si le serveur Albert est indisponible : basculer sur un jeton personnel dans **« Configuration IA »** (hors champ), ou reporter le tournage — ne pas montrer le mode dégradé par commandes (`barres champ1 champ2`) dans cette vidéo.
- Ne **pas** promettre d'autres fournisseurs à l'écran ; mentionner uniquement Albert (la compatibilité OpenAI/Anthropic/Mistral existe mais n'est pas l'objet de la démo).
