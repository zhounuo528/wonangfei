const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const evidence = path.join(root, 'evidence/mint-loading');
app.setPath('userData', path.join(root, '.test-browser/mint-loading'));
app.commandLine.appendSwitch('no-proxy-server');
app.on('window-all-closed', () => {});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  await fs.mkdir(evidence, { recursive: true });
  let release, waiting = false;
  const isolated = session.fromPartition(`mint-loading-${Date.now()}`);
  isolated.webRequest.onBeforeRequest((details, callback) => {
    if (details.url === `${base}/app.mjs`) { waiting = true; release = () => callback({}); }
    else callback({});
  });
  const win = new BrowserWindow({ width: 1440, height: 1000, show: true, webPreferences: { session: isolated, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  win.webContents.debugger.attach('1.3');
  const evaluate = async code => {
    const result = await win.webContents.debugger.sendCommand('Runtime.evaluate', { expression: code, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
    return result.result.value;
  };
  async function until(code, label) {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) { try { if (await evaluate(code)) return; } catch {} await delay(50); }
    throw Error(`Timed out: ${label}`);
  }
  const loaded = win.loadURL(base);
  for (let i = 0; i < 200 && !waiting; i++) await delay(50);
  assert.ok(waiting, 'Actual app module request is held by test network gate');
  await until("document.getElementById('boot-screen') && !document.getElementById('boot-screen').hidden", 'loading shell');
  await until("performance.getEntriesByType('resource').some(r=>r.name.endsWith('/loading-scene.png') && r.responseEnd>0)", 'approved loading illustration');
  assert.equal(await evaluate("document.getElementById('app-shell').inert"), true);
  const layouts = [];
  for (const width of [1440,390,320]) {
    win.setContentSize(width, 920); await delay(120);
    const layout = await evaluate("(()=>{const r=document.querySelector('.boot-card').getBoundingClientRect();return {width:innerWidth,scroll:document.documentElement.scrollWidth,left:r.left,right:r.right,cardHeight:r.height,visible:!document.getElementById('boot-screen').hidden};})()");
    assert.ok(layout.visible && layout.scroll <= width && layout.left >= 0 && layout.right <= width);
    layouts.push(layout);
    await fs.writeFile(path.join(evidence,`loading-${width}.png`),(await win.webContents.capturePage()).toPNG());
  }
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.boot-dots i')).animationName"),'none');
  const releasedAt = Date.now(); release(); await loaded;
  await until("document.documentElement.dataset.bootState==='ready'",'initialization complete');
  const millisecondsAfterModuleAvailable = Date.now()-releasedAt;
  assert.equal(await evaluate("document.getElementById('boot-screen').hidden && !document.body.classList.contains('app-loading') && !document.getElementById('app-shell').inert"),true);
  const bootstrap = await fs.readFile(path.join(root,'src/bootstrap.mjs'),'utf8');
  assert.ok(!/setTimeout|setInterval/.test(bootstrap),'No artificial minimum loading duration');
  win.destroy();
  const failureSession = session.fromPartition(`mint-loading-failure-${Date.now()}`);
  failureSession.webRequest.onBeforeRequest((details, callback) => callback(details.url === `${base}/app.mjs` ? {cancel:true} : {}));
  const failed = new BrowserWindow({width:1024,height:800,show:true,webPreferences:{session:failureSession,sandbox:true,contextIsolation:true,nodeIntegration:false}});
  await failed.loadURL(base).catch(() => {});
  const deadline = Date.now()+10000;
  while (Date.now()<deadline && !await failed.webContents.executeJavaScript("document.documentElement.dataset.bootState==='error'")) await delay(50);
  assert.equal(await failed.webContents.executeJavaScript("!document.getElementById('boot-retry').hidden && document.getElementById('app-shell').inert && getComputedStyle(document.querySelector('.boot-dots')).display==='none'"),true);
  await fs.writeFile(path.join(evidence,'loading-error.png'),(await failed.webContents.capturePage()).toPNG());
  failed.destroy();
  const result={timestamp:new Date().toISOString(),data:'isolated empty browser sessions; fictional only',checks:['Actual pending module request displays approved loading card','320/390/1440px loading layouts fit viewport','Application stays inert until initialized','Reduced motion disables dot animation','Loading ends when initialization resolves with no minimum duration','Module failure stops animation and offers a real reload action'],millisecondsAfterModuleAvailable,layouts};
  await fs.writeFile(path.join(evidence,'loading-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));app.exit(0);
}).catch(async error=>{console.error(error);await fs.mkdir(evidence,{recursive:true});await fs.writeFile(path.join(evidence,'failure.txt'),String(error.stack));app.exit(1);});
