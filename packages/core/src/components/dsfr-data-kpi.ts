import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { SourceSubscriberMixin } from '../utils/source-subscriber.js';
import { sanitizeTemplateUrl } from '../utils/template-expression.js';
import {
  formatValue,
  formatPercentage,
  isFormatType,
  FORMAT_TYPES,
  FormatType,
  getColorBySeuil,
} from '../utils/formatters.js';
import {
  computeAggregation,
  parseExpression,
  countsReceivedRows,
  isRateExpression,
  resolveMetaTotal,
  type AggregationContext,
} from '../utils/aggregations.js';
import { sendWidgetBeacon } from '../utils/beacon.js';
import {
  renderSourceLoading,
  renderSourceError,
  renderConfigError,
  renderSourceIdle,
  IDLE_MESSAGE_DEFAULT,
} from '../utils/status-templates.js';
import { reportConfigError, clearConfigError } from '../utils/config-error.js';
import { parseKpiLines, resolveKpiLines, type ResolvedKpiLine } from '../utils/kpi-lines.js';
import { getDataMeta } from '../utils/data-bridge.js';
import { getByPath } from '../utils/json-path.js';
import { parseSpan, legacyConflictMessage } from '../utils/grid-layout.js';
import { applyLocalFilter, validateColonFilter } from '@dsfr-data/shared/lib';

/** Les 4 tokens sémantiques historiques : un ÉTAT (bon, attention, critique, neutre). */
type KpiSemanticColor = 'vert' | 'orange' | 'rouge' | 'bleu';

/**
 * Les 17 couleurs illustratives du DSFR (planche « kpi-evolutions », 3c),
 * telles que nommées par les tokens `--border-plain-<nom>`,
 * `--background-contrast-<nom>` (fond 950), `--background-alt-<nom>` (975)
 * et l'option `--<nom>-925-125`. Vérifié dans `dsfr@1.14.4/dist/dsfr.min.css`
 * le 2026-09-20 : les quatre tokens existent pour chacun des 17 noms.
 */
export const ILLUSTRATIVE_COLOR_TOKENS = [
  'green-tilleul-verveine',
  'green-bourgeon',
  'green-emeraude',
  'green-menthe',
  'green-archipel',
  'blue-ecume',
  'blue-cumulus',
  'purple-glycine',
  'pink-macaron',
  'pink-tuile',
  'yellow-tournesol',
  'yellow-moutarde',
  'orange-terre-battue',
  'brown-cafe-creme',
  'brown-caramel',
  'brown-opera',
  'beige-gris-galet',
] as const;

type KpiIllustrativeColor = (typeof ILLUSTRATIVE_COLOR_TOKENS)[number];
type KpiColor = KpiSemanticColor | KpiIllustrativeColor;

const SEMANTIC_COLORS: ReadonlySet<string> = new Set(['vert', 'orange', 'rouge', 'bleu']);
const ILLUSTRATIVE_COLORS: ReadonlySet<string> = new Set(ILLUSTRATIVE_COLOR_TOKENS);

const COLOR_CLASSES: Record<KpiSemanticColor, string> = {
  vert: 'dsfr-data-kpi--success',
  orange: 'dsfr-data-kpi--warning',
  rouge: 'dsfr-data-kpi--error',
  bleu: 'dsfr-data-kpi--info',
};

/** Nom DSFR du token sémantique (`--background-contrast-<nom>`, `--<nom>-975-75`). */
const SEMANTIC_DSFR_NAMES: Record<KpiSemanticColor, string> = {
  vert: 'success',
  orange: 'warning',
  rouge: 'error',
  bleu: 'info',
};

const ICON_POSITIONS = ['label', 'top', 'right'] as const;
type IconPosition = (typeof ICON_POSITIONS)[number];
const ICON_SIZES = ['sm', 'md'] as const;
type IconSize = (typeof ICON_SIZES)[number];
const IMAGE_POSITIONS = ['top', 'left', 'right'] as const;
type ImagePosition = (typeof IMAGE_POSITIONS)[number];
const BORDER_MODES = ['left', 'top', 'bottom', 'outline', 'left-short', 'none'] as const;
type BorderMode = (typeof BORDER_MODES)[number];
const TINT_SHADES = ['975', '950', '925'] as const;
type TintShade = (typeof TINT_SHADES)[number];

/**
 * `icon` ne pose qu'une classe CSS, jamais du balisage : la valeur est
 * contrainte à une classe d'icône DSFR (`fr-icon-*`) ou Remix (`ri-*`).
 */
const ICON_CLASS_RE = /^(fr-icon|ri)-[a-z0-9-]+$/;

/**
 * Nom de pictogramme : segments `[a-z0-9-]+` séparés par `/` (les pictogrammes
 * DSFR vivent sous un dossier de catégorie : `environment/leaf`), soit le
 * motif `^[a-z0-9-]+(/[a-z0-9-]+)*$`. Vérifié segment par segment plutôt que
 * par une regex à quantificateur imbriqué (lint `detect-unsafe-regex`). Le
 * motif exclut mécaniquement `..`, `:` et tout schéma — sans assainisseur.
 */
const PICTO_SEGMENT_RE = /^[a-z0-9-]+$/;
const PICTO_NAME_PATTERN = '^[a-z0-9-]+(/[a-z0-9-]+)*$';
function isPictoName(nom: string): boolean {
  return nom.split('/').every((seg) => PICTO_SEGMENT_RE.test(seg));
}

/**
 * Un avertissement par (attribut, valeur) pour toute la durée de la page.
 * Le dépôt a payé une régression de 7 139 messages identiques : le compte
 * émis est mesuré par les tests (`tests/kpi-affichage.test.ts`).
 */
const avertissementsAffichage = new Set<string>();

/** Remet le dédoublonnage des avertissements d'affichage à zéro (tests). */
export function resetKpiDisplayWarnings(): void {
  avertissementsAffichage.clear();
}

function warnAffichage(cle: string, message: string): void {
  if (avertissementsAffichage.has(cle)) return;
  avertissementsAffichage.add(cle);
  console.warn(`dsfr-data-kpi: ${message}`);
}

/**
 * <dsfr-data-kpi> - Widget d'indicateur chiffré
 *
 * Affiche une valeur numérique mise en avant, style "chiffre clé".
 * Se connecte à une source de données via son ID.
 *
 * @example
 * <dsfr-data-kpi
 *   source="sites"
 *   valeur="avg:score_rgaa"
 *   label="Score RGAA moyen"
 *   format="pourcentage"
 *   seuil-vert="80"
 *   seuil-orange="50">
 * </dsfr-data-kpi>
 */
@customElement('dsfr-data-kpi')
export class DsfrDataKpi extends SourceSubscriberMixin(LitElement) {
  /** Id de la source (ou du transformateur) dont ce KPI consomme les données. Facultatif si `value` est un littéral (`value="=667"`). */
  @property({ type: String })
  source = '';

