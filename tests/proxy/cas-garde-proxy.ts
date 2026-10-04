/**
 * Table de cas du bornage du proxy generique (`/cors-proxy`, `/ia-proxy`).
 *
 * UNE table, rejouee partout ou la regle s'applique :
 *   - `garde-proxy.test.ts` : le module `scripts/lib/garde-proxy.cjs` et son
 *     middleware (serveur de developpement) ;
 *   - `garde-proxy-coherence.test.ts` : les `map` des trois configurations nginx,
 *     relues et evaluees motif par motif ;
 *   - `garde-proxy-nginx.test.ts` : un vrai nginx sous Docker (CI).
 *
 * Aucune de ces cibles n'est appelee : les tests s'arretent a la decision.
 */

/** Hote par lequel l'instance est appelee dans les cas (en-tete `Host`). */
export const HOTE_INSTANCE = 'instance.exemple.fr';

export interface CasCible {
  nom: string;
  /** Valeur de l'en-tete `X-Target-URL` ; `undefined` : en-tete absent. */
  cible: string | undefined;
  /** `admis` : la requete part vers l'amont. Sinon le statut du refus. */
  attendu: 'admis' | 400 | 403;
}

export const CAS_CIBLES: CasCible[] = [
  // --- Admis : hotes publics, en https, sur le port par defaut -------------
  { nom: 'hote public', cible: 'https://api.exemple.fr/v1/data?limit=10', attendu: 'admis' },
  {
    nom: 'portail open data',
    cible: 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets',
    attendu: 'admis',
  },
  { nom: 'hote public sans chemin', cible: 'https://api.exemple.fr', attendu: 'admis' },
  { nom: 'hote public, requete seule', cible: 'https://api.exemple.fr?x=1', attendu: 'admis' },
  { nom: 'casse quelconque', cible: 'HTTPS://API.Exemple.FR/x', attendu: 'admis' },
  { nom: 'nom en punycode', cible: 'https://xn--caf-dma.exemple.fr/', attendu: 'admis' },
  { nom: 'domaine de tete en punycode', cible: 'https://exemple.xn--p1ai/', attendu: 'admis' },
  {
    nom: 'deux-points dans le chemin, cle en requete (Gemini)',
    cible: 'https://generativelanguage.googleapis.com/v1beta/models/m:generateContent?key=abc',
    attendu: 'admis',
  },
  {
    nom: 'requete encodee',
    cible: 'https://api.exemple.fr/a?where=nom%20%3D%20%22x%22&select=a,b',
    attendu: 'admis',
  },
  {
    // LIMITE ASSUMEE : la regle lit un NOM. Un nom public qui resout vers une
    // adresse privee la passe ; il est arrete plus loin (https, port 443,
    // certificat verifie) et par l'isolation reseau — docs/SECURITY.md.
    nom: 'nom public resolvant vers une adresse privee (hors de portee du nom)',
    cible: 'https://10.0.0.1.nip.io/',
    attendu: 'admis',
  },

  // --- En-tete absent -------------------------------------------------------
  { nom: 'en-tete absent', cible: undefined, attendu: 400 },

  // --- Schema ---------------------------------------------------------------
  { nom: 'http', cible: 'http://api.exemple.fr/', attendu: 403 },
  { nom: 'http vers la boucle locale', cible: 'http://127.0.0.1:3003/x', attendu: 403 },
  { nom: 'ftp', cible: 'ftp://api.exemple.fr/', attendu: 403 },
  { nom: 'file', cible: 'file:///etc/passwd', attendu: 403 },
  { nom: 'sans schema', cible: '//api.exemple.fr/', attendu: 403 },
  { nom: 'nom nu', cible: 'api.exemple.fr', attendu: 403 },

  // --- Adresses IP litterales ----------------------------------------------
  { nom: 'boucle locale 127.0.0.1', cible: 'https://127.0.0.1/', attendu: 403 },
  { nom: 'boucle locale [::1]', cible: 'https://[::1]/', attendu: 403 },
  { nom: 'IPv6 mappee', cible: 'https://[::ffff:127.0.0.1]/', attendu: 403 },
  { nom: 'IPv6 locale unique', cible: 'https://[fd00::1]/', attendu: 403 },
  { nom: 'IPv6 lien local', cible: 'https://[fe80::1]/', attendu: 403 },
  { nom: 'prive 10.x', cible: 'https://10.0.0.5/', attendu: 403 },
  { nom: 'prive 172.16.x', cible: 'https://172.16.0.1/', attendu: 403 },
  { nom: 'prive 172.31.x', cible: 'https://172.31.255.254/', attendu: 403 },
  { nom: 'prive 192.168.x', cible: 'https://192.168.1.1/', attendu: 403 },
  { nom: 'lien local, metadonnees', cible: 'https://169.254.169.254/latest/', attendu: 403 },
  { nom: 'metadonnees en http', cible: 'http://169.254.169.254/latest/', attendu: 403 },
  { nom: 'CGNAT 100.64.x', cible: 'https://100.64.0.1/', attendu: 403 },
  { nom: 'adresse nulle', cible: 'https://0.0.0.0/', attendu: 403 },
  { nom: 'IP publique litterale', cible: 'https://93.184.215.14/', attendu: 403 },
  { nom: 'IP en notation decimale', cible: 'https://2130706433/', attendu: 403 },
  { nom: 'IP en notation hexadecimale', cible: 'https://0x7f000001/', attendu: 403 },
  { nom: 'IP pointee hexadecimale', cible: 'https://0x7f.0.0.1/', attendu: 403 },
  { nom: 'IP pointee octale', cible: 'https://0177.0.0.1/', attendu: 403 },
  { nom: 'IP abregee', cible: 'https://127.1/', attendu: 403 },

  // --- Noms locaux ----------------------------------------------------------
  { nom: 'localhost', cible: 'https://localhost/', attendu: 403 },
  { nom: 'localhost avec port', cible: 'https://localhost:8080/', attendu: 403 },
  { nom: 'sous-domaine de localhost', cible: 'https://app.localhost/', attendu: 403 },
  { nom: 'service Docker mariadb', cible: 'https://mariadb/', attendu: 403 },
  { nom: 'service Docker web', cible: 'https://web/', attendu: 403 },
  { nom: 'service Docker chartsbuilder', cible: 'https://chartsbuilder/', attendu: 403 },
  {
    nom: 'service Docker qualifie par son reseau',
    cible: 'https://mariadb.internal/',
    attendu: 403,
  },
  { nom: 'hote Docker', cible: 'https://host.docker.internal/', attendu: 403 },
  { nom: 'nom mDNS', cible: 'https://imprimante.local/', attendu: 403 },
  { nom: 'nom de reseau domestique', cible: 'https://nas.lan/', attendu: 403 },
  { nom: 'zone arpa', cible: 'https://service.home.arpa/', attendu: 403 },
  { nom: 'point final', cible: 'https://api.exemple.fr./', attendu: 403 },

  // --- Identifiants, port, formes ambigues ---------------------------------
  { nom: 'identifiants dans l’URL', cible: 'https://user:pass@api.exemple.fr/', attendu: 403 },
  {
    nom: 'arobase vers une adresse privee',
    cible: 'https://api.exemple.fr@10.0.0.1/',
    attendu: 403,
  },
  {
    nom: 'faux port puis arobase',
    cible: 'https://api.exemple.fr:443@10.0.0.1/',
    attendu: 403,
  },
  { nom: 'barre oblique inverse', cible: 'https://api.exemple.fr\\@10.0.0.1/', attendu: 403 },
  { nom: 'diese puis arobase', cible: 'https://api.exemple.fr#@10.0.0.1/', attendu: 403 },
  { nom: 'port non standard', cible: 'https://api.exemple.fr:8443/', attendu: 403 },
  { nom: 'port 80', cible: 'https://api.exemple.fr:80/', attendu: 403 },
  { nom: 'port par defaut ecrit', cible: 'https://api.exemple.fr:443/', attendu: 403 },
  { nom: 'espace dans le chemin', cible: 'https://api.exemple.fr/a b', attendu: 403 },
  { nom: 'deux cibles', cible: 'https://a.exemple.fr/, https://b.exemple.fr/', attendu: 403 },

  // --- L'instance elle-meme -------------------------------------------------
  { nom: 'domaine de l’instance', cible: `https://${HOTE_INSTANCE}/api/x`, attendu: 403 },
  { nom: 'domaine de l’instance, sans chemin', cible: `https://${HOTE_INSTANCE}`, attendu: 403 },
  {
    nom: 'domaine de l’instance, autre casse',
    cible: 'https://Instance.Exemple.FR/cors-proxy',
    attendu: 403,
  },
];

/** Methodes que plus aucune route generique ne relaie. */
export const METHODES_RETIREES = ['PUT', 'DELETE', 'PATCH', 'HEAD'] as const;
