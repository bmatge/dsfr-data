---
'dsfr-data': patch
---

fix(ui): restaurer les accents français manquants sur ~1200 chaînes UI (closes #192, audit UX 2026-05-26 §T-1).

Avant : labels, hints, tooltips, validations, messages d'erreur écrits sans accents partout (« donnees », « categorie », « agreger », « Genere », « Apercu », « Telechargement », « Cle », « ecran », « previsualiser », …). Pour un produit qui se présente conforme DSFR / République Française, ça donnait une impression d'amateurisme contradictoire avec le ton institutionnel attendu.

Après : 1217 remplacements sur 103 fichiers d'`apps/` + `packages/` (`.ts`, `.html`, `.css`, `.md`), via une passe scriptée appliquant 80+ patterns (mots français sans ambiguïté avec l'anglais ou les identifiants). Les tests qui hardcodaient les anciennes chaînes ont été mis à jour en parallèle (102 remplacements sur 30 fichiers de `tests/`).

**Hors scope** (volontairement) :
- Les mots ambigus avec l'anglais (`selection`/`generation`/`definition`/`present`/`detail`) restent non touchés — chaque occurrence demande un jugement contextuel (les commentaires de code en anglais ne doivent pas être accentués).
- `series`/`Series` exclu pour la même raison + collision avec les identifiants HTML (`extra-series-container`).
- Les accents grammaticaux ponctuels (`a` → `à`, `ou` → `où`, `la` → `là`) — dépendent de la position dans la phrase.

**Garde-fou anti-régression** : nouveau script [`scripts/check-french-accents.sh`](scripts/check-french-accents.sh) exécuté par `npm run check:accents` et câblé dans le job CI principal (`.github/workflows/ci.yml`, juste après `check:sri`). Liste blanche de 80+ patterns qui, s'ils réapparaissent en source UI, font échouer la CI avec un message actionnable. Tests `/tests/` exclus du check (chaînes mock).