  /**
   * Expression de valeur — convention cible anglaise (#300).
   * Grammaire commune "champ:fn" (#303), ex. value="population:sum".
   * `champ:distinct` (alias `count-distinct`, #672) : nombre de valeurs
   * distinctes, null et chaîne vide exclus, calculé sur les lignes reçues.
   * `meta:total` (#659) : total publié par l'amont (total serveur en
   * server-side, lignes avant `limit` derrière un query) — `count` ne
   * compte que les lignes reçues. Total inconnu de l'amont (page serveur
   * ou lot tronqué sans total, #1046) : « — ».
   * Ratio (#673) : `value="count:statut:ouvert / count"`, chaque côté dans
   * la grammaire ci-dessus (`meta:total` compris). Résultat = fraction
   * (0,35) ; `format="pourcentage"` la rend en pourcentage (35 %) — les
   * seuils s'expriment alors en pourcentage aussi. Division par zéro : « — ».
   * `count:champ:valeur` accepte un champ tableau (un élément égal suffit).
   * Depuis #953, le `where` ci-dessous et le filtre entre accolades
   * `count{tags:eq:urgent}` font PAREIL : `value="count:tags:urgent"` et
   * `value="count{tags:eq:urgent}"` rendent le MÊME chiffre. L'asymétrie de
   * #842 — deux chiffres sur le même jeu, et c'était « voulu » — a disparu :
   * l'égalité client est alignée sur celle du portail, qui lit déjà `=` sur
   * un champ multivalué comme un « contient » (mesuré le 2026-09-19).
   * Seul `count` accepte une valeur de filtre : `sum:champ:valeur` est une
   * erreur de configuration (#764).
   * Filtre propre à une expression (#776), dialecte du `where` entre
   * accolades : `value="effectif:sum{sexe:eq:F} / effectif:sum"` rend une
   * part de SOMMES — le filtre ne vaut que pour son côté du ratio, là où
   * `where` filtre les deux. Marche aussi pour `count{…}` et les autres
   * fonctions ; un filtre non reconnu est une erreur de configuration. Le
   * contenu des accolades est lu d'un bloc : une valeur qui contient ` / `
   * ne coupe pas le ratio (#839).
   * `champ:first` / `champ:last` : valeur du champ sur la première / la
   * dernière ligne, DANS L'ORDRE COURANT — poser un `order-by` en amont
   * (ex. dernière valeur d'une série datée). Propres au KPI : absentes de
   * l'`aggregate` de `dsfr-data-query`.
   * `champ:evolution` (#675) : (dernière − première) / première sur les
   * lignes DANS LEUR ORDRE COURANT — poser un `order-by` chronologique en
   * amont. Fraction, rendue en pourcentage par `format="pourcentage"`,
   * `trend` et `lines` ; « — » si moins de deux valeurs ou première = 0.
   * @champ expression
   */
  @property({ type: String })
  value = '';

  /**
   * @deprecated alias français de `value` (#300)
   * @champ expression
   */
  @property({ type: String })
  valeur = '';

  /**
   * Filtre des lignes AVANT le calcul (#674), dialecte colon de
   * dsfr-data-query : `where="categorie:eq:Actif, montant:gte:1000"` —
   * mêmes 12 opérateurs (eq, neq, gt, gte, lt, lte, contains, notcontains,
   * in, notin, isnull, isnotnull), même égalité lâche, chemins imbriqués
   * acceptés. Appliqué à `value`, `trend` et `lines`.
   * CÔTÉ CLIENT SEULEMENT : le KPI ne délègue rien au serveur, le filtre
   * porte sur les lignes reçues (derrière un `limit` ou une page, poser le
   * `where` sur la source ou une query amont). `meta:total` n'en tient pas
   * compte. Une clause non reconnue est une erreur de configuration.
   * CHAMP TABLEAU (#953, ex-#842) : `eq` / `in` regardent DANS le tableau.
   * `where="tags:eq:urgent"` retient une ligne dont `tags` vaut
   * `['urgent','social']`, exactement comme `value="count:tags:urgent"` la
   * compte, et comme le portail la retiendrait sur une clause déléguée. Le
   * repli textuel est gardé en OU : `['a','b']` matche encore `'a,b'` côté
   * client, là où le portail rend 0 — le client ne peut donc que gagner des
   * lignes, jamais en perdre. `neq` / `notin`, étant la négation, en perdent
   * (le portail aussi : son `!=` est la négation stricte de son `=`).
   * ⚠️ Le KPI ne délègue jamais : son `where` évalue toujours la voie client.
   * Depuis l'alignement, c'est sans conséquence sur un champ tableau — un KPI
   * et un graphique portant le même `where` rendent le même chiffre, au repli
   * textuel près. Le booléen dérivé en amont (`dsfr-data-normalize`
   * `compute="a_urgent = when contains(tags,'urgent') then 1 else 0"`, puis
   * `where="a_urgent:eq:1"`) reste valide et garde un intérêt — le filtre
   * final porte sur un scalaire, donc regroupable et délégable — mais il
   * n'est plus NÉCESSAIRE.
   * @champ clauses
   */
  @property({ type: String })
  where = '';

  /**
   * Titre affiché AU-DESSUS de la valeur (surtitre, style majuscules grises).
   * Nommé `heading` et non `title` : ce dernier entrerait en collision avec la
   * propriété DOM native HTMLElement.title (infobulle).
   */
  @property({ type: String })
  heading = '';

  /** Libellé affiché sous le chiffre (et sous les `lines`) */
  @property({ type: String })
  label = '';

  /** Description détaillée pour l'accessibilité */
  @property({ type: String })
  description = '';

  /**
   * Classe d'icône DSFR (`fr-icon-leaf-line`) ou Remix (`ri-global-line`).
   * Une CLASSE, jamais du balisage : la valeur doit suivre
   * `^(fr-icon|ri)-[a-z0-9-]+$`, sinon elle est ignorée avec un avertissement
   * console qui la nomme (une fois par valeur). Placement et taille :
   * `icon-position`, `icon-size`. Remplacée par `picto` si les deux sont posés.
   */
  @property({ type: String })
  icon = '';

  /**
   * Où se place l'icône (ou le pictogramme) : `label` (défaut, rendu
   * historique : entre le surtitre et la valeur, en gris), `top` (en tête de
   * la carte, dans la couleur de l'accent — vignette 1a), `right` (à droite,
   * alignée en haut, le texte garde sa marge — vignette 1b). Sans effet
   * sans `icon` ni `picto`.
   */
  @property({ type: String, attribute: 'icon-position' })
  iconPosition: IconPosition | string = 'label';

  /**
   * Taille de l'icône : `sm` = 1,5 rem (24 px — sans attribut, c'est le rendu
   * historique, inchangé) ou `md` = 2 rem (32 px). L'échelle s'arrête là :
   * l'échelle documentée du DSFR s'arrête à `fr-icon--lg` = 2 rem, et au-delà
   * le DSFR ne parle plus d'icône mais de PICTOGRAMME — pour une illustration
   * de 48 ou 80 px, poser `picto`, pas une icône agrandie. Ni `lg`, ni valeur
   * en pixels : une autre valeur est ignorée avec un avertissement. Vaut aussi
   * pour `picto`, sur l'échelle des tuiles DSFR : `sm` = 3,5 rem, `md` = 5 rem
   * (sans attribut : `md`, la tuile DSFR standard). Pour une icône `fr-icon-*`, la taille passe par `--icon-size`
   * (le glyphe est un `::before` masqué, indifférent à `font-size`).
   */
  @property({ type: String, attribute: 'icon-size' })
  iconSize: IconSize | string = '';

  /**
   * Pictogramme DSFR illustratif (`fr-artwork`), par son NOM : `environment/leaf`,
   * `buildings/city-hall`… (dossier de catégorie + fichier, sans `.svg`).
   * Contraint à `^[a-z0-9-]+(/[a-z0-9-]+)*$` — ce motif exclut `../` et tout
   * schéma sans assainisseur. Le composant rend le SVG canonique à trois
   * `<use>` (`#artwork-decorative`, `#artwork-minor`, `#artwork-major`) dont
   * l'adresse est `picto-base` + nom + `.svg` : `picto-base` est OBLIGATOIRE
   * (sans lui, rien n'est rendu, avec un avertissement). Les couleurs viennent
   * des classes `fr-artwork-*` du DSFR — le mode sombre suit sans travail — et
   * une couleur illustrative (`color-token`) est reportée en `fr-artwork--<nom>`.
   * ⚠️ `<use href>` vers un AUTRE domaine n'est pas rendu par les navigateurs
   * (pas de CORS sur `use`) : `picto-base` doit servir les SVG depuis l'origine
   * de la page (copie locale de `dist/artwork/pictograms/`), pas depuis un CDN.
   * Prime sur `icon`. Mêmes `icon-position` et `icon-size` que l'icône.
   */
  @property({ type: String })
  picto = '';

