const { Tray, nativeImage, Menu, screen } = require('electron');
const zlib = require('node:zlib');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
// Generate a high-DPI template icon locally. No web renderer or external images.
function crc32(buffer) { let crc = 0xffffffff; for (const byte of buffer) { crc ^= byte; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, bytes) { const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4); length.writeUInt32BE(bytes.length); crc.writeUInt32BE(crc32(Buffer.concat([name, bytes]))); return Buffer.concat([length, name, bytes, crc]); }
function arcImage(progress, overtime) {
  const width = 48, height = 36, pixels = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const dx = x - 23.5, dy = y - 23, radius = Math.hypot(dx, dy), angle = Math.atan2(dy, dx) + Math.PI;
    let alpha = 0;
    if (dy <= 0 && radius >= 16 && radius <= 20) alpha = angle <= Math.PI * progress ? 235 : 65;
    // An open-ended plus replaces the bounded progress cue during overtime.
    if (overtime && ((x >= 22 && x <= 25 && y >= 17 && y <= 29) || (x >= 17 && x <= 30 && y >= 22 && y <= 25))) alpha = 235;
    const index = y * (width * 4 + 1) + 1 + x * 4; pixels[index + 3] = alpha;
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
  const image = nativeImage.createFromBuffer(png, { scaleFactor: 2 }); image.setTemplateImage(true); return image;
}
exports.createStatusBar = async ({ app, getWindow, store, showFull }) => {
  const model = await import(pathToFileURL(path.join(__dirname, '../src/model.mjs')).href), money = await import(pathToFileURL(path.join(__dirname, '../src/money.mjs')).href);
  const tray = new Tray(arcImage(0, false)); let signature = '', lastTitle = '', currentTooltip = '', detailsVisible = false;
  function showDetails() {
    const win = getWindow(); if (!win) return;
    const bounds = tray.getBounds(), work = screen.getDisplayMatching(bounds).workArea;
    const width = 420, height = 530;
    win.setMinimumSize(360, 350); win.setBounds({ x: Math.max(work.x, Math.min(work.x + work.width - width, Math.round(bounds.x + bounds.width / 2 - width / 2))), y: Math.max(work.y, bounds.y + bounds.height + 5), width, height });
    win.webContents.send('window:presentation', 'tray'); win.setTitle('窝囊费 · 菜单栏详情'); win.show(); win.focus(); detailsVisible = true;
  }
  tray.on('click', () => { const win = getWindow(); if (detailsVisible && win?.isVisible() && win.getTitle() === '窝囊费 · 菜单栏详情') { win.hide(); detailsVisible = false; } else showDetails(); });
  tray.on('right-click', () => tray.popUpContextMenu(Menu.buildFromTemplate([
    { label: '查看详情', click: showDetails },
    { label: '添加花销', click: () => { showDetails(); getWindow().webContents.send('app:action', 'expense'); } },
    { label: '添加摸鱼时间', click: () => { showDetails(); getWindow().webContents.send('app:action', 'break'); } },
    { label: '下班', click: () => { showDetails(); getWindow().webContents.send('app:action', 'clockout'); } },
    { type: 'separator' }, { label: '打开完整窗口', click: showFull }, { label: '退出窝囊费', click: () => app.quit() }
  ])));
  function update() {
    const state = store.currentState; if (!state || tray.isDestroyed()) return;
    const stamp = model.clockNow(state).getTime(), shift = model.activeShift(state, stamp), key = shift?.key ?? model.dateKey(new Date(stamp)), stats = model.dayStats(state, key, stamp);
    const overtime = !!shift && stamp >= model.at(key, stats.settings.end), progress = Math.min(1, stats.elapsed / stats.planned);
    const title = state.display === 'hidden' ? '金额已隐藏' : `${stats.net < 0 ? '今日还欠' : '今日已赚'} ${money.formatCurrency(stats.net)}`;
    if (title !== lastTitle) { tray.setTitle(title, { fontType: 'monospacedDigit' }); lastTitle = title; }
    const nextSignature = `${overtime}:${Math.round(progress * 100)}`;
    if (signature !== nextSignature) { tray.setImage(arcImage(overtime ? 1 : progress, overtime)); signature = nextSignature; }
    currentTooltip = overtime ? '已加班：工资自动计薪已封顶，下班时可另记加班费。弧形 + 表示开放状态，没有百分比上限。点击查看详情。' : `计薪进度 ${(progress * 100).toFixed(0)}%。点击查看详情。`;
    tray.setToolTip(currentTooltip);
  }
  update(); const timer = setInterval(update, 1000); timer.unref();
  return { tray, update, showDetails, getInfo: () => ({ title: lastTitle, tooltip: currentTooltip, iconState: signature }), hide: () => { getWindow()?.hide(); detailsVisible = false; }, destroy: () => { clearInterval(timer); tray.destroy(); } };
};
