'use strict';

const NAMES = Object.freeze({
  aliceblue:'#f0f8ff', antiquewhite:'#faebd7', aqua:'#00ffff', aquamarine:'#7fffd4', azure:'#f0ffff',
  beige:'#f5f5dc', bisque:'#ffe4c4', black:'#000000', blanchedalmond:'#ffebcd', blue:'#0000ff', blueviolet:'#8a2be2', brown:'#a52a2a', burlywood:'#deb887',
  cadetblue:'#5f9ea0', chartreuse:'#7fff00', chocolate:'#d2691e', coral:'#ff7f50', cornflowerblue:'#6495ed', cornsilk:'#fff8dc', crimson:'#dc143c', cyan:'#00ffff',
  darkblue:'#00008b', darkcyan:'#008b8b', darkgoldenrod:'#b8860b', darkgray:'#a9a9a9', darkgrey:'#a9a9a9', darkgreen:'#006400', darkkhaki:'#bdb76b', darkmagenta:'#8b008b', darkolivegreen:'#556b2f', darkorange:'#ff8c00', darkorchid:'#9932cc', darkred:'#8b0000', darksalmon:'#e9967a', darkseagreen:'#8fbc8f', darkslateblue:'#483d8b', darkslategray:'#2f4f4f', darkslategrey:'#2f4f4f', darkturquoise:'#00ced1', darkviolet:'#9400d3',
  deeppink:'#ff1493', deepskyblue:'#00bfff', dimgray:'#696969', dimgrey:'#696969', dodgerblue:'#1e90ff',
  firebrick:'#b22222', floralwhite:'#fffaf0', forestgreen:'#228b22', fuchsia:'#ff00ff', gainsboro:'#dcdcdc', ghostwhite:'#f8f8ff', gold:'#ffd700', goldenrod:'#daa520', gray:'#808080', grey:'#808080', green:'#008000', greenyellow:'#adff2f',
  honeydew:'#f0fff0', hotpink:'#ff69b4', indianred:'#cd5c5c', indigo:'#4b0082', ivory:'#fffff0', khaki:'#f0e68c', lavender:'#e6e6fa', lavenderblush:'#fff0f5', lawngreen:'#7cfc00', lemonchiffon:'#fffacd', lightblue:'#add8e6', lightcoral:'#f08080', lightcyan:'#e0ffff', lightgoldenrodyellow:'#fafad2', lightgray:'#d3d3d3', lightgrey:'#d3d3d3', lightgreen:'#90ee90', lightpink:'#ffb6c1', lightsalmon:'#ffa07a', lightseagreen:'#20b2aa', lightskyblue:'#87cefa', lightslategray:'#778899', lightslategrey:'#778899', lightsteelblue:'#b0c4de', lightyellow:'#ffffe0',
  lime:'#00ff00', limegreen:'#32cd32', linen:'#faf0e6', magenta:'#ff00ff', maroon:'#800000', mediumaquamarine:'#66cdaa', mediumblue:'#0000cd', mediumorchid:'#ba55d3', mediumpurple:'#9370db', mediumseagreen:'#3cb371', mediumslateblue:'#7b68ee', mediumspringgreen:'#00fa9a', mediumturquoise:'#48d1cc', mediumvioletred:'#c71585', midnightblue:'#191970', mintcream:'#f5fffa', mistyrose:'#ffe4e1', moccasin:'#ffe4b5', navajowhite:'#ffdead', navy:'#000080', oldlace:'#fdf5e6', olive:'#808000', olivedrab:'#6b8e23', orange:'#ffa500', orangered:'#ff4500', orchid:'#da70d6', palegoldenrod:'#eee8aa', palegreen:'#98fb98', paleturquoise:'#afeeee', palevioletred:'#db7093', papayawhip:'#ffefd5', peachpuff:'#ffdab9', peru:'#cd853f', pink:'#ffc0cb', plum:'#dda0dd', powderblue:'#b0e0e6', purple:'#800080', rebeccapurple:'#663399', red:'#ff0000', rosybrown:'#bc8f8f', royalblue:'#4169e1', saddlebrown:'#8b4513', salmon:'#fa8072', sandybrown:'#f4a460', seagreen:'#2e8b57', seashell:'#fff5ee', sienna:'#a0522d', silver:'#c0c0c0', skyblue:'#87ceeb', slateblue:'#6a5acd', slategray:'#708090', slategrey:'#708090', snow:'#fffafa', springgreen:'#00ff7f', steelblue:'#4682b4', tan:'#d2b48c', teal:'#008080', thistle:'#d8bfd8', tomato:'#ff6347', turquoise:'#40e0d0', violet:'#ee82ee', wheat:'#f5deb3', white:'#ffffff', whitesmoke:'#f5f5f5', yellow:'#ffff00', yellowgreen:'#9acd32', transparent:'#00000000'
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
function alphaHex(alpha) { return alpha < 1 ? byteHex(alpha * 255) : ''; }

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
  return `#${byteHex(r * 255)}${byteHex(g * 255)}${byteHex(b * 255)}${alphaHex(clamp(Number(alpha), 0, 1))}`;
}

function rgbaToHex(parts) {
  const values = parts.map(Number);
  if (values.slice(0, 3).some((v) => !Number.isFinite(v) || v < 0 || v > 255)) return null;
  let alpha = values.length === 4 ? values[3] : 1;
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 255) return null;
  if (alpha > 1) alpha /= 255;
  return `#${byteHex(values[0])}${byteHex(values[1])}${byteHex(values[2])}${alphaHex(alpha)}`;
}

