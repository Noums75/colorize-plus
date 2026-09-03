# Colorize for Lua & FiveM

Colorize Plus keeps the original **Colorize** settings and behavior while adding first-class Lua and FiveM support. Existing Colorize workspaces can keep their familiar configuration, and the Lua/FiveM additions remain enabled independently.

## Restored Colorize features

- CSS color names (the complete browser color set), hexadecimal colors with `#` or `0x`, RGB/RGBA, HSL/HSLA, ARGB, OKLAB and OKLCH.
- Legacy `colorize.include` and `colorize.exclude` glob filtering, alongside the existing `colorize.files` and `colorize.files_extensions` compatibility settings.
- Decoration styles: `background`, `underline`, `outline`, `dot` and `square-dot`.
- Optional color marks in the overview ruler / scrollbar with `colorize.ruler_decoration`.
- CSS, Sass, Less and Stylus variable references.
- Optional workspace-wide variable discovery with `colorize.enable_search_variables`, so a variable declared in one matching file can colorize references in another.
- The active-line hiding behavior and Colorize status-bar indicator.

## Lua & FiveM additions

- Lua hexadecimal integers such as `0xFF8800`.
- Color-assigned Lua tables such as `color = { 255, 136, 0, 200 }`.
- FiveM caret formatting codes (`^1` … `^9`).
- FiveM HUD formatting codes such as `~r~`, `~g~`, `~b~`, `~y~` and `~w~`.

Lua table matching deliberately requires a color-like variable name, so ordinary coordinate tables are not incorrectly highlighted.

## Settings

```jsonc
{
  "colorize.languages": ["css", "sass", "scss", "less", "stylus", "lua"],
  "colorize.include": ["**/*.css", "**/*.scss", "**/*.sass", "**/*.less", "**/*.styl"],
  "colorize.exclude": ["**/node_modules", "**/dist", "**/tests"],
  "colorize.files": ["**/*.js", "**/*.html", "**/*.lua"],
  "colorize.colorized_colors": [
    "BROWSERS_COLORS", "HEXA", "RGB", "HSL", "OKLAB", "OKLCH", "LUA", "FIVEM"
  ],
  "colorize.colorized_variables": ["CSS", "SASS", "LESS", "STYLUS"],
  "colorize.enable_search_variables": false,
  "colorize.decoration_type": "background",
  "colorize.ruler_decoration": true,
  "colorize.hide_current_line_decorations": false,
  "colorize.lua.enableTables": true,
  "colorize.lua.enableFiveM": true
}
```

`ARGB` is available in `colorize.colorized_colors` but is not enabled by default because 4/8-digit hexadecimal values are ambiguous between RGBA and ARGB. Put `ARGB` before `HEXA` in the array when ARGB interpretation should win.

Workspace variable discovery is intentionally disabled by default in Colorize Plus to avoid an unnecessary startup scan. Turn on `colorize.enable_search_variables` when you need references to declarations from other files.

Run **Colorize: Reload decorations** from the command palette (or click the Colorize status-bar item) after changing files externally. Configuration and document edits refresh automatically.

## Development

```sh
npm install
npm test
npm run check
npm run build
```

Development and packaging require Node.js 22 or newer. GitHub Actions runs the tests and builds the VSIX on every push and pull request.

Press `F5` in VS Code to launch an Extension Development Host.
