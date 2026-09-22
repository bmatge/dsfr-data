# ADR-137 — Assistant contextuel des interfaces, et socle IA commun avec le studio

- **Statut** : proposé (2026-09-22)
- **Numéro** : provisoire — les ADR vivent dans le vault ([ADR-053]) ; à confirmer au report.
- **Décideurs** : Bertrand Matge
- **Liens** : diagnostic #605-#609, studio #607, frontière lib/app #319, specs générées #757,
  référence des skills générée #512, assistant d'origine : `proto-catalogue-donnees`
  (`docs/ALBERT-ASSISTANT.md`) et `proto-ecosysteme-sircom`.

[ADR-053]: ~/Documents/Obsidian/30-Knowledge/ADR/ADR-053-carte-architecture-repo-et-feature-vault.md

## Contexte

Deux besoins, qu'on a longtemps pris pour un seul :

1. **Construire sans interface** : on décrit ce qu'on veut, l'IA écrit le document. C'est le rôle du
   studio IA (et du builder IA, appelé à fusionner avec lui).
2. **Être accompagné dans une interface** : l'usager est dans le builder carto, le builder graphique,
   le dashboard, le playground… Il sait ce qu'il veut (« afficher les POI dans une fiche et pas dans
   un volet », « ajouter une série »), pas où c'est ; ou bien la carte reste vide et rien ne dit
   pourquoi, parce que l'erreur n'est visible que dans les outils de développement.

Le second besoin n'a aujourd'hui qu'une réponse : le bouton « Envoyer à l'assistant » du volet
Diagnostic, qui **quitte l'app** pour ouvrir le builder IA (`builder-carto/src/main.ts`,
`envoyerDiagnosticVersAssistant`). L'usager perd l'interface qu'il réglait au moment où il a besoin
d'aide dessus.

Les briques pour faire mieux existent déjà, mais dispersées :

| Brique | Où | Ce qu'elle sait faire |
|---|---|---|
| Trace du pipeline | `packages/shared/src/debug/` (recorder, frame, mount, format) | lignes par étape, champs, erreurs, `attemptedUrl` ; branchée dans 7 apps via `mountDiagnosticPanel` (iframe ou racine du document) |
| Analyse statique du balisage | `packages/shared/src/debug/lint-markup.ts` + contrat généré | déjà partagée avec le serveur MCP (`diagnose_widget_code`) |
| Outils de diagnostic pour un modèle | `apps/studio/src/ia/diagnostic-tools.ts` | `run_and_trace`, `trace_pipeline`, `inspect_stage` : schémas plats, texte français, masquage |
| Transport Albert | `apps/studio/src/ia/transport.ts` (et `builder-ia/src/chat/chat.ts`) | clé côté serveur (`/ia-proxy-default`), retry 429 |
| Boucles agentiques | `apps/studio/src/ia/agent-loop.ts` (`MAX_ROUNDS = 8`), `apps/builder-ia/src/ia/agent-loop.ts` (`MAX_ROUNDS = 6`) | deux implémentations de la même chose |
| Correspondance phrase → fiche | `packages/shared/src/ia/skill-matching.ts` | sans appel au modèle ; copié dans le MCP |
| Mise en évidence d'un contrôle | `packages/shared/src/ui/product-tour.ts` | sélecteur + `onBeforeShow` (ouvrir une section), déjà utilisé par 6 apps |
| Diagnostic heuristique de la carto | `builder-carto/src/main.ts` (`updatePreviewStatus`) | « chargé mais rien dessiné », « Zones sans géométrie », « aucune donnée » |
| Recensement des contrôles | `scripts/list-builder-parameters.ts` | extraction des `select`/`input` du builder — jamais branchée en CI |

## Décision

### 1. Deux modes, un socle

```
                       ┌──────────────────────────────────────────────┐
                       │     Socle IA commun  (packages/shared/ia)    │
                       │  transport Albert · boucle agentique ·       │
                       │  plafond d'appels · masquage · skills +      │
                       │  correspondance · DIAGNOSTIC (trace, réseau, │
                       │  console, règles → constats)                 │
                       └──────────────┬─────────────────┬─────────────┘
                                      │                 │
         ┌────────────────────────────┴───┐     ┌───────┴──────────────────────────┐
         │  ASSISTANT CONTEXTUEL          │     │  STUDIO IA                       │
         │  (app-assistant, app-ui)       │     │  (apps/studio, + builder-ia)     │
         │  + registre de repères généré  │     │  + outils d'écriture du document │
         │  + montrer / guider            │     │  l'IA ÉCRIT                      │
         │  + plan pas à pas              │     │                                  │
         │  l'USAGER agit                 │     │                                  │
         └───────────────┬────────────────┘     └──────────────────────────────────┘
                         │ un adaptateur par app
     builder · builder-carto · dashboard · playground · pipeline-helper · sources
```

