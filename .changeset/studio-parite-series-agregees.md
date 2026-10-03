---
'dsfr-data': patch
---

Studio IA : trois défauts de parité avec l'ancien Assistant IA sont corrigés (#1081).

- **Multi-séries avec agrégation.** L'export d'un graphique à plusieurs mesures (`valueFields`, ou `valueField2` d'un « barres + ligne ») n'agrégeait que la première : `aggregate="population:sum"` face à `value-fields="pop2025"`. La requête agrégée ne rendant que les champs de groupe et les agrégats, la seconde série se traçait vide, sans erreur. Chaque mesure est désormais agrégée (`aggregate="population:sum, pop2025:sum"`) et le graphique désigne les colonnes agrégées, sous l'alias inline `pop2025__sum:pop2025` qui garde le nom du champ en légende. L'export d'un graphique à une seule mesure est inchangé.
- **Bloc de texte nettoyé.** Le contenu d'un bloc de texte écrit par l'assistant est nettoyé à l'écriture dans le document : scripts, gestionnaires `on*`, URL `javascript:`, iframes et autres éléments actifs sont retirés, le HTML simple (gras, italique, lien, liste, paragraphe) est gardé. Le nettoyage des gabarits (`nettoyerGabarit`) retire aussi `<meta>`, `<base>` et `<link>`.
- **Argument d'outil mal formé.** Un argument dont la forme n'est pas celle du schéma (`blocks: [null]`, `fields: "region"`, `layers: {…}`) n'interrompt plus le tour par une erreur : il est refusé, et le refus rendu au modèle nomme l'argument et la forme attendue.
