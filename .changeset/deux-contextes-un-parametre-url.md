---
'dsfr-data': patch
---

Deux contextes `url-sync` qui partagent un nom de champ ne le font plus en silence (#922)

Deux `dsfr-data-context url-sync` qui portent un filtre sur le **même champ**
écrivent le **même paramètre d'URL** : le dernier écrase les autres, et l'URL ne
garde qu'une valeur pour deux contextes. Rechargé, un comparateur de territoires
compare donc un territoire avec lui-même. Rien ne le disait — la détection de
conflit existante (#773) ne couvrait qu'une facette autonome face à un contexte.

La console le dit désormais, une fois par paramètre et par jeu de contextes :
elle nomme le paramètre, tous les contextes qui l'écrivent, et le geste qui sort
du piège — un seul contexte dans l'URL, ou `url-param-map` pour séparer les
paramètres.

**Aucun comportement ne change** : l'URL écrite et l'ordre d'application restent
exactement ceux d'avant, pour ne casser aucun lien déjà partagé.