  /**
   * Même chose que `picto`, mais le nom est lu dans un CHAMP de la première
   * ligne reçue (`picto-field="theme_picto"`) — utile dans un répéteur. Même
   * motif, même refus. `picto` prime s'il est posé.
   * @champ nom
   */
  @property({ type: String, attribute: 'picto-field' })
  pictoField = '';

  /**
   * Préfixe d'adresse des pictogrammes, écrit par l'intégrateur :
   * `picto-base="/dsfr/artwork/pictograms/"`. Le nom (`picto`) y est concaténé
   * (barre finale ajoutée si absente). C'est ce découpage nom / base qui rend
   * `picto` sûr par construction. Même origine que la page, voir `picto`.
   */
  @property({ type: String, attribute: 'picto-base' })
  pictoBase = '';

  /**
   * Image libre (photo, logo) par son URL. Passée par la même liste blanche de
   * schémas que le format `{{champ:url}}` des gabarits (`http:`, `https:`,
   * `mailto:`, `tel:` ou relative) : une URL refusée (`javascript:`, `data:`…)
   * n'affiche rien et avertit. Placement : `image-position`. Texte alternatif :
   * `image-alt` (vide = décorative). Rendue seulement quand la donnée est là.
   */
  @property({ type: String })
  image = '';

  /** Texte alternatif de `image`. Vide (défaut) : image décorative (`alt=""`). */
  @property({ type: String, attribute: 'image-alt' })
  imageAlt = '';

  /**
   * Placement de `image` : `top` (défaut, bandeau 16:9 bord à bord au-dessus du
   * contenu — vignette 1d), `left` (colonne de 10 rem pleine hauteur, le liseré
   * reste à gauche de l'image — 2a), `right` (vignette carrée de 7,5 rem dans la
   * marge, à droite du texte — 2b).
   */
  @property({ type: String, attribute: 'image-position' })
  imagePosition: ImagePosition | string = 'top';

  /**
   * `horizontal` (défaut, carte à liseré gauche) ou `vertical` : tuile à
   * liseré HAUT (sauf `border` explicite). Avec une icône, un pictogramme ou
   * une image, tout passe au-dessus du surtitre et le texte est centré
   * (vignette 1f) ; sans média, le KPI reste aligné à gauche — la version
   * sobre des chiffres-clés éditoriaux (1g). Sur `dsfr-data-kpi-group`, le
   * même attribut empile les KPI (voir le groupe).
   */
  @property({ type: String })
  orientation: 'horizontal' | 'vertical' | string = 'horizontal';

  /**
   * Tracé du liseré ; sa couleur reste celle de `color-token` ou des seuils.
   * `left` (défaut, 4 px, rendu historique), `top` (4 px), `bottom` (filet de
   * 2 px, comme les champs DSFR), `outline` (contour de 1 px), `left-short`
   * (4 px à hauteur de la valeur), `none`. Autre valeur : ignorée, avertissement.
   */
  @property({ type: String })
  border: BorderMode | string = 'left';

  /**
   * Fond teinté dans la couleur du token : `tint` (ou `tint="true"`) prend le
   * fond 950 (`--background-contrast-<nom>`) ; `tint="975"` le fond le plus
   * clair (`--background-alt-<nom>`) ; `tint="925"` le plus soutenu
   * (`--<nom>-925-125`). Les 4 tokens sémantiques n'ont pas de 925 dans le
   * DSFR : replié sur 950 avec un avertissement. La VALEUR reste en gris titre
   * (`--text-title-grey`) : les teintes pleines claires (tournesol, café-crème,
   * galet) ne tiennent pas le contraste pour du texte — planche 3b. Le surtitre
   * et le libellé passent en `--text-default-grey` pour la même raison.
   * Se combine avec `border` (souvent `border="none"`).
   */
  @property({ type: String })
  tint: string | null = null;

  /** @deprecated alias français de `icon` (#300) */
  @property({ type: String })
  icone = '';

  /**
   * Format d'affichage : nombre (défaut), pourcentage, euro, decimal, compact
   * (14 785 684 → « 14,8 M »), date (chaîne ISO → « 09/09/2026 », #667).
   * Les décimales passent par `decimals`, jamais par le format (`euro:3` est
   * refusé et affiché comme erreur de configuration, #665).
   */
  @property({ type: String })
  format: FormatType = 'nombre';

  /**
   * Nombre de décimales affichées (entier 0 à 20), ex. `format="euro" decimals="3"`
   * → « 1,749 € ». Fixe pour nombre, pourcentage, euro et decimal ; plafond pour
   * compact ; sans effet sur date. Absent : défaut historique du format (#665).
   */
  @property({ type: Number })
  decimals?: number;

  /**
   * Unité accolée après la valeur (espace insécable), ex. `format="compact" unit="€"`
   * → « 44,9 Md € ». Surtout utile avec nombre, decimal et compact — euro et
   * pourcentage portent déjà leur symbole (#665).
   */
  @property({ type: String })
  unit = '';

  /**
   * RACCOURCI HERITE — pour une ligne d'evolution riche (signe, suffixe,
   * couleur, repli n.d.), preferez `lines`. Conserve pour compatibilite.
   *
   * Expression d'agrégation pour la tendance, évaluée sur les données de la
   * source (grammaire commune "champ:fn", ex. "evolution:avg") — PAS un
   * litteral : l'ancienne doc ("+3.2") laissait croire qu'on passait une
   * valeur, la chaîne etait interpretee comme nom de champ (#303).
   * Rendue avec une fleche (↑/↓) en pourcentage fr-FR ("↑ 5,2 %").
   * `trend="recettes:evolution"` (#675) : taux d'évolution entre la première
   * et la dernière ligne, rendu en pourcentage.
   * @champ expression
   */
  @property({ type: String })
  trend = '';

  /**
   * @deprecated alias français de `trend` (#300)
   * @champ expression
   */
  @property({ type: String })
  tendance = '';

  /**
   * Lignes secondaires declaratives (JSON), rendues ENTRE la valeur et le
   * `label`. Chaque item est soit data-driven (`value` = expression
   * "champ:fn"), soit texte statique (`text`), avec couleur declarative.
   * Ex. `[{"value":"evol:avg","sign":true,"suffix":"vs mai 2025","color":"auto"}]`.
   * Schema complet : packages/core/src/utils/kpi-lines.ts (KpiLineSpec).
   */
  @property({ type: String })
  lines = '';

  /** Seuil au-dessus duquel la valeur est verte */
  @property({ type: Number, attribute: 'threshold-green' })
  thresholdGreen?: number;

  /** @deprecated alias français de `threshold-green` (#300) */
  @property({ type: Number, attribute: 'seuil-vert' })
  seuilVert?: number;

  /** Seuil au-dessus duquel la valeur est orange */
  @property({ type: Number, attribute: 'threshold-orange' })
  thresholdOrange?: number;

  /** @deprecated alias français de `threshold-orange` (#300) */
  @property({ type: Number, attribute: 'seuil-orange' })
  seuilOrange?: number;

