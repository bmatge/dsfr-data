---
'dsfr-data': patch
---

Volet Diagnostic : `mountDiagnosticPanel` accepte `envoi: 'demander'`, qui affiche « Demander à l'assistant » (#1016). Ce bouton ouvre l'assistant contextuel de l'app sans la quitter et reste actif sans trace. Le défaut reste « Envoyer à l'assistant ». La nouvelle option `onConstats` reçoit chaque évaluation des constats, ce qui rafraîchit la pastille de l'assistant. `appHref` connaît aussi le Studio (`'studio'`). Le Studio pose un diagnostic transmis par « Construire pour moi » dans son champ, sans l'envoyer. Il accepte aussi une couche geoshape sans `geoField` : la bibliothèque détecte alors la colonne géométrique (#1060).
