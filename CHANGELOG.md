# Changelog

## 2.2.0

- Check for updates on every VS Code launch after three seconds; remove the daily throttle that could skip startup checks.
- Add configurable hourly background checks and separate controls for startup checks and automatic installation.
- Show manual progress, an update log, and Install update / Sign in actions when needed.
- Retry transient errors with increasing delays and respect GitHub rate limits across restarts.
- Reuse GitHub sessions, retry after account changes, allow manual session renewal, and cancel requests on deactivation.
- Isolate temporary downloads between windows and queue manual checks instead of silently ignoring them during a background check.

## 2.1.6

- Set the project display name to Colorize Plus and the author to Noums.
- Use the project name consistently in the README, VS Code settings, commands and status bar.

## 2.1.5

- Include the latest transparent Colorize Plus icon uploaded to the repository.
- Convert desktop user-data storage addresses to filesystem URIs accepted by the VSIX installer in recent VS Code versions.
- Keep automatic update checks running while the reload notification remains open.
- Retry failed downloads or installations on the next scheduled check instead of marking them as a successful daily check.
- Display installation errors correctly even when VS Code returns a string.

## 2.1.4

- Add the Colorize Plus icon to the VS Code extension and display it at the top of the README.

## 2.1.3

- Match browser color names only as complete Unicode words, preventing false highlights such as `red` inside the French word `redémarrage` in Lua comments.
- Preserve standalone color names and cover accented letters, combining marks and non-Latin characters with regression tests.

## 2.1.2

- Download release assets through GitHub's API so private repositories work.
- Reuse VS Code's GitHub authentication for private release updates; the manual update command can request sign-in, while automatic checks never prompt.
- Let the standalone installer use an already authenticated GitHub CLI for private repositories, without extracting or storing credentials.

## 2.1.1

- Keep color decorations available in remote SSH, WSL and container documents when the updater runs in the local VS Code UI extension host.
- Verify Lua detection for `.lua` files even without a Lua language extension installed.

## 2.1.0

- Display named Lua RGB/RGBA tables such as `{ r = 0, g = 170, b = 255, a = 150 }`, including palette entries, reordered channels and multiline values.
- Treat `#` as Lua's length operator in code, preventing false color highlights on `#definition`, `#def`, `#dead` and similar identifiers while preserving hexadecimal colors in strings and comments.
- Automatically install stable GitHub release updates after SHA-256 verification, with a manual **Colorize Plus: Check for updates** command and a User setting to disable automatic updates.
- Provide a standalone `install-colorize.cjs` download for quick installation and updates using Node.js and VS Code's command-line interface.
- Publish minor and patch releases as well as major releases, with downloadable checksums.
