---
'dsfr-data': patch
---

`dsfr-data-chart` — cadre officiel (`databox`) : le contenu de la fenêtre n'exécute plus de code, un `databox-actions` mal formé ne fait plus disparaître le cadre, les attributs sans effet et l'absence du JavaScript du DSFR sont signalés (#1289).

**Contenu nettoyé avant d'être relayé à DSFR Chart.** DSFR Chart pose deux attributs dans la page par `innerHTML` : `databox-modal-content` (la fenêtre du cadre, rendue dès l'affichage — un `<img onerror>` écrit dans l'attribut s'exécutait sans aucun clic) et `unit-tooltip` / `unit-tooltip-bar` (l'infobulle du graphique, au survol). Les deux passent désormais par le nettoyeur de la bibliothèque. Tous les autres attributs étaient et restent rendus comme du texte.

Ce qui est **gardé**, à l'identique : paragraphes, gras, italique, liens `http(s)`, `mailto:` et relatifs, listes, tableaux, images, `<sup>` / `<sub>` (une unité `m<sup>2</sup>` garde son exposant), classes et attributs ordinaires. Une page existante qui met un lien ou du gras dans la fenêtre ne change pas.

Ce qui **disparaît** de ces deux attributs, et de eux seuls :

- les éléments `script`, `iframe`, `object`, `embed`, `style`, `template`, `meta`, `base`, `link` ;
- les éléments `textarea`, `title`, `xmp`, `noscript`, `noembed`, `noframes`, `plaintext`, avec leur contenu ;
- les animations SVG `animate` et `set` ;
- tout attribut `on*` (`onclick`, `onerror`…) ;
- les URL `javascript:`, `vbscript:` et `data:` dans `href`, `src`, `xlink:href`, `action`, `formaction` — une image intégrée en `data:` perd donc sa source ;
- les commentaires HTML.

Un retrait est signalé une fois dans la console, avec l'attribut en cause. Le nettoyage retire ce qui s'exécute, pas ce qui trompe (un formulaire, un lien restent) : une valeur lue dans les données s'échappe avant d'être écrite dans ces attributs.

**Nettoyeur durci.** `nettoyerGabarit`, déjà appliqué aux blocs du Studio IA, laissait passer des charges qu'un navigateur exécutait : élément à texte brut (`<textarea>`, `<title>`, `<noscript>`…) dont la fermeture est cachée dans un attribut, nom d'attribut commençant par `=`, référence numérique sans point-virgule (`&#106avascript:`), animation SVG d'un `href`, morceaux qui se recollent après un retrait (`<<script></script>img onerror=…>`). Ces cas sont fermés ; le Studio IA en bénéficie aussi.

**`databox-actions` validé.** Un JSON invalide, autre chose qu'un tableau, ou un tableau portant un nombre ou `null` faisait disparaître tout le cadre, sans message. C'est maintenant une erreur de configuration lisible (`data-dsfr-config-error`, console) : les entrées fautives sont écartées, les autres gardées, le cadre reste affiché. La documentation dit qu'une action n'a aucun comportement par elle-même et comment la page la branche (`data-action`).

**Attributs sans effet signalés**, par un avertissement console unique qui nomme l'attribut et ce qui manque : `databox-default-source` (une seule source déclarée, aucun sélecteur), `databox-fullscreen` sans `databox-modal-title`, `databox-modal-title` sans `databox-fullscreen`, `databox-modal-content` sans titre. Aucun attribut n'est retiré.

**JavaScript du DSFR absent.** Le menu « Plus d'actions » (téléchargement CSV, capture), l'infobulle et la fenêtre du cadre ne s'ouvrent qu'avec `dsfr.module.min.js`. Quand le cadre en porte un et que le script n'est pas chargé, un avertissement console unique le dit, après le chargement de la page (un script chargé en différé ne déclenche pas de faux positif).