Et un troisième consommateur du diagnostic : le **serveur MCP**, qui partage déjà `lintMarkup` et
doit rendre les mêmes constats qu'un usager voit dans l'interface.

- **Assistant contextuel** : forme, expert de l'interface. Il ne modifie pas l'état de l'app ; il
  montre, explique, signale. Au plus il **prépare** une valeur (présélection) que l'usager confirme.
- **Studio IA** : il écrit. Les constats de diagnostic lui servent à corriger lui-même.
- **Passage de l'un à l'autre** par le mécanisme de passation existant (`transmettreDiagnostic`,
  `appHref`) : « construis-le pour moi » (contextuel → studio), « ouvre-le dans le builder carto pour
  le régler » (studio → builder, assistant contextuel prêt).

### 2. Le socle vit dans `packages/shared`

On **déplace** plutôt que de réécrire : le transport et la boucle du studio deviennent le socle ;
le builder IA s'y raccorde (ce qui prépare la fusion studio / builder IA). Frontière #319 : tout
cela est **app-side** (entrée `@dsfr-data/shared`, jamais `@dsfr-data/shared/lib`) ; la lib
`packages/core` n'en importe rien. Les règles de diagnostic, pures et sans DOM, sont écrites pour
pouvoir être aussi servies par le MCP.

### 3. Diagnostic : trace + réseau + console → constats

- **Journal réseau** : enveloppe de `fetch` posée au chargement de l'app (ou dans le tampon précoce
  de l'iframe d'aperçu), complétée par `PerformanceObserver` : URL, méthode, code HTTP, durée, type,
  taille, erreur. **Limite assumée** : un blocage CORS n'est vu qu'en `TypeError: Failed to fetch` ;
  on le **déduit** en rejouant l'URL par le proxy.
- **Console** : `window.onerror`, `unhandledrejection`.
- **Masquage** avant tout envoi au modèle : en-têtes d'authentification, jetons en paramètre d'URL,
  et valeurs d'échantillon selon l'option existante `redactValues`.
- **Règles** : fonctions pures `(trace, réseau, état) → Constat[]`, testées une à une. Premier lot
  (carto) : pas de champ géo, lat/lon inversées, Lambert 93, décimales à virgule, points à (0,0),
  adresse ou code INSEE seuls, plus d'enregistrements que `max-items`, volume ou latence excessifs,
  HTTP 4xx/5xx, CORS.
- **Chaque constat désigne le ou les repères qui le corrigent** (§4). C'est le lien entre les deux
  moitiés : l'erreur silencieuse arrive en pastille « Me montrer », et le clic suit le chemin du
  guidage, prérequis compris.

### 4. Repères : tous les contrôles, générés et vérifiés en CI

