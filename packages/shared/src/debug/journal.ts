/**
 * Journal réseau et console (#994, ADR-143 §3).
 *
 * Ce que seuls les outils de développement montraient jusqu'ici : la requête
 * réellement partie (URL après proxy, méthode, statut, durée, type, taille,
 * erreur) et ce que la page a crié en console (`console.warn/error`,
 * `window.onerror`, `unhandledrejection`). Sans cela, une carte vide sous un
 * 404 ou un blocage CORS ne se distingue pas d'une carte vide faute de champ
 * géographique.
 *
 * Deux poses, UN seul format de tampon :
 *
 *   - **iframe d'aperçu** : `earlyBufferScript()` (ES5, en tête du document)
 *     pose les enveloppes avant la bibliothèque, par `journalScript()` ;
 *   - **même document** (Carto, Pipeline) : `installerJournal(window)`, appelé
 *     par `./installer-journal.ts`, importé en PREMIÈRE ligne de l'app.
 *
 * Les deux écrivent dans `window.__dsfrDataNet` et `window.__dsfrDataConsole`,
 * et le collecteur les vide par `drainerJournal()` au moment de l'instantané :
 * il n'a pas à savoir qui a posé les enveloppes. Les deux implémentations ne
 * peuvent pas partager leur code (le script précoce tient dans une chaîne,
 * sans dépendance) : la MÊME suite de tests les exécute toutes les deux
 * (`tests/debug/journal.test.ts`) et exige le même résultat.
 *
 * Invariants, chacun non négociable :
 *
 * 1. **Transparence.** L'enveloppe de `fetch` rend LA MÊME promesse que le
 *    `fetch` d'origine : même résolution, même rejet, même flux.
 * 2. **Aucun corps lu.** Ni `json()`, ni `text()`, ni `clone()` : seuls les
 *    en-têtes `content-type` et `content-length` de la RÉPONSE sont relevés.
 *    Aucun en-tête de requête n'est conservé — un `Authorization` ne peut
 *    donc pas fuir, faute d'avoir été copié.
 * 3. **Jamais d'échec induit.** Toute la mécanique est sous `try` : une page
 *    observée ne doit jamais tomber à cause de son observateur.
 * 4. **Tampons plafonnés** à 500 entrées, en évinçant la plus ANCIENNE —
 *    contrairement au tampon du bus qui cesse d'empiler : pour le réseau,
 *    c'est la dernière erreur qui compte.
 * 5. **Les URL sont brutes dans le tampon** ; le masquage des jetons se fait
 *    au rendu (`masquerUrl`, appelée par `formatTrace`).
 */

/** Variable globale du tampon réseau. */
export const JOURNAL_RESEAU_KEY = '__dsfrDataNet';
/** Variable globale du tampon console. */
export const JOURNAL_CONSOLE_KEY = '__dsfrDataConsole';
/** Drapeau d'installation — rend `installerJournal` idempotent. */
export const JOURNAL_INSTALLE_KEY = '__dsfrDataJournalInstalle';
/** Plafond de chaque tampon. */
export const JOURNAL_MAX = 500;
/** Longueur maximale d'un message de console. */
export const JOURNAL_MESSAGE_MAX = 500;
/** Longueur maximale d'une pile d'appel. */
export const JOURNAL_PILE_MAX = 1000;

/**
 * Requêtes jamais journalisées. `motif` est la SOURCE d'une expression
 * régulière (chaîne, pour être recopiée telle quelle dans le script ES5),
 * testée :
 *   - sur l'URL absolue complète si `memeOrigine` vaut `false` ;
 *   - sur chemin + requête, et seulement pour une URL de la même origine que
 *     la page, si `memeOrigine` vaut `true`.
 *
 * - **Beacon d'usage** (pixel `…/beacon`, transport `/api/monitoring/beacon`) :
 *   l'observateur ne doit pas se voir lui-même. On filtre le CHEMIN et non
 *   `BEACON_BASE_URL`, qui est aussi la base du proxy : l'exclure écarterait
 *   toutes les requêtes de données.
 * - **Appels `/api/*` de l'app** (auth, stockage, favoris) : ce n'est pas du
 *   trafic de pipeline, et ils portent le jeton de session. Entrée à retirer
 *   si l'on décide de les voir.
 */