  /**
   * Couleur forcée. Deux familles, deux SENS :
   * - les 4 tokens sémantiques `vert`, `orange`, `rouge`, `bleu` disent un
   *   ÉTAT (bon, attention, critique, neutre) — c'est aussi ce que posent les
   *   seuils, et ce que le libellé accessible annonce (« etat bon ») ;
   * - les 17 couleurs illustratives DSFR (`green-emeraude`, `blue-cumulus`,
   *   `purple-glycine`, `orange-terre-battue`… liste : `ILLUSTRATIVE_COLOR_TOKENS`)
   *   disent une CATÉGORIE — thème, ministère, famille de données — et
   *   n'annoncent aucun état. Un KPI en rouge illustratif (`pink-tuile`) qui ne
   *   veut pas dire « mauvais » est un contresens de lecture : l'état reste aux
   *   tokens sémantiques.
   * Une couleur illustrative pose le liseré et l'icône en teinte pleine via
   * `var(--border-plain-<nom>)` et, avec `tint`, le fond via
   * `var(--background-contrast-<nom>)` — tokens DSFR existants, aucun
   * hexadécimal : le mode sombre suit. Nom inconnu : ignoré avec avertissement,
   * repli sur les seuils puis bleu.
   */
  @property({ type: String, attribute: 'color-token' })
  colorToken: KpiColor | '' = '';

  /** @deprecated alias de `color-token` (#367) — le nom `color` évoque l'attribut
   * de présentation HTML déprécié (faux positif d'audit RGAA 10.1.2) */
  @property({ type: String })
  color: KpiColor | '' = '';

  /** @deprecated alias français de `color-token` (#300) */
  @property({ type: String })
  couleur: KpiColor | '' = '';

  /**
   * Largeur en colonnes DSFR (1-12). Significatif uniquement dans un
   * <dsfr-data-kpi-group>. Même rôle que `span`, qui est préféré (#790) ;
   * toujours accepté.
   */
  @property({ type: Number, reflect: true })
  col?: number;

  /**
   * Largeur sur la grille de 12 colonnes (1-12), dans un
   * <dsfr-data-kpi-group> : `span="6"` occupe la moitié de la ligne. Remplace
   * `col`, même sens (#790) ; prime sur `col` s'ils sont posés ensemble.
   *
   * Sans valeur par défaut, et pour la même raison que `col` : la propriété
   * est reflétée, donc une valeur initiale `''` poserait `span=""` sur CHAQUE
   * KPI. La largeur par défaut du groupe est portée par une règle
   * `::slotted(*:not([col]):not([span]))` — un attribut vide, mais présent,
   * la désactive et tous les KPI retombent en `grid-column: auto` (#822).
   */
  @property({ type: String, reflect: true })
  span?: string;

  /**
   * Message rendu quand l'amont attend un filtre (`require-where`, #690).
   * Distinct de « aucune donnée » : aucune requête n'a été faite. Vide,
   * le libellé par défaut est utilisé.
   */
  @property({ type: String, attribute: 'idle-message' })
  idleMessage = IDLE_MESSAGE_DEFAULT;

  // Utilise le Light DOM pour bénéficier des styles DSFR
  createRenderRoot() {
    return this;
  }

  /** Warn-once : attributs français dépréciés (#300, cible = anglais) */
  private _warnDeprecatedFrenchAttrs() {
    const aliases: Array<[string, string]> = [
      ['valeur', 'value'],
      ['icone', 'icon'],
      ['couleur', 'color-token'],
      ['seuil-vert', 'threshold-green'],
      ['seuil-orange', 'threshold-orange'],
      ['tendance', 'trend'],
    ];
    const used = aliases.filter(([fr]) => this.hasAttribute(fr)).map(([fr, en]) => `${fr}→${en}`);
    if (used.length > 0) {
      console.warn(
        `dsfr-data-kpi: attributs français dépréciés (${used.join(', ')}) — la convention cible est l'anglais, les alias seront retirés à la 1.0 (#300)`
      );
    }
  }

  /** Warn-once : `color` déprécié au profit de `color-token` (#367) */
  private _warnDeprecatedColorAttr() {
    if (this.hasAttribute('color')) {
      console.warn(
        `dsfr-data-kpi: attribut "color" déprécié — utilisez "color-token" (token sémantique DSFR). L'alias sera retiré à la prochaine version majeure (#367)`
      );
    }
  }

  connectedCallback() {
    super.connectedCallback();
    this._warnDeprecatedFrenchAttrs();
    this._warnDeprecatedColorAttr();
    sendWidgetBeacon('dsfr-data-kpi');
  }

  static styles = css``;

  /**
   * Lignes de la source après le `where` client (#674). Sans `where` (ou
   * avec un `where` invalide, déjà signalé), les données brutes — y compris
   * une source mono-objet, que computeAggregation sait lire.
   */
  private _filteredData(): unknown {
    const data = this._sourceData;
    if (!this.where || data == null || validateColonFilter(this.where) !== null) return data;
    const rows: Record<string, unknown>[] = Array.isArray(data)
      ? (data as Record<string, unknown>[])
      : typeof data === 'object'
        ? [data as Record<string, unknown>]
        : [];
    return applyLocalFilter(rows, this.where, getByPath);
  }

  private _computeValue(): number | string | null {
    const expr = this.value || this.valeur;
    if (!expr) return null;
    // Valeur litterale : value="=667" ou value="=87 %" — affichee telle
    // quelle (nombre si numerique), sans dependre d'une source de donnees.
    // Pour les chiffres valides a la main ou non calculables depuis le flux.
    if (expr.startsWith('=')) {
      const literal = expr.slice(1).trim();
      const num = Number(literal.replace(',', '.'));
      return literal !== '' && !Number.isNaN(num) ? num : literal;
    }
    if (!this._sourceData) return null;
    const rows = Array.isArray(this._sourceData) ? this._sourceData.length : 1;
    const parsed = parseExpression(expr);
    // Le warn compare le total amont aux lignes RECUES (avant `where`) :
    // un filtre qui garde 3 lignes sur 12 n'est pas une troncature.
    if (countsReceivedRows(parsed)) {
      this._warnPartialCount(rows, parsed.type === 'distinct' ? 'distinct' : 'count');
    }
    // `meta:total` (#659) est résolu par le contexte : total de l'amont,
    // que le `where` client (#674) ne filtre pas.
    const raw = computeAggregation(this._filteredData(), expr, this._aggregationContext());
    return this._scaleRate(raw, expr, this.format);
  }

  /**
   * Contexte d'évaluation : total publié par l'amont (`meta:total`, #659),
   * `null` quand l'amont pagine ou tronque sans connaître son total (#1046).
   */
  private _aggregationContext(): AggregationContext {
    return { metaTotal: resolveMetaTotal(getDataMeta(this.source)) };
  }

  /**
   * Un ratio (#673) est une fraction ; en `format="pourcentage"` on la rend
   * en pourcentage (0,35 -> 35). La valeur retournée par `_computeValue` est
   * celle qui s'affiche : seuils et aria-label parlent de la même unité.
   */
  private _scaleRate(
    value: number | string | null,
    expr: string,
    format: string
  ): number | string | null {
    if (typeof value === 'number' && format === 'pourcentage' && isRateExpression(expr)) {
      return value * 100;
    }
    return value;
  }

  /**
   * Texte affiché pour la valeur calculée : `format` + `decimals` + `unit`
   * (#665). Une chaîne (littéral `value="=87 %"`, champ texte) est rendue
   * telle quelle — sauf `format="date"`, qui la lit comme date ISO (#667).
   */
  private _formatDisplay(value: number | string | null): string {
    if (typeof value === 'string' && this.format !== 'date') return value;
    return formatValue(value, this.format, { decimals: this.decimals, unit: this.unit });
  }

  /** Warn-once : `count` sur des lignes tronquees (#659). */
  private _partialCountWarned = false;

