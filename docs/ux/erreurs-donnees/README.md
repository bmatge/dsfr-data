# Erreurs de données lisibles par l'usager (#1203)

Planches de l'epic #1203. La source vivante, éditable, est la planche Claude Design :
https://claude.ai/artifact/NGSARkasn29jQrDGiecpzH (privée, à partager depuis son menu Partager).

**Arbitrage du propriétaire (2026-10-02) : propositions 1 + 2** (`retenu-1-plus-2.png`).

- **Le bandeau** dit la panne une fois, par source, et porte le seul « Réessayer » (`role="status"`).
- **Chaque bloc** garde sa place et dit en clair que son chiffre manque : pas de rouge, pas de bouton
  répété, code HTTP replié dans « Détails techniques ».
- **Sans bandeau** (un seul bloc, ou intégrateur qui n'en veut pas) : le bloc porte lui-même « Réessayer ».

| Fichier | Contenu |
|---|---|
| `0-aujourdhui.png` | L'état actuel : un message technique rouge par bloc. |
| `1-message-par-bloc.png` | Proposition 1 : un message clair dans chaque bloc. |
| `2-bandeau-par-source.png` | Proposition 2 : un seul bandeau par source. |
| `3-dernieres-donnees.png` | Proposition 3 (non retenue pour l'instant) : les dernières données connues, datées. |
| `retenu-1-plus-2.png` | La combinaison retenue. |
| `bareme-messages.png` | Barème : un message par cause, pour l'usager et pour l'intégrateur. |

## Suite : forme compacte du KPI et lien vers la page des données (#1222)

Les deux éléments de la planche laissés de côté par #1219.

**Tuile de KPI.** Le gabarit commun doublait la hauteur d'une tuile. Un `dsfr-data-kpi` dont la
source échoue rend « — » à la place du chiffre, son libellé et une phrase courte :

| Cause | Phrase de la tuile |
|---|---|
| Service indisponible, réponse bloquée | Chiffre momentanément indisponible |
| Hors connexion | Vous semblez hors connexion |
| Service très sollicité (429) | Le service est très sollicité |
| Données introuvables (404, 410) | Ce chiffre n’est plus publié à cette adresse |
| Accès restreint (401, 403) | Ce chiffre n’est pas accessible publiquement |
| Page mal réglée (400, configuration) | Ce chiffre n’a pas pu être affiché |

- Avec un bandeau : ni bouton, ni lien, ni détail, ni `role` dans la tuile — la planche.
- Sans bandeau : « Réessayer » sur la ligne du tiret (44 px, quand un essai a un sens),
  « Détails » replié à la suite de la phrase.
- Seul le KPI prend cette forme. Graphique (jauge comprise), liste, podium, display et repeat gardent
  le gabarit complet : leur bloc a la hauteur d'un graphique.
- Écart à la planche : le libellé reste SOUS le tiret, à sa place habituelle dans le composant, et non
  au-dessus — une tuile en panne s'aligne ainsi sur ses voisines.

**Lien vers la source.** « La source », pour un usager, est la page du jeu sur le portail du
producteur. La bibliothèque ne la connaît pas et ne la déduit pas : sur Opendatasoft, la page
`/explore/dataset/<id>/` disparaît avec le jeu (mesuré : API 404, page 404) ; sur Tabular,
l'identifiant de ressource ne donne pas le jeu sans une requête de plus ; un `base-url` Grist ou un
`url` brut sont des adresses d'API. L'intégrateur la donne donc par `source-page` sur la source, et le
lien « Consulter la page de ces données » n'apparaît que sur des données introuvables.
