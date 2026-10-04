// Relais cachable (ADR-155) — classement des adresses IP et des noms d'hôte.
//
// Règle C-SSRF-6 du contrat (docs/RELAY.md) : un hôte autorisé qui RÉSOUT vers
// une adresse privée, de boucle locale ou de lien local est refusé. La liste
// blanche ne protège que du nom ; c'est l'adresse qui décide de ce qu'on atteint.
//
// Modules `node:` seuls : `net.BlockList` fait le calcul de sous-réseau.

import { BlockList, isIP } from 'node:net';

/** Plages IPv4 jamais jointes par le relais. */
const BLOCKED_V4 = [
  ['0.0.0.0', 8], // « ce réseau », dont 0.0.0.0
  ['10.0.0.0', 8], // privé
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // boucle locale
  ['169.254.0.0', 16], // lien local, dont les métadonnées des hébergeurs
  ['172.16.0.0', 12], // privé
  ['192.0.0.0', 24], // affectations IETF
  ['192.88.99.0', 24], // ancien relais 6to4
  ['192.168.0.0', 16], // privé
  ['198.18.0.0', 15], // bancs de mesure
  ['224.0.0.0', 4], // multidiffusion
  ['240.0.0.0', 4], // réservé, dont 255.255.255.255
];

/**
 * En IPv6, la règle est inversée : seul l'unicast global (2000::/3) passe, et
 * on en retire les plages spéciales qu'il contient. Tout le reste — boucle
 * locale `::1`, lien local `fe80::/10`, adresses locales uniques `fc00::/7`,
 * IPv4 mappée `::ffff:0:0/96`, NAT64 `64:ff9b::/96` — tombe hors de 2000::/3.
 */
const BLOCKED_V6_IN_GLOBAL = [
  ['2001::', 23], // affectations IETF, dont Teredo 2001::/32
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4 : embarque une IPv4 arbitraire
];

// Les trois TEST-NET de la RFC 5737 (192.0.2.0/24, 198.51.100.0/24,
// 203.0.113.0/24) ne sont PAS dans la liste : ils ne sont routés nulle part,
// ne mènent donc à aucune ressource interne, et servent d'adresses « publiques »
// au banc de tests (tests/relay/), qui ne doit joindre aucune adresse réelle.

const blockedV4 = new BlockList();
for (const [network, prefix] of BLOCKED_V4) blockedV4.addSubnet(network, prefix, 'ipv4');

const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');

const blockedV6 = new BlockList();
for (const [network, prefix] of BLOCKED_V6_IN_GLOBAL) blockedV6.addSubnet(network, prefix, 'ipv6');

/**
 * Vrai si l'adresse est une adresse publique que le relais a le droit de joindre.
 * Tout ce qui n'est pas une adresse IP littérale valide rend `false`.
 *
 * @param {unknown} address
 * @returns {boolean}
 */
export function isPublicAddress(address) {
  if (typeof address !== 'string') return false;
  // Identifiant de zone (`fe80::1%eth0`) : jamais une adresse publique.
  if (address.includes('%')) return false;
  const family = isIP(address);
  if (family === 4) return !blockedV4.check(address, 'ipv4');
  if (family === 6) {
    // Une IPv4 embarquée (`::ffff:a.b.c.d`, `::a.b.c.d`) est refusée d'office :
    // elle n'est pas dans 2000::/3, et `BlockList` la comparerait aux règles IPv4.
    if (address.includes('.')) return false;
    return globalV6.check(address, 'ipv6') && !blockedV6.check(address, 'ipv6');
  }
  return false;
}

/**
 * Nom d'hôte acceptable dans la liste blanche et dans une URL de relais :
 * minuscules, au moins deux étiquettes, et un domaine de premier niveau qui
 * commence par une lettre. Cette dernière clause écarte TOUTES les écritures
 * d'une adresse IPv4 (`127.0.0.1`, `2130706433`, `0x7f000001`, `0177.0.0.1`),
 * qu'un analyseur d'URL convertirait en adresse ; les crochets d'une IPv6, le
 * `:` d'un port, le `@` d'identifiants et le point final sont hors alphabet.
 */
const LABEL_RE = /^[a-z0-9-]+$/;
const STARTS_WITH_LETTER_RE = /^[a-z]/;

/**
 * @param {unknown} host
 * @returns {boolean}
 */
export function isValidHostname(host) {
  if (typeof host !== 'string' || host.length === 0 || host.length > 253) return false;
  const labels = host.split('.');
  if (labels.length < 2) return false;
  const wellFormed = labels.every(
    (label) =>
      label.length <= 63 && LABEL_RE.test(label) && !label.startsWith('-') && !label.endsWith('-')
  );
  if (!wellFormed) return false;
  return STARTS_WITH_LETTER_RE.test(labels[labels.length - 1]);
}

/**
 * Clé de limitation de débit pour une adresse cliente : l'IPv4 entière, ou le
 * préfixe /64 d'une IPv6 (un abonné IPv6 dispose d'un /64 complet : compter par
 * adresse reviendrait à ne rien limiter).
 *
 * @param {string | undefined} address
 * @returns {string}
 */
export function rateLimitKey(address) {
  if (typeof address !== 'string' || address === '') return 'inconnue';
  let value = address;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(value);
  if (mapped) value = mapped[1];
  if (isIP(value) !== 6) return value;
  const zone = value.indexOf('%');
  if (zone !== -1) value = value.slice(0, zone);
  const [head, tail = ''] = value.split('::');
  const headGroups = head === '' ? [] : head.split(':');
  const tailGroups = tail === '' ? [] : tail.split(':');
  const missing = value.includes('::') ? 8 - headGroups.length - tailGroups.length : 0;
  const groups = [...headGroups, ...new Array(Math.max(missing, 0)).fill('0'), ...tailGroups];
  return groups
    .slice(0, 4)
    .map((group) => group.toLowerCase().replace(/^0+(?=.)/, ''))
    .join(':');
}
