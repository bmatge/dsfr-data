---
'dsfr-data': patch
---

Shared app-side : contrats et nettoyages (#322). `isDbMode()` ne fige plus le « simple mode » quand le premier ping échoue (backend qui redémarre) — l'échec réseau laisse le mode indéterminé et re-sonde au prochain appel. `fetchWithTimeout` **compose** le signal de l'appelant (`AbortSignal.any`) au lieu de l'écraser (l'annulation amont était impossible). Versions CDN alignées (`dsfr-chart` 2.0.5) et **gardées par test** contre `package.json`. La couche persistance n'affiche plus d'UI : le dépassement de quota émet `dsfr-data:storage-quota` (le chrome app-ui le transforme en toast). `PaletteType` retrouve son `keyof` (l'annotation `Record<string, …>` le résolvait en `string` — `satisfies` à la place). Code mort supprimé : `setAuthBaseUrl` (exporté, jamais appelé), `migration.ts`, exports orphelins `validateAndFilterArray`/`getAllProviders`.
