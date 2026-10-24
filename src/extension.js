'use strict';

const vscode = require('vscode');
const path = require('path');
const { parseColors, extractVariableDefinitions } = require('./color-parser');
const { registerUpdates } = require('./updates');

const decorations = new Map();
const timers = new Map();
let workspaceTimer;
let workspaceVariables = new Map();
let statusBar;

function readableForeground(hex) {
  const value = hex.replace('#', '').slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 145 ? '#111111' : '#ffffff';
}

function decorationOptions(color, decorationType, rulerDecoration) {
  const options = {
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
  };
  if (rulerDecoration) {
    options.overviewRulerColor = color;
    options.overviewRulerLane = vscode.OverviewRulerLane.Full;
  }
  switch (decorationType) {
    case 'underline':
      return { ...options, borderWidth: '0 0 2px 0', borderStyle: 'solid', borderColor: color };
    case 'outline':
      return { ...options, borderWidth: '1px', borderStyle: 'solid', borderColor: color };
    case 'dot':
      return { ...options, after: { margin: '0 0 0 5px', contentText: '⬤', color } };
    case 'square-dot': {
      const fontSize = vscode.workspace.getConfiguration('editor').get('fontSize', 14);
      return { ...options, after: { height: `${fontSize}px`, width: `${fontSize}px`, margin: '0 0 0 5px', backgroundColor: color, contentText: '' } };
    }
    case 'background':
    default:
      return {
        ...options,
        backgroundColor: color,
        color: readableForeground(color),
        borderColor: color,
        borderStyle: 'solid',
        borderWidth: '1px',
        borderRadius: '2px'
      };
  }
}

function decorationFor(color, config) {
  const decorationType = config.get('decoration_type', 'background');
  const rulerDecoration = config.get('ruler_decoration', true);
  const key = `${decorationType}|${rulerDecoration ? 1 : 0}|${color.toLowerCase()}`;
  if (!decorations.has(key)) {
    decorations.set(key, vscode.window.createTextEditorDecorationType(decorationOptions(color, decorationType, rulerDecoration)));
  }
  return decorations.get(key);
}

function resetDecorationTypes() {
  for (const type of decorations.values()) type.dispose();
  decorations.clear();
}

function normalizePath(value) { return value.replace(/\\/g, '/'); }
function regexEscape(char) { return /[\\^$.*+?()[\]{}|]/.test(char) ? `\\${char}` : char; }

function globToRegExp(glob) {
  const source = normalizePath(glob);
  let out = '^';
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '*') {
      if (source[i + 1] === '*') {
        i += 1;
        if (source[i + 1] === '/') {
          i += 1;
          out += '(?:.*/)?';
        } else out += '.*';
      } else out += '[^/]*';
    } else if (char === '?') out += '[^/]';
    else if (char === '{') {
      const end = source.indexOf('}', i + 1);
      if (end !== -1) {
        const values = source.slice(i + 1, end).split(',').map((value) => value.split('').map(regexEscape).join(''));
        out += `(?:${values.join('|')})`;
        i = end;
      } else out += '\\{';
    } else out += regexEscape(char);
  }
  return new RegExp(`${out}$`);
}

