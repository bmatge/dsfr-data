# Audit des fondations de layout — apps « outils à gauche / aperçu à droite »
## ChartsBuilder / dsfr-data — `main` après #636 (volet Diagnostic), Aperçu 0.21.0

> Document destiné à servir de brief de refonte à Claude Code, dans la lignée de
> [`audit-ergonomique-2026-09.md`](audit-ergonomique-2026-09.md). Chaque constat est mesuré
> (page, sélecteur, valeur), le verdict est en §2, la cible en §6, le plan en §7.
> Décision formalisée dans l'ADR-102 du vault (« Gabarit unique app-workspace pour les apps de travail »).

> ⚠️ **État daté.** Cet audit mesure `main` après #636, avec l'Aperçu en **0.21.0**. Le dépôt est
> depuis passé en 0.33.0 et les apps ont bougé : **les valeurs chiffrées ci-dessous ne sont plus à
> jour**, et certaines des violations relevées ont pu être corrigées depuis. Ce qui reste utile,
> c'est la **méthode** — chaque constat porte sa page, son sélecteur et sa valeur —, les invariants
> de la §2 et la cible de la §6. Pas les nombres.
>
> Ce document n'avait jamais été fusionné : il vivait sur la branche `docs/audit-layout-2026-09`,
> versé ici au nettoyage des branches du 2026-09-19 plutôt que supprimé avec elle. Son geojson
> compagnon (`regions-simplifiees.geojson`, 225 Ko) n'a pas été repris : il ne servait qu'à une
> page d'exemple absente de `main`.

---

## 1. Méthode et périmètre

Audit réalisé le 7 septembre 2026 sur la branche `feat/volet-diagnostic-602` (mergée depuis en #636,
release 0.21.0), en deux temps :

1. **Lecture du code** : `packages/app-ui/src/app-layout-builder.ts`, `app-preview-panel.ts`,
   `app-action-bar.ts`, `app-header.ts`, `app-diagnostic-panel.ts`, et les feuilles de style
   de chaque app (`apps/*/src/styles/*.css`), plus l'historique git de ces fichiers.
2. **Mesure en navigation réelle** sur `localhost:5173`, fenêtre Chrome 1440×900 (soit un
   viewport CSS de **1212×719 px** une fois le chrome du navigateur déduit), via une sonde
   JavaScript qui relève pour chaque page : qui défile (page ou conteneur interne), la hauteur
   réelle de chaque zone, la position (`static` / `sticky` / `fixed` / `absolute`), les
   variables CSS publiées au runtime et l'empilement (`z-index`).

Apps auditées : Builder, Assistant IA, Studio IA, Playground, Carto (les quatre demandées plus
Studio, qui partage le même composant), avec un passage sur Dashboard et Pipeline pour
situer les cas « maison ».

### 1.1 Le principe fondateur, traduit en invariants testables

Le commanditaire a formulé l'UX attendue de ces interfaces :

> Toujours voir l'aperçu (partie droite) où que l'on soit dans les outils / le code / la
> conversation (partie gauche). Ne pas avoir à scroller à droite sauf si l'aperçu est
> naturellement haut. Le séparateur permet de voir l'aperçu en largeur contrainte (défaut)
> ou en grande largeur, en repoussant les outils jusqu'à presque les faire disparaître.

Ce principe se décline en six invariants, qui servent de grille de notation dans tout le
document :

