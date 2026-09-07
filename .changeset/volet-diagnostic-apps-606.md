---
'dsfr-data': patch
---

Volet Diagnostic dans les sept apps dotees d'un apercu (#606).

Le montage est le meme partout, seul le mode change selon la facon dont
chaque app rend :

- **live / iframe** — Playground, Builder, Studio, Dashboard ;
- **live / meme document** — Carto (`#map-canvas`) et Pipeline, qui
  instancient de vrais composants sans passer par une iframe ;
- **rapporte** — Assistant IA, dont l'apercu ne passe par aucun composant
  dsfr-data et n'emet donc rien sur le bus (#609).

« Envoyer a l'assistant » depose le diagnostic en `sessionStorage` et ouvre
l'Assistant IA, qui le pose dans son champ de chat — meme mecanisme de
passation que le code entre apps. Dans le Studio, qui porte deja un chat,
l'injection est directe.

Sources, Favoris et Suivi ne recoivent pas le volet : ils ne rendent aucun
pipeline dsfr-data.
