---
'dsfr-data': patch
---

Assistant contextuel (ADR-143) : la surbrillance de « Me montrer » est rejouée quand l'app réécrit le panneau pendant la mise en évidence (panneaux de la carto re-rendus par `innerHTML` à la reprise de session ou à la fin de l'analyse des champs). Le focus ne suit qu'en mode « Guider », et seulement si l'usager ne l'a pas déplacé. Dans le builder, sans source enregistrée, le prérequis « source chargée » surligne l'état vide de la section Source (jeux d'exemple, lien vers l'app Sources) au lieu du sélecteur masqué, et annonce son chemin.
