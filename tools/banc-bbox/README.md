# Banc « zone visible » simulée (#1023)

Mesure ce que coûterait un `serverGeo` simulé sur l'API tabulaire : quatre filtres
`lat__greater / lat__less / lon__greater / lon__less` (ce que l'adaptateur produit déjà depuis
`lat:gte:…, lat:lte:…, lon:gte:…, lon:lte:…`). Aucun import de `packages/`, aucune dépendance.

```bash
npx playwright test --config tools/banc-bbox/playwright.config.ts
```

Quatre blocs, consignés dans `out/mesures.jsonl` (ignoré par git) puis `resultats-AAAA-MM-JJ.md` :

1. **Rectangles** — 3 jeux × 3 rectangles × avec/sans `columns=`, 3 répétitions (Node `fetch`).
2. **Exactitude** — le jeu ENTIER est relu depuis son export Parquet (page `page/index.html`,
   hyparquet via jsDelivr, servie sur **127.0.0.1:5191**) pour compter exactement les points de
   chaque rectangle, et ce que verrait le filtre client sur les 25 000 premières lignes.
3. **Séquence pan** — 10 rectangles à 100 ms d'intervalle : sans anti-rebond, avec annulation
   client, avec l'anti-rebond de 300 ms par défaut.
4. **Premier affichage** — `limit` 1 000 sans filtre (#1020) vs `require-where` + bbox.

Variables : `BANC_REPETITIONS` (3), `BANC_PAUSE_MS` (20000). Les pauses évitent le blocage IP
constaté le 2026-09-22 (voir `tools/banc-parquet/README.md`). Durée : une dizaine de minutes.
Le serveur de dev (5173) n'est ni utilisé ni touché.
