---
'dsfr-data': patch
---

Studio IA et assistants : le modèle Albert par défaut passe de `openweight-large` (gpt-oss-120b) à `openweight-medium` (Mistral-Small-24B), dont la limite de jetons est plus haute et qui raisonne moins avant de répondre ; tool calling et structured outputs vérifiés sur le gateway. Le même défaut vaut pour le proxy serveur (`IA_DEFAULT_MODEL` absent) ; un modèle choisi dans le formulaire ou posé dans le `.env` reste respecté.
