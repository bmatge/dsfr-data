---
'dsfr-data': patch
---

fix(chart) : un code de département sur trois caractères ne vide plus la carte

`normalizeDeptCode` savait **ajouter** un zéro de tête (`1` → `01`), jamais en **retirer** un. Un
jeu qui publie ses départements sur trois caractères (`059`) ou son outre-mer sur quatre (`0971`)
voyait chaque ligne comptée puis jetée : la carte se vidait. Le zéro de tête en trop est désormais
retiré, `059` désigne le Nord, `02A` la Corse-du-Sud, `0971` la Guadeloupe.

Le zéro n'est retiré que si le reste est un code valide : `000` ou `096` restent invalides et
continuent d'être comptés dans les lignes ignorées, plutôt que de devenir un autre code faux. Les
formes déjà valides sont inchangées. La même règle s'applique au code généré par le Builder et le
Builder IA.

Résout le constat BUG-014 du banc d'essai (#766).
