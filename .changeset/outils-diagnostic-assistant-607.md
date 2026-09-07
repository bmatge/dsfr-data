---
'dsfr-data': patch
---

Outils de diagnostic pour l'assistant du Studio (#607).

L'assistant peut desormais OBSERVER l'apercu, pas seulement le composer :
`run_and_trace` relance le rendu et rend le flux complet, `trace_pipeline`
le relit sans relancer, `inspect_stage` creuse une etape.

Il lit exactement le meme texte que l'utilisateur — `formatTrace()` est la
fonction pivot des deux cotes — et le meme reglage de masquage des valeurs
gouverne la copie, l'envoi et ce que recoit le modele.

Deux reglages qui comptent :

- budget de tours porte a 12 en mode diagnostic : une boucle de debogage fait
  au minimum observer -> hypothese -> correctif -> reobserver -> confirmer,
  et 8 coupait juste avant la verification ;
- `run_and_trace` est explicitement exclu de l'anti-boucle : verifier qu'un
  correctif a fonctionne, c'est relancer la MEME observation.

Le volet gagne une case « Masquer les valeurs », persistee : la trace part
vers un service externe, l'utilisateur decide ce qui sort du navigateur.
