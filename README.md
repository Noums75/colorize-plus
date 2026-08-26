# Colorize for Lua & FiveM

The **Colorize** experience, kept under its original extension name and settings,
with Lua and FiveM added out of the box. Color literals are rendered directly
behind their source text. Existing Colorize workspace configuration remains
valid.

## Supported formats

- CSS: `#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA`, `rgb(a)`, `hsl(a)` and common names.
- Lua: hexadecimal integers such as `0xFF8800` and color-assigned tables such as
  `color = { 255, 136, 0, 200 }`.
- FiveM: caret formatting codes (`^1` … `^9`) and HUD formatting codes such as
  `~r~`, `~g~`, `~b~`, `~y~` and `~w~`.

Lua table matching deliberately requires a color-like variable name, so ordinary
coordinate tables are not incorrectly highlighted.

## Settings

```jsonc
{
  "colorize.languages": ["css", "sass", "scss", "less", "lua"],
  "colorize.files": ["**/*.js", "**/*.html", "**/*.lua"],
  "colorize.colorized_colors": ["BROWSERS_COLORS", "HEXA", "RGB", "HSL", "LUA", "FIVEM"],
  "colorize.enable_search_variables": false,
  "colorize.colorized_variables": ["CSS", "SASS", "LESS"],
  "colorize.hide_current_line_decorations": false,
  "colorize.lua.enableTables": true,
  "colorize.lua.enableFiveM": true
}
```

Run **Colorize: Reload decorations** from the command palette after changing a
file externally. Configuration and document edits refresh automatically.

## Development

```sh
npm test
npm run check
```

Press `F5` in VS Code to launch an Extension Development Host.
