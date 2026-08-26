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

test('parses FiveM caret and tilde formatting codes', () => {
  const colors = parseColors('print("^1Error^7: ~y~warning")');
  assert.deepEqual(colors.map((item) => item.color), ['#f44336', '#ffffff', '#ffeb3b']);
});

test('honours syntax and Lua feature switches', () => {
  assert.deepEqual(parseColors('^1 #fff', { syntaxes: ['HEXA'] }).map((item) => item.text), ['#fff']);
  assert.equal(parseColors('color = {1, 2, 3}', { luaTables: false }).length, 0);
});

test('converts HSL and validates RGBA channels', () => {
  assert.equal(hslToHex(0, 100, 50), '#ff0000');
  assert.equal(rgbaToHex(['256', '0', '0']), null);
});

test('supports the original BROWSERS_COLORS syntax name', () => {
  assert.equal(parseColors('red', { syntaxes: ['BROWSERS_COLORS'] })[0].color, '#ff0000');
});

test('colorizes references when original variable search is enabled', () => {
  const source = ':root { --brand: #123456; } a { color: var(--brand) }\n$accent: red; b { color: $accent }';
  const variables = parseColors(source, { variables: true }).filter((color) => color.syntax === 'VARIABLE');
  assert.deepEqual(variables.map((color) => [color.text, color.color]), [['var(--brand)', '#123456'], ['$accent', '#ff0000']]);
});
