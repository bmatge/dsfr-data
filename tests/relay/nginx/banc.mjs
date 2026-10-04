// Banc de l'extrait nginx du relais (ADR-155, lot 3).
//
// Un relais conforme ne joint que du `https` sur le port 443 : il ne peut pas joindre
// le faux amont local de la suite de conformance (docs/RELAY.md §7). Le banc reçoit
// donc une VARIANTE de l'extrait, dérivée ici de l'extrait de production
// (`proxy/relay/nginx/`) par deux opérations, et deux seulement :
//
//   1. les trois hôtes d'exemple et le préfixe d'exemple sont RENOMMÉS en ceux du
//      profil de conformance (`tests/relay/conformance-profile.json`) ;
//   2. l'ADRESSE DE L'AMONT change : `server <hôte>:443` devient le faux amont, et
//      `proxy_pass https://` devient `http://` (le faux amont parle en clair).
//
// Tout le reste — relais-http.conf, relais-server.conf, relais-hote.conf,
// relais-reponse.conf — est monté tel quel dans le conteneur : ce sont les fichiers de
// production. `tests/relay/nginx/extrait-nginx.test.ts` garde les fichiers de `banc/`
// égaux à cette dérivation, et vérifie ligne à ligne que rien d'autre ne diffère.

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

export const EXTRAIT_DIR = fileURLToPath(new URL('../../../proxy/relay/nginx/', import.meta.url));
export const BANC_DIR = fileURLToPath(new URL('./banc/', import.meta.url));

/** Hôtes et préfixe d'exemple de l'extrait → ceux du profil de conformance. */
export const RENOMMAGES = [
  ['donnees.portail.example', 'ouvert.conformance.test'],
  ['autre.portail.example', 'second.conformance.test'],
  ['portail-prive.example', 'cle.conformance.test'],
  ['/api/explore/v2.1/catalog/datasets/jeu-publiable/', '/api/public/'],
];

/** Adresse du faux amont de la suite de conformance (`CONFORMANCE_UPSTREAM_PORT`). */
export const AMONT_BANC = '127.0.0.1:18155';

/** Ports d'écoute des nginx du banc : hors de 8155, que garde le relais Node. */
export const PORT_RELAIS = 8165;
export const PORT_MANDATAIRE = 8166;
export const PORT_OBSERVATION = 8167;

const SERVEUR_AMONT_RE = /^(\s*server )[a-z0-9.-]+:443( )/gm;
const PROXY_PASS_RE = /^(\s*proxy_pass )https:\/\//gm;
const DUREE_CACHE_RE = /^(\s*proxy_cache_valid 200 )\d+s;/gm;

const EN_TETE = [
  '# DÉRIVÉ de proxy/relay/nginx/ par tests/relay/nginx/banc.mjs — ne pas modifier à la main.',
  '# Hôtes renommés en ceux du profil de conformance ; amont : le faux amont local, en clair.',
  '',
].join('\n');

/** @param {string} nom fichier de `proxy/relay/nginx/` */
export function lireExtrait(nom) {
  return readFileSync(`${EXTRAIT_DIR}${nom}`, 'utf8');
}

/**
 * Remplace toutes les occurrences, en exigeant qu'il y en ait : un renommage qui ne
 * trouve plus rien est un extrait qui a changé sans que le banc suive.
 *
 * @param {string} texte
 * @param {string | RegExp} motif
 * @param {string} remplacement
 * @param {number} [attendu] nombre exact d'occurrences
 */
function remplacer(texte, motif, remplacement, attendu) {
  const trouve =
    typeof motif === 'string' ? texte.split(motif).length - 1 : [...texte.matchAll(motif)].length;
  if (trouve === 0 || (attendu !== undefined && trouve !== attendu)) {
    throw new Error(
      `banc nginx : « ${motif} » trouvé ${trouve} fois` +
        (attendu === undefined ? '' : `, attendu ${attendu}`)
    );
  }
  return typeof motif === 'string'
    ? texte.replaceAll(motif, remplacement)
    : texte.replace(motif, remplacement);
}

/** Opération 1 : les hôtes et le préfixe d'exemple deviennent ceux du profil. */
export function renommer(texte) {
  let sortie = texte;
  for (const [exemple, banc] of RENOMMAGES) {
    if (sortie.includes(exemple)) sortie = sortie.replaceAll(exemple, banc);
  }
  return sortie;
}

/**
 * Les fichiers d'hôtes du banc, dérivés de ceux de l'extrait.
 *
 * `dureeCache` n'est JAMAIS passé pour la suite de conformance : il ne sert qu'au banc
 * d'observation, qui regarde ce que fait nginx d'une entrée périmée sans attendre cinq
 * minutes (`observations.test.mjs`).
 *
 * @param {{ amont?: string, dureeCache?: number }} [options]
 * @returns {{ http: string, server: string, cles: string }}
 */
export function deriverBanc({ amont = AMONT_BANC, dureeCache } = {}) {
  const hotes = RENOMMAGES.length - 1;

  let http = renommer(lireExtrait('hotes.http.example.conf'));
  http = remplacer(http, SERVEUR_AMONT_RE, `$1${amont}$2`, hotes);

  let server = renommer(lireExtrait('hotes.server.example.conf'));
  server = remplacer(server, PROXY_PASS_RE, '$1http://', hotes);
  if (dureeCache !== undefined) {
    server = remplacer(server, DUREE_CACHE_RE, `$1${dureeCache}s;`, hotes);
  }

  let cles = renommer(lireExtrait('cles.example.conf'));
  cles = remplacer(cles, 'CLE-FICTIVE-A-REMPLACER', 'cle-fictive-de-conformance', 1);

  return { http: EN_TETE + http, server: EN_TETE + server, cles: EN_TETE + cles };
}

/**
 * Le `nginx.conf` d'un conteneur du banc : « le site », dans lequel l'extrait est
 * inclus comme le ferait un intégrateur. Aucun en-tête n'est posé au niveau `server` :
 * ce que nginx répond avant de router n'est donc pas maquillé par le banc.
 *
 * @param {{ port: number, http: string[], server: string[], extra?: string }} options
 */
export function squelette({ port, http, server, extra = '' }) {
  return `# Squelette du banc (tests/relay/nginx/banc.mjs) : un « site » minimal autour de l'extrait.
user nginx;
worker_processes 2;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    access_log off;

${http.map((fichier) => `    include ${fichier};`).join('\n')}

    server {
        listen 127.0.0.1:${port};
        server_name _;

        # Le site : tout ce qui n'est pas le relais.
        location / {
            return 404;
        }

${server.map((fichier) => `        include ${fichier};`).join('\n')}
${extra}
    }
}
`;
}

/**
 * Trois `location` NAÏVES, pour le banc d'observation seulement : ce que `proxy_pass`
 * transmet à l'amont selon sa forme. Aucune n'est dans l'extrait ; elles sont là pour
 * montrer pourquoi.
 */
export const LOCATIONS_NAIVES = `
        # proxy_pass AVEC URI : nginx remplace le préfixe et transmet le chemin NORMALISÉ.
        location /naif-uri/ {
            proxy_pass http://${AMONT_BANC}/;
        }
        # proxy_pass SANS URI : la cible de requête d'origine, préfixe compris.
        location /naif-brut/ {
            proxy_pass http://${AMONT_BANC};
        }
        # proxy_pass avec une variable : exactement la valeur de la variable.
        location /naif-variable/ {
            proxy_pass http://${AMONT_BANC}$request_uri;
        }
`;
