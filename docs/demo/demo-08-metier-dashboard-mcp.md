# Démo métier 8 — Un tableau de bord construit par l'IA : Claude + extension Chrome + MCP ChartsBuilder

> **Durée cible** : 3 min 00 · **Persona** : chargé d'études / data analyst outillé IA · **Outils** : Claude (claude.ai) + extension **Claude in Chrome** + connecteur MCP **ChartsBuilder** + Playground
> **Données** : `prix-controle-technique` (DGCCRF) sur data.economie.gouv.fr — ~143 000 tarifs de centres de contrôle technique

## Scénario

« On me demande un tableau de bord sur les prix des contrôles techniques publiés par la DGCCRF. Plutôt que de le construire écran par écran, je le délègue à Claude : le connecteur MCP ChartsBuilder lui fournit les spécifications des composants dsfr-data, et l'extension Claude in Chrome lui permet de tester lui-même le résultat dans mon navigateur. »

Le message : **l'IA généraliste devient un intégrateur Charts builder compétent** dès qu'on lui branche le MCP — et elle vérifie son propre travail dans le navigateur.

## Prérequis (avant tournage)

- Compte claude.ai avec : le connecteur MCP **ChartsBuilder** activé (serveur `dsfr-data-mcp` en mode HTTP — il expose 4 outils : `list_skills`, `get_skill`, `get_relevant_skills`, `generate_widget_code`) et l'extension **Claude in Chrome** installée et autorisée sur `chartsbuilder.miweb.run`.
- Conversation Claude vierge ; onglet Chrome ouvert sur le Playground de l'instance (`https://chartsbuilder.miweb.run/playground/`).
- Prompt principal répété en amont (les temps de génération varient — prévoir des coupes au montage).
- ⚠️ Répétition générale : dérouler le prompt une fois pour vérifier que les outils MCP répondent et que l'extension a bien les permissions sur le domaine.

---

## Séquence 1 — La commande et le dispositif (0:00 – 0:30)

| | |
|---|---|
| 🖥️ **Écran** | Page du dataset `prix-controle-technique` sur data.economie.gouv.fr (143 000 lignes : centre, commune, région, catégorie de véhicule, prix de la visite). Puis claude.ai : ouverture du panneau des connecteurs, le connecteur **ChartsBuilder** est actif avec ses outils visibles. |
| 🖱️ **Actions** | 1. Montrer 5 s la page du jeu de données (colonnes `cct_denomination`, `nom_region`, `cat_vehicule_libelle`, `prix_visite`). 2. Basculer sur claude.ai, ouvrir la liste des connecteurs, pointer **ChartsBuilder** et ses outils. |
| 🎙️ **Voix off** | « La DGCCRF publie les tarifs de tous les centres de contrôle technique de France — cent quarante-trois mille lignes. On me demande un tableau de bord. Cette fois, je ne vais pas le construire moi-même : je vais le faire construire. Mon assistant Claude est relié au connecteur MCP ChartsBuilder, qui lui donne accès aux spécifications de tous les composants dataviz — et l'extension Claude in Chrome lui prête mes mains dans le navigateur. » |

## Séquence 2 — Le prompt (0:30 – 0:55)

| | |
|---|---|
| 🖥️ **Écran** | Zone de saisie claude.ai. Saisie du prompt complet, envoi. |
| 🖱️ **Actions** | Taper et envoyer : `Construis-moi un tableau de bord HTML avec les composants dsfr-data sur le dataset "prix-controle-technique" de data.economie.gouv.fr (API OpenDataSoft) : un KPI du prix moyen de la visite pour une voiture particulière, un graphique en barres du prix moyen par région, et un tableau des 10 centres les moins chers. Source dynamique (pas de données en dur). Teste ensuite le rendu dans le Playground de chartsbuilder.miweb.run avec l'extension Chrome.` |
| 🎙️ **Voix off** | « Ma commande tient en une phrase — ou presque : un indicateur du prix moyen pour une voiture particulière, un comparatif par région, et le palmarès des centres les moins chers. Je précise deux exigences de pro : des sources dynamiques branchées sur l'API, et une vérification du rendu dans le Playground. » |

## Séquence 3 — Claude consulte le MCP et génère le code (0:55 – 1:40)

