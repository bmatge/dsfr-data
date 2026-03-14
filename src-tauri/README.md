# src-tauri/

Code Rust et configuration de l'application desktop Tauri.

## Contenu

| Fichier/Dossier | Description |
|-----------------|-------------|
| `src/lib.rs` | Setup Tauri (zoom 80% au demarrage) |
| `src/main.rs` | Point d'entree de l'application |
| `tauri.conf.json` | Configuration de l'app (nom, fenetre, identifiants) |
| `Cargo.toml` | Dependances Rust |
| `icons/` | Icones de l'app (PNG, ICNS pour macOS, ICO pour Windows) |
| `capabilities/` | Configuration des permissions Tauri |
| `gen/` | Code genere par Tauri |

## Plateformes cibles

- **macOS** : DMG, APP (ARM + x86)
- **Windows** : NSIS, MSI
- **Linux** : deb, AppImage

## Commandes

```bash
npm run tauri:dev    # Dev avec hot-reload
npm run tauri:build  # Build production (build:all + build:app + tauri build)
```

## Notes

- Le zoom de 80% (`window.set_zoom(0.8)`) est applique dans `lib.rs` pour afficher plus de contenu sans modifier le CSS.
- Le frontend est servi depuis `app-dist/`.
