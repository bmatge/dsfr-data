---
'dsfr-data': minor
---

Playground : nouvelle action « Ouvrir dans le Studio IA » (#1132). Le code du Playground part vers le Studio IA par la même passation que « Construire pour moi dans le Studio » : la source qu'il déclare (Opendatasoft, Tabular, Grist, INSEE, URL reconnue) est chargée d'office comme source du document, par le chemin de l'outil `charger_source_url` — une source qui exige une clé n'est pas transmise, et le Studio le dit. La consigne de reconstruction fidèle (blocs guidés quand ils couvrent le code, bloc « composant libre » sinon), le code et le diagnostic sont posés dans le champ du chat sans être envoyés : l'usager relit avant que rien ne parte vers le modèle. Le Studio offre « Retour au Playground », qui rend le code d'origine.