function candidatePaths(fileName) {
  const absolute = normalizePath(fileName);
  let relative = absolute;
  try { relative = normalizePath(vscode.workspace.asRelativePath(fileName, false)); } catch { /* no workspace */ }
  return Array.from(new Set([absolute, relative, relative.replace(/^\.\//, '')]));
}

function matchesGlob(fileName, pattern) {
  if (!pattern || typeof pattern !== 'string') return false;
  let regex;
  try { regex = globToRegExp(pattern); } catch { return false; }
  for (const candidate of candidatePaths(fileName)) {
    if (regex.test(candidate)) return true;
    const segments = candidate.split('/');
    for (let i = segments.length - 1; i > 0; i -= 1) {
      if (regex.test(segments.slice(0, i).join('/'))) return true;
    }
  }
  return false;
}

function isExcluded(fileName, config) {
  return config.get('exclude', []).some((pattern) => matchesGlob(fileName, pattern));
}

function isSupported(document, config) {
  if (!['file', 'vscode-remote'].includes(document.uri.scheme) || isExcluded(document.fileName, config)) return false;
  const languages = config.get('languages', []);
  const extensions = config.get('files_extensions', []);
  const include = config.get('include', []);
  const files = config.get('files', []);
  const ext = path.extname(document.fileName).toLowerCase();
  return languages.includes(document.languageId)
    || extensions.map((value) => value.toLowerCase()).includes(ext)
    || include.some((glob) => matchesGlob(document.fileName, glob))
    || files.some((glob) => matchesGlob(document.fileName, glob));
}

function inferExtensionPatterns(languages) {
  const found = new Set();
  for (const extension of vscode.extensions.all) {
    for (const language of extension.packageJSON?.contributes?.languages || []) {
      if (!languages.includes(language.id)) continue;
      for (const ext of language.extensions || []) found.add(`**/*${ext}`);
      for (const filename of language.filenames || []) found.add(`**/${filename}`);
    }
  }
  return [...found];
}

function workspaceIncludePatterns(config) {
  const patterns = new Set([
    ...config.get('include', []),
    ...config.get('files', []),
    ...config.get('files_extensions', []).map((ext) => `**/*${ext}`),
    ...inferExtensionPatterns(config.get('languages', []))
  ]);
  return [...patterns].filter(Boolean);
}

function combinedExclude(config) {
  const excludes = config.get('exclude', []).filter(Boolean);
  if (!excludes.length) return undefined;
  if (excludes.length === 1) return excludes[0];
  return `{${excludes.join(',')}}`;
}

async function refreshWorkspaceVariables() {
  const config = vscode.workspace.getConfiguration('colorize');
  if (!config.get('enable_search_variables', false) || !vscode.workspace.workspaceFolders?.length) {
    workspaceVariables = new Map();
    return;
  }
  const families = config.get('colorized_variables', ['CSS', 'SASS', 'LESS']);
  const syntaxes = config.get('colorized_colors');
  const uris = new Map();
  const exclude = combinedExclude(config);
  for (const pattern of workspaceIncludePatterns(config)) {
    try {
      for (const uri of await vscode.workspace.findFiles(pattern, exclude, 5000)) uris.set(uri.toString(), uri);
    } catch (error) {
      console.warn(`Colorize: unable to scan pattern ${pattern}`, error);
    }
  }
  const next = new Map();
  for (const uri of uris.values()) {
    if (isExcluded(uri.fsPath, config)) continue;
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const definitions = extractVariableDefinitions(document.getText(), { variableFamilies: families, syntaxes });
      for (const [key, value] of definitions) next.set(key, value);
    } catch (error) {
      console.warn(`Colorize: unable to inspect ${uri.fsPath}`, error);
    }
  }
  workspaceVariables = next;
}

function updateStatusBar(editor, supported) {
  if (!statusBar || editor !== vscode.window.activeTextEditor) return;
  statusBar.text = supported ? '$(check) Colorize' : '$(circle-slash) Colorize';
  statusBar.tooltip = supported ? 'Colorize is activated for this file' : 'Colorize is not activated for this file';
  statusBar.show();
}

function clearEditor(editor) {
  for (const type of decorations.values()) editor.setDecorations(type, []);
}

function update(editor = vscode.window.activeTextEditor) {
  if (!editor) return;
  const config = vscode.workspace.getConfiguration('colorize', editor.document.uri);
  clearEditor(editor);
  const supported = isSupported(editor.document, config);
  updateStatusBar(editor, supported);
  if (!supported) return;

  const hiddenLines = config.get('hide_current_line_decorations', false)
    ? new Set(editor.selections.map((selection) => selection.active.line))
    : new Set();
  const variableFamilies = config.get('colorized_variables', ['CSS', 'SASS', 'LESS']);
  const grouped = new Map();
  for (const match of parseColors(editor.document.getText(), {
    languageId: path.extname(editor.document.fileName).toLowerCase() === '.lua' ? 'lua' : editor.document.languageId,
    syntaxes: config.get('colorized_colors'),
    luaTables: config.get('lua.enableTables'),
    fiveM: config.get('lua.enableFiveM'),
    variables: variableFamilies.length > 0,
    variableFamilies,
    variableDefinitions: config.get('enable_search_variables', false) ? workspaceVariables : undefined
  })) {
    const range = new vscode.Range(editor.document.positionAt(match.start), editor.document.positionAt(match.end));
    if (hiddenLines.has(range.start.line)) continue;
    const type = decorationFor(match.color, config);
    if (!grouped.has(type)) grouped.set(type, []);
    grouped.get(type).push(range);
  }
  for (const [type, ranges] of grouped) editor.setDecorations(type, ranges);
}

function updateVisibleEditors() {
  for (const editor of vscode.window.visibleTextEditors) update(editor);
}

function schedule(editor) {
  if (!editor) return;
  const key = editor.document.uri.toString();
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => {
    timers.delete(key);
    update(editor);
  }, 120));
}

function scheduleWorkspaceRefresh() {
  clearTimeout(workspaceTimer);
  workspaceTimer = setTimeout(async () => {
    await refreshWorkspaceVariables();
    updateVisibleEditors();
  }, 250);
}

async function activate(context) {
  registerUpdates(context);
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'colorize.reload';
  context.subscriptions.push(statusBar);

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => update(editor)),
    vscode.window.onDidChangeTextEditorSelection((event) => schedule(event.textEditor)),
    vscode.workspace.onDidChangeTextDocument((event) => {
      for (const editor of vscode.window.visibleTextEditors) if (editor.document === event.document) schedule(editor);
    }),
    vscode.workspace.onDidSaveTextDocument(() => scheduleWorkspaceRefresh()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration('colorize')) return;
      resetDecorationTypes();
      scheduleWorkspaceRefresh();
      updateVisibleEditors();
    }),
    vscode.commands.registerCommand('colorize.reload', async () => {
      resetDecorationTypes();
      await refreshWorkspaceVariables();
      updateVisibleEditors();
    })
  );

  await refreshWorkspaceVariables();
  updateVisibleEditors();
}

function deactivate() {
  clearTimeout(workspaceTimer);
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  resetDecorationTypes();
  workspaceVariables.clear();
  statusBar = undefined;
}

module.exports = { activate, deactivate, globToRegExp, matchesGlob };
