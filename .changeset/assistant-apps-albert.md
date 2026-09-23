---
'dsfr-data': patch
---

Assistant contextuel dans toutes les apps d'édition (#1017, #1018). `brancherAlbert(assistant, options)` résout le transport au montage et ne branche Albert que s'il est utilisable (clé ou jeton serveur, et tool-calling) ; sinon l'assistant reste en guidage local, sous-titre « Guidage dans l'interface ». `mountAssistant` gagne `brancherModele()` (brancher ou débrancher le modèle après le montage, sous-titre et pied suivent) et l'option `montrerHorsRegistre`, pour les repères que l'app montre elle-même (lignes de code du Playground). Dans `app-action-bar`, « Plus d'actions » reprend la pastille `data-count` d'une action repliée (le bouton « Assistant » sur un écran large) et la dit dans son `aria-label`.
