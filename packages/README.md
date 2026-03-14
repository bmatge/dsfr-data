# packages/

Packages npm partages entre les applications du monorepo.

## Packages

### shared/ (`@dsfr-data/shared`)

Bibliotheque d'utilitaires communs importee par toutes les apps.

**Modules principaux :**

| Module | Exports |
|--------|---------|
| `utils/` | `escapeHtml()`, `toNumber()`, `looksLikeNumber()`, `isValidDeptCode()` |
| `constants/` | `DSFR_COLORS`, `PALETTE_COLORS` |
| `api/` | `getProxyConfig()`, `getProxiedUrl()` |
| `storage/` | `loadFromStorage()`, `saveToStorage()`, `STORAGE_KEYS` |
| `ui/` | `openModal()`, `closeModal()`, `toastWarning()`, `toastSuccess()` |
| `providers/` | `detectProvider()`, utilitaires de configuration des sources API |
| `templates/` | Templates de generation de code |
| `types/` | Interfaces TypeScript partagees |

**Build :**

```bash
npm run build:shared
```