| | |
|---|---|
| 🖥️ **Écran** | Fil de la conversation : les appels d'outils MCP s'affichent — `get_relevant_skills` puis `generate_widget_code` (dérouler un appel pour montrer la spécification reçue : attributs de `dsfr-data-kpi`, `dsfr-data-query`…). Puis Claude rédige le bloc de code HTML complet du tableau de bord. |
| 🖱️ **Actions** | 1. Laisser dérouler les appels d'outils ; déplier celui de `generate_widget_code` 3 s. 2. Faire défiler le code produit : `<dsfr-data-source api-type="opendatasoft" dataset-id="prix-controle-technique">`, un `<dsfr-data-kpi>` avec filtre voiture particulière, un `<dsfr-data-query>` avec `group-by` région et moyenne, un `<dsfr-data-list>` trié par prix. |
| 🎙️ **Voix off** | « Regardez ce qui se passe : avant d'écrire la moindre ligne, Claude interroge le serveur MCP. Celui-ci lui renvoie les "skills" ChartsBuilder — la documentation exacte de chaque composant, la même qui alimente le Builder IA. Résultat : pas de code inventé. L'assistant assemble une source branchée sur l'API de Bercy, une requête qui agrège les prix par région côté serveur, un KPI filtré sur les voitures particulières, et un tableau trié. Du dsfr-data idiomatique, comme l'aurait écrit un intégrateur qui connaît la bibliothèque. » |

## Séquence 4 — Claude teste lui-même dans le navigateur (1:40 – 2:30)

| | |
|---|---|
| 🖥️ **Écran** | L'extension Claude in Chrome prend la main : l'onglet du **Playground** s'active, le code est collé dans l'éditeur, clic sur **« Executer »**. Le tableau de bord se rend dans l'aperçu : la tuile KPI (~84 €), les barres par région, le tableau des centres. Claude capture l'écran et commente le résultat dans la conversation. |
| 🖱️ **Actions** | 1. Ne pas toucher au clavier : montrer la navigation pilotée par l'extension (badge actif). 2. Le code apparaît dans l'éditeur du Playground, **« Executer »** est cliqué. 3. Zoom sur le rendu : KPI, barres, tableau. 4. Retour au fil claude.ai : Claude confirme le rendu (capture à l'appui) et propose un ajustement. |
| 🎙️ **Voix off** | « Et maintenant, la partie la plus impressionnante : je ne copie rien moi-même. Via l'extension Chrome, Claude ouvre le Playground de mon instance, colle son code, l'exécute — et vérifie le résultat de ses propres yeux. Le prix moyen d'un contrôle technique pour une voiture particulière : quatre-vingt-quatre euros. Les écarts entre régions, le palmarès des centres. Si un champ était erroné, il le verrait à l'écran et corrigerait. La boucle générer-tester-corriger, entièrement déléguée. » |

## Séquence 5 — Itération en langage naturel (2:30 – 2:50)

| | |
|---|---|
| 🖥️ **Écran** | Nouvelle consigne dans claude.ai : `Ajoute un second KPI avec le prix moyen de la contre-visite maximale, et trie les régions par prix décroissant.` Claude modifie le code, le re-teste dans le Playground : le tableau de bord se met à jour. |
| 🖱️ **Actions** | 1. Envoyer la consigne d'ajustement. 2. Laisser l'extension rejouer le collage + **« Executer »**. 3. Plan sur le tableau de bord final à l'écran. |
| 🎙️ **Voix off** | « Un ajustement ? Je le demande, en français. L'assistant met le code à jour, le rejoue dans le Playground, et me montre le résultat. Le tableau de bord est prêt à être copié dans une page, sauvegardé en favori — ou remis à l'équipe web tel quel. » |

## Séquence 6 — Conclusion (2:50 – 3:00)

| | |
|---|---|
| 🖥️ **Écran** | Écran scindé (montage) : le fil de conversation Claude à gauche, le tableau de bord rendu à droite. Fondu de fin. |
| 🖱️ **Actions** | Plan de conclusion. |
| 🎙️ **Voix off** | « Un jeu de données public, un prompt, trois minutes : le MCP ChartsBuilder transforme n'importe quel assistant IA en intégrateur dataviz de l'État — et le navigateur devient son banc d'essai. » |

---

## Plan B / variantes

- Si l'extension Chrome n'a pas la main au tournage : Claude fournit le code dans la conversation, l'utilisateur le colle lui-même dans le Playground (adapter la voix off des séquences 4–5 : « je colle son code et j'exécute »).
- Si le premier rendu de Claude comporte une erreur à la répétition : la **garder** dans la vidéo si elle est corrigée par la boucle de test — c'est l'argument central (l'IA vérifie et corrige) ; sinon régénérer.
- Chiffres de secours pour la voix off (vérifiés en juillet 2026) : 142 963 tarifs ; prix moyen visite « Voiture particulière » ≈ 84,34 € (28 531 tarifs) ; motos ≈ 71 € ; camping-cars ≈ 88 €.
- Variante « poste développeur » : même scénario dans Claude Code (le serveur `dsfr-data-mcp` en mode stdio via `npx dsfr-data-mcp`), le code étant écrit directement dans un fichier du projet — à réserver à un public technique.