  /**
   * `count` compte les lignes RECUES : derriere un `limit`, une page de
   * pagination serveur ou un plafond `max-records`, ce n'est pas le total.
   * Trois annuaires ont affiche « 12 activites » pour 28 pendant sept lots.
   */
  private _warnPartialCount(rows: number, fn: 'count' | 'distinct' = 'count'): void {
    if (this._partialCountWarned) return;
    const total = getDataMeta(this.source)?.total;
    if (typeof total !== 'number' || total <= rows) return;
    this._partialCountWarned = true;
    console.warn(
      `dsfr-data-kpi: value="${fn}" sur "${this.source}" compte ${rows} lignes reçues, ` +
        `mais l'amont en détient ${total} (meta.total) — chiffre partiel (limit, page ou max-records). ` +
        `Pour le total : value="meta:total" (#659)`
    );
  }

  private _getColor(): KpiColor {
    const explicitColor = this.colorToken || this.color || this.couleur;
    if (explicitColor) {
      if (SEMANTIC_COLORS.has(explicitColor) || ILLUSTRATIVE_COLORS.has(explicitColor)) {
        return explicitColor;
      }
      warnAffichage(
        `color-token:${explicitColor}`,
        `color-token="${explicitColor}" inconnu — attendu vert, orange, rouge, bleu ` +
          `ou une couleur illustrative DSFR (${ILLUSTRATIVE_COLOR_TOKENS.join(', ')}) ; ignoré`
      );
    }

    const value = this._computeValue();
    if (typeof value !== 'number') return 'bleu';

    return getColorBySeuil(
      value,
      this.thresholdGreen ?? this.seuilVert,
      this.thresholdOrange ?? this.seuilOrange
    );
  }

  private _getTendanceInfo(): { value: number; direction: 'up' | 'down' | 'stable' } | null {
    const trendExpr = this.trend || this.tendance;
    if (!trendExpr || !this._sourceData) return null;

    // La tendance est TOUJOURS rendue en pourcentage : un ratio y est mis à
    // l'échelle (#673), une colonne d'évolution est déjà en points de %.
    const tendanceValue = this._scaleRate(
      computeAggregation(this._filteredData(), trendExpr, this._aggregationContext()),
      trendExpr,
      'pourcentage'
    );
    if (typeof tendanceValue !== 'number') return null;

    return {
      value: tendanceValue,
      direction: tendanceValue > 0 ? 'up' : tendanceValue < 0 ? 'down' : 'stable',
    };
  }

  /** Résout l'attribut `lines` en lignes affichables (pur, sans effet de bord). */
  private _resolveLines(): ResolvedKpiLine[] {
    if (!this.lines) return [];
    const specs = parseKpiLines(this.lines);
    if (!specs) return [];
    return resolveKpiLines(specs, this._filteredData(), this._aggregationContext());
  }

  /** Dernier message d'erreur de config posé (anti-spam console). */
  private _configErrorKey: string | null = null;

  /**
   * Erreur de configuration BLOQUANTE (#649) : fonction d'agrégat inconnue
   * dans `value` — rendue dans la page à la place d'un KPI vide.
   */
  private _blockingConfigError: string | null = null;

  willUpdate(changedProperties: Map<string, unknown>) {
    super.willUpdate(changedProperties);
    // Avant le rendu (et non dans updated()) : render() lit
    // _blockingConfigError sans déclencher un second cycle de mise à jour.
    this._validateConfig();
  }

  /**
   * Diagnostic de configuration (hors render pour garder render() pur) :
   * fonction d'agrégat inconnue dans `value`/`trend` (#649), `lines` JSON
   * invalide, ou raccourci hérité `trend` qui ne résout pas en nombre.
   * Reporté une seule fois par état (au lieu de disparaître en silence — #338).
   */
  private _validateConfig() {
    let message: string | null = null;
    this._blockingConfigError = null;

    const valueExpr = this.value || this.valeur;
    if (valueExpr && !valueExpr.startsWith('=')) {
      const parsed = parseExpression(valueExpr);
      if (parsed.type === 'invalid') {
        message = `value="${valueExpr}" : ${parsed.error}`;
        this._blockingConfigError = message;
      }
    }

    // `where` non parsable (#674) : bloquant — un filtre ignoré en silence
    // afficherait un chiffre faux avec l'aplomb d'un chiffre juste.
    if (!message && this.where) {
      const whereError = validateColonFilter(this.where);
      if (whereError) {
        message = `where="${this.where}" : ${whereError}`;
        this._blockingConfigError = message;
      }
    }

    // Format inconnu (#665) : bloquant, comme une fonction d'agrégat inconnue —
    // `euro:3` rendait « 1 749 » en silence, la grammaire colon reste à `value`.
    if (!message && this.format && !isFormatType(this.format)) {
      const received = String(this.format);
      const hint = received.includes(':')
        ? ` — les décimales passent par decimals="N" (ex. format="${received.split(':')[0]}" decimals="${received.split(':')[1]}")`
        : '';
      message =
        `format="${received}" inconnu${hint} ; ` + `formats acceptés : ${FORMAT_TYPES.join(', ')}`;
      this._blockingConfigError = message;
    }

    // Largeur dans un kpi-group (#790) : non bloquant, la grille retombe sur
    // sa largeur par défaut.
    if (!message && this.span) {
      const span = parseSpan(this.span);
      if (span.error) message = span.error;
      else if (this.col !== undefined && this.col !== null && this.hasAttribute('col')) {
        message = legacyConflictMessage('col', 'span');
      }
    }

    if (!message && this.lines && parseKpiLines(this.lines) === null) {
      message =
        'lines : JSON invalide — attendu un tableau d’objets, ex. ' +
        '[{"value":"evol:avg","suffix":"vs N-1","color":"auto"}]';
    }

    if (!message) {
      const trendExpr = this.trend || this.tendance;
      if (trendExpr && parseExpression(trendExpr).type === 'invalid') {
        message = `trend="${trendExpr}" : ${parseExpression(trendExpr).error}`;
      } else if (trendExpr && this._sourceData != null) {
        const v = computeAggregation(this._filteredData(), trendExpr, this._aggregationContext());
        if (typeof v !== 'number') {
          message =
            `trend="${trendExpr}" ne résout pas en nombre — attendu une ` +
            'expression "champ:fn" (ex. "evolution:avg"), pas une valeur littérale';
        }
      }
    }

    if (message !== this._configErrorKey) {
      this._configErrorKey = message;
      if (message) reportConfigError(this, 'dsfr-data-kpi', message);
      else clearConfigError(this);
    }
  }

  private _getAriaLabel(): string {
    if (this.description) return this.description;

    const value = this._computeValue();
    const formattedValue = this._formatDisplay(value);
    let label = this.heading
      ? `${this.heading} — ${this.label}: ${formattedValue}`
      : `${this.label}: ${formattedValue}`;

    if (
      typeof value === 'number' &&
      ((this.thresholdGreen ?? this.seuilVert) !== undefined ||
        (this.thresholdOrange ?? this.seuilOrange) !== undefined)
    ) {
      const color = this._getColor();
      const stateMap: Record<string, string> = {
        vert: 'bon',
        orange: 'attention',
        rouge: 'critique',
        bleu: '',
      };
      const state = stateMap[color];
      if (state) label += `, etat ${state}`;
    }

    const lineTexts = this._resolveLines()
      .map((l) => l.text)
      .filter(Boolean);
    if (lineTexts.length > 0) label += `. ${lineTexts.join('. ')}`;

    return label;
  }

  // ---------------------------------------------------------------------------
  // Habillage (planche « kpi-evolutions ») — rien ici ne touche à la donnée.
  // Chaque résolution est pure et ne pose un avertissement qu'une fois par
  // (attribut, valeur), quelle que soit la quantité d'instances.
  // ---------------------------------------------------------------------------

