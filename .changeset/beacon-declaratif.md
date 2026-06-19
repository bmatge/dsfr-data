---
'dsfr-data': minor
---

Nouvel element `<dsfr-data-beacon url="...">` (#345) : cible telemetrie **declarative**, pendant cote telemetrie de `proxy-url` (#340). Rend la collecte d'usage **visible et retirable** dans le HTML au lieu d'un `window.*` opaque — un integrateur voit qu'une telemetrie part et vers ou (et peut la retirer), un operateur souverain (ministère…) la pointe vers son propre collecteur sans toucher au JS de la page. La presence d'un element avec `url` non vide vaut **opt-in** ET fournit l'URL de collecte. Precedence : element `url` > `window.DSFR_DATA_BEACON_URL` > URL bakee au build ; `window.DSFR_DATA_BEACON = false` reste un **kill switch** qui neutralise meme un element present. L'element est invisible, n'emet aucun beacon lui-meme et vit dans le bundle **core** ; consulte en lookup paresseux (+ micro-defer) au moment de l'envoi, son ordre dans le DOM est indifferent. Off par defaut : sans element ni global, rien ne change.
