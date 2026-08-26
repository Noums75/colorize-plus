'use strict';

const NAMES = Object.freeze({
  black: '#000000', silver: '#c0c0c0', gray: '#808080', white: '#ffffff',
  maroon: '#800000', red: '#ff0000', purple: '#800080', fuchsia: '#ff00ff',
  green: '#008000', lime: '#00ff00', olive: '#808000', yellow: '#ffff00',
  navy: '#000080', blue: '#0000ff', teal: '#008080', aqua: '#00ffff',
  orange: '#ffa500', transparent: '#00000000'
});

const FIVEM_CARET = Object.freeze({
  0: '#ffffff', 1: '#f44336', 2: '#4caf50', 3: '#ffeb3b', 4: '#42a5f5',
  5: '#03a9f4', 6: '#9c27b0', 7: '#ffffff', 8: '#ff9800', 9: '#9e9e9e'
});
const FIVEM_TILDE = Object.freeze({
  r: '#f44336', g: '#4caf50', b: '#42a5f5', y: '#ffeb3b', p: '#9c27b0',
  o: '#ff9800', c: '#9e9e9e', m: '#616161', u: '#000000', w: '#ffffff'
});

function clamp(value, min = 0, max = 255) { return Math.min(max, Math.max(min, value)); }
function byteHex(value) { return Math.round(clamp(value)).toString(16).padStart(2, '0'); }

function hslToHex(h, s, l, alpha = 1) {
  h = ((Number(h) % 360) + 360) % 360 / 360;
  s = clamp(Number(s), 0, 100) / 100;
  l = clamp(Number(l), 0, 100) / 100;
  const hue = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r = l, g = l, b = l;
  if (s) {
    const q = l < .5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue(p, q, h + 1 / 3); g = hue(p, q, h); b = hue(p, q, h - 1 / 3);
  }
  return `#${byteHex(r * 255)}${byteHex(g * 255)}${byteHex(b * 255)}${alpha < 1 ? byteHex(alpha * 255) : ''}`;
}

function rgbaToHex(parts) {
  const values = parts.map(Number);
  if (values.slice(0, 3).some((v) => !Number.isFinite(v) || v < 0 || v > 255)) return null;
  let alpha = values.length === 4 ? values[3] : 1;
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 255) return null;
  if (alpha > 1) alpha /= 255; // Lua/FiveM convention; CSS alpha remains supported.
  return `#${byteHex(values[0])}${byteHex(values[1])}${byteHex(values[2])}${alpha < 1 ? byteHex(alpha * 255) : ''}`;
}

function pushMatches(results, text, regex, syntax, colorFromMatch) {
  for (const match of text.matchAll(regex)) {
    const color = colorFromMatch(match);
    if (color) results.push({ start: match.index, end: match.index + match[0].length, color, syntax, text: match[0] });
  }
}

function parseVariables(text, results, enabled) {
  const definitions = new Map();
  const families = [
    ['CSS', /(--[\w-]+)\s*:\s*([^;\n}]+)/g, (name) => new RegExp(`var\\(\\s*${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*\\)`, 'g')],
    ['SASS', /(\$[\w-]+)\s*:\s*([^;\n}]+)/g, (name) => new RegExp(`\\${name}\\b`, 'g')],
    ['LESS', /(@[\w-]+)\s*:\s*([^;\n}]+)/g, (name) => new RegExp(`${name}\\b`, 'g')]
  ];
  for (const [family, regex, references] of families) {
    if (!enabled.has(family)) continue;
    for (const match of text.matchAll(regex)) {
      const color = parseColors(match[2], { variables: false }).at(0)?.color;
      if (color) definitions.set(match[1], { color, reference: references(match[1]), definitionStart: match.index });
    }
  }
  for (const [name, definition] of definitions) {
    for (const match of text.matchAll(definition.reference)) {
      if (match.index === definition.definitionStart) continue;
      results.push({ start: match.index, end: match.index + match[0].length, color: definition.color, syntax: 'VARIABLE', text: match[0], name });
    }
  }
}

function parseColors(text, options = {}) {
  const enabled = new Set(options.syntaxes || ['HEXA', 'RGB', 'HSL', 'NAMES', 'LUA', 'FIVEM']);
  const results = [];
  if (enabled.has('HEXA')) {
    pushMatches(results, text, /#[\da-f]{3,4}(?![\da-f])|#[\da-f]{6}(?:[\da-f]{2})?(?![\da-f])/gi, 'HEXA', (m) => m[0]);
  }
  if (enabled.has('RGB')) {
    pushMatches(results, text, /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+))?\s*\)/gi, 'RGB', (m) => rgbaToHex(m.slice(1).filter((v) => v !== undefined)));
  }
  if (enabled.has('HSL')) {
    pushMatches(results, text, /hsla?\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%(?:\s*,\s*(\d*\.?\d+))?\s*\)/gi, 'HSL', (m) => hslToHex(m[1], m[2], m[3], m[4] === undefined ? 1 : clamp(Number(m[4]), 0, 1)));
  }
  if (enabled.has('LUA')) {
    pushMatches(results, text, /\b0x([\da-f]{6}|[\da-f]{8})\b/gi, 'LUA', (m) => `#${m[1]}`);
    if (options.luaTables !== false) {
      pushMatches(results, text, /\b(?:colou?r|rgba?|markerColou?r|blipColou?r)\s*=\s*\{\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d{1,3}))?\s*\}/gi, 'LUA', (m) => rgbaToHex(m.slice(1).filter((v) => v !== undefined)));
    }
  }
  if (enabled.has('FIVEM') && options.fiveM !== false) {
    pushMatches(results, text, /\^(\d)/g, 'FIVEM', (m) => FIVEM_CARET[m[1]]);
    pushMatches(results, text, /~([rgbypocmuw])~/gi, 'FIVEM', (m) => FIVEM_TILDE[m[1].toLowerCase()]);
  }
  if (enabled.has('NAMES') || enabled.has('BROWSERS_COLORS')) {
    const names = Object.keys(NAMES).join('|');
    pushMatches(results, text, new RegExp(`\\b(?:${names})\\b`, 'gi'), 'NAMES', (m) => NAMES[m[0].toLowerCase()]);
  }
  if (options.variables) parseVariables(text, results, new Set(options.variableFamilies || ['CSS', 'SASS', 'LESS']));
  // Prefer the more explicit syntax if two recognizers cover the same bytes.
  return results.sort((a, b) => a.start - b.start || b.end - a.end)
    .filter((item, index, all) => !all.slice(0, index).some((kept) => item.start < kept.end && item.end > kept.start));
}

module.exports = { parseColors, rgbaToHex, hslToHex, FIVEM_CARET, FIVEM_TILDE };