export const JOURNAL_EXCLUSIONS: ReadonlyArray<{ motif: string; memeOrigine: boolean }> = [
  { motif: '/beacon(?:[?#]|$)', memeOrigine: false },
  { motif: '^/api/', memeOrigine: true },
];

/** Une requête observée. */
export interface EntreeReseau {
  /** Départ de la requête, `Date.now()` ABSOLU — comme `TraceEvent.t`. */
  t: number;
  /** URL telle qu'appelée (proxy appliqué), absolue, BRUTE : masquée au rendu. */
  url: string;
  /** Méthode HTTP, en capitales, `GET` par défaut. */
  methode: string;
  /** Code HTTP ; `null` si la requête a échoué sans réponse (CORS, réseau). */
  statut: number | null;
  /** Durée jusqu'aux en-têtes de réponse (ms), complétée par `performance` si absente. */
  dureeMs: number | null;
  /** En-tête `content-type` de la réponse. */
  type: string | null;
  /** `content-length`, complétée par `performance` si absente. */
  taille: number | null;
  /** `${err.name}: ${err.message}` d'un `fetch` rejeté, ex. `TypeError: Failed to fetch`. */
  erreur: string | null;
  origine: 'fetch';
}

/** Un avertissement, une erreur de console, une erreur non rattrapée ou une promesse rejetée. */
export interface EntreeConsole {
  t: number;
  niveau: 'warn' | 'error';
  /** Message aplati en texte, borné à 500 caractères. */
  message: string;
  source: 'console' | 'onerror' | 'unhandledrejection';
  /** Pile d'appel, quand l'erreur en porte une, bornée à 1 000 caractères. */
  pile?: string;
}

/** Ce que rend `drainerJournal`. */
export interface JournalDraine {
  reseau: EntreeReseau[];
  console: EntreeConsole[];
}

interface WindowWithJournal extends Window {
  __dsfrDataNet?: EntreeReseau[];
  __dsfrDataConsole?: EntreeConsole[];
  __dsfrDataJournalInstalle?: boolean;
  // `console` est une globale, absente du type `Window` de lib.dom.
  console?: Console;
}

function borne(texte: string, max: number): string {
  return texte.length > max ? `${texte.slice(0, max - 1)}…` : texte;
}

/** Aplatit une valeur en texte, sans jamais lever. */
function enTexte(valeur: unknown): string {
  try {
    if (typeof valeur === 'string') return valeur;
    if (valeur && typeof valeur === 'object' && 'message' in valeur) {
      const e = valeur as { name?: string; message?: string };
      return `${e.name || 'Error'}: ${e.message || ''}`;
    }
    const json = JSON.stringify(valeur);
    return json === undefined ? String(valeur) : json;
  } catch {
    return String(valeur);
  }
}

function pileDe(valeur: unknown): string | undefined {
  const pile = (valeur as { stack?: unknown } | null | undefined)?.stack;
  return typeof pile === 'string' ? borne(pile, JOURNAL_PILE_MAX) : undefined;
}

function empiler<T>(tampon: T[], entree: T): void {
  tampon.push(entree);
  while (tampon.length > JOURNAL_MAX) tampon.shift();
}

/**
 * Exclusions compilées une fois. Motifs constants du module (jamais une
 * saisie) : le constructeur non littéral est sans risque ici.
 */
const EXCLUSIONS_RE = JOURNAL_EXCLUSIONS.map(({ motif, memeOrigine }) => ({
  // eslint-disable-next-line security/detect-non-literal-regexp
  re: new RegExp(motif),
  memeOrigine,
}));

function exclue(url: string, win: Window): boolean {
  for (const { re, memeOrigine } of EXCLUSIONS_RE) {
    if (!memeOrigine) {
      if (re.test(url)) return true;
      continue;
    }
    try {
      const u = new URL(url);
      if (u.origin === win.location.origin && re.test(u.pathname + u.search)) return true;
    } catch {
      // URL non analysable : on la garde.
    }
  }
  return false;
}

