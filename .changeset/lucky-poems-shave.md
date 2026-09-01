---
'dsfr-data': minor
---

Référence des composants générée depuis le code (#512)

Le package publie désormais un **custom-elements manifest** (`custom-elements.json`,
champ `customElements` du `package.json`) : les éditeurs qui le lisent (VS Code,
JetBrains) offrent l'autocomplétion et la documentation des attributs sur les balises
`dsfr-data-*` dans le HTML.

Le manifeste est produit par `@custom-elements-manifest/analyzer` à partir du JSDoc des
composants, complété pour l'occasion : les **264 attributs** des 23 composants ont
maintenant une description, les aliases dépréciés sont signalés comme tels, et les
événements (`@fires`), slots (`@slot`) et variables CSS (`@cssprop`) sont documentés.

Côté connaissance IA (builder-IA et serveur MCP), la section « référence » de chaque
skill de composant est générée depuis ce manifeste — donc exhaustive par construction —
au lieu d'être rédigée à la main. Les événements du pipeline sont déduits du mixin porté
par le composant, ce qui comble le manque principal : la connaissance ne décrivait aucun
événement, aucun slot et aucune variable CSS.

Aucun changement de comportement des composants.
