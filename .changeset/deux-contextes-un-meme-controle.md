---
'dsfr-data': patch
---

Deux contextes sur un même contrôle : la dépendance à l'ordre de déclaration se dit (#923)

Un `dsfr-data-context-filter` lit la valeur de son contrôle **à son montage**, et
le pré-remplissage depuis l'URL (ou depuis `default`) écrit `el.value` **sans
émettre d'événement**. Quand deux contextes écoutent le même `<select>`, le filtre
du contexte déclaré avant le contexte `url-sync` reste donc sur la valeur
initiale : deux pages identiques à l'ordre près répondent deux choses différentes
sur la même URL, avec le même affichage. C'est un chiffre faux, pas un inconfort.

La console le dit désormais, une fois par situation : elle nomme le contrôle, le
filtre qui vient d'être pré-rempli, celui qui a lu trop tôt et son contexte, puis
le geste qui sort du piège — déclarer le contexte `url-sync` **en premier** dans
le document. Le message ne sort que si le pré-remplissage a réellement changé la
valeur du contrôle : deux filtres qui lisent la même valeur ne se contredisent pas.

**Aucun comportement ne change** : émettre un `change` au pré-remplissage
corrigerait le fond mais changerait l'ordre d'application de toutes les pages qui
marchent. La dépendance est aussi documentée dans la fiche `url-sync`.
