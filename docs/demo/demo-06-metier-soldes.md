# Démo métier 6 — Illustrer un article sur les soldes : de la recherche de données au graphique

> **Durée cible** : 2 min 55 · **Persona** : rédacteur / chargé de communication · **Apps** : Sources + Builder
> **Données** : INSEE Melodi, dataset `DS_ICA` — indice de volume des ventes (IVVC) du commerce de détail d'habillement (NAF 47.71)

## Scénario

« On me demande d'illustrer un article sur les soldes en France. Je n'ai pas de données sous la main : je les cherche, je les branche, et je produis un graphique qui montre l'effet des soldes sur les ventes d'habillement. »

L'angle éditorial : dans la série mensuelle de l'INSEE, **le pic de janvier** (soldes d'hiver) saute aux yeux — en 2026, l'indice bondit à 124 en janvier avant de retomber à 83 en février.

## Prérequis (avant tournage)

- Instance Charts builder lancée.
- Onglets prêts dans le navigateur : data.gouv.fr et le catalogue de données INSEE (catalogue-donnees.insee.fr).
- URL Melodi préparée dans un gestionnaire de notes (elle sera collée à l'écran) :
  `https://api.insee.fr/melodi/data/DS_ICA?ACTIVITY=47.71&IDX_TYPE=IVVC&SEASONAL_ADJUST=N`
  (ACTIVITY 47.71 = commerce de détail d'habillement ; IVVC = indice de volume des ventes ; SEASONAL_ADJUST=N = série brute, indispensable pour voir la saisonnalité des soldes).
- ⚠️ **Répétition générale obligatoire** : dérouler une fois le parcours complet (détection de l'URL Melodi, aperçu, graphique) pour noter les noms exacts des colonnes aplaties (`TIME_PERIOD`, `OBS_VALUE_NIVEAU`) et vérifier le temps de chargement de la série.

---

## Séquence 1 — La commande, et la chasse aux données (0:00 – 0:40)

| | |
|---|---|
| 🖥️ **Écran** | Maquette de l'article en cours de rédaction (traitement de texte ou CMS) avec un emplacement vide « [graphique ici] ». Puis navigateur : recherche « soldes » sur data.gouv.fr — résultats décevants (comptes publics, délibérations municipales…). Bascule sur le site de l'INSEE. |
| 🖱️ **Actions** | 1. Montrer 3 s l'article en préparation. 2. Taper `soldes` dans la recherche de data.gouv.fr, faire défiler les résultats. 3. Ouvrir le catalogue INSEE, montrer la fiche de l'indice de chiffre d'affaires / volume des ventes dans le commerce de détail. |
| 🎙️ **Voix off** | « La rédaction me demande d'illustrer un article sur les soldes. Premier réflexe : chercher des données ouvertes. Sur data.gouv.fr, "soldes" renvoie surtout… des soldes comptables. Le bon filon est ailleurs : l'INSEE publie chaque mois l'indice de volume des ventes du commerce de détail, décliné par activité — dont l'habillement, le secteur roi des soldes. Et son API Melodi est ouverte, sans clé. » |

## Séquence 2 — Brancher l'API INSEE dans Sources (0:40 – 1:20)

| | |
|---|---|
| 🖥️ **Écran** | App **Sources** de Charts builder. Clic sur **« Nouvelle connexion »**, collage de l'URL Melodi dans **« Adresse du jeu de données »**, clic sur **« Continuer »** → message **« Plateforme détectée : INSEE (Melodi) »**. Nom pré-rempli, clic sur **« Tester et sauvegarder »**. |
| 🖱️ **Actions** | 1. Ouvrir **Sources**. 2. **« Nouvelle connexion »**. 3. Coller l'URL `https://api.insee.fr/melodi/data/DS_ICA?ACTIVITY=47.71&IDX_TYPE=IVVC&SEASONAL_ADJUST=N`. 4. **« Continuer »** — zoom sur « Plateforme détectée : INSEE (Melodi) ». 5. Renommer la connexion : `Ventes habillement (INSEE)`. 6. **« Tester et sauvegarder »**. |
| 🎙️ **Voix off** | « Pas besoin de lire la documentation de l'API : je colle l'adresse dans Charts builder, qui reconnaît la plateforme INSEE Melodi et pré-configure tout. L'URL embarque déjà mes filtres : l'activité habillement, l'indice de volume des ventes, et la série brute — car c'est justement la saisonnalité qui m'intéresse. Test de connexion, sauvegarde : c'est branché. » |

## Séquence 3 — Vérifier les données (1:20 – 1:40)

| | |
|---|---|
| 🖥️ **Écran** | Explorateur de la connexion, onglet **« Aperçu »** : tableau des observations aplaties — colonnes `TIME_PERIOD` (mois) et `OBS_VALUE_NIVEAU` (indice), bandeau de métadonnées. |
| 🖱️ **Actions** | 1. Cliquer sur la connexion. 2. Parcourir l'aperçu : pointer `TIME_PERIOD` et `OBS_VALUE_NIVEAU`. 3. Cliquer sur **« Utiliser dans le Builder »**. |
| 🎙️ **Voix off** | « Un coup d'œil à l'aperçu : une ligne par mois depuis 2005, avec la période et la valeur de l'indice. C'est exactement la matière qu'il me faut. Direction le Builder. » |

## Séquence 4 — Construire la courbe (1:40 – 2:25)

| | |
|---|---|
| 🖥️ **Écran** | Builder, source présélectionnée. Type **« Lignes »**. Configuration : étiquettes `TIME_PERIOD`, valeur `OBS_VALUE_NIVEAU`, ordre **« Ordre source »**. Mode avancé activé, filtre `TIME_PERIOD:gte:2023-01` pour resserrer sur les 3 dernières années. Titre, palette, **« Générer le graphique »** : la courbe apparaît avec ses pics de décembre-janvier. |
| 🖱️ **Actions** | 1. Type de graphique : **« Lignes »**. 2. **« Étiquettes (axe horizontal) »** : `TIME_PERIOD` — libellé `Mois`. 3. **« Valeur à mesurer (Série 1) »** : `OBS_VALUE_NIVEAU` — libellé `Indice de volume des ventes`. 4. **« Ordre »** : **« Ordre source »**. 5. Activer **« Mode avancé (filtres & requêtes) »**, filtre : `TIME_PERIOD:gte:2023-01`. 6. Titre : `L'effet soldes sur les ventes d'habillement` ; sous-titre : `Indice de volume des ventes, base 100 en 2021 — Source : INSEE`. 7. **« Générer le graphique »**. 8. Survoler le point de janvier 2026 (124) puis février (83). |
| 🎙️ **Voix off** | « Une courbe, la période en abscisse, l'indice en ordonnée. Je filtre sur les trois dernières années pour que le motif reste lisible. Et le voilà, mon angle d'article : chaque mois de janvier, les ventes d'habillement s'envolent — ici l'indice grimpe à 124 — avant de retomber à 83 en février. L'effet soldes, visible d'un seul regard. Le graphique cite sa source et sa base : l'INSEE, base 100 en 2021. » |

## Séquence 5 — Livrer le graphique (2:25 – 2:55)

| | |
|---|---|
| 🖥️ **Écran** | Onglet **« Code généré »**, clic sur **« Copier le code »**. Retour à la maquette de l'article : le code est collé, le graphique s'affiche dans la page (montage). Fondu de fin. |
| 🖱️ **Actions** | 1. Onglet **« Code généré »** → **« Copier le code »** (toast). 2. Coller dans la page de l'article (ou montrer le rendu final préparé). 3. Plan final sur l'article illustré. |
| 🎙️ **Voix off** | « Il ne reste qu'à copier le fragment HTML et à le coller dans l'article. Le graphique est autonome, aux couleurs de l'État, accessible — et comme il interroge l'API de l'INSEE, il affichera les prochains mois sans que j'aie à y retoucher. De la recherche de données au graphique publié : quelques minutes. » |

---

## Plan B / variantes

- Si la détection Melodi ou l'aplatissement des colonnes ne se comporte pas comme attendu à la répétition : télécharger la série en CSV depuis le site INSEE et la charger en **source manuelle** (onglet « Importer CSV ») — le reste du parcours Builder est identique (mais le graphique devient statique : adapter la dernière phrase de la voix off).
- Si la série complète est trop lente à charger : garder le filtre d'URL et ajouter `&maxResult=…` réduit, ou resserrer le filtre du Builder à `2024-01`.
- Chiffres de secours pour la voix off (vérifiés en juillet 2026) : décembre 2025 = 144, janvier 2026 = 124, février 2026 = 83.