function consigner(
  cons: EntreeConsole[],
  niveau: EntreeConsole['niveau'],
  source: EntreeConsole['source'],
  message: string,
  porteurPile: unknown
): void {
  const entree: EntreeConsole = {
    t: Date.now(),
    niveau,
    message: borne(message, JOURNAL_MESSAGE_MAX),
    source,
  };
  const pile = pileDe(porteurPile);
  if (pile) entree.pile = pile;
  empiler(cons, entree);
}

/**
 * Pose les enveloppes réseau et console sur une fenêtre. Idempotent : un
 * second appel sur le même document — ou après le script précoce — ne fait
 * rien, sans quoi chaque requête serait journalisée deux fois.
 */
export function installerJournal(win: Window): void {
  const w = win as WindowWithJournal | null | undefined;
  if (!w || w.__dsfrDataJournalInstalle) return;
  try {
    w.__dsfrDataJournalInstalle = true;
    const net: EntreeReseau[] = [];
    const cons: EntreeConsole[] = [];
    w.__dsfrDataNet = net;
    w.__dsfrDataConsole = cons;

    const fetchOrigine = w.fetch;
    if (typeof fetchOrigine === 'function') {
      w.fetch = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
        // L'appel d'origine d'abord, hors de tout try : une exception
        // synchrone doit remonter telle quelle, et c'est SA promesse qu'on rend.
        const promesse = fetchOrigine.call(this === undefined ? w : this, input, init);
        try {
          const req = input && typeof input === 'object' && 'url' in input ? input : null;
          const brute = typeof input === 'string' ? input : req ? String(req.url) : String(input);
          let url = brute;
          try {
            url = new URL(brute, w.location.href).href;
          } catch {
            // URL non résoluble : on garde la chaîne telle quelle.
          }
          if (exclue(url, w)) return promesse;
          const debut = Date.now();
          const entree: EntreeReseau = {
            t: debut,
            url,
            methode: String(init?.method || (req as Request | null)?.method || 'GET').toUpperCase(),
            statut: null,
            dureeMs: null,
            type: null,
            taille: null,
            erreur: null,
            origine: 'fetch',
          };
          promesse.then(
            (reponse) => {
              try {
                entree.statut = reponse.status;
                entree.dureeMs = Date.now() - debut;
                entree.type = reponse.headers.get('content-type');
                const longueur = reponse.headers.get('content-length');
                entree.taille = longueur ? Number(longueur) : null;
                empiler(net, entree);
              } catch {
                // Réponse exotique : rien à journaliser.
              }
            },
            (erreur: unknown) => {
              try {
                entree.dureeMs = Date.now() - debut;
                entree.erreur = enTexte(erreur);
                empiler(net, entree);
              } catch {
                // idem
              }
            }
          );
        } catch {
          // Journalisation impossible : la requête part quand même.
        }
        return promesse;
      } as typeof fetch;
    }

    const c = w.console;
    if (c) {
      for (const niveau of ['warn', 'error'] as const) {
        const origine = c[niveau];
        if (typeof origine !== 'function') continue;
        c[niveau] = function (this: unknown, ...args: unknown[]) {
          try {
            consigner(
              cons,
              niveau,
              'console',
              args.map(enTexte).join(' '),
              args.find((a) => pileDe(a) !== undefined)
            );
          } catch {
            // idem
          }
          return origine.apply(this === undefined ? c : this, args);
        };
      }
    }

    w.addEventListener('error', (e: Event) => {
      try {
        // Les erreurs de chargement de ressource (img, script) ne remontent
        // pas jusqu'à `window` hors phase de capture : ne restent que les
        // erreurs d'exécution, qui portent un message ou une erreur.
        const ev = e as ErrorEvent;
        if (typeof ev.message !== 'string' && !ev.error) return;
        consigner(cons, 'error', 'onerror', ev.message || enTexte(ev.error), ev.error);
      } catch {
        // idem
      }
    });

    w.addEventListener('unhandledrejection', (e: Event) => {
      try {
        const raison = (e as PromiseRejectionEvent).reason;
        consigner(cons, 'error', 'unhandledrejection', enTexte(raison), raison);
      } catch {
        // idem
      }
    });
  } catch {
    // Fenêtre inutilisable : la page tourne sans journal.
  }
}

