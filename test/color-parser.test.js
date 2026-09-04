'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseColors, hslToHex, rgbaToHex } = require('../src/color-parser');

test('parses web colors without breaking legacy formats', () => {
  const colors = parseColors('background: #f00; color: rgba(0, 128, 255, .5); border: blue');
  assert.deepEqual(colors.map((item) => item.color), ['#f00', '#0080ff80', '#0000ff']);
});

test('parses Lua hex integers and named color tables', () => {
  const colors = parseColors('local primary = 0x12ABEF\nlocal color = { 255, 64, 0, 128 }');
  assert.deepEqual(colors.map((item) => [item.syntax, item.color]), [['LUA', '#12ABEF'], ['LUA', '#ff400080']]);
});

test('does not decorate arbitrary Lua coordinate tables', () => {
  assert.equal(parseColors('coords = { 255, 64, 0 }').length, 0);
});

test('colorizes keyed RGB tuples inside Lua color palette tables', () => {
  const source = `CategoryColors = {
    Staff = { 125, 0, 125 },
    Secours = { 155, 0, 0 },
    ["Forces de l'ordre"] = { 0, 0, 155 },
    ["Météo"] = { 56, 189, 248 },
    Heure = { 251, 146, 60 },
    Debug = { 250, 204, 21 },
  }`;
  const colors = parseColors(source, { syntaxes: ['LUA'] });
  assert.deepEqual(colors.map((item) => [item.text, item.color]), [
    ['{ 125, 0, 125 }', '#7d007d'],
    ['{ 155, 0, 0 }', '#9b0000'],
    ['{ 0, 0, 155 }', '#00009b'],
    ['{ 56, 189, 248 }', '#38bdf8'],
    ['{ 251, 146, 60 }', '#fb923c'],
    ['{ 250, 204, 21 }', '#facc15']
  ]);
});

test('parses FiveM caret and tilde formatting codes', () => {
  const colors = parseColors('print("^1Error^7: ~y~warning")');
  assert.deepEqual(colors.map((item) => item.color), ['#f44336', '#ffffff', '#ffeb3b']);
});

test('honours syntax and Lua feature switches', () => {
  assert.deepEqual(parseColors('^1 #fff', { syntaxes: ['HEXA'] }).map((item) => item.text), ['#fff']);
  assert.equal(parseColors('color = {1, 2, 3}', { luaTables: false }).length, 0);
  assert.equal(parseColors('CategoryColors = { Staff = { 125, 0, 125 } }', { syntaxes: ['LUA'], luaTables: false }).length, 0);
});

test('converts HSL and validates RGBA channels', () => {
  assert.equal(hslToHex(0, 100, 50), '#ff0000');
  assert.equal(rgbaToHex(['256', '0', '0']), null);
});

test('supports the original BROWSERS_COLORS syntax name', () => {
  assert.equal(parseColors('red', { syntaxes: ['BROWSERS_COLORS'] })[0].color, '#ff0000');
});

test('does not treat Lua length expressions or enum-like strings as colors', () => {
  const lengthExpression = parseColors('for index = 1, #definition.Sections do');
  assert.equal(lengthExpression.length, 0);

  const weatherOption = parseColors("{ Label = 'Neige', Value = 'SNOW', Icon = 'fa-solid fa-snowflake' }");
  assert.equal(weatherOption.length, 0);
});

test('still accepts quoted browser color names on color-like assignments', () => {
  const colors = parseColors("TextColor = 'SNOW'");
  assert.deepEqual(colors.map((item) => [item.text, item.color]), [['SNOW', '#fffafa']]);
});

test('colorizes references when original variable search is enabled', () => {
  const source = ':root { --brand: #123456; } a { color: var(--brand) }\n$accent: red; b { color: $accent }';
  const variables = parseColors(source, { variables: true }).filter((color) => color.syntax === 'VARIABLE');
  assert.deepEqual(variables.map((color) => [color.text, color.color]), [['var(--brand)', '#123456'], ['$accent', '#ff0000']]);
});

test('restores legacy formats and modern CSS syntax', () => {
  assert.equal(parseColors('0x0f08', { syntaxes: ['HEXA'] })[0].color, '#00ff0088');
  assert.equal(parseColors('#80ff0000', { syntaxes: ['ARGB'] })[0].color, '#ff000080');
  assert.equal(parseColors('rgb(100% 0% 0% / 50%)', { syntaxes: ['RGB'] })[0].color, '#ff000080');
  assert.equal(parseColors('hsl(0deg 100% 50% / 25%)', { syntaxes: ['HSL'] })[0].color, '#ff000040');
  assert.equal(parseColors('rebeccapurple', { syntaxes: ['BROWSERS_COLORS'] })[0].color, '#663399');
});

test('restores OKLAB and OKLCH support', () => {
  const lab = parseColors('oklab(62.8% 0.2249 0.1258)', { syntaxes: ['OKLAB'] })[0];
  const lch = parseColors('oklch(62.8% 0.2577 29.23)', { syntaxes: ['OKLCH'] })[0];
  assert.match(lab.color, /^#[0-9a-f]{6}$/);
  assert.match(lch.color, /^#[0-9a-f]{6}$/);
});

test('restores Stylus variables and external workspace variables', () => {
  const stylus = parseColors('brand = #123456\na\n  color brand', { variables: true, variableFamilies: ['STYLUS'] })
    .filter((item) => item.syntax === 'VARIABLE');
  assert.deepEqual(stylus.map((item) => [item.text, item.color]), [['brand', '#123456']]);

  const external = new Map([['CSS:--workspace-brand', { family: 'CSS', name: '--workspace-brand', color: '#abcdef' }]]);
  const workspace = parseColors('color: var(--workspace-brand)', { variables: true, variableFamilies: ['CSS'], variableDefinitions: external })
    .filter((item) => item.syntax === 'VARIABLE');
  assert.equal(workspace[0].color, '#abcdef');
});
