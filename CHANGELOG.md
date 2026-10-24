# Changelog

## 2.1.0

- Display named Lua RGB/RGBA tables such as `{ r = 0, g = 170, b = 255, a = 150 }`, including palette entries, reordered channels and multiline values.
- Treat `#` as Lua's length operator in code, preventing false color highlights on `#definition`, `#def`, `#dead` and similar identifiers while preserving hexadecimal colors in strings and comments.
- Automatically install stable GitHub release updates after SHA-256 verification, with a manual **Colorize Plus: Check for updates** command and a User setting to disable automatic updates.
- Provide a standalone `install-colorize.cjs` download for quick installation and updates using Node.js and VS Code's command-line interface.
- Publish minor and patch releases as well as major releases, with downloadable checksums.
