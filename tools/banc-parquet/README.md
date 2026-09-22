# Banc Parquet (#1022)

Mesure, dans Chromium, la lecture d'un jeu data.gouv par son **export Parquet** (A, jeu entier)
contre l'API tabulaire paginée à 200 lignes, en séquentiel (B) ou 4 requêtes en vol (C), à
1 000 lignes (plafond #1020) et, pour B seul, à 25 000 lignes (plafond de l'adaptateur). Aucune dépendance du
dépôt : `hyparquet` et `fzstd` (les exports sont compressés en ZSTD) sont importés depuis
jsDelivr par `page/banc.js`. Rien n'est importé de `packages/`.

```bash
npx playwright test --config tools/banc-parquet/playwright.config.ts
```

- Sert `page/` sur **127.0.0.1:5190** (`python3 -m http.server`, démarré et arrêté par Playwright) :
  le serveur de dev (5173) n'est ni utilisé ni touché.
- Écrit `out/mesures.jsonl` (ignoré par git) puis `resultats-AAAA-MM-JJ.md` (tableau, typage,
  intégrité, fraîcheur).
- Variables : `BANC_REPETITIONS` (3), `BANC_PROFILS` (`poste,mobile`), `BANC_PAUSE_MS` (10000,
  avant chaque mesure à 1 000 lignes), `BANC_PAUSE_LONGUE_MS` (150000, avant chaque mesure à
  25 000 lignes), `BANC_REPRISE=1` (compléter `out/mesures.jsonl` au lieu de le vider, avec `-g`),
  `BANC_JEU_ENTIER=1` (IRVE entière par l'API, 1 100+ requêtes : **à éviter**, voir ci-dessous).
- Profil `mobile` : preset DevTools « Fast 3G » + CPU ×4, par le protocole DevTools.
- Durée : de l'ordre de 45 min (profil mobile et pauses).

**Blocage IP.** Le 2026-09-22, deux passages sans pause (≈ 250 requêtes en 15 s vers
`tabular-api`) ont fait refuser les connexions de ce poste par `tabular-api.data.gouv.fr` **et**
`www.data.gouv.fr` (`ECONNREFUSED`) pendant **58 minutes**, le S3 `hydra` restant joignable.
D'où les pauses, une seule mesure à 25 000 lignes par jeu et profil, pas de C à 25 000 lignes,
et aucun réessai : la spec s'arrête au premier échec.