/**
 * Complète durée et taille par `performance` (`PerformanceResourceTiming`).
 *
 * Complément SEULEMENT, jamais source du statut : le statut vient toujours de
 * la réponse de `fetch`, et une ressource cross-origin sans
 * `Timing-Allow-Origin` rend des tailles à zéro. La taille n'étant connue
 * qu'après lecture du corps, on la cherche au drainage, pas à la réponse.
 */
function completerParPerformance(win: Window, entrees: EntreeReseau[]): void {
  const perf = win.performance;
  if (!perf || typeof perf.getEntriesByName !== 'function') return;
  for (const entree of entrees) {
    if (entree.taille !== null && entree.dureeMs !== null) continue;
    try {
      const mesures = perf.getEntriesByName(entree.url, 'resource') as PerformanceResourceTiming[];
      const mesure = mesures[mesures.length - 1];
      if (!mesure) continue;
      if (entree.dureeMs === null && mesure.duration > 0) {
        entree.dureeMs = Math.round(mesure.duration);
      }
      const octets = mesure.encodedBodySize || mesure.transferSize;
      if (entree.taille === null && octets > 0) entree.taille = octets;
    } catch {
      // `performance` indisponible dans ce contexte.
    }
  }
}

/**
 * Vide les tampons d'une fenêtre et rend ce qu'ils contenaient.
 *
 * Vider plutôt que copier, comme `drainEarlyBuffer` : le collecteur garde SA
 * copie, et une iframe rechargée ne rejoue pas le journal du rendu précédent.
 */
export function drainerJournal(win: Window | null | undefined): JournalDraine {
  const w = win as WindowWithJournal | null | undefined;
  try {
    const net = w?.__dsfrDataNet;
    const cons = w?.__dsfrDataConsole;
    const reseau = Array.isArray(net) ? net.splice(0, net.length) : [];
    if (w && reseau.length > 0) completerParPerformance(w, reseau);
    return { reseau, console: Array.isArray(cons) ? cons.splice(0, cons.length) : [] };
  } catch {
    // Fenêtre d'une iframe détruite : plus rien à lire.
    return { reseau: [], console: [] };
  }
}

