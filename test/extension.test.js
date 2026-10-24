'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadWithVscode(filename, vscode, overrides = {}) {
  const module = { exports: {} };
  const fullPath = path.join(__dirname, '..', 'src', filename);
  vm.runInNewContext(fs.readFileSync(fullPath, 'utf8'), {
    module, exports: module.exports, console: { warn() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    require(name) {
      if (name === 'vscode') return vscode;
      if (name.startsWith('./')) return require(path.join(path.dirname(fullPath), name));
      return require(name);
    },
    ...overrides
  }, { filename: fullPath });
  return module.exports;
}

test('extension activation decorates the reported Lua table and ignores length expressions', async () => {
  const source = 'local MARKER = { color = { r = 0, g = 170, b = 255, a = 150 } }\nfor index = 1, #definition.Sections do\nprint(#dead)';
  const applied = new Map();
  const editor = {
    document: { languageId: 'lua', fileName: '/project/client.lua', uri: { scheme: 'file' },
      getText: () => source, positionAt: (offset) => ({ line: 0, character: offset }) },
    selections: [], setDecorations: (decoration, ranges) => applied.set(decoration, ranges)
  };
  const properties = require('../package.json').contributes.configuration.properties;
  const disposable = { dispose() {} };
  const vscode = {
    window: { activeTextEditor: editor, visibleTextEditors: [editor],
      createTextEditorDecorationType: (options) => ({ ...options, dispose() {} }),
      createStatusBarItem: () => ({ ...disposable, show() {} }),
      onDidChangeActiveTextEditor: () => disposable, onDidChangeTextEditorSelection: () => disposable },
    workspace: { getConfiguration: () => ({ get: (key, fallback) => properties[`colorize.${key}`]?.default ?? fallback }),
      onDidChangeTextDocument: () => disposable, onDidSaveTextDocument: () => disposable,
      onDidChangeConfiguration: () => disposable },
    commands: { registerCommand: () => disposable }, StatusBarAlignment: { Right: 1 },
    DecorationRangeBehavior: { ClosedClosed: 1 }, OverviewRulerLane: { Full: 1 },
    Range: class { constructor(start, end) { this.start = start; this.end = end; } }
  };
  const extension = loadWithVscode('extension.js', vscode, {
    require(name) {
      if (name === 'vscode') return vscode;
      if (name === './updates') return { registerUpdates() {} };
      return name.startsWith('./') ? require(`../src/${name.slice(2)}`) : require(name);
    }
  });
  await extension.activate({ subscriptions: [] });
  assert.equal(applied.size, 1);
  const [[decoration, ranges]] = applied;
  assert.equal(decoration.backgroundColor, '#00aaff96');
  assert.equal(ranges.length, 1);
  assert.equal(source.slice(ranges[0].start.character, ranges[0].end.character), '{ r = 0, g = 170, b = 255, a = 150 }');
  extension.deactivate();
});

