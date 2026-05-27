---
'dsfr-data': patch
---

docs(builder): ajouter URL de la doc des composants dans le commentaire d'en-tête du code généré (closes #209, T-8 du rapport d'audit UX 2026-05-26).

Toutes les 13 chaînes de templates HTML du `code-generator.ts` (variantes par type/mode : Graphique / Tableau / KPI / Nuage de points + embedded / dynamique) gagnent une seconde ligne de commentaire juste sous l'entête « généré avec dsfr-data Builder » :

```html
<!-- Graphique généré avec dsfr-data Builder -->
<!-- Doc des composants : ${PROXY_BASE_URL_EMBED}/specs/ -->
```

L'URL est dérivée de `PROXY_BASE_URL_EMBED` (déjà exporté depuis `@dsfr-data/shared`) au moment de la génération du code — pas hardcodée — pour rester self-hostable conformément à l'épic #168 et l'ADR-026 (« accès direct `import.meta.env`, pas de valeur en dur »). Sur le déploiement de référence : `https://chartsbuilder.matge.com/specs/`. Sur une instance self-hostée : l'URL du domaine embed configuré via `VITE_PROXY_URL_EMBED`.

Pour Sami (P2 data analyst) qui copie le code dans son site, c'est un point d'entrée immédiat vers la doc des attributs des composants dsfr-data utilisés. Avant, il devait chercher à la main.

Ferme l'EPIC #188 (l'autre sous-issue #208 — refactor mapping `<dsfr-data-chart>` — a été closed `not planned` lors du nettoyage backlog UX 2026-05-27).
