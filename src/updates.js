'use strict';

const vscode = require('vscode');
const { findUpdate, downloadUpdate } = require('./release-updater');

const DAY = 24 * 60 * 60 * 1000;

function registerUpdates(context) {
  let busy = false;
  let disposed = false;
  let pendingReload = false;
  let installedVersion = context.extension.packageJSON.version;

  async function check(manual = false) {
    if (busy || disposed) return;
    if (!manual && (!vscode.workspace.getConfiguration('colorize').get('updates.autoUpdate', true)
      || Date.now() - context.globalState.get('updates.lastCheck', 0) < DAY)) return;
    busy = true;
    try {
      let token;
      let update;
      try {
        update = await findUpdate(installedVersion);
      } catch (error) {
        if (![401, 404].includes(error.status)) throw error;
        const session = await vscode.authentication.getSession('github', ['repo'], manual
          ? { createIfNone: true } : { silent: true });
        if (!session) throw new Error('GitHub access is required. Run Colorize Plus: Check for updates to sign in with an account that can read the repository.');
        token = session.accessToken;
        update = await findUpdate(installedVersion, undefined, token);
      }
      await context.globalState.update('updates.lastCheck', Date.now());
      if (disposed) return;
      if (!update) {
        if (manual) await vscode.window.showInformationMessage(pendingReload
          ? 'Colorize Plus is updated. Reload VS Code to activate it.' : 'Colorize Plus is up to date.');
        return;
      }
      const bytes = await downloadUpdate(update, undefined, token);
      if (disposed) return;
      await vscode.workspace.fs.createDirectory(context.globalStorageUri);
      const uri = vscode.Uri.joinPath(context.globalStorageUri, update.filename);
      await vscode.workspace.fs.writeFile(uri, bytes);
      try {
        await vscode.commands.executeCommand('workbench.extensions.installExtension', uri);
      } finally {
        await vscode.workspace.fs.delete(uri).catch(() => {});
      }
      installedVersion = update.version;
      pendingReload = true;
      if (disposed) return;
      const action = await vscode.window.showInformationMessage(
        `Colorize Plus ${update.version} is installed. Reload VS Code to activate the update.`, 'Reload now');
      if (action === 'Reload now') await vscode.commands.executeCommand('workbench.action.reloadWindow');
    } catch (error) {
      // Offline work must never interrupt color decorations. The command exposes
      // errors on demand, while automatic checks stay silent and retry later.
      console.warn('Colorize Plus update:', error.message);
      if (manual && !disposed) await vscode.window.showErrorMessage(`Colorize Plus update failed: ${error.message}`);
    } finally {
      busy = false;
    }
  }

  const startup = setTimeout(() => check(), 30_000);
  const interval = setInterval(() => check(), 6 * 60 * 60 * 1000);
  context.subscriptions.push(
    vscode.commands.registerCommand('colorize.checkForUpdates', () => check(true)),
    { dispose() { disposed = true; clearTimeout(startup); clearInterval(interval); } }
  );
}

module.exports = { registerUpdates };