| # | Invariant | Comment on le vérifie |
|---|---|---|
| **I1** | L'aperçu est **toujours visible**, quel que soit l'état de la colonne gauche et quels que soient les volets secondaires ouverts (diagnostic, statut, onglets) | Le bas de l'aperçu ne dépasse jamais le viewport ; aucun élément fixe ne le recouvre |
| **I2** | **La page ne défile jamais.** La gauche défile en interne ; la droite ne défile en interne que si son contenu est plus haut que la zone | `documentElement.scrollHeight === clientHeight` ; un seul conteneur scrollable par colonne |
| **I3** | Le **séparateur** est un vrai contrôle : souris, tactile, clavier ; il va jusqu'à replier les outils en rail ; la position est mémorisée | `role="separator"`, `aria-valuenow`, largeur gauche minimale ≈ 0 (rail), persistance |
| **I4** | Les zones secondaires (tiroir Diagnostic, statut, onglets) sont des **zones du gabarit**, qui **réduisent** les volets au lieu de les recouvrir | Ouvrir le tiroir réduit la hauteur des colonnes |
| **I5** | **Une seule source de vérité** pour la géométrie : pas de variables CSS mesurées au runtime ni de `calc()` en chaîne | Nombre de `ResizeObserver` de layout et de variables `--*-h` |
| **I6** | La zone de travail exploite la hauteur disponible ; le chrome (header, barre d'actions) est proportionné à un outil, pas à une page éditoriale | Ratio zone de travail / viewport |

---

## 1.2 Ce que #636 a changé entre les mesures et la publication de ce rapport

L'épic #614 entière (#609, #611, #612, #613) a été livrée dans la PR #636, mergée le
9 septembre après les mesures du §2 et de l'annexe. Re-mesuré sur `main` le 9 septembre
(viewport 1440×746) :

| Point | Avant #636 (7 sept.) | Sur `main` (9 sept.) | Verdict |
|---|---|---|---|
| Surcharges app-side de `.builder-layout-*` | Builder, Assistant IA, Playground | **0** — remplacées par `mode="fullscreen"` / `mode="sticky-left"` sur le composant | Constat 2 réglé, constat 1 **déplacé** dans le composant (trois modes) |
| Playground : éditeur | 350 px dans 544 | **571 px sur 571**, défile en interne | #611 réglé |
| Playground : aperçu au scroll | sort de l'écran | **sort toujours de l'écran** (`mode="sticky-left"` : page à 1288 px ; à 600 px de scroll, aperçu à y = −303, éditeur épinglé poussé à y = −128) | **I1 et I2 toujours violés, par construction du mode** |
| Carto : tiroir sous les panneaux | panneaux à z 1000 | panneaux à **z 600**, tiroir à 780 | #612 réglé — par une nouvelle échelle locale documentée dans `carto.css:154-175` (constat 7 confirmé) |
| Carto : hauteur des panneaux | Couches 75 px, Éléments 169 px | Couches **71 px**, Éléments **163 px** | inchangé |
| Tiroir Diagnostic ouvert | recouvre 175 px | **recouvre toujours** (Carto : tiroir y = 503..746, carte jusqu'à 709, panneaux jusqu'à 693 ; seule la hauteur du rail est publiée dans `--app-diagnostic-h`) | **I4 toujours violé** |
| Variables mesurées au runtime | 6 | 6 | inchangé |

Autrement dit, #636 a **absorbé les surcharges dans le composant sans changer le modèle** : les
trois comportements coexistent désormais officiellement, dont deux (`page-scroll`, `sticky-left`)
laissent l'aperçu défiler hors champ. Le reste du rapport est conservé tel que mesuré le 7 ; là où
un constat a évolué, la ligne ci-dessus fait foi.

## 2. Synthèse exécutive et verdict

**Oui, un refacto des fondations est nécessaire, et il est moins coûteux que de continuer à
empiler.** Le diagnostic n'est pas « le layout est mal réglé » mais « il n'y a pas de layout » :
le seul composant partagé (`app-layout-builder`, 281 lignes) ne modélise que deux colonnes et
un modèle de hauteur ; tout le reste (plein écran, inversion, tiroir bas, panneaux flottants,
onglets, statut) a été ajouté **autour** de lui, app par app, à coups de surcharges de ses
classes internes, de `!important`, de `position: fixed` et de variables CSS mesurées au runtime.

Résultat mesuré à 1440×900, par invariant :

| App | I1 aperçu toujours visible | I2 pas de scroll de page | I3 séparateur | I4 zones, pas overlays | I5 une géométrie | I6 hauteur exploitée |
|---|---|---|---|---|---|---|
| Builder | ⚠️ sauf tiroir Diagnostic ouvert (recouvre 175 px de l'aperçu) | ✅ | ⚠️ souris seule, min 280 px, non persisté | ❌ | ❌ | ⚠️ 496 px sur 719 |
| Assistant IA | ⚠️ idem | ✅ | ⚠️ idem | ❌ | ❌ | ❌ conversation : **106 px** |
| Studio IA | ⚠️ tant qu'on ne scrolle pas | ❌ page à 940 px sans raison | ⚠️ idem | ❌ | ❌ | ⚠️ 426 px, vide sous la saisie |
| Playground | ❌ **l'aperçu sort de l'écran** au scroll, laisse un blanc puis le footer | ❌ page forcée à ≥ 100vh à droite | ⚠️ idem | ❌ | ❌ | ❌ éditeur **350 px** dans une colonne de 544 (#611) |
| Carto | ❌ les panneaux flottants (344 px) **couvrent** la carte ; le tiroir Diagnostic passe **sous** eux (#612) | ✅ | ❌ aucun | ❌ | ❌ | ❌ carte **239 px** ; panneaux Couches **75 px**, Éléments **169 px** |

Les dix constats structurants :

| # | Constat | Sévérité |
|---|---|---|
| 1 | **Quatre modèles de hauteur** pour la même UX : page-scroll (Studio), plein écran par surcharge (Builder, Assistant IA — bloc copié-collé), page-scroll inversé à `!important` (Playground), absolu maison (Carto) | 🔴 |
| 2 | Le composant partagé est **contourné par 3 apps sur 4** qui stylent ses classes internes `.builder-layout-*` — tout changement dans le composant casse silencieusement les apps (le sticky du lot #538 a obligé le Playground à empiler des `!important`) | 🔴 |
| 3 | **Playground viole le principe fondateur** : l'aperçu défile hors champ, l'éditeur reste à 350 px (#611) | 🔴 |
| 4 | **Carto viole le principe fondateur** : les outils recouvrent l'aperçu au lieu d'être à côté ; la carte utile fait 239 px de haut ; les panneaux scrollent dans 75 px | 🔴 |
| 5 | Le **tiroir Diagnostic** (#602, mergé en #636) est un `position: fixed` de plus : il **recouvre** 175 px d'aperçu et de colonne outils au lieu de les réduire (mesuré sur Builder), passe sous les panneaux Carto (#612) | 🟠 |
| 6 | **Six variables CSS mesurées au runtime** (`--app-header-h`, `--app-action-bar-h`, `--app-action-bar-fixed-h`, `--app-diagnostic-h`, `--carto-header-h`, `--carto-tabs-h`) par **quatre `ResizeObserver`**, consommées dans des `calc()` à valeurs de repli magiques (96, 56, 48, 208 px) — jusque dans le **code de carte généré** (`state.map.height`) | 🟠 |
| 7 | **Échelle de `z-index` implicite** : barre 700, header 750, tiroir 780, barre mobile 800, panneaux Carto 1000, menu utilisateur 1000, infobulles Builder 10 000 — chaque nouvelle couche cherche sa place à la main | 🟠 |
| 8 | Le hack « `fr-tabs` fige sa hauteur » (`height: auto !important` + `::before { display: none }`) est **copié trois fois** (preview-panel, Carto, Dashboard) | 🟡 |
| 9 | Le **séparateur** est souris seule (pas de `pointer`/tactile, pas de clavier, pas de `role="separator"`), non persisté, borné à 280 px à gauche : impossible de « faire presque disparaître les outils » | 🟡 |
| 10 | **Chrome de 224 px** (header DSFR 175 + barre 49) soit **31 % du viewport** sur un écran 1440×900 ; le footer est présent sur 2 apps sur 6 sans logique | 🟡 |

---

## 3. Cartographie de l'existant

### 3.1 Qui utilise quoi

| App | Gabarit | Modèle réel | Où est la surcharge | Footer |
|---|---|---|---|---|
| Studio IA | `app-layout-builder` | page-scroll, droite sticky (défaut du composant) | aucune | non |
| Builder | `app-layout-builder` | plein écran, `body { height: 100vh; overflow: hidden }` | `builder.css:678-729` (`body.builder-v2 .builder-layout-*`) | non |
| Assistant IA | `app-layout-builder` | plein écran | `builder-ia.css:11-52` — **copie du bloc Builder** | non |
| Playground | `app-layout-builder` | gauche sticky, droite défile (**inverse** du composant) | `playground.css:19-38`, 9 `!important` | oui |
| Carto | maison | onglets `fr-tabs` + `main` relatif + canevas absolu + colonne de panneaux absolue | `carto.css:4-180` | non |
| Dashboard | maison | sidebar 320 px fixe + grille, page-scroll, `main` à `overflow: hidden` qui dépasse le viewport (868 px) | `dashboard.css` | oui |
| Pipeline | maison | `calc(100vh - vars)` + 2/3 – 1/3 | `pipeline-helper.css:9` | oui |

Les `left-ratio` par défaut divergent aussi sans justification : 38 (Builder), 50 (Assistant IA),
50 (Playground), 40 (Studio).

### 3.2 Ce que fait réellement `app-layout-builder`

`packages/app-ui/src/app-layout-builder.ts` :

- Light DOM, deux « slots » simulés en **déplaçant les nœuds** `[slot=left]` / `[slot=right]`
  après le premier rendu (`_moveContent()`), avec un drapeau `_contentMoved` re-testé dans
  `updated()`. Fragile dès qu'une app ajoute une zone.
- **Un seul modèle** : `.builder-layout-container { min-height: 100vh }`, droite
  `position: sticky; top: calc(var(--app-header-h) + var(--app-action-bar-h)); max-height: calc(100dvh - …)`.
  C'est ce modèle que Builder et Assistant IA annulent intégralement (`position: static;
  max-height: none`) et que Playground inverse.
- Le **resizer** : `mousedown` / `mousemove` / `mouseup` sur `document`, `cursor` et
  `user-select` posés sur `body`, ratio en `%` recalculé à chaque `mousemove` avec
  `requestUpdate()`. Pas de `pointer events` (tactile, stylet), pas de clavier, pas d'ARIA,
  pas de double-clic de réinitialisation, pas de persistance (mesuré : 461 px → 700 px par
  drag, 461 px après rechargement), `minLeftWidth = 280`.
- Les **styles sont dans le template Lit** (`<style>` dans `render()`), donc réévalués à
  chaque `requestUpdate()` du drag.
- Point de rupture responsive : **900 px**, contre 760 (Carto), 992 (`app-layout-demo`),
  768 (`48em`, header et barre d'actions). Quatre seuils pour un même chrome.

### 3.3 La géométrie par variables mesurées

Chaîne actuelle pour caler un panneau sous le chrome :

```
app-header  --ResizeObserver-->  --app-header-h        (documentElement)
app-action-bar --ResizeObserver-->  --app-action-bar-h, --app-action-bar-fixed-h
app-diagnostic-panel --ResizeObserver-->  --app-diagnostic-h  + body { padding-bottom }
carto main.ts --ResizeObserver-->  --carto-header-h (re-mesure le même header), --carto-tabs-h
```

Consommateurs : `app-layout-builder` (sticky top / max-height), `playground.css` (height de
la colonne), `pipeline-helper.css`, `carto.css`, et `apps/builder-carto/src/main.ts:1760`
qui écrit `calc(100dvh - var(--carto-header-h, 96px) - var(--app-action-bar-h, 56px) -
var(--carto-tabs-h, 48px) - 208px)` **dans l'attribut `height` de la carte générée**.

Observé : au premier relevé, `--app-action-bar-h` était vide sur Assistant IA, Playground et
Studio (publication après le premier rendu). Tout ce qui en dépend démarre donc avec la valeur
de repli puis « saute ». Un gabarit en grille CSS n'a besoin d'aucune de ces variables : la
hauteur restante est `1fr`.

### 3.4 Les couches superposées

Éléments hors flux relevés dans les apps de travail, et leur `z-index` :

| Élément | Position | z | Défini dans |
|---|---|---|---|
| `app-action-bar` | sticky | 700 | app-action-bar.ts |
| `app-header` (≥ 48em) | sticky | 750 | app-header.ts |
| `app-diagnostic-panel` | **fixed bottom** | 780 | app-diagnostic-panel.ts |
| barre d'actions mobile | fixed bottom | 800 | app-action-bar.ts |
| `.carto-panels` | absolute | **1000** | carto.css |
| menu utilisateur | absolute | 1000 | app-header.ts |
| `.carto-status` | absolute | — | carto.css |
| infobulles d'aide Builder | fixed | 10 000 | builder.css |
| popover de visite guidée | fixed | 1000 | builder.css |
| toasts | fixed | — | shared |

Chaque couche a été positionnée « par rapport aux autres au moment où elle est arrivée ». Le
tiroir Diagnostic en est la dernière illustration : 780 pour passer au-dessus de la barre (700)
mais sous la barre mobile (800), sans savoir que Carto a des panneaux à 1000 — d'où #612.

### 3.5 Duplications (l'empilement, chiffré)

| Bloc | Copies | Emplacements |
|---|---|---|
| Surcharge « plein écran » de `.builder-layout-*` | 2 | `builder.css:678-729`, `builder-ia.css:11-52` |
| Hack `fr-tabs` hauteur libre | 3 | `app-preview-panel.ts:273-291`, `carto.css:25-70`, `dashboard.css:427-435` |
| Mesure de la hauteur du header | 2 | `app-header.ts:159-175`, `builder-carto/src/main.ts:1799-1810` |
| Sections repliables `config-section` (CSS + `toggleSection` inline) | 3 | builder, builder-ia, studio |
| Grille « Source / statut / + Nouvelle » | 3 | builder, builder-ia, studio |
| Bloc responsive « on repasse en page-scroll sous 900 px » | 3 | builder, builder-ia, playground |

Historique : `builder.css` a été touché par 16 commits depuis mars 2026, `carto.css` 10,
`builder-ia.css` 9, `playground.css` 8 ; `app-layout-builder.ts` par 3 seulement, dont un seul
de fond (le sticky du lot #538, qui a précisément déclenché les `!important` du Playground).
Le composant partagé n'a pas suivi les besoins ; les besoins ont été satisfaits autour de lui.

---

## 4. Constats détaillés par app

### 4.1 Builder (`apps/builder`)

- Plein écran correct : page à 719 px, `body { overflow: hidden }`, gauche défile dans
  `.builder-scroll` (634/496), droite `overflow: auto` sans besoin de défiler. **I2 respecté.**
- Zone de travail : 496 px sur 719 (chrome 224 px). Avec le rail Diagnostic replié : 459 px.
- **Tiroir Diagnostic ouvert** : le volet s'étend de y=507 à 719 tandis que les colonnes
  s'arrêtent toujours à y=682 → **175 px d'aperçu et d'outils recouverts** ; seul le rail
  (37 px) est compensé par `body { padding-bottom }`. **I1 et I4 violés.**
- Séparateur : fonctionne à la souris, aucune autre modalité, non persisté (§3.2).
- Le layout est obtenu en **annulant** le composant : `position: static; max-height: none`
  sur `.builder-layout-right`, `overflow: hidden` sur `.builder-layout-left`, etc.

### 4.2 Assistant IA (`apps/builder-ia`)

- Même mécanique que Builder, par copie du bloc CSS.
- **La conversation, qui est l'outil principal de cette app, mesure 106 px de haut**
  (`#chat-messages`, 202/106) dans une colonne de 496 px : la zone « Source » (≈ 210 px) et
  l'en-tête « Configuration IA » (≈ 65 px) restent dépliés au-dessus, à hauteur fixe. Le
  premier message est déjà tronqué à l'arrivée. **I6 violé.**
- Pas de footer, pas d'onglet Diagnostic live (mode « rapporté » — assumé dans #602).

### 4.3 Studio IA (`apps/studio`)

- Seule app à garder le modèle par défaut du composant, et cela se voit : la page mesure
  940 px pour un viewport de 719 **sans contenu à révéler** (le footer est absent). La colonne
  gauche fait 426 px, la droite 522 px sticky ; sous la zone de saisie, ≈ 100 px de vide.
- Modèle « page-scroll » et principe fondateur sont incompatibles : dès qu'on défile, le
  header sort mais l'aperçu sticky finit lui aussi par être poussé quand on atteint le bas.
  **I2 violé, I1 fragile.**

### 4.4 Playground (`apps/playground`)

- Le composant est inversé à coups de `!important` : gauche `sticky` pleine hauteur, droite
  `static; min-height: 100vh`. Conséquences mesurées :
  - la page défile **toujours** (1224 px), même quand la sortie tient dans l'écran, à cause du
    `min-height: 100vh` ;
  - au scroll, **l'aperçu sort de l'écran** : capture faite à mi-course — colonne droite
    blanche, éditeur coupé à la ligne 12, footer occupant le bas. **I1 violé frontalement.**
  - l'éditeur CodeMirror reste à 350 px dans une colonne de 544 (`.CodeMirror { height: 300px }`
    du CDN jamais surchargé, #611) : zone grise morte sous le code.
- La barre d'actions fait ici 65 px (sélecteur d'exemple dans la zone contexte) contre 49 ailleurs.

### 4.5 Carto (`apps/builder-carto`)

- Architecture radicalement différente : `fr-tabs` (Aperçu / Code) → `main.carto-workspace`
  relatif → `#map-canvas` absolu plein cadre → `.carto-panels` absolu (344 px, `z-index: 1000`)
  **par-dessus** la carte.
- Mesures : conteneur Leaflet **239 px** de haut (448 px de canevas moins 208 px réservés aux
  encarts, même quand il n'y a qu'un jeu d'exemple) ; corps du panneau Couches **75 px** pour
  523 px de contenu ; Éléments **169 px** pour 948 px ; les tuiles « Cercles / Chaleur » sont
  coupées par le bas du viewport.
- C'est la **même UX** que les autres apps (outils / aperçu) : le choix « panneaux flottants
  pour maximiser la carte » produit l'inverse — les panneaux cachent 30 % de la carte et se
  retrouvent eux-mêmes à l'étroit. Un volet outils repliable en rail donnerait une carte
  réellement pleine largeur **sur demande**, ce qui est exactement le principe fondateur.
- Le tiroir Diagnostic s'ouvre **derrière** les panneaux (mesuré : `elementsFromPoint` sur le
  tiroir rend `.carto-panels`) et le toast de statut chevauche les deux (#612).
- Deux variables mesurées propres à l'app (`--carto-header-h`, `--carto-tabs-h`) et la hauteur
  de carte injectée dans le code généré (§3.3).
- L'exclusion de Carto du périmètre d'harmonisation dans #614 est, à mon sens, une erreur : c'est
  l'app qui a le plus à gagner du gabarit.

### 4.6 Dashboard et Pipeline (pour situer)

- Dashboard : sidebar 320 px non redimensionnable, `main { overflow: hidden }` de 868 px dans
  un viewport de 719 → contenu bas inatteignable sans scroll de page ; hack `fr-tabs` copié.
- Pipeline : `height: calc(100vh - vars)`, dépend des mêmes variables mesurées.
- Tous deux relèvent du même gabarit (outils / canevas) ; à migrer en dernier.

---

## 5. Pourquoi #613 / #614 (livrées dans #636) ne suffisent pas

- **#613 (« modes de hauteur explicites », livrée)** a porté *les trois modèles existants*
  dans le composant (`page-scroll`, `fullscreen`, `sticky-left`). Deux de ces trois modes
  (`page-scroll`, `sticky-left`) **violent I1 par construction** : ils laissent l'aperçu défiler
  hors champ — re-mesuré sur `main` (§1.2). Officialiser des comportements que le principe
  fondateur interdit, c'est figer la dette. Il faut **un** modèle, pas trois.
- **#614 (fermée)** a exclu Carto et Dashboard de l'harmonisation ; Carto est pourtant le cas le
  plus dégradé (§4.5), et ses panneaux mesurent toujours 71 et 163 px sur `main`.
- **#611** et **#612** étaient des symptômes du gabarit absent ; ils ont été corrigés à la marge
  (règle CSS sur `.CodeMirror` ; nouvelle échelle de `z-index` locale à Carto). Le second correctif
  ajoute précisément le type de couche que le constat 7 décrit.
- **Le volet Diagnostic (#602, PR #636)** : le contenu du volet (Flux / Champs / Journal, `formatTrace`,
  mode live / rapporté) est bon et réutilisable tel quel. Son **positionnement** (`fixed`,
  `--app-diagnostic-h`, `body:has() { padding-bottom }`, `z-index: 780`) est la cinquième
  couche ad hoc ; il doit devenir une zone du gabarit.

---

## 6. Spécification cible : un gabarit unique, `app-workspace`

### 6.1 Zones

Un seul composant de gabarit dans `packages/app-ui`, qui remplace `app-layout-builder` et
modélise **toutes** les zones rencontrées dans l'audit :

```
┌──────────────────────────────────────────────────────────────┐
│ app-header (en flux, non sticky : rien ne défile derrière)    │
├──────────────────────────────────────────────────────────────┤
│ app-action-bar (en flux)                                      │
├───────────────────────┬─┬────────────────────────────────────┤
│ tools                 │ │ preview                            │
│ (défile en interne)   │s│ (app-preview-panel : onglets +     │
│                       │p│  contenu ; défile en interne       │
│                       │l│  seulement si naturellement haut)  │
│                       │i│                       ┌──────────┐ │
│                       │t│                       │ status   │ │
├───────────────────────┴─┴───────────────────────┴──────────┴─┤
│ drawer (tiroir Diagnostic : rail replié / ouvert, redimen-    │
│ sionnable ; réduit la hauteur des volets, ne les recouvre pas)│
└──────────────────────────────────────────────────────────────┘
```

```html
<body class="app-workspace-host">           <!-- height: 100dvh; overflow: hidden; grid rows auto auto 1fr -->
  <app-header compact></app-header>
  <app-action-bar heading="…">…</app-action-bar>
  <app-workspace storage-key="builder" split="38" min-preview="360">
    <aside slot="tools">…</aside>
    <app-preview-panel slot="preview">…</app-preview-panel>
    <div slot="status">…</div>            <!-- optionnel : statut / toasts ancrés à l'aperçu -->
    <app-diagnostic-panel slot="drawer"></app-diagnostic-panel>
  </app-workspace>
</body>
```

Implémentation : **CSS Grid**, `grid-template-columns: var(--ws-tools-w) 6px minmax(var(--ws-min-preview), 1fr)`
et `grid-template-rows: minmax(0, 1fr) auto` (volets / tiroir). Aucune variable mesurée : la
hauteur restante est `1fr`, le tiroir en flux réduit mécaniquement les volets (I4, I5). Le
`<style>` du composant est injecté une fois dans `<head>` (comme `injectAppPrimitives`), pas
dans le template.

### 6.2 Défilement (I1, I2)

- `body` : `height: 100dvh; overflow: hidden`. La page ne défile jamais.
- `tools` : `overflow: auto; min-height: 0`. Le contenu projeté est une colonne flex
  (`display: flex; flex-direction: column`) pour que les apps puissent épingler une zone en
  bas (saisie du chat, bouton) et faire grandir la zone principale (messages, éditeur) —
  contrat documenté, qui règle #611 et le chat à 106 px de l'Assistant IA.
- `preview` : `overflow: auto; min-height: 0`. Le contenu **n'a pas de hauteur forcée** ; le
  défilement n'apparaît que si le rendu est plus haut que le volet (I2). Les aperçus en
  `iframe srcdoc` (Builder, Studio, #609) s'auto-dimensionnent sur leur contenu (déjà fait
  dans Playground avec un `ResizeObserver`) ; la carte Leaflet prend `100 %` du volet.
- `drawer` : ouvert, hauteur par défaut 30 % du workspace, redimensionnable verticalement,
  bornée à 50 % ; le tiroir défile en interne au-delà. L'aperçu reste donc visible **quoi
  qu'il arrive** (I1).

### 6.3 Séparateur (I3)

- `role="separator" aria-orientation="vertical" aria-valuemin/max/now aria-controls`
  `tabindex="0"`.
- **Pointer events** (souris, tactile, stylet), `setPointerCapture`, `touch-action: none`.
- Clavier : ← → de 16 px, Maj+← → de 64 px, Début / Fin = rail / aperçu minimal, Entrée =
  bascule replié / restauré.
- Double-clic : retour au `split` par défaut de l'app.
- **Repli en rail** : en dessous de 120 px de largeur outils, le volet se replie en un rail de
  48 px (icône + « Afficher les outils ») ; c'est le geste « faire presque disparaître les outils »
  du principe fondateur, qui donne l'**aperçu large**. Un bouton « Aperçu large / Aperçu
  contraint » dans `app-action-bar` (slot tertiaire) offre le même résultat au clavier et le
  rend découvrable.
- Persistance : `localStorage['dsfr-data:workspace:<storage-key>'] = { tools: px, drawer: px, collapsed }`.
  Restaurée avant le premier rendu (pas de saut).
- Événement `workspace-resize { tools, preview }` pour les consommateurs qui doivent se
  recalculer (Leaflet `invalidateSize()`, CodeMirror `refresh()`, graphiques).

### 6.4 Onglets d'aperçu

`app-preview-panel` reste le porteur des onglets Aperçu / Code / Données ; le hack `fr-tabs`
n'existe plus qu'à cet endroit. **Carto adopte `app-preview-panel`** (Aperçu / Code) : ses
`carto-tabs`, `--carto-tabs-h` et le panneau absolu disparaissent. Le panneau non sélectionné
reste en page en `visibility: hidden` (contrainte Leaflet, déjà gérée dans le composant).

### 6.5 Empilement

Une échelle **déclarée** en variables CSS de `app-primitives` : `--z-workspace: 0`,
`--z-status: 10`, `--z-popover: 100` (aide, visite), `--z-chrome-mobile: 800`,
`--z-toast: 900`, `--z-modal: 1750` (valeur DSFR). Plus aucun `z-index` littéral dans les
apps ; le tiroir et les volets n'en ont pas besoin puisqu'ils sont en flux.

### 6.6 Chrome (I6)

- `app-header compact` pour les apps de travail : sans la ligne de tagline et avec la
  navigation sur la même ligne que la marque quand la largeur le permet — objectif ≈ 120 px
  au lieu de 175. Décision à valider (le header DSFR complet reste sur le hub et les pages
  éditoriales).
- Header **non sticky** dans le gabarit (rien ne défile derrière lui) : la règle sticky du lot
  #538 ne s'applique qu'aux pages éditoriales.
- Footer : **absent des apps de travail**, présent sur le hub et les pages éditoriales
  (Sources, Favoris, Guide). Playground et Dashboard s'alignent. Décision à valider.

### 6.7 Responsive

Sous 900 px (seuil unique, partagé par `app-workspace`, header et barre d'actions), le
gabarit passe en **bascule à deux vues** — segmenté « Outils | Aperçu » dans la barre d'actions,
une seule vue plein écran à la fois, aperçu accessible en un geste. C'est le seul mode qui
respecte I1 sur un téléphone ; l'empilement vertical actuel (outils au-dessus, aperçu quelque
part en dessous) ne le respecte pas.

### 6.8 Ce qui ne change pas

- `app-header`, `app-action-bar` (ADR-101), `app-preview-panel`, `app-primitives`, le contenu
  d'`app-diagnostic-panel`.
- Les **ids** des contrôles (ADR-096) et la suite E2E `tests/builder-e2e`.
- Le pipeline de composants, le proxy, les bundles : aucun impact lib.

---

## 7. Plan d'implémentation

Un lot = une PR mergeable, l'ancien composant et le nouveau cohabitent le temps de la migration.

| Lot | Contenu | Se substitue à | Prérequis |
|---|---|---|---|
| **0** | `app-workspace` + primitive de séparateur (H et V) + échelle `--z-*` + tests Vitest (grille, persistance, clavier, repli) + **spec Playwright « invariants »** réutilisant la sonde de cet audit (page ne défile pas, bas de l'aperçu ≤ viewport, aperçu visible tiroir ouvert, un seul scroller par colonne) | — | aucun |
| **1** | **Builder** migré (référence) : `app-layout-builder mode="fullscreen"` → `app-workspace`, `.builder-scroll` devient le contrat `tools` ; header compact ; tiroir en `slot="drawer"` | `mode="fullscreen"` (#613) | 0 |
| **2** | **Tiroir Diagnostic** (#636) : `app-diagnostic-panel` perd `position: fixed`, `--app-diagnostic-h`, `body:has()`, `z-index` ; devient la zone `drawer` (rail / ouvert / redimensionnable) | échelle locale Carto de #612 | 1 |
| **3** | **Playground** : éditeur en colonne `tools` (CodeMirror `setSize(null, '100%')` + `refresh()` sur `workspace-resize`), sortie en `preview`, footer retiré, `!important` supprimés | `mode="sticky-left"` (#613) ; conserve le correctif CodeMirror de #611 | 0 |
| **4** | **Studio** puis **Assistant IA** : zone « Source » repliable par défaut une fois choisie, conversation en zone qui grandit, saisie épinglée. Assistant IA après #609 (l'aperçu change de nature) | `mode="fullscreen"` / défaut | 0 (#609 est livré) |
| **5** | **Carto** : panneaux → volet `tools` (sections repliables existantes), carte → `preview` à 100 %, bande d'encarts dans l'aperçu, onglets → `app-preview-panel`, `--carto-header-h` / `--carto-tabs-h` / 208 px supprimés, `state.map.height` généré redevient une valeur simple ; `invalidateSize()` sur `workspace-resize` | exception Carto de #614 | 0, 2 |
| **6** | Dashboard, Pipeline (sidebar → `tools` redimensionnable) ; suppression d'`app-layout-builder` ; `docs/ARCHITECTURE.md` (section gabarit + couplages : Leaflet, CodeMirror, `fr-tabs`, iframes) ; ADR « gabarit unique des apps de travail » | les trois modes de `app-layout-builder` | 1-5 |

Ordre recommandé : **0 → 1 → 2 → 3 → 5 → 4 → 6**. Carto avant Studio / Assistant IA parce
qu'elle est la plus dégradée et qu'elle valide le gabarit sur son cas le plus exigeant
(Leaflet, encarts, deux onglets). Estimation : lot 0 deux sessions, lots 1 à 4 une session
chacun, lot 5 deux sessions, lot 6 une session — **une dizaine de sessions**, contre une
maintenance app par app qui a déjà coûté 43 commits de CSS sur quatre feuilles en six mois.

### 7.1 Décisions à prendre avant le lot 0

1. Header compact (§6.6) : oui / non, et jusqu'où (tagline, nav sur une ligne).
2. Footer absent des apps de travail (§6.6).
3. Mobile en bascule Outils | Aperçu (§6.7) plutôt qu'en empilement.
4. Carto dans le périmètre (§4.5, lot 5) — l'audit recommande oui.
5. Ouvrir une nouvelle épic « gabarit unique `app-workspace` » (ADR-102) qui succède à #614, fermée avec #636.

### 7.2 Risques identifiés

- **Leaflet** : tout changement de taille du volet sans `invalidateSize()` laisse des tuiles
  grises — d'où l'événement `workspace-resize` et le `ResizeObserver` sur le volet.
- **CodeMirror 5** : `refresh()` obligatoire après affichage ou redimensionnement.
- **`fr-tabs`** : le JS DSFR fige `--tabs-height` ; garder le contournement au seul endroit
  `app-preview-panel`.
- **Aperçus en iframe** (#609 en cours) : l'auto-dimensionnement doit être le contrat, sinon
  I2 est trahi par un iframe à hauteur fixe.
- **Tests E2E** : `tests/builder-e2e` s'appuie sur des ids conservés (ADR-096) ; ajouter la
  spec « invariants » avant de migrer pour détecter une régression de gabarit en CI.
- **Modales DSFR** : `z-index` 1750 ; l'échelle `--z-*` doit rester en dessous.

---

## Annexe — relevés bruts (viewport 1212×719)

```
Builder       pageScrolls=false body=hidden hdr=175 bar=49
              L y=224 h=496 ov=hidden | scroll .builder-scroll 634/496 | R y=224 h=496 ov=auto
              tiroir ouvert : drawer y=507..719 ; colonnes bottom=682 ; bodyPad=37
              drag 461→700 ; reload → 461 ; resizer: pas de role/tabindex
Assistant IA  pageScrolls=false ; L w=606 h=496 ; #chat-messages h=106 (202) ; textarea prompt y=1021 (hors champ, section repliée)
Studio        pageScrolls=TRUE docH=940 ; L h=426 ov=auto ; R h=522 sticky ; #chat-messages h=160
Playground    pageScrolls=TRUE docH=1224 ; L sticky h=544 ov=hidden ; R static h=719 ; footer y=959 h=266
              .CodeMirror-scroll h=350 (682) ; barre d'actions h=65
Carto         pageScrolls=false ; tabs y=224 h=496 ; workspace y=272 h=448 ; leaflet h=239 ; panels w=344 z=1000
              #couches-body 523/75 ; #layer-config 948/169 ; cartoHdr=175 tabs=48
              tiroir ouvert : y=476 z=780 ; elementsFromPoint(200,690) → .carto-panels
Dashboard     pageScrolls=TRUE docH=1357 ; sidebar w=320 h=868 ; main ov=hidden h=868 ; pas de resizer
```
