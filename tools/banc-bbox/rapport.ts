/**
 * Banc « zone visible » simulee (#1023) — globalTeardown :
 * out/mesures.jsonl -> resultats-AAAA-MM-JJ.md. Aucune estimation.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, totalmem, release, type } from 'node:os';
import { DOSSIER, JEUX, MESURES, RECTS, mediane } from './commun';

type Ligne = Record<string, unknown> & { type: string };

const s = (ms: number) => (Number.isFinite(ms) ? (ms / 1000).toFixed(2) + ' s' : '—');
const ko = (o: number) =>
  !Number.isFinite(o)
    ? '—'
    : o >= 1e6
      ? (o / 1e6).toFixed(2) + ' Mo'
      : (o / 1e3).toFixed(1) + ' Ko';
const n = (x: unknown) => (typeof x === 'number' ? x.toLocaleString('fr-FR') : '—');
const ms = (xs: unknown) =>
  (xs as number[]).map((m) => (Number.isFinite(m) ? Math.round(m) : '—')).join(' · ');

export default function rapport(): void {
  if (!existsSync(MESURES)) return;
  const L: Ligne[] = readFileSync(MESURES, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const debut = String(L.find((l) => l.type === 'debut')?.horodatage ?? new Date().toISOString());
  const out: string[] = [];
  out.push(`# Banc « zone visible » simulée (#1023) — résultats du ${debut.slice(0, 10)}`, '');
  out.push(
    'Généré par `npx playwright test --config tools/banc-bbox/playwright.config.ts` (voir README.md).',
    ''
  );
  out.push(
    `- Poste : ${cpus()[0]?.model ?? '?'} (${cpus().length} cœurs), ${Math.round(totalmem() / 2 ** 30)} Gio, ${type()} ${release()}, Node ${process.version}`,
    `- Début du passage : ${debut}`,
    '- Temps API = requête envoyée → corps JSON reçu (Node `fetch`), sans rendu. Octets = corps JSON décompressé.',
    '- Filtre : `lat__greater=S&lat__less=N&lon__greater=O&lon__less=E` (bornes incluses), ce que produirait ' +
      '`lat:gte:S, lat:lte:N, lon:gte:O, lon:lte:E` via l’adaptateur. Colonne texte « lat, lon » : latitude seule, comparaison textuelle.',
    ''
  );
  out.push('Rectangles :', '');
  for (const r of RECTS)
    out.push(`- **${r.cle}** — ${r.nom} : lat ${r.s} → ${r.n}, lon ${r.o} → ${r.e}`);
  out.push('', 'Jeux :', '');
  for (const j of JEUX) out.push(`- **${j.cle}** — ${j.nom} (\`${j.rid}\`)`);

  const rect = L.filter((l) => l.type === 'rectangle');
  if (rect.length) {
    out.push('', '## Rectangles (une page de 200)', '');
    out.push(
      '| Jeu | Rectangle | `columns=` | Temps (médiane) | Essais (ms) | `meta.total` | Octets | Statuts |'
    );
    out.push('|---|---|---|---:|---|---:|---:|---|');
    for (const x of rect) {
      out.push(
        `| ${String(x.jeu)} | ${String(x.rect)} | ${x.colonnes ? 'oui' : 'non'} | ${s(mediane(x.ms as number[]))} | ${ms(x.ms)} | ` +
          `${n(x.total)} | ${ko(mediane(x.octets as number[]))} | ${[...new Set(x.statut as number[])].join(',')} |`
      );
    }
  }

  const ex = L.filter((l) => l.type === 'exactitude');
  if (ex.length) {
    out.push('', '## Exactitude du filtre serveur', '');
    out.push(
      '`serveur` = `meta.total` de la requête filtrée. Les autres colonnes sont comptées sur le jeu ENTIER relu ' +
        'depuis son export Parquet : `exact` (numérique, les 4 bornes) ; `client 25 k` = ce que le filtre client ' +
        'd’aujourd’hui peut montrer (25 000 premières lignes, ordre du fichier) ; `bande lat` = latitude seule ; ' +
        '`texte` = comparaison textuelle de la chaîne « lat, lon » (ce que fait l’API sur une colonne string).',
      ''
    );
    out.push(
      '| Jeu | Rectangle | serveur | exact | client 25 k | bande lat | texte | lignes | sans coordonnées |'
    );
    out.push('|---|---|---:|---:|---:|---:|---:|---:|---:|');
    for (const x of ex) {
      for (const r of x.res as Record<string, unknown>[]) {
        const serveur = rect.find((y) => y.jeu === x.jeu && y.rect === r.rect)?.total;
        out.push(
          `| ${String(x.jeu)} | ${String(r.rect)} | ${n(serveur)} | ${n(r.exact)} | ${n(r.client25k)} | ${n(r.bandeLat)} | ` +
            `${r.texte === null ? '—' : n(r.texte)} | ${n(x.lignes)} | ${n(x.sansCoord)} |`
        );
      }
    }
  }

  const pan = L.filter((l) => l.type === 'pan');
  if (pan.length) {
    out.push(
      '',
      '## Séquence pan (IRVE, 10 rectangles « ville » glissant vers l’est, un geste toutes les 100 ms)',
      ''
    );
    out.push('« Dernière donnée » = du dernier geste à la réponse du dernier rectangle.', '');
    out.push(
      '| Stratégie | Requêtes envoyées | Annulées (client) | Dernière donnée (médiane) | Essais (ms) |'
    );
    out.push('|---|---:|---:|---:|---|');
    for (const st of [...new Set(pan.map((p) => String(p.strategie)))]) {
      const xs = pan.filter((p) => p.strategie === st);
      const d = xs.map((p) => Number(p.derniereDonnee));
      out.push(
        `| ${st} | ${xs.map((p) => p.envoyees).join(' · ')} | ${xs[0].annulees !== undefined ? xs.map((p) => p.annulees).join(' · ') : '—'} | ` +
          `${s(mediane(d))} | ${ms(d)} |`
      );
    }
    const a = pan.filter((p) => Array.isArray(p.serveurMs));
    if (a.length) {
      const tous = a.flatMap((p) => p.serveurMs as number[]);
      out.push(
        '',
        `Temps de chacune des 10 requêtes superposées (stratégie a, toutes répétitions) : médiane ${s(mediane(tous))}, ` +
          `max ${s(Math.max(...tous))} ; octets pour 10 requêtes : ${ko(mediane(a.map((p) => Number(p.octets))))}.`
      );
    }
  }

  const pr = L.filter((l) => l.type === 'premier');
  if (pr.length) {
    out.push('', '## Premier affichage (IRVE, pages séquentielles de 200 comme `fetchAll`)', '');
    out.push(
      '| Cas | Jusqu’à la dernière page (médiane) | Essais (ms) | Lignes | Requêtes | Octets |'
    );
    out.push('|---|---:|---|---:|---:|---:|');
    for (const x of pr) {
      out.push(
        `| ${String(x.cas)} | ${s(mediane(x.ms as number[]))} | ${ms(x.ms)} | ${n(x.lignes)} | ${n(x.requetes)} | ${ko(Number(x.octets))} |`
      );
    }
    out.push(
      '',
      'Le cas « sans filtre, plafond 25 000 » (125 pages) est mesuré par le banc Parquet (#1022, scénario B, IRVE, profil poste) : ' +
        'même requête, même projection.'
    );
  }
  out.push('');
  writeFileSync(`${DOSSIER}resultats-${debut.slice(0, 10)}.md`, out.join('\n'));
}
