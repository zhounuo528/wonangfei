const { app, BrowserWindow, ipcMain, session, dialog, Menu, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { LocalStore } = require('./storage.cjs');
const smoke = process.argv.includes('--smoke-test');
const root = path.join(__dirname, '..');
const storagePath = process.env.WORKDAY_DATA_DIR || (smoke ? path.join(root, '.smoke-data') : app.isPackaged ? path.join(app.getPath('appData'), 'WonangfeiTrial') : path.join(root, '.local-data'));
app.setName('窝囊费');
app.setPath('userData', storagePath);
app.setPath('sessionData', path.join(storagePath, 'chromium'));
const store = new LocalStore(storagePath);
const updates=require('./update-service.cjs').createUpdateService({version:app.getVersion(),platform:process.platform,arch:process.arch});
let win, fullBounds, mini = false, statusBar;
const indexUrl = pathToFileURL(path.join(root, 'src/index.html')).href;
function trusted(event) { if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== indexUrl) throw Error('未知调用来源'); }
function handle(name, fn) { ipcMain.handle(name, async (event, ...args) => { trusted(event); return fn(...args); }); }
handle('state:load', async () => ({ ...await store.load(), nativeVisible: win.isVisible() && !win.isMinimized(), platform: process.platform }));
handle('state:save', async state => { await store.save(state); statusBar?.update(); });
handle('app:about',async()=>({stream:'desktop',version:app.getVersion(),platform:process.platform,arch:process.arch,packaged:app.isPackaged,channel:require('../package.json').releaseChannel??'preview',changes:(await import(pathToFileURL(path.join(root,'src/release-notes.mjs')).href)).releaseNotes('desktop')}));
handle('app:check-update',includePrerelease=>updates.check(includePrerelease));
handle('app:open-downloads',()=>shell.openExternal('https://github.com/zhounuo528/wonangfei/releases',{activate:true}));
handle('app:contact-author',()=>shell.openExternal('mailto:znzhounuo@outlook.com',{activate:true}));
handle('app:open-checked-release',()=>{const url=updates.checkedReleaseURL();if(!url)throw Error('请先成功检查适配发行版');return shell.openExternal(url,{activate:true});});
handle('state:export', async state => {
  const { validateState, dateKey } = await import(pathToFileURL(path.join(root, 'src/model.mjs')).href);
  validateState(state);
  const result = await dialog.showSaveDialog(win, { title: '导出本地备份', defaultPath: `workday-cheer-${dateKey()}.json`, filters: [{ name: 'JSON 备份', extensions: ['json'] }] });
  if (!result.canceled) await fs.writeFile(result.filePath, JSON.stringify(state, null, 2), { mode: 0o600 });
  return { canceled: result.canceled };
});
handle('window:pin', enabled => { if (typeof enabled !== 'boolean') throw Error('置顶参数无效'); win.setAlwaysOnTop(enabled); return win.isAlwaysOnTop(); });
handle('window:mode', enabled => {
  if (typeof enabled !== 'boolean') throw Error('窗口参数无效');
  if (enabled && !mini) { fullBounds = win.getBounds(); win.setMinimumSize(390, 300); win.setSize(430, 300); }
  else if (!enabled) { win.setMinimumSize(760, 650); if (fullBounds) win.setBounds(fullBounds); else win.setSize(1220, 930); win.setTitle('窝囊费'); win.webContents.send('window:presentation', 'full'); }
  mini = enabled; return { mini };
});
handle('window:tray', async state => {
  if (process.platform !== 'darwin') throw Error('当前菜单栏模式仅实现 Mac；Windows 托盘尚待适配');
  await store.save(state);
  fullBounds = win.getBounds(); mini = true;
  if (!statusBar) statusBar = await require('./tray.cjs').createStatusBar({ app, getWindow: () => win, store, showFull: () => { mini = false; win.setMinimumSize(760, 650); win.setBounds(fullBounds ?? { width: 1220, height: 930 }); win.webContents.send('window:presentation', 'full'); win.setTitle('窝囊费'); win.show(); win.focus(); } });
  statusBar.update(); win.webContents.send('window:presentation', 'tray'); statusBar.hide();
  return { mode: 'tray', nativeBounds: statusBar.tray.getBounds() };
});
async function createWindow() {
  win = new BrowserWindow({ width: 1220, height: 930, minWidth: 760, minHeight: 650, useContentSize: true, title: '窝囊费', icon: path.join(root, 'src/app-icon.png'), backgroundColor: '#f7f8fa', show: false, autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, spellcheck: false, webSecurity: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  let lastVisibility;
  const publishVisibility = visible => { if (win && !win.webContents.isDestroyed() && visible !== lastVisibility) { lastVisibility = visible; win.webContents.send('window:visibility', visible); } };
  const sendVisibility = () => { if (win) publishVisibility(win.isVisible() && !win.isMinimized()); };
  for (const event of ['hide', 'minimize']) win.on(event, () => publishVisibility(false));
  for (const event of ['show', 'restore']) win.on(event, () => publishVisibility(true));
  win.webContents.on('did-finish-load', sendVisibility);
  // Fallback for native hides which don't dispatch a visibility event on some Mac builds.
  // This polls two booleans; IPC is sent only when the state changes, never every frame.
  const visibilityTimer = setInterval(sendVisibility, 1000);
  visibilityTimer.unref();
  win.once('ready-to-show', () => win.show());
  win.on('close', event => { if (statusBar && !quitting) { event.preventDefault(); win.hide(); } });
  win.on('closed', () => { clearInterval(visibilityTimer); win = null; });
  await win.loadFile(path.join(root, 'src/index.html'));
  if (smoke) {
    try { await require(process.env.WORKDAY_SMOKE_SCRIPT || '../scripts/smoke.cjs').run({ app, win, store, root, getStatusBar: () => statusBar }); app.exit(0); }
    catch (error) { console.error(error); app.exit(1); }
  }
}
app.whenReady().then(async () => {
  if (process.platform === 'darwin') app.dock?.setIcon(path.join(root, 'src/app-icon.png'));
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: '窝囊费', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] }, { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] }, { label: '窗口', submenu: [{ role: 'minimize' }, { role: 'close' }] }]));
  await createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
}).catch(error => { console.error(error); app.exit(1); });
app.on('window-all-closed', () => app.quit());
// Writes are triggered at each mutation, never once per second.
let quitting = false;
app.on('before-quit', event => {
  if (!quitting) { event.preventDefault(); quitting = true; store.tail.finally(() => app.quit()); }
});