function normalizeHex(prefix, body, argb = false) {
  let value = body.toLowerCase();
  if (value.length === 3 || value.length === 4) value = value.split('').map((c) => c + c).join('');
  let rgb = value.slice(0, 6);
  let alpha = value.length === 8 ? value.slice(6, 8) : '';
  if (argb && value.length === 8) { alpha = value.slice(0, 2); rgb = value.slice(2); }
  if (argb && body.length === 4) { alpha = value.slice(0, 2); rgb = value.slice(2); }
  if (prefix === '#' && !argb) return `#${rgb}${alpha}`;
  return `#${rgb}${alpha}`;
}

function parseAlpha(value) {
  if (value === undefined || value === null || value === '') return 1;
  const raw = String(value).trim();
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  if (raw.endsWith('%')) return n >= 0 && n <= 100 ? n / 100 : null;
  return n >= 0 && n <= 1 ? n : null;
}

function parseRgbChannel(value) {
  const raw = String(value).trim();
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  if (raw.endsWith('%')) return n >= 0 && n <= 100 ? n * 2.55 : null;
  return n >= 0 && n <= 255 ? n : null;
}

function parseRgbFunction(raw) {
  const inner = raw.slice(raw.indexOf('(') + 1, -1).trim();
  let channels; let alpha;
  if (inner.includes(',')) {
    const parts = inner.split(',').map((v) => v.trim());
    if (parts.length !== 3 && parts.length !== 4) return null;
    channels = parts.slice(0, 3); alpha = parts[3];
  } else {
    const slash = inner.split('/');
    if (slash.length > 2) return null;
    channels = slash[0].trim().split(/\s+/); alpha = slash[1]?.trim();
    if (channels.length !== 3) return null;
  }
  const rgb = channels.map(parseRgbChannel); const a = parseAlpha(alpha);
  if (rgb.some((v) => v === null) || a === null) return null;
  return `#${byteHex(rgb[0])}${byteHex(rgb[1])}${byteHex(rgb[2])}${alphaHex(a)}`;
}

function parseHue(value) {
  const raw = String(value).trim().toLowerCase(); const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  if (raw.endsWith('turn')) return n * 360;
  if (raw.endsWith('rad')) return n * 180 / Math.PI;
  if (raw.endsWith('grad')) return n * 0.9;
  return n;
}

