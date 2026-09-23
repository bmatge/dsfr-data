---
'dsfr-data': patch
---

Assistant contextuel (ADR-143) : le volet s'ouvre désormais SOUS la barre d'actions sur ordinateur (`--app-action-bar-bas`, position mesurée et publiée par `app-action-bar`), si bien que « Exécuter » et les autres actions restent cliquables volet ouvert ; sur Sources, qui n'a pas de `app-action-bar`, `mountAssistant` publie la même variable depuis la rangée d'actions du bouton (« Nouvelle connexion » reste cliquable). Une languette « Assistant » collée au bord droit, à mi-hauteur, ouvre aussi le volet : masquée volet ouvert, elle porte la pastille des constats et reprend le focus à la réduction ; sur mobile, elle devient une pastille ronde en bas à droite, au-dessus de la barre d'actions fixe et du tiroir Diagnostic. À la réduction, le focus revient au déclencheur effectif (bouton de la barre, menu « Plus d'actions » s'il y est replié, ou languette).
