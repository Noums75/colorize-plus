'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseColors } = require('../src/color-parser');

test('the reported setBusy selector list does not highlight #add', () => {
  const source = `function setBusy(value) {
    busy=value;
    for(const node of all('[data-intent], #add, #logging, .remove-access, .row-action'))node.disabled=value || !state?.active;
    for(const id of ['#export','#review-simple','#submit-add','#submit-confirm'])$(id).disabled=value || !state;
    $('#refresh').disabled=value;
    $('#submit-confirm').textContent=value?'Application en cours…':(pending?.label || 'Appliquer');
    $('#submit-add').textContent=value?'Application en cours…':'Ajouter';
  }`;
  for (const languageId of [undefined, 'javascript', 'typescript', 'javascriptreact', 'typescriptreact', 'html']) {
    assert.deepEqual(parseColors(source, { languageId }), [], languageId);
  }
});

test('hex-looking IDs are selectors in DOM methods, query helpers and jQuery', () => {
  const source = `document.querySelector('#add');
    document.querySelectorAll('#face, #abcdef');
    element.matches('#deadbeef');
    element.closest('#ADD');
    all('#add'); qs('#face'); qsa('#abcdef');
    $('#add'); $$('#face');
    document.getElementById('#add');
    d3.select('#add'); d3.selectAll('#face');`;
  for (const syntaxes of [['HEXA'], ['ARGB'], ['HEXA', 'ARGB']]) {
    assert.deepEqual(parseColors(source, { languageId: 'javascript', syntaxes }), []);
  }
});

test('multiline calls, optional calls and TypeScript type arguments retain selector context', () => {
  const source = `document.querySelector /* target */ (
      /* selector */ '#add'
    );
    document?.querySelector?.('#face');
    document.querySelector<HTMLElement>('#abcdef');
    document.querySelector?.<HTMLElement>('#deadbeef');
    document['querySelector']('#add');`;
  assert.deepEqual(parseColors(source, { languageId: 'typescript', syntaxes: ['HEXA'] }), []);
});

test('template selector strings and escaped quotes do not produce colors', () => {
  const source = [
    'all(`[data-intent],\n #add, #face`);',
    'document.querySelector(`#${prefix} #add`);',
    'document.querySelector(String.raw`#add`);',
    'all(("#add"));',
    String.raw`document.querySelector("[data-label=\"quoted\"], #add");`
  ].join('\n');
  assert.deepEqual(parseColors(source, { languageId: 'javascript', syntaxes: ['HEXA'] }), []);
});

test('genuine JavaScript and CSS colors remain highlighted beside selectors', () => {
  const source = `const tint = '#add';
    document.querySelector('#add').style.color = '#add';
    $('#add', '#face').css('background', '#abcdef');
    install('#add');
    const css = '.button { color: #add; background: #abcd; }';`;
  const colors = parseColors(source, { languageId: 'javascript', syntaxes: ['HEXA'] });
  assert.deepEqual(colors.map(({ text }) => text), ['#add', '#add', '#abcdef', '#add', '#add', '#abcd']);
  for (const color of colors) assert.equal(source.slice(color.start, color.end), color.text);
});

test('jQuery HTML creation and ready callbacks retain real color values', () => {
  const source = `const node = $('<div style="color: #add">');
    $('<div>', { color: '#abcd' });
    $(function () { const tint = '#abcdef'; });
    $(document).ready(() => { document.body.style.color = '#face'; });`;
  assert.deepEqual(parseColors(source, { languageId: 'javascript', syntaxes: ['HEXA'] }).map(({ text }) => text),
    ['#add', '#abcd', '#abcdef', '#face']);
});

test('the same hex value remains a valid color outside selector calls and in Lua strings', () => {
  assert.equal(parseColors('color: #add', { languageId: 'css', syntaxes: ['HEXA'] })[0].color, '#add');
  assert.equal(parseColors("local color = '#add'", { languageId: 'lua', syntaxes: ['HEXA'] })[0].color, '#add');
});

test('CSS and preprocessor color functions are not mistaken for JavaScript query helpers', () => {
  for (const languageId of ['css', 'scss', 'sass', 'less', 'stylus', 'postcss', 'sss']) {
    assert.deepEqual(parseColors('color: all("#add");', { languageId, syntaxes: ['HEXA'] }).map(({ text }) => text), ['#add']);
  }
});

test('stylesheet variable references still inherit colors from custom color functions', () => {
  const source = '$brand: all("#add"); .button { color: $brand; }';
  const colors = parseColors(source, { languageId: 'scss', syntaxes: ['HEXA'], variables: true, variableFamilies: ['SASS'] });
  assert.deepEqual(colors.filter(({ syntax }) => syntax === 'VARIABLE').map(({ text, color }) => [text, color]), [['$brand', '#add']]);
});
