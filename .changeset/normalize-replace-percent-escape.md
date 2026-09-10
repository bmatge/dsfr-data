---
"dsfr-data": patch
---

`dsfr-data-normalize` : les attributs `replace` et `replace-fields` (et `rename`) acceptent l'échappement percent d'un `:` littéral (`%3A`, ainsi que `%7C`, `%2C`, `%25`), avec la même convention que `where` — `replace-fields="h:10%3A00:10h"` récrit désormais une heure (#676).
