/**
 * Banc Parquet (#1022) — globalTeardown : out/mesures.jsonl -> resultats-AAAA-MM-JJ.md.
 *
 * Mediane des repetitions pour chaque (profil, jeu, scenario). Aucune
 * estimation : une cellule sans mesure s'affiche « — ».
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, totalmem, release, type } from 'node:os';
import { DOSSIER, JEUX, MESURES, PLAFOND_ADAPTATEUR } from './commun';

type Ligne = Record<string, unknown> & { type: string };

const mediane = (xs: number[]): number => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const somme = (o: unknown, sauf: string[] = []): number =>
  Object.entries((o as Record<string, number>) || {})
    .filter(([k]) => !sauf.includes(k))
    .reduce((s, [, v]) => s + v, 0);
const s = (ms: number): string => (Number.isFinite(ms) ? (ms / 1000).toFixed(2) + ' s' : '—');
const ko = (o: number): string =>
  !Number.isFinite(o) ? '—' : o >= 1e6 ? (o / 1e6).toFixed(2) + ' Mo' : Math.round(o / 1e3) + ' Ko';
const n = (x: number): string => (Number.isFinite(x) ? x.toLocaleString('fr-FR') : '—');

const SCENARIOS = ['A', 'B1k', 'C1k', 'B25k'];
const LIBELLE: Record<string, string> = {
  A: 'A · Parquet, jeu entier (plages, 3 col.)',
  B1k: 'B · API 200/page, séquentiel, 1 000 l.',
  C1k: 'C · API 200/page, 4 en vol, 1 000 l.',
  B25k: 'B · API 200/page, séquentiel, 25 000 l. (1 mesure)',
  C: 'C · API 200/page, 4 en vol',
};

export default function rapport(): void {
  if (!existsSync(MESURES)) return;
  const lignes: Ligne[] = readFileSync(MESURES, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const mesures = lignes.filter((l) => l.type === 'mesure');
  const env = lignes.find((l) => l.type === 'env') as Record<string, unknown> | undefined;
  const date = new Date().toISOString().slice(0, 10);
  const out: string[] = [];

  out.push(`# Banc Parquet (#1022) — résultats du ${date}`, '');
  out.push(
    'Généré par `npx playwright test --config tools/banc-parquet/playwright.config.ts` ' +
      '(voir README.md). Médiane de ' +
      `${Math.max(0, ...mesures.map((m) => Number(m.rep)))} répétition(s), contexte de navigateur neuf à chaque fois.`,
    ''
  );
  out.push('## Environnement', '');
  out.push(
    `- Poste : ${cpus()[0]?.model ?? '?'} (${cpus().length} cœurs), ${Math.round(totalmem() / 2 ** 30)} Gio, ${type()} ${release()}`
  );
  if (env) {
    out.push(`- Navigateur : Chromium ${String(env.navigateur)} (headless, Playwright)`);
    out.push(
      `- Réseau (estimation Chromium \`navigator.connection\`) : ${JSON.stringify(env.connexion)}`
    );
    const lat = (env.latenceTabularMs as number[]) || [];
    out.push(
      `- Aller-retour \`data/?page_size=1\` depuis Node : ${lat.map((x) => Math.round(x) + ' ms').join(', ')}`
    );
    out.push(`- Début du passage : ${String(env.debut)}`);
  }
  out.push(
    '- Profil **mobile** : preset DevTools « Fast 3G » (562,5 ms de latence, 1,44 Mbit/s descendant) via ' +
      '`Network.emulateNetworkConditions` + CPU ×4 (`Emulation.setCPUThrottlingRate`).',
    ''
  );
  out.push('## Mesures', '');
  out.push(
    '- **TTFR** : du début du scénario à la première ligne exploitable (A : premier groupe de lignes ' +
      'décodé pour les 3 colonnes, résolution de l’URL Parquet par l’API data.gouv comprise ; B/C : première page reçue et parsée).',
    `- **Lignes** : A lit le jeu entier ; B et C s’arrêtent à 1 000 lignes (plafond #1020, 5 requêtes) ; B25k au plafond de l’adaptateur (${n(PLAFOND_ADAPTATEUR)} lignes, 125 requêtes, #286), mesuré une seule fois par jeu et profil (blocage IP, voir README). C à 25 000 lignes n’est pas mesuré.`,
    '- **Octets / requêtes** : reçus, en-têtes compris (`Network.loadingFinished.encodedDataLength`), hors page et hors module.',
    '- **Mémoire** : `performance.memory.usedJSHeapSize` ; *pic* échantillonné (20 ms + à chaque bloc), *retenue* = après `gc()`, lignes (objets) encore référencées.',
    '- **Module** (A seulement) : import de hyparquet + fzstd depuis jsDelivr, mesuré à part, non compté dans TTFR/total.',
    ''
  );

  for (const profil of ['poste', 'mobile']) {
    const duProfil = mesures.filter((m) => m.profil === profil);
    if (!duProfil.length) continue;
    out.push(`### Profil ${profil}`, '');
    out.push(
      '| Jeu | Scénario | TTFR | Total | Lignes | Octets | Requêtes | Pic mémoire | Mémoire retenue | Module |'
    );
    out.push('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|');
    for (const jeu of JEUX) {
      for (const sc of SCENARIOS) {
        const r = duProfil.filter((m) => m.jeu === jeu.cle && m.scenario === sc);
        if (!r.length) continue;
        const med = (f: (m: Ligne) => number) => mediane(r.map(f));
        const module =
          sc === 'A'
            ? `${s(med((m) => Number(m.importMs)))} / ${ko(med((m) => Number(m.importOctets)))}`
            : '';
        out.push(
          `| ${jeu.nom} | ${LIBELLE[sc]} | ${s(med((m) => Number(m.ttfr)))} | ${s(med((m) => Number(m.total)))} | ` +
            `${n(med((m) => Number(m.lignes)))} / ${n(med((m) => Number(m.totalServeur)))} | ` +
            `${ko(med((m) => somme(m.octets, ['cdn', 'local'])))} | ${n(med((m) => somme(m.requetes, ['cdn', 'local'])))} | ` +
            `${ko(med((m) => Number(m.picOctets)))} | ${ko(med((m) => Number(m.retenuOctets)))} | ${module} |`
        );
      }
    }
    out.push('');
    out.push('<details><summary>Valeurs brutes (ms) par répétition</summary>', '');
    out.push(
      '| Jeu | Scénario | TTFR | Total | dont résolution data.gouv (A) | Préflights | Anomalies HTTP / réessais |'
    );
    out.push('|---|---|---|---|---|---:|---|');
    for (const jeu of JEUX) {
      for (const sc of SCENARIOS) {
        const r = duProfil.filter((m) => m.jeu === jeu.cle && m.scenario === sc);
        if (!r.length) continue;
        out.push(
          `| ${jeu.cle} | ${sc} | ${r.map((m) => Math.round(Number(m.ttfr))).join(' · ')} | ` +
            `${r.map((m) => Math.round(Number(m.total))).join(' · ')} | ` +
            `${sc === 'A' ? r.map((m) => Math.round(Number(m.resolutionMs))).join(' · ') : ''} | ` +
            `${r.map((m) => m.preflights).join(' · ')} | ` +
            `${r.map((m) => JSON.stringify(m.anomalies || {}) + (m.echecs ? ` r${String(m.echecs)}` : '')).join(' · ')} |`
        );
      }
    }
    out.push('', '</details>', '');
  }

  const entier = lignes.filter((l) => l.type === 'jeu-entier');
  if (entier.length) {
    out.push('### Jeu entier par l’API (poste, une mesure)', '');
    out.push(
      '| Jeu | Scénario | TTFR | Total | Lignes | Octets | Requêtes | Pic mémoire | Mémoire retenue |'
    );
    out.push('|---|---|---:|---:|---:|---:|---:|---:|---:|');
    for (const m of entier) {
      out.push(
        `| ${String(m.jeu)} | ${LIBELLE[String(m.scenario)]} | ${s(Number(m.ttfr))} | ${s(Number(m.total))} | ` +
          `${n(Number(m.lignes))} | ${ko(somme(m.octets, ['cdn', 'local']))} | ${n(somme(m.requetes, ['cdn', 'local']))} | ` +
          `${ko(Number(m.picOctets))} | ${ko(Number(m.retenuOctets))} |`
      );
    }
    out.push('');
  }

  const typage = lignes.filter((l) => l.type === 'typage');
  if (typage.length) {
    out.push('## Typage Parquet vs `profile/`', '');
    out.push(
      'Colonnes non textuelles selon `profile/` (ou dont le type Parquet n’est pas une chaîne).',
      ''
    );
    out.push('| Jeu | Colonne | profile/ (format / python_type) | Parquet (physique / logique) |');
    out.push('|---|---|---|---|');
    for (const t of typage) {
      const sch = t.schema as {
        colonnes: { nom: string; physique: string; logique: string | null }[];
        codec: string;
        groupes: number[];
      };
      const prof = t.profile as Record<string, { format: string; python_type: string }>;
      for (const c of sch.colonnes) {
        const p = prof[c.nom];
        const texte = p && p.python_type === 'string' && c.physique === 'BYTE_ARRAY';
        if (texte) continue;
        out.push(
          `| ${String(t.jeu)} | \`${c.nom}\` | ${p ? `${p.format} / ${p.python_type}` : '—'} | ${c.physique} / ${c.logique ?? '—'} |`
        );
      }
    }
    out.push('');
    for (const t of typage) {
      const sch = t.schema as { codec: string; groupes: number[]; creePar: string };
      out.push(
        `- ${String(t.jeu)} : codec ${sch.codec}, ${sch.groupes.length} groupe(s) de lignes (${sch.groupes.map(n).join(', ')}), écrit par « ${sch.creePar} ».`
      );
    }
    out.push('');
  }

  const integ = lignes.filter((l) => l.type === 'integrite');
  if (integ.length) {
    out.push('## Intégrité : Parquet vs API tabulaire', '');
    out.push(
      '| Jeu | Colonne | Lignes Parquet | `meta.total` | Somme Parquet | `__sum` API | Écart |'
    );
    out.push('|---|---|---:|---:|---:|---:|---:|');
    for (const i of integ) {
      const p = i.parquet as { lignes: number; somme: number };
      const t = i.tabular as { total: number; somme: number };
      out.push(
        `| ${String(i.jeu)} | \`${String(i.colonne)}\` | ${n(p.lignes)} | ${n(t.total)} | ${n(p.somme)} | ${n(t.somme)} | ${(p.somme - t.somme).toPrecision(3)} |`
      );
    }
    out.push('');
  }

  const fr = lignes.filter((l) => l.type === 'fraicheur');
  if (fr.length) {
    out.push('## Fraîcheur de l’export Parquet', '');
    out.push(
      '`last_modified` est la date de la ressource (une moisson peut la bouger sans changer le contenu) ; ' +
        '`analysis:last-modified-at` est la date de contenu détectée par l’analyse. ' +
        'Délai = `analysis:parsing:finished_at` − date de contenu (à défaut `last_modified`). ' +
        'Un délai négatif signifierait un Parquet plus ancien que le contenu.',
      ''
    );
    out.push(
      '| Ressource | Titre | last_modified | contenu modifié | parsing fini | Délai | Taille fichier → Parquet |'
    );
    out.push('|---|---|---|---|---|---:|---:|');
    const delais: number[] = [];
    for (const f of fr) {
      const ref = String(f.contenuModifie ?? f.lastModified);
      const d = f.finishedAt ? (Date.parse(String(f.finishedAt)) - Date.parse(ref)) / 1000 : NaN;
      if (Number.isFinite(d) && f.parquet) delais.push(d);
      const delai = !Number.isFinite(d)
        ? '—'
        : Math.abs(d) < 3600
          ? `${Math.round(d)} s`
          : `${(d / 86400).toFixed(1)} j`;
      const taille = (x: unknown) => (x == null ? '—' : ko(Number(x)));
      out.push(
        `| \`${String(f.rid).slice(0, 8)}\` | ${String(f.titre).slice(0, 45)} | ${String(f.lastModified).slice(0, 16)} | ` +
          `${f.contenuModifie ? String(f.contenuModifie).slice(0, 16) : '—'} | ` +
          `${f.finishedAt ? String(f.finishedAt).slice(0, 16) : '—'} | ${delai} | ` +
          `${taille(f.fichierTaille)} → ${f.parquet ? taille(f.parquetTaille) : 'pas d’export'} |`
      );
    }
    out.push('');
    if (delais.length) {
      out.push(
        `Délai maximal (ressources avec export) : ${(Math.max(...delais) / 86400).toFixed(1)} j ; minimal : ${Math.round(Math.min(...delais))} s.`,
        ''
      );
    }
  }

  writeFileSync(`${DOSSIER}resultats-${date}.md`, out.join('\n'));
}