function parsePercentLike(value) {
  const raw = String(value).trim(); const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

function parseHslFunction(raw) {
  const inner = raw.slice(raw.indexOf('(') + 1, -1).trim();
  let parts; let alpha;
  if (inner.includes(',')) {
    const legacy = inner.split(',').map((v) => v.trim());
    if (legacy.length !== 3 && legacy.length !== 4) return null;
    parts = legacy.slice(0, 3); alpha = legacy[3];
  } else {
    const slash = inner.split('/');
    if (slash.length > 2) return null;
    parts = slash[0].trim().split(/\s+/); alpha = slash[1]?.trim();
    if (parts.length !== 3) return null;
  }
  const h = parseHue(parts[0]); const s = parsePercentLike(parts[1]); const l = parsePercentLike(parts[2]); const a = parseAlpha(alpha);
  if (h === null || s === null || l === null || a === null) return null;
  return hslToHex(h, s, l, a);
}

function srgbEncode(linear) {
  const c = linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
  return clamp(c, 0, 1) * 255;
}

function oklabToHex(L, a, b, alpha = 1) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const r = srgbEncode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = srgbEncode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const bl = srgbEncode(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return `#${byteHex(r)}${byteHex(g)}${byteHex(bl)}${alphaHex(alpha)}`;
}

function parseOklabNumber(raw, kind) {
  const value = String(raw).trim(); const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return null;
  if (kind === 'L') return value.endsWith('%') ? n / 100 : n;
  return value.endsWith('%') ? n * 0.004 : n;
}

function parseOklabFunction(raw, lch = false) {
  const inner = raw.slice(raw.indexOf('(') + 1, -1).trim(); const slash = inner.split('/');
  if (slash.length > 2) return null;
  const parts = slash[0].trim().split(/\s+/); if (parts.length !== 3) return null;
  const L = parseOklabNumber(parts[0], 'L'); const alpha = parseAlpha(slash[1]?.trim());
  if (L === null || alpha === null || L < 0 || L > 1) return null;
  if (!lch) {
    const a = parseOklabNumber(parts[1], 'axis'); const b = parseOklabNumber(parts[2], 'axis');
    if (a === null || b === null) return null;
    return oklabToHex(L, a, b, alpha);
  }
  const C = parseOklabNumber(parts[1], 'axis'); const h = parseHue(parts[2]);
  if (C === null || h === null || C < 0) return null;
  const radians = h * Math.PI / 180;
  return oklabToHex(L, C * Math.cos(radians), C * Math.sin(radians), alpha);
}

function pushMatches(results, text, regex, syntax, colorFromMatch, priority) {
  for (const match of text.matchAll(regex)) {
    const color = colorFromMatch(match);
    if (color) results.push({ start: match.index, end: match.index + match[0].length, color, syntax, text: match[0], priority });
  }
}
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function colorFromValue(value, syntaxes) { return parseColors(value, { syntaxes, variables: false, luaTables: false, fiveM: false })[0]?.color || null; }

function extractVariableDefinitions(text, options = {}) {
  const families = new Set(options.variableFamilies || ['CSS', 'SASS', 'LESS', 'STYLUS']);
  const syntaxes = options.syntaxes; const definitions = new Map();
  const add = (family, name, value, index) => { const color = colorFromValue(value, syntaxes); if (color) definitions.set(`${family}:${name}`, { family, name, color, index }); };
  if (families.has('CSS')) for (const m of text.matchAll(/(--[\w-]+)\s*:\s*([^;\n}]+)/g)) add('CSS', m[1], m[2], m.index);
  if (families.has('SASS')) for (const m of text.matchAll(/(\$[\w-]+)\s*:\s*([^;\n}]+)/g)) add('SASS', m[1], m[2], m.index);
  if (families.has('LESS')) for (const m of text.matchAll(/(@[\w-]+)\s*:\s*([^;\n}]+)/g)) add('LESS', m[1], m[2], m.index);
  if (families.has('STYLUS')) for (const m of text.matchAll(/^\s*([a-z_$-][\w$-]*)\s*=\s*([^\n;]+)/gim)) add('STYLUS', m[1], m[2], m.index);
  return definitions;
}

function mergeDefinitions(external, local) {
  const merged = new Map();
  if (external instanceof Map) for (const [key, value] of external) merged.set(key, typeof value === 'string' ? { color: value } : value);
  else if (external && typeof external === 'object') for (const [key, value] of Object.entries(external)) merged.set(key, typeof value === 'string' ? { color: value } : value);
  for (const [key, value] of local) merged.set(key, value);
  return merged;
}

function parseVariables(text, results, options) {
  const families = new Set(options.variableFamilies || ['CSS', 'SASS', 'LESS', 'STYLUS']);
  const definitions = mergeDefinitions(options.variableDefinitions, extractVariableDefinitions(text, options));
  for (const [key, definition] of definitions) {
    const split = key.indexOf(':'); const family = definition.family || key.slice(0, split); const name = definition.name || key.slice(split + 1);
    if (!families.has(family) || !definition.color || !name) continue;
    let regex;
    if (family === 'CSS') regex = new RegExp(`var\\(\\s*${escapeRegExp(name)}\\s*(?:,[^)]*)?\\)`, 'g');
    else if (family === 'SASS' || family === 'LESS') regex = new RegExp(`${escapeRegExp(name)}(?![\\w-])`, 'g');
    else regex = new RegExp(`(?<![\\w$-])${escapeRegExp(name)}(?![\\w$-])`, 'g');
    for (const match of text.matchAll(regex)) {
      const after = text.slice(match.index + match[0].length, match.index + match[0].length + 8);
      if ((family === 'SASS' || family === 'LESS') && /^\s*:/.test(after)) continue;
      if (family === 'STYLUS' && /^\s*=/.test(after)) continue;
      results.push({ start: match.index, end: match.index + match[0].length, color: definition.color, syntax: 'VARIABLE', text: match[0], name, priority: 1000 });
    }
  }
}