  /** Classe d'icône validée, ou `''` (valeur hors motif : avertie, ignorée). */
  private _iconClass(): string {
    const raw = (this.icon || this.icone).trim();
    if (!raw) return '';
    if (ICON_CLASS_RE.test(raw)) return raw;
    warnAffichage(
      `icon:${raw}`,
      `icon="${raw}" ignoré — attendu une classe d'icône DSFR (fr-icon-…) ou Remix (ri-…), ` +
        `une seule, sans espace ni balisage`
    );
    return '';
  }

  private _iconPosition(): IconPosition {
    const v = this.iconPosition;
    if ((ICON_POSITIONS as readonly string[]).includes(v)) return v as IconPosition;
    warnAffichage(
      `icon-position:${v}`,
      `icon-position="${v}" inconnu — attendu ${ICON_POSITIONS.join(', ')} ; rendu par défaut (label)`
    );
    return 'label';
  }

  /** Taille validée ; sans attribut : `sm` pour une icône (1,5 rem historique), `md` pour un picto. */
  private _iconSize(picto: boolean): IconSize {
    const v = this.iconSize;
    if (!v) return picto ? 'md' : 'sm';
    if ((ICON_SIZES as readonly string[]).includes(v)) return v as IconSize;
    warnAffichage(
      `icon-size:${v}`,
      `icon-size="${v}" inconnu — l'échelle s'arrête à sm (1,5 rem) et md (2 rem), la taille ` +
        `maximale d'une icône DSFR (fr-icon--lg) ; au-delà, poser un pictogramme (picto). Rendu en sm`
    );
    return 'sm';
  }

  /** Nom de pictogramme validé (`picto`, sinon `picto-field` sur la 1re ligne), ou `''`. */
  private _pictoName(): string {
    let nom = this.picto.trim();
    if (!nom && this.pictoField) {
      const data = this._filteredData();
      const first = Array.isArray(data) ? data[0] : data;
      const v = first && typeof first === 'object' ? getByPath(first, this.pictoField) : undefined;
      nom = v == null ? '' : String(v).trim();
    }
    if (!nom) return '';
    if (!isPictoName(nom)) {
      warnAffichage(
        `picto:${nom}`,
        `picto="${nom}" refusé — attendu un nom de pictogramme DSFR (${PICTO_NAME_PATTERN}), ` +
          `ex. environment/leaf ; rien n'est rendu`
      );
      return '';
    }
    if (!this.pictoBase) {
      warnAffichage(
        `picto-base:${nom}`,
        `picto="${nom}" sans picto-base — l'adresse des SVG est écrite par l'intégrateur ` +
          `(picto-base="/dsfr/artwork/pictograms/", même origine que la page) ; rien n'est rendu`
      );
      return '';
    }
    return nom;
  }

  /** Adresse du fichier SVG d'un pictogramme : base + nom + `.svg`. */
  private _pictoFile(nom: string): string {
    const base = this.pictoBase.endsWith('/') ? this.pictoBase : `${this.pictoBase}/`;
    return `${base}${nom}.svg`;
  }

  /** URL d'image acceptée par la liste blanche de schémas, ou `''`. */
  private _imageUrl(): string {
    const raw = this.image.trim();
    if (!raw) return '';
    const safe = sanitizeTemplateUrl(raw);
    if (safe) return safe;
    warnAffichage(
      `image:${raw}`,
      `image="${raw}" refusée — schéma hors liste blanche (http, https, mailto, tel ou URL relative) ; ` +
        `rien n'est rendu`
    );
    return '';
  }

  private _imagePosition(): ImagePosition {
    const v = this.imagePosition;
    if ((IMAGE_POSITIONS as readonly string[]).includes(v)) return v as ImagePosition;
    warnAffichage(
      `image-position:${v}`,
      `image-position="${v}" inconnu — attendu ${IMAGE_POSITIONS.join(', ')} ; rendu en top`
    );
    return 'top';
  }

  private _isVertical(): boolean {
    return this.orientation === 'vertical';
  }

  /** Mode de liseré effectif : `border` validé, sinon `top` en vertical, sinon `left`. */
  private _borderMode(): BorderMode {
    const v = this.border;
    if ((BORDER_MODES as readonly string[]).includes(v)) {
      if (v !== 'left' || this.hasAttribute('border') || !this._isVertical())
        return v as BorderMode;
    } else {
      warnAffichage(
        `border:${v}`,
        `border="${v}" inconnu — attendu ${BORDER_MODES.join(', ')} ; rendu par défaut`
      );
    }
    return this._isVertical() ? 'top' : 'left';
  }

  /** Teinte demandée, ou `null` sans `tint` (ou `tint="false"`). */
  private _tintShade(): TintShade | null {
    if (this.tint === null || this.tint === undefined) return null;
    const v = String(this.tint).trim().toLowerCase();
    if (v === 'false' || v === '0' || v === 'no' || v === 'non') return null;
    if (v === '' || v === 'true' || v === 'tint') return '950';
    if ((TINT_SHADES as readonly string[]).includes(v)) return v as TintShade;
    warnAffichage(`tint:${v}`, `tint="${v}" inconnu — attendu 975, 950 ou 925 ; fond 950`);
    return '950';
  }

  /**
   * Variable CSS du fond teinté, depuis les tokens DSFR — jamais un hexadécimal.
   * Illustratif : alt (975) / contrast (950) / option 925-125.
   * Sémantique : option 975-75 / contrast (950) ; pas de 925 dans le DSFR.
   */
  private _tintVar(color: KpiColor, shade: TintShade): string {
    if (ILLUSTRATIVE_COLORS.has(color)) {
      if (shade === '975') return `var(--background-alt-${color})`;
      if (shade === '925') return `var(--${color}-925-125)`;
      return `var(--background-contrast-${color})`;
    }
    const nom = SEMANTIC_DSFR_NAMES[color as KpiSemanticColor];
    if (shade === '975') return `var(--${nom}-975-75)`;
    if (shade === '925') {
      warnAffichage(
        `tint-925:${color}`,
        `tint="925" avec color-token="${color}" — le DSFR ne définit pas de fond 925 pour les ` +
          `tokens sémantiques (seulement 975 et 950) ; fond 950 utilisé`
      );
    }
    return `var(--background-contrast-${nom})`;
  }

  /** Dans un `dsfr-data-kpi-group orientation="vertical"` (lu au rendu). */
  private _inStackedGroup(): boolean {
    return this.closest('dsfr-data-kpi-group[orientation="vertical"]') !== null;
  }

