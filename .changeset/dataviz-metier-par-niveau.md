---
'dsfr-data': minor
---

Skills IA : la skill métier `dataviz-metier` s'adresse par niveau et par référence (#1035). `get_skill("datavizMetier", niveau: "base" | "intermediaire" | "avance")` sert l'index puis les références du niveau, `get_skill("datavizMetier", reference: "choisir-la-forme")` une seule référence ; sans niveau, l'intermédiaire est servi et la réponse l'annonce, avec la façon de demander base ou avancé. Le vocabulaire des sections reste fermé (`guide`, `reference`, `exemples`, `pieges`). `list_skills` annonce niveaux et références, `get_relevant_skills` ne rend plus que l'index de la skill au lieu de ses quelque 1 400 lignes. Même adressage dans le Studio IA et l'assistant (client skills partagé) et dans le serveur MCP ; `skills.json` gagne `index`, `levels` et `references` pour cette skill, de façon additive.