function parseColors(text, options = {}) {
  const requested = options.syntaxes || ['BROWSERS_COLORS', 'HEXA', 'RGB', 'HSL', 'OKLAB', 'OKLCH', 'LUA', 'FIVEM'];
  const enabled = new Set(requested); const results = []; const priority = new Map(requested.map((name, index) => [name, index]));
  const p = (name) => priority.has(name) ? priority.get(name) : 999;
  if (enabled.has('HEXA')) {
    pushMatches(results, text, /#[\da-f]{3,4}(?![\da-f])|#[\da-f]{6}(?:[\da-f]{2})?(?![\da-f])/gi, 'HEXA', (m) => m[0], p('HEXA'));
    if (!enabled.has('LUA')) pushMatches(results, text, /\b0x([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})\b/gi, 'HEXA', (m) => normalizeHex('0x', m[1]), p('HEXA'));
  }
  if (enabled.has('ARGB')) {
    pushMatches(results, text, /#[\da-f]{3,4}(?![\da-f])|#[\da-f]{6}(?:[\da-f]{2})?(?![\da-f])/gi, 'ARGB', (m) => normalizeHex('#', m[0].slice(1), true), p('ARGB'));
    if (!enabled.has('LUA')) pushMatches(results, text, /\b0x([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})\b/gi, 'ARGB', (m) => normalizeHex('0x', m[1], true), p('ARGB'));
  }
  if (enabled.has('RGB')) pushMatches(results, text, /rgba?\([^\n)]*\)/gi, 'RGB', (m) => parseRgbFunction(m[0]), p('RGB'));
  if (enabled.has('HSL')) pushMatches(results, text, /hsla?\([^\n)]*\)/gi, 'HSL', (m) => parseHslFunction(m[0]), p('HSL'));
  if (enabled.has('OKLAB')) pushMatches(results, text, /oklab\([^\n)]*\)/gi, 'OKLAB', (m) => parseOklabFunction(m[0], false), p('OKLAB'));
  if (enabled.has('OKLCH')) pushMatches(results, text, /oklch\([^\n)]*\)/gi, 'OKLCH', (m) => parseOklabFunction(m[0], true), p('OKLCH'));
  if (enabled.has('LUA')) {
    pushMatches(results, text, /\b0x([\da-f]{6}|[\da-f]{8})\b/gi, 'LUA', (m) => `#${m[1]}`, p('LUA'));
    if (options.luaTables !== false) pushMatches(results, text, /\b(?:colou?r|rgba?|markerColou?r|blipColou?r)\s*=\s*\{\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d{1,3}))?\s*\}/gi, 'LUA', (m) => rgbaToHex(m.slice(1).filter((v) => v !== undefined)), p('LUA'));
  }
  if (enabled.has('FIVEM') && options.fiveM !== false) {
    pushMatches(results, text, /\^(\d)/g, 'FIVEM', (m) => FIVEM_CARET[m[1]], p('FIVEM'));
    pushMatches(results, text, /~([rgbypocmuw])~/gi, 'FIVEM', (m) => FIVEM_TILDE[m[1].toLowerCase()], p('FIVEM'));
  }
  if (enabled.has('NAMES') || enabled.has('BROWSERS_COLORS')) {
    const names = Object.keys(NAMES).join('|'); const namePriority = Math.min(p('NAMES'), p('BROWSERS_COLORS'));
    pushMatches(results, text, new RegExp(`\\b(?:${names})\\b`, 'gi'), 'NAMES', (m) => NAMES[m[0].toLowerCase()], namePriority);
  }
  if (options.variables) parseVariables(text, results, { ...options, syntaxes: requested });
  return results.sort((a, b) => a.start - b.start || a.priority - b.priority || b.end - a.end)
    .filter((item, index, all) => !all.slice(0, index).some((kept) => item.start < kept.end && item.end > kept.start))
    .map(({ priority: _priority, ...item }) => item);
}

module.exports = { parseColors, extractVariableDefinitions, rgbaToHex, hslToHex, oklabToHex, FIVEM_CARET, FIVEM_TILDE, NAMES };
