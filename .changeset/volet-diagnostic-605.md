---
'dsfr-data': minor
---

Volet **Diagnostic** (#605) et durcissement du bus de trace.

- `app-diagnostic-panel` : tiroir bas present a l'identique dans toutes les
  apps, monte d'abord sur le Playground. Rail informatif (`3 etapes ·
  100 -> 8 lignes · 1 alerte`), trois onglets Flux / Champs / Journal,
  « Copier le diagnostic ».
- `origin` est desormais renseigne par TOUS les emetteurs de commandes
  (search, facets, context, map-layer, pagination), plus seulement query.
- Une etape en echec invalide ses donnees : l'aval ne rapporte plus le compte
  du dernier succes, et un afficheur ne se declare plus alimente sous une
  source tombee.
- L'avertissement « agregation cote client » ne se declenche plus que si
  l'etape demande reellement un group-by ou une agregation.
- `Trace.order` porte l'ordre topologique : des ids numeriques inversaient la
  lecture de `states` (les cles entieres passent en premier en JavaScript).
- `StageNode.ambiguous` distingue l'id fabrique (le noeud n'emet pas) de l'id
  duplique (il emet, sous une cle partagee).
- JSDoc `@fires` mis a jour et skills regenerees : l'assistant connait
  desormais `attemptedUrl` et `origin`.