/** Paramètre d'URL porteur d'un secret, comparé au nom exact : `key` masque `?key=`, pas `?monkey=`. */
const PARAM_SENSIBLE_RE = /([?&#](?:token|apikey|api_key|key|access_token)=)[^&#\s"'<>]*/gi;

/**
 * URL prête à sortir de la page (#994).
 *
 * Les jetons passés en paramètre (`token`, `apikey`, `api_key`, `key`,
 * `access_token`, nom exact, casse ignorée) deviennent `***`. Avec
 * `hoteEtCheminSeulement` (option `redactValues` du rendu), l'URL est réduite
 * à l'hôte et au chemin : les valeurs de filtre (`where=nom="Dupont"`) sont
 * des DONNÉES, au même titre que l'échantillon qu'on masque déjà.
 */
export function masquerUrl(url: string, opts: { hoteEtCheminSeulement?: boolean } = {}): string {
  if (opts.hoteEtCheminSeulement) {
    try {
      const u = new URL(url);
      return `${u.host}${u.pathname}`;
    } catch {
      return url.split(/[?#]/)[0];
    }
  }
  return url.replace(PARAM_SENSIBLE_RE, '$1***');
}

/**
 * Le même journal, en ES5 sans dépendance, pour le tampon précoce de l'iframe.
 *
 * Rend le CORPS d'un script (sans balise) : `earlyBufferScript()` le place
 * dans la même balise que le tampon du bus. Toute évolution
 * d'`installerJournal` se reporte ici : `tests/debug/journal.test.ts` exécute
 * les deux et exige le même résultat.
 */
export function journalScript(): string {
  const x = JSON.stringify(JOURNAL_EXCLUSIONS);
  return (
    `(function(w){try{if(w.${JOURNAL_INSTALLE_KEY})return;w.${JOURNAL_INSTALLE_KEY}=true;` +
    `var N=[],C=[],M=${JOURNAL_MAX},X=${x};` +
    `w.${JOURNAL_RESEAU_KEY}=N;w.${JOURNAL_CONSOLE_KEY}=C;` +
    // empiler, en évinçant la plus ancienne
    `function P(b,e){b.push(e);while(b.length>M)b.shift();}` +
    `function S(v){try{if(typeof v==='string')return v;` +
    `if(v&&typeof v==='object'&&'message' in v)return(v.name||'Error')+': '+(v.message||'');` +
    `var j=JSON.stringify(v);return j===undefined?String(v):j;}catch(y){return String(v);}}` +
    `function L(s,m){return s.length>m?s.slice(0,m-1)+'\\u2026':s;}` +
    `function K(v){var s=v&&v.stack;return typeof s==='string'?L(s,${JOURNAL_PILE_MAX}):undefined;}` +
    `function G(n,s,m,p){var e={t:Date.now(),niveau:n,message:L(m,${JOURNAL_MESSAGE_MAX}),source:s};` +
    `var k=K(p);if(k)e.pile=k;P(C,e);}` +
    // exclusions
    `function Z(u){for(var i=0;i<X.length;i++){var r=new RegExp(X[i].motif);` +
    `if(!X[i].memeOrigine){if(r.test(u))return true;continue;}` +
    `try{var q=new URL(u);if(q.origin===w.location.origin&&r.test(q.pathname+q.search))return true;}catch(y){}}` +
    `return false;}` +
    // fetch
    `try{var F=w.fetch;if(typeof F==='function'){w.fetch=function(i,n){` +
    `var p=F.call(this===undefined?w:this,i,n);try{` +
    `var q=i&&typeof i==='object'&&'url' in i?i:null;` +
    `var r=typeof i==='string'?i:(q?String(q.url):String(i)),u=r;` +
    `try{u=new URL(r,w.location.href).href;}catch(y){}` +
    `if(Z(u))return p;var d=Date.now();` +
    `var e={t:d,url:u,methode:String((n&&n.method)||(q&&q.method)||'GET').toUpperCase(),` +
    `statut:null,dureeMs:null,type:null,taille:null,erreur:null,origine:'fetch'};` +
    `p.then(function(s){try{e.statut=s.status;e.dureeMs=Date.now()-d;` +
    `e.type=s.headers.get('content-type');var l=s.headers.get('content-length');` +
    `e.taille=l?Number(l):null;P(N,e);}catch(y){}},` +
    `function(x){try{e.dureeMs=Date.now()-d;e.erreur=S(x);P(N,e);}catch(y){}});` +
    `}catch(y){}return p;};}}catch(y){}` +
    // console.warn / console.error
    `try{var c=w.console;if(c){var V=['warn','error'];for(var j=0;j<V.length;j++){(function(v){` +
    `var o=c[v];if(typeof o!=='function')return;c[v]=function(){var a=Array.prototype.slice.call(arguments);` +
    `try{var t=[],g;for(var z=0;z<a.length;z++){t.push(S(a[z]));if(g===undefined&&K(a[z])!==undefined)g=a[z];}` +
    `G(v,'console',t.join(' '),g);}catch(y){}` +
    `return o.apply(this===undefined?c:this,a);};})(V[j]);}}}catch(y){}` +
    // erreurs non rattrapées, promesses rejetées
    `w.addEventListener('error',function(v){try{if(typeof v.message!=='string'&&!v.error)return;` +
    `G('error','onerror',v.message||S(v.error),v.error);}catch(y){}});` +
    `w.addEventListener('unhandledrejection',function(v){try{` +
    `G('error','unhandledrejection',S(v.reason),v.reason);}catch(y){}});` +
    `}catch(y){}})(window);`
  );
}