Même principe que la chaîne attributs → custom-elements.json → skills → specs (#512, #757) :

- **Chaque contrôle porte son repère dans le balisage**, en HTML statique comme dans les gabarits TS
  rendus à la volée :
  `data-repere="carto.popup-mode"`, `data-prerequis="couche-active"`,
  `data-attribut="dsfr-data-map-layer:popup-mode"` quand il pilote un attribut de la lib.
- **`npm run build:reperes`** extrait ces marques (index.html + gabarits TS) et génère le registre
  de chaque app (`*.reperes.generated.ts`), enrichi de la description de l'attribut tirée du
  custom-elements manifest. Jamais édité à la main.
- **`npm run check:reperes`**, bloquant en CI, échoue si :
  1. un `input`, `select`, `textarea` ou `button` des zones de réglage n'a pas de repère
     (exceptions déclarées, avec leur raison) ;
  2. un `data-attribut` n'existe pas dans le manifeste ;
  3. un prérequis cité n'est implémenté par aucune règle de l'app ;
  4. le registre généré n'est pas à jour.
- **Alignement à trois** : attribut de la lib ↔ contrôle ↔ fiche skill. Un attribut qui change
  désigne en CI le contrôle et la fiche à reprendre ; l'assistant explique tout contrôle avec la fiche
  déjà maintenue.
- **Les visites guidées** deviennent des suites de repères : une seule description de l'interface.

### 5. Prérequis : ce que l'assistant enseigne

Un prérequis est une règle nommée, implémentée une fois par app, qui porte son message et **le
repère qui le lève** :

| Prérequis | Message | Repère qui le lève |
|---|---|---|
| `couche-active` | Avant de choisir l'affichage des POI, sélectionnez une couche. | `carto.couches.liste` |
| `couche-interactive` | Cette couche est décorative : désactivez l'option dans Options avancées. | `carto.no-interactive` |
| `type-multi-series` | Ce type n'a qu'une série : passez en barres, courbes ou radar. | `builder.type` |

Un prérequis manquant n'est jamais un refus : l'assistant montre d'abord le repère qui le lève, puis
reprend.

### 6. Montrer, guider, pas à pas

- **Outil `montrer(id)`** : paramètre à **enum** fermé sur les identifiants du registre (décodage
  guidé vLLM, schéma plat). Le modèle ne produit jamais de sélecteur. Le code vérifie les prérequis,
  révèle (ouvre le panneau, sélectionne l'onglet, attend le rendu) puis met en évidence.
- **Plan** : suite de repères ; l'assistant écoute les changements d'état de l'app et avance quand
  l'étape est faite, sans bouton « suivant ».
- **Correspondance sans modèle d'abord** (`skill-matching` sur libellés, synonymes et fiches) ;
  Albert seulement si rien ne correspond clairement. Le guidage simple fonctionne donc sans clé.
- **Playground** : le repère désigne un **endroit du code** (ligne, balise, attribut) plutôt qu'un
  contrôle ; même panneau, adaptateur différent, s'appuyant sur `lint-markup`.

### 7. Accessibilité : deux modes

| Mode | Comportement | Défaut |
|---|---|---|
| **Dire** | Mise en évidence visuelle, annonce `aria-live` avec le chemin (« Panneau Éléments › Au clic sur un élément »), aucun déplacement du focus. Le panneau n'est ouvert que parce que l'usager l'a demandé. | oui (conforme) |
| **Guider** | Ouvre, fait défiler, **déplace le focus** sur le contrôle. Choix explicite, mémorisé. | non |

Aucune animation sous `prefers-reduced-motion`. Jamais d'ouverture spontanée du panneau
conversationnel : un constat se signale par une pastille, l'usager ouvre.

### 8. Albert : sobriété

10 requêtes/minute par clé en expérimentation, partagées par toute l'instance. D'où : règles
déterministes d'abord (la plupart des constats et des demandes de guidage ne coûtent aucun appel),
plafond de tours d'outils, plafond d'appels global côté serveur (repris de `proto-catalogue-donnees`,
`lib/assistant/debit.js`), prise en compte de `Retry-After`.

## Conséquences

**Positives**
- L'aide arrive là où l'usager travaille ; plus de départ forcé vers le builder IA.
- Une seule implémentation du transport, de la boucle et du diagnostic pour le studio, le builder IA,
  l'assistant contextuel et le MCP.
- L'interface devient une donnée vérifiée : un contrôle sans repère ou un repère orphelin casse la CI.

**Coûts et risques**
- Balisage de **tous** les contrôles de 6 apps, dont les gabarits TS de la carto : travail initial
  important, puis coût marginal tenu par `check:reperes`.
- L'extraction dans les gabarits TS est plus fragile que dans le HTML ; si elle ne tient pas, repli
  sur un test jsdom qui rend chaque panneau et collecte les `data-repere`.
- Le journal réseau enveloppe `fetch` : il doit être transparent (mêmes erreurs, même flux) et ne
  jamais conserver de corps de réponse.
- Le numéro d'ADR est à réconcilier avec le vault.

## Hors périmètre

- Écriture de l'état de l'app par le modèle (au-delà de la présélection confirmée).
- RAG ou collections Albert (partagées par clé de service).
- Fusion studio / builder IA elle-même : cet ADR la prépare (socle commun), ne la réalise pas.
- Journalisation serveur des conversations.

## Alternatives écartées

- **Sélecteurs CSS choisis par le modèle** : hallucinations, aucune garantie que la cible existe.
- **Registre de repères écrit à la main à côté du code** : dérive garantie ; même raison que la
  référence des skills générée (#512).
- **Un assistant par app** : autant de transports, de boucles et de jeux de règles que d'apps.
- **Tout passer par le studio** : c'est l'état actuel, qui fait quitter l'interface.
