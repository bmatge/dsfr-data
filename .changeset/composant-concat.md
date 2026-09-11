---
'dsfr-data': minor
---

feat(core) : `dsfr-data-concat`, empiler des sources de même schéma

Aucun composant ne savait mettre des lignes bout à bout : `dsfr-data-join` juxtapose des colonnes.
Empiler quatre séries de même schéma demandait quatre pivots, trois jointures et un dépliage, et le
banc d'essai en comptait 28 sur une seule page.

```html
<dsfr-data-concat id="ventes" sources="v2023, v2024, v2025"
  origin-field="millesime" origin-labels="v2023:2023 | v2024:2024 | v2025:2025">
</dsfr-data-concat>
<dsfr-data-chart source="ventes" type="line"
  label-field="mois" value-field="montant" series-field="millesime">
</dsfr-data-chart>
```

- `sources` : les ids à empiler, dans l'ordre, au moins deux. L'émission attend que toutes aient
  répondu.
- `origin-field` : une colonne qui dit de quelle source vient chaque ligne, l'id ou le libellé
  d'`origin-labels`. C'est le format long que `series-field` consomme directement.
- Des **schémas divergents** sont une erreur de configuration qui liste, par source, les colonnes
  en trop et en moins, et rien n'est émis. Jamais de tableau aux colonnes vides muettes.
- Aucune commande aval (page, filtre, tri) n'est relayée aux sources, faute de savoir à laquelle
  l'adresser : derrière un empilement, filtre et regroupement sont côté client. Le résultat est
  marqué tronqué au volet Diagnostic si une seule source l'est.

Le composant est dans les bundles complet et core, dans le volet Diagnostic, le lint de balisage et
une nouvelle fiche de skill.

Résout le constat AM-074 du banc d'essai (#777).