  render() {
    const value = this._computeValue();
    const formattedValue = this._formatDisplay(value);
    const color = this._getColor();
    const illustrative = ILLUSTRATIVE_COLORS.has(color);
    const colorClass = illustrative
      ? 'dsfr-data-kpi--illustrative'
      : COLOR_CLASSES[color as KpiSemanticColor] || COLOR_CLASSES.bleu;
    const tendance = this._getTendanceInfo();
    const resolvedLines = this._resolveLines();

    const dataState =
      !this._blockingConfigError && !this._sourceLoading && !this._sourceError && !this._sourceIdle;

    // --- habillage --------------------------------------------------------
    const pictoName = this._pictoName();
    const iconClass = pictoName ? '' : this._iconClass();
    const hasMedia = Boolean(pictoName || iconClass);
    const vertical = this._isVertical();
    const stacked = this._inStackedGroup();
    // En vertical, comme dans un groupe empilé, le média passe en tête ;
    // ailleurs, la position demandée (label = rendu historique).
    const iconPosition: IconPosition =
      hasMedia && (vertical || stacked) ? 'top' : hasMedia ? this._iconPosition() : 'label';
    const iconSize: IconSize = hasMedia ? this._iconSize(Boolean(pictoName)) : 'sm';
    const imageUrl = dataState ? this._imageUrl() : '';
    const imagePosition = imageUrl ? this._imagePosition() : 'top';
    const borderMode = this._borderMode();
    const tintShade = this._tintShade();

    const cardClasses = ['dsfr-data-kpi', colorClass];
    if (borderMode !== 'left') cardClasses.push(`dsfr-data-kpi--border-${borderMode}`);
    if (vertical) cardClasses.push('dsfr-data-kpi--vertical');
    if (vertical && (hasMedia || imageUrl)) cardClasses.push('dsfr-data-kpi--centered');
    if (tintShade) cardClasses.push('dsfr-data-kpi--tint');
    if (iconPosition === 'right') cardClasses.push('dsfr-data-kpi--icon-right');
    if (stacked && hasMedia) cardClasses.push('dsfr-data-kpi--stacked-media');
    if (imageUrl) cardClasses.push(`dsfr-data-kpi--image-${imagePosition}`);
    if (hasMedia && iconPosition === 'right') {
      cardClasses.push(`dsfr-data-kpi--media-${pictoName ? 'picto' : 'icon'}-${iconSize}`);
    }

    const cardStyle: string[] = [];
    if (illustrative) cardStyle.push(`--dsfr-data-kpi-accent: var(--border-plain-${color})`);
    if (tintShade) cardStyle.push(`--dsfr-data-kpi-tint: ${this._tintVar(color, tintShade)}`);

    const media = pictoName
      ? this._renderPicto(pictoName, iconPosition, iconSize, illustrative ? color : '')
      : iconClass
        ? html`
            <span
              class="dsfr-data-kpi__icon ${iconClass}${
                iconPosition !== 'label' ? ` dsfr-data-kpi__icon--${iconPosition}` : ''
              }${iconSize === 'md' ? ' dsfr-data-kpi__icon--md' : ''}"
              aria-hidden="true"
            ></span>
          `
        : '';

    const image = imageUrl
      ? html`
          <div class="dsfr-data-kpi__image dsfr-data-kpi__image--${imagePosition}">
            <img src="${imageUrl}" alt="${this.imageAlt}" />
          </div>
        `
      : '';

    return html`
      <div
        class="${cardClasses.join(' ')}"
        role="figure"
        aria-label="${this._getAriaLabel()}"
        style=${cardStyle.length ? cardStyle.join('; ') : nothing}
      >
        ${imageUrl && imagePosition !== 'right' ? image : ''}
        ${
          this._blockingConfigError
            ? renderConfigError('dsfr-data-kpi', this._blockingConfigError)
            : this._sourceLoading
              ? renderSourceLoading('dsfr-data-kpi')
              : this._sourceError
                ? renderSourceError('dsfr-data-kpi', this._sourceError)
                : this._sourceIdle
                  ? renderSourceIdle('dsfr-data-kpi', this.idleMessage)
                  : html`
                      <div
                        class="dsfr-data-kpi__content${
                          iconPosition === 'right' ? ' dsfr-data-kpi__content--icon-right' : ''
                        }"
                      >
                        ${iconPosition === 'top' ? media : ''}
                        ${
                          this.heading
                            ? html`<span class="dsfr-data-kpi__heading">${this.heading}</span>`
                            : ''
                        }
                        ${iconPosition === 'label' ? media : ''}
                        <div class="dsfr-data-kpi__value-wrapper">
                          <span class="dsfr-data-kpi__value">${formattedValue}</span>
                          ${
                            tendance
                              ? html`
                                  <span
                                    class="dsfr-data-kpi__tendance dsfr-data-kpi__tendance--${tendance.direction}"
                                    role="img"
                                    aria-label="${
                                      tendance.value > 0
                                        ? `en hausse de ${formatPercentage(Math.abs(tendance.value))}`
                                        : tendance.value < 0
                                          ? `en baisse de ${formatPercentage(Math.abs(tendance.value))}`
                                          : 'stable'
                                    }"
                                  >
                                    ${
                                      tendance.direction === 'up'
                                        ? '↑'
                                        : tendance.direction === 'down'
                                          ? '↓'
                                          : '→'
                                    }
                                    ${formatPercentage(Math.abs(tendance.value))}
                                  </span>
                                `
                              : ''
                          }
                        </div>
                        ${resolvedLines.map(
                          (line) => html`
                            <span
                              class="dsfr-data-kpi__line"
                              style=${line.color ? `color: ${line.color};` : ''}
                              >${line.text}</span
                            >
                          `
                        )}
                        <span class="dsfr-data-kpi__label">${this.label}</span>
                        ${iconPosition === 'right' ? media : ''}
                      </div>
                    `
        }
        ${imageUrl && imagePosition === 'right' ? image : ''}
      </div>
      <style>
        .dsfr-data-kpi {
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 1.5rem;
          background: var(--background-default-grey);
          border-radius: 0.25rem;
          border-left: 4px solid var(--border-default-grey);
          min-height: 140px;
          height: 100%;
          box-sizing: border-box;
        }
        .dsfr-data-kpi--success {
          border-left-color: var(--background-flat-success);
        }
        .dsfr-data-kpi--warning {
          border-left-color: var(--background-flat-warning);
        }
        .dsfr-data-kpi--error {
          border-left-color: var(--background-flat-error);
        }
        .dsfr-data-kpi--info {
          border-left-color: var(--background-flat-info);
        }
        .dsfr-data-kpi__content {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .dsfr-data-kpi__heading {
          font-size: 0.875rem;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.01em;
          color: var(--text-mention-grey);
        }
        .dsfr-data-kpi__line {
          font-size: 0.875rem;
          font-weight: 500;
        }
        .dsfr-data-kpi__icon {
          font-size: 1.5rem;
          color: var(--text-mention-grey);
        }
        .dsfr-data-kpi__value-wrapper {
          display: flex;
          align-items: baseline;
          gap: 0.5rem;
        }
        .dsfr-data-kpi__value {
          font-size: 2.5rem;
          font-weight: 700;
          line-height: 1;
          color: var(--text-title-grey);
        }
        .dsfr-data-kpi__tendance {
          font-size: 0.875rem;
          font-weight: 500;
        }
        .dsfr-data-kpi__tendance--up {
          color: var(--text-default-success);
        }
        .dsfr-data-kpi__tendance--down {
          color: var(--text-default-error);
        }
        .dsfr-data-kpi__tendance--stable {
          color: var(--text-mention-grey);
        }
        .dsfr-data-kpi__label {
          font-size: 0.875rem;
          color: var(--text-mention-grey);
        }
        .dsfr-data-kpi__loading,
        .dsfr-data-kpi__error {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--text-mention-grey);
          font-size: 0.875rem;
        }
        .dsfr-data-kpi__error {
          color: var(--text-default-error);
        }

        /* ------------------------------------------------------------------
           Habillage (planche kpi-evolutions). Tout ce qui suit est ADDITIF :
           les règles ci-dessus, qui régissent le rendu historique, ne sont pas
           retouchées (tests/kpi-rendu-retrocompat.test.ts) — les tokens
           sémantiques n'y gagnent qu'une variable d'accent, consommée par les
           nouveaux modes seulement.
           ------------------------------------------------------------------ */
        .dsfr-data-kpi--success {
          --dsfr-data-kpi-accent: var(--background-flat-success);
        }
        .dsfr-data-kpi--warning {
          --dsfr-data-kpi-accent: var(--background-flat-warning);
        }
        .dsfr-data-kpi--error {
          --dsfr-data-kpi-accent: var(--background-flat-error);
        }
        .dsfr-data-kpi--info {
          --dsfr-data-kpi-accent: var(--background-flat-info);
        }
        /* Couleur illustrative : l'accent est posé en style inline,
           var(--border-plain-<nom>) — token DSFR, mode sombre inclus. */
        .dsfr-data-kpi--illustrative {
          border-left-color: var(--dsfr-data-kpi-accent);
        }

        /* Liseré : border="top|bottom|outline|left-short|none" */
        .dsfr-data-kpi--border-top {
          border-left-width: 0;
          border-top: 4px solid var(--dsfr-data-kpi-accent, var(--border-default-grey));
        }
        .dsfr-data-kpi--border-bottom {
          border-left-width: 0;
          box-shadow: inset 0 -2px 0 var(--dsfr-data-kpi-accent, var(--border-default-grey));
        }
        .dsfr-data-kpi--border-outline {
          border: 1px solid var(--dsfr-data-kpi-accent, var(--border-default-grey));
        }
        .dsfr-data-kpi--border-left-short {
          border-left-width: 0;
          position: relative;
        }
        .dsfr-data-kpi--border-left-short::before {
          content: '';
          position: absolute;
          left: 0;
          top: 1.5rem;
          width: 4px;
          height: 2.5rem;
          background: var(--dsfr-data-kpi-accent, var(--border-default-grey));
        }
        .dsfr-data-kpi--border-none {
          border-left-width: 0;
        }

        /* Fond teinté : la VALEUR reste en gris titre (contraste, planche 3b). */
        .dsfr-data-kpi--tint {
          background: var(--dsfr-data-kpi-tint);
        }
        .dsfr-data-kpi--tint .dsfr-data-kpi__heading,
        .dsfr-data-kpi--tint .dsfr-data-kpi__label {
          color: var(--text-default-grey);
        }

        /* Icône : taille et position */
        .dsfr-data-kpi__icon--md {
          font-size: 2rem;
          --icon-size: 2rem;
        }
        .dsfr-data-kpi__icon--top,
        .dsfr-data-kpi__icon--right {
          color: var(--dsfr-data-kpi-accent, var(--text-mention-grey));
          line-height: 1;
        }
        .dsfr-data-kpi--media-icon-sm {
          --dsfr-data-kpi-media-size: 1.5rem;
        }
        .dsfr-data-kpi--media-icon-md {
          --dsfr-data-kpi-media-size: 2rem;
        }
        .dsfr-data-kpi--media-picto-sm {
          --dsfr-data-kpi-media-size: 3.5rem;
        }
        .dsfr-data-kpi--media-picto-md {
          --dsfr-data-kpi-media-size: 5rem;
        }
        .dsfr-data-kpi--icon-right {
          position: relative;
        }
        .dsfr-data-kpi__content--icon-right {
          padding-right: calc(var(--dsfr-data-kpi-media-size, 1.5rem) + 1.5rem);
        }
        .dsfr-data-kpi__icon--right,
        .dsfr-data-kpi__picto--right {
          position: absolute;
          top: 1.5rem;
          right: 1.5rem;
        }

        /* Pictogramme DSFR : échelle des tuiles (5 rem, 3,5 rem en sm) */
        .dsfr-data-kpi__picto {
          width: 5rem;
          height: 5rem;
          flex: none;
        }
        .dsfr-data-kpi__picto--sm {
          width: 3.5rem;
          height: 3.5rem;
        }

        /* Image : bandeau, colonne ou vignette */
        .dsfr-data-kpi__image {
          flex: none;
          overflow: hidden;
        }
        .dsfr-data-kpi__image img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .dsfr-data-kpi--image-top {
          padding: 0;
        }
        .dsfr-data-kpi--image-top > .dsfr-data-kpi__content {
          padding: 1.5rem;
        }
        .dsfr-data-kpi__image--top {
          aspect-ratio: 16 / 9;
        }
        .dsfr-data-kpi--image-left {
          flex-direction: row;
          justify-content: flex-start;
          align-items: stretch;
          padding: 0;
        }
        .dsfr-data-kpi--image-left > .dsfr-data-kpi__content {
          flex: 1;
          min-width: 0;
          justify-content: center;
          padding: 1.5rem;
        }
        .dsfr-data-kpi__image--left {
          width: 10rem;
        }
        .dsfr-data-kpi--image-right {
          flex-direction: row;
          justify-content: flex-start;
          align-items: flex-start;
          gap: 1.5rem;
        }
        .dsfr-data-kpi--image-right > .dsfr-data-kpi__content {
          flex: 1;
          min-width: 0;
        }
        .dsfr-data-kpi__image--right {
          width: 7.5rem;
          height: 7.5rem;
        }

        /* Vertical : tuile centrée quand elle porte un média (1f), sinon 1g */
        .dsfr-data-kpi--centered {
          align-items: center;
          text-align: center;
        }
        .dsfr-data-kpi--centered .dsfr-data-kpi__content {
          align-items: center;
        }
        .dsfr-data-kpi--centered .dsfr-data-kpi__value-wrapper {
          justify-content: center;
        }

        /* Groupe empilé (dsfr-data-kpi-group orientation="vertical", 1e) :
           un liseré continu porté par le groupe, un filet entre les KPI,
           le média à gauche du texte à 2,5 rem. */
        dsfr-data-kpi-group[orientation='vertical'] > dsfr-data-kpi > .dsfr-data-kpi {
          border: 0;
          border-radius: 0;
          box-shadow: none;
          min-height: 0;
          height: auto;
          padding: 1.25rem 2rem 1.5rem;
          background: transparent;
          position: relative;
        }
        dsfr-data-kpi-group[orientation='vertical']
          > dsfr-data-kpi:not(:last-child)
          > .dsfr-data-kpi {
          box-shadow: inset 0 -1px 0 var(--border-default-grey);
        }
        dsfr-data-kpi-group[orientation='vertical'] > dsfr-data-kpi .dsfr-data-kpi__value {
          font-size: 2rem;
        }
        dsfr-data-kpi-group[orientation='vertical'] > dsfr-data-kpi .dsfr-data-kpi__content {
          gap: 0.25rem;
        }
        dsfr-data-kpi-group[orientation='vertical']
          > dsfr-data-kpi
          > .dsfr-data-kpi--stacked-media {
          padding-left: 5.75rem;
        }
        dsfr-data-kpi-group[orientation='vertical'] > dsfr-data-kpi .dsfr-data-kpi__icon--top,
        dsfr-data-kpi-group[orientation='vertical'] > dsfr-data-kpi .dsfr-data-kpi__picto--top {
          position: absolute;
          left: 2rem;
          top: 1.25rem;
          width: 2.5rem;
          height: 2.5rem;
          font-size: 2.5rem;
          --icon-size: 2.5rem;
        }
      </style>
    `;
  }

  /** SVG canonique d'un pictogramme DSFR : trois `<use>` vers le même fichier. */
  private _renderPicto(nom: string, position: IconPosition, size: IconSize, illustrative: string) {
    const file = this._pictoFile(nom);
    const classes = ['fr-artwork', 'dsfr-data-kpi__picto'];
    if (position !== 'label') classes.push(`dsfr-data-kpi__picto--${position}`);
    if (size === 'sm') classes.push('dsfr-data-kpi__picto--sm');
    if (illustrative) classes.push(`fr-artwork--${illustrative}`);
    return html`
      <svg
        class="${classes.join(' ')}"
        aria-hidden="true"
        viewBox="0 0 80 80"
        width="80"
        height="80"
      >
        <use class="fr-artwork-decorative" href="${file}#artwork-decorative"></use>
        <use class="fr-artwork-minor" href="${file}#artwork-minor"></use>
        <use class="fr-artwork-major" href="${file}#artwork-major"></use>
      </svg>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsfr-data-kpi': DsfrDataKpi;
  }
}
