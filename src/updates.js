'use strict';

const vscode = require('vscode');
const { randomUUID } = require('node:crypto');
const { REPOSITORY, findUpdate, downloadUpdate } = require('./release-updater');

const HOUR = 60 * 60 * 1000;
const RETRIES = [60_000, 5 * 60_000, 15 * 60_000, HOUR];

function registerUpdates(context) {
  const output = vscode.window.createOutputChannel('Colorize Plus Updates');
  let disposed = false;
  let timer;
  let running;
  let runningReason;
  let controller;
  let failures = 0;
  let pendingReload = false;
  let installedVersion = context.extension.packageJSON.version;

  const settings = () => vscode.workspace.getConfiguration('colorize');
  const interval = () => {
    const hours = settings().get('updates.checkIntervalHours', 1);
    return Number.isFinite(hours) && hours >= 0 && hours <= 24 ? hours * HOUR : HOUR;
  };
  const automatic = () => settings().get('updates.checkOnStartup', true) || interval() > 0;
  const log = (message) => {
    if (!disposed) output.appendLine(`[${new Date().toISOString()}] ${message}`);
  };
  const notify = (promise) => {
    void promise.catch((error) => log(`Notification: ${error?.message || String(error)}`));
  };
  const clearTimer = () => { clearTimeout(timer); timer = undefined; };
  const schedule = (delay, reason = 'periodic') => {
    clearTimer();
    if (disposed || delay <= 0) return;
    timer = setTimeout(() => { timer = undefined; return check(reason); }, Math.min(delay, 2 ** 31 - 1));
  };

  async function requireAccess(manual, signal) {
    let token;
    try {
      token = (await vscode.authentication.getSession('github', ['repo'], { silent: true }))?.accessToken;
    } catch { /* Public releases can still work without a GitHub provider. */ }
    try {
      return { update: await findUpdate(installedVersion, undefined, token, { signal }), token };
    } catch (error) {
      if (![401, 404].includes(error.status)) throw error;
      if (manual) {
        const session = await vscode.authentication.getSession('github', ['repo'], token
          ? { forceNewSession: true } : { createIfNone: true });
        if (session) {
          try {
            return { update: await findUpdate(installedVersion, undefined, session.accessToken, { signal }), token: session.accessToken };
          } catch (retryError) {
            if (![401, 404].includes(retryError.status)) throw retryError;
          }
        }
      }
      const accessError = new Error(`GitHub access to ${REPOSITORY} is required. Use Check for updates to sign in with an account that can read this repository.`);
      accessError.code = 'GITHUB_AUTH_REQUIRED';
      throw accessError;
    }
  }

  async function reportAvailable(update) {
    log(`Version ${update.version} is available; automatic installation is disabled.`);
    if (context.globalState.get('updates.notifiedVersion') === update.version) return;
    await context.globalState.update('updates.notifiedVersion', update.version);
    if (disposed) return;
    notify(vscode.window.showInformationMessage(
      `Colorize Plus ${update.version} is available.`, 'Install update', 'Release notes')
      .then((action) => {
        if (disposed) return;
        if (action === 'Install update') return check('manual');
        if (action === 'Release notes') return vscode.env.openExternal(vscode.Uri.parse(`https://github.com/${REPOSITORY}/releases/tag/v${update.version}`));
      }));
  }

  async function run(reason, progress) {
    if (disposed) return 0;
    const manual = reason === 'manual';
    let nextDelay;
    const signal = controller.signal;
    const rateLimitUntil = context.globalState.get('updates.rateLimitUntil', 0);
    if (Number.isFinite(rateLimitUntil) && rateLimitUntil > Date.now()) {
      nextDelay = rateLimitUntil - Date.now();
      log(`GitHub rate limit: next check after ${new Date(rateLimitUntil).toISOString()}.`);
      if (manual) notify(vscode.window.showInformationMessage('GitHub is temporarily limiting requests. Colorize Plus will retry automatically.', 'Show log')
        .then((action) => { if (!disposed && action === 'Show log') output.show(true); }));
      return nextDelay;
    }
    log(`Checking for updates (${reason}); running ${context.extension.packageJSON.version}, installed ${installedVersion}.`);
    try {
      progress?.report({ message: 'Checking the latest GitHub release…' });
      const { update, token } = await requireAccess(manual, signal);
      if (disposed) return 0;
      if (!update) {
        log(pendingReload ? `Version ${installedVersion} is installed; reload VS Code to activate it.` : `Version ${installedVersion} is up to date.`);
        if (manual) notify(vscode.window.showInformationMessage(pendingReload
          ? `Colorize Plus ${installedVersion} is installed. Reload VS Code to activate it.` : `Colorize Plus ${installedVersion} is up to date.`));
      } else if (!manual && !settings().get('updates.autoUpdate', true)) {
        await reportAvailable(update);
      } else {
        progress?.report({ message: `Downloading and verifying ${update.version}…` });
        log(`Downloading ${update.version}; SHA-256 verification is required.`);
        const bytes = await downloadUpdate(update, undefined, token, { signal });
        if (disposed) return 0;
        if (!manual && !settings().get('updates.autoUpdate', true)) {
          await reportAvailable(update);
        } else {
          // Separate directories prevent VS Code windows from deleting each
          // other's downloads while an installation is in progress.
          const directory = vscode.Uri.joinPath(context.globalStorageUri, `update-${randomUUID()}`);
          try {
            await vscode.workspace.fs.createDirectory(directory);
            const uri = vscode.Uri.joinPath(directory, update.filename);
            await vscode.workspace.fs.writeFile(uri, bytes);
            if (disposed) return 0;
            const installUri = uri.scheme === 'vscode-userdata' ? vscode.Uri.file(uri.fsPath) : uri;
            progress?.report({ message: `Installing ${update.version}…` });
            await vscode.commands.executeCommand('workbench.extensions.installExtension', installUri);
          } finally {
            await vscode.workspace.fs.delete(directory, { recursive: true }).catch(() => {});
          }
          installedVersion = update.version;
          pendingReload = true;
          log(`Version ${installedVersion} installed and temporary files removed. Reload when convenient.`);
          if (!disposed) notify(vscode.window.showInformationMessage(
            `Colorize Plus ${installedVersion} is installed. Reload VS Code to activate the update.`, 'Reload now')
            .then((action) => {
              if (!disposed && action === 'Reload now') return vscode.commands.executeCommand('workbench.action.reloadWindow');
            }));
        }
      }
      if (disposed) return 0;
      failures = 0;
      await context.globalState.update('updates.lastCheck', Date.now());
      await context.globalState.update('updates.rateLimitUntil', undefined);
    } catch (error) {
      if (disposed) return 0;
      const message = error?.message || String(error);
      log(`Check failed: ${message}`);
      if (error?.code === 'GITHUB_AUTH_REQUIRED') {
        nextDelay = undefined;
        const lastNotice = context.globalState.get('updates.authNotice', 0);
        if (!manual && Date.now() - lastNotice >= 24 * HOUR) {
          await context.globalState.update('updates.authNotice', Date.now());
          if (!disposed) notify(vscode.window.showInformationMessage(
            'Sign in to GitHub once to let Colorize Plus check this private repository for updates.', 'Sign in')
            .then((action) => { if (!disposed && action === 'Sign in') return check('manual'); }));
        }
      } else {
        nextDelay = RETRIES[Math.min(failures++, RETRIES.length - 1)];
        if (Number.isFinite(error?.retryAfterMs) && error.retryAfterMs > 0) {
          nextDelay = Math.max(nextDelay, error.retryAfterMs);
          await context.globalState.update('updates.rateLimitUntil', Date.now() + nextDelay);
        }
        log(`Next automatic attempt in ${Math.ceil(nextDelay / 60_000)} minute(s).`);
      }
      if (manual && !disposed) notify(vscode.window.showErrorMessage(`Colorize Plus update failed: ${message}`, 'Show log')
        .then((action) => { if (!disposed && action === 'Show log') output.show(true); }));
    }
    return nextDelay;
  }

  function check(reason = 'manual') {
    if (disposed) return Promise.resolve();
    if (running) {
      // A manual request made during a background check must still be able to
      // sign in or install an update after the background operation completes.
      if (reason === 'manual' && runningReason !== 'manual') return running.then(() => check('manual'));
      return running;
    }
    clearTimer();
    controller = new AbortController();
    runningReason = reason;
    const task = (progress) => run(reason, progress);
    // Start on a microtask so even immediate failures share the same promise.
    running = Promise.resolve().then(() => reason === 'manual'
      ? vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Colorize Plus: Checking for updates', cancellable: false }, task)
      : task()).then((delay) => {
      if (automatic()) schedule(delay ?? interval(), 'periodic');
    }).catch((error) => {
      log(`Unable to finish the update check: ${error?.message || String(error)}`);
      if (automatic()) schedule(RETRIES[0], 'periodic');
    }).finally(() => { running = undefined; controller = undefined; });
    return running;
  }

  context.subscriptions.push(
    { dispose() { disposed = true; clearTimer(); controller?.abort(); output.dispose(); } },
    vscode.commands.registerCommand('colorize.checkForUpdates', () => check('manual')),
    vscode.commands.registerCommand('colorize.showUpdateLog', () => output.show(true)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration('colorize.updates')) return;
      log('Update settings changed.');
      clearTimer();
      if (!running && automatic()) schedule(1000, 'configuration');
    }),
    vscode.authentication.onDidChangeSessions((event) => {
      if (event.provider.id === 'github' && automatic()) void check('authentication');
    })
  );
  log(`Colorize Plus ${installedVersion} update service started.`);
  if (settings().get('updates.checkOnStartup', true)) schedule(3000, 'startup');
  else schedule(interval(), 'periodic');
}

module.exports = { registerUpdates };
