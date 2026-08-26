'use strict';

const vscode = require('vscode');
const path = require('path');
const { parseColors } = require('./color-parser');

const decorations = new Map();
let timer;

function readableForeground(hex) {
  const value = hex.replace('#', '').slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 145 ? '#111111' : '#ffffff';
}

function decorationFor(color) {
  const key = color.toLowerCase();
  if (!decorations.has(key)) {
    decorations.set(key, vscode.window.createTextEditorDecorationType({
      backgroundColor: color,
      color: readableForeground(color),
      borderRadius: '2px',
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    }));
  }
  return decorations.get(key);
}

function isSupported(document, config) {
  const languages = config.get('languages', []);
  const extensions = config.get('files_extensions', []);
  const basename = document.fileName.replace(/\\/g, '/');
  const globMatch = config.get('files', []).some((glob) => {
    const suffix = glob.startsWith('**/*') ? glob.slice(4) : glob.startsWith('**/') ? glob.slice(3) : glob;
    return basename.endsWith(suffix.replace('*', ''));
  });
  return languages.includes(document.languageId) || extensions.includes(path.extname(document.fileName).toLowerCase()) || globMatch;
}

function update(editor = vscode.window.activeTextEditor) {
  if (!editor) return;
  const config = vscode.workspace.getConfiguration('colorize', editor.document.uri);
  for (const type of decorations.values()) editor.setDecorations(type, []);
  if (!isSupported(editor.document, config)) return;

  const hiddenLine = config.get('hide_current_line_decorations', false) ? editor.selection.active.line : -1;
  const grouped = new Map();
  for (const match of parseColors(editor.document.getText(), {
    syntaxes: config.get('colorized_colors'),
    luaTables: config.get('lua.enableTables'),
    fiveM: config.get('lua.enableFiveM'),
    variables: config.get('enable_search_variables'),
    variableFamilies: config.get('colorized_variables')
  })) {
    const range = new vscode.Range(editor.document.positionAt(match.start), editor.document.positionAt(match.end));
    if (range.start.line === hiddenLine) continue;
    const type = decorationFor(match.color);
    if (!grouped.has(type)) grouped.set(type, []);
    grouped.get(type).push(range);
  }
  for (const [type, ranges] of grouped) editor.setDecorations(type, ranges);
}

function schedule(editor) {
  clearTimeout(timer);
  timer = setTimeout(() => update(editor), 120);
}

function activate(context) {
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(update),
    vscode.window.onDidChangeTextEditorSelection((event) => schedule(event.textEditor)),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (vscode.window.activeTextEditor?.document === event.document) schedule(vscode.window.activeTextEditor);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('colorize')) update();
    }),
    vscode.commands.registerCommand('colorize.reload', () => update())
  );
  update();
}

function deactivate() {
  clearTimeout(timer);
  for (const type of decorations.values()) type.dispose();
  decorations.clear();
}

module.exports = { activate, deactivate };
