// Run with an installed Electron binary. Site code gets no Node or native bridge.
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const evidenceName = process.env.EVIDENCE_NAME || (process.env.BASE_URL ? 'online' : 'local');
if (!/^[a-z0-9_-]+$/.test(evidenceName)) throw Error('Invalid evidence directory');
const evidence = path.join(root, 'evidence', evidenceName);
app.setPath('userData', path.join(root, '.test-browser', process.env.BASE_URL ? 'online' : 'local'));
app.commandLine.appendSwitch('no-proxy-server');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  await fs.mkdir(evidence, { recursive: true });
  const checks = [], errors = [], requests = [];
  const isolated = session.fromPartition(`wonangfei-test-${Date.now()}`);
  isolated.webRequest.onBeforeRequest((details, callback) => { requests.push({ method: details.method, url: details.url }); callback({}); });
  const options = { width: 1280, height: 1000, show: true, webPreferences: { session: isolated, sandbox: true, contextIsolation: true, nodeIntegration: false } };
  const win = new BrowserWindow(options);
  const attach = target => target.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  attach(win);
  const js = code => win.webContents.executeJavaScript(code, true);
  async function until(code, label, target = win) {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) { if (await target.webContents.executeJavaScript(code)) return; await delay(75); }
    throw Error(`Timed out: ${label}; ${await target.webContents.executeJavaScript('document.body.innerText.slice(-600)')}`);
  }
  const click = id => js(`document.getElementById(${JSON.stringify(id)}).click()`);
  const saved = () => until("document.getElementById('save-status').textContent==='已保存在此浏览器'", 'IndexedDB saved');
  async function reload() { win.reload(); await delay(150); await until("document.documentElement.dataset.ready==='true'", 'reload'); }
  const readRecord = key => js(`new Promise((resolve,reject)=>{ const r=indexedDB.open('wonangfei-web-v1',1); r.onsuccess=()=>{const db=r.result,t=db.transaction('records'),q=t.objectStore('records').get(${JSON.stringify(key)});q.onsuccess=()=>resolve(q.result);t.oncomplete=()=>db.close();};r.onerror=()=>reject(r.error);})`);
  async function fixture(code) { await js(`(async()=>{const m=await import('./model.mjs'),a=await import('./browser-api.mjs'); const state=${code}; await a.browserStore.save(state);})()`); await reload(); }
  async function capture(name) { await js("window.scrollTo(0,0);document.getElementById('toast').hidden=true"); await delay(150); await fs.writeFile(path.join(evidence, `${name}.png`), (await win.webContents.capturePage()).toPNG()); }
  await win.loadURL(base); await until("document.documentElement.dataset.ready==='true' && document.documentElement.dataset.bootState==='ready'", 'first use');
  assert.equal(await js("document.getElementById('boot-screen').hidden && !document.getElementById('app-shell').inert"),true);
  assert.equal(await js("document.querySelector('link[rel=icon]').getAttribute('href')"),'app-icon.png');
  assert.equal(await js("document.getElementById('settings-view').hidden"), false);
  assert.equal(await js("typeof window.workday"), 'undefined');
  assert.equal(await js("['pin','mini','collapse-to-tray'].every(id=>document.getElementById(id).hidden)"), true);
  checks.push('First visit opens attendance setup; no native bridge or desktop-only controls.');
  await capture('first-use-desktop');
  await js(`(()=>{const f=document.getElementById('settings-form');f.elements.salary.value='17400';f.elements.payDaysMode.value='manual';f.elements.payDays.value='21.75';f.elements.start.value='00:00';f.elements.end.value='23:59';f.elements.lunch.checked=false;for(const e of document.querySelectorAll('#weekdays input'))e.checked=true;f.requestSubmit();})()`);
  await saved();
  assert.equal((await readRecord('real')).state.settings.salary, 17400);
  await click('work-toggle'); await saved(); await delay(1200);
  const first = await readRecord('real');
  assert.ok(Object.values(first.state.days)[0].sessions[0].start > 0);
  await reload(); assert.equal(await js("document.getElementById('work-toggle').textContent.includes('下班')"), true);
  assert.deepEqual((await readRecord('real')).state.days, first.state.days);
  checks.push('Personal salary, attendance and open session persist through full page reload.');
  await js("document.querySelector('[data-expense=咖啡]').click();document.getElementById('expense-amount').value='30.00';document.getElementById('expense-form').requestSubmit()"); await saved();
  assert.equal((await readRecord('real')).state.expenses[0].amount, 30);
  await js("document.querySelector('nav [data-view=expenses]').click()"); await click('add-fixed');
  await js("document.getElementById('fixed-form').elements.amount.value='2200';document.getElementById('fixed-form').requestSubmit()"); await saved();
  assert.equal((await readRecord('real')).state.fixed[0].amount, 2200);
  await js("document.querySelector('nav [data-view=dashboard]').click()");
  await click('edit-goal'); await js("document.getElementById('goal-form').elements.name.value='浏览器测试目标';document.getElementById('goal-form').elements.amount.value='2000';document.getElementById('goal-form').requestSubmit()"); await saved();
  assert.equal((await readRecord('real')).state.goal.amount, 2000);
  checks.push('Expense, working-day fixed cost and goal forms save personal records.');
  // Browser download, including a real UI import of exactly that backup.
  const backupPath = path.join(evidence, 'fictional-personal-backup.json');
  let downloaded;
  isolated.once('will-download', (_event, item) => { item.setSavePath(backupPath); item.once('done', (_e, state) => { downloaded = state; }); });
  await js("document.querySelector('nav [data-view=settings]').click()"); await click('export-data');
  for (let i = 0; i < 100 && !downloaded; i++) await delay(50);
  assert.equal(downloaded, 'completed');
  const backup = JSON.parse(await fs.readFile(backupPath, 'utf8'));
  assert.equal(backup.state.settings.salary, 17400); assert.equal(backup.format, 'wonangfei-backup');
  // Chromium's file chooser is replaced with a virtual File, exercising the same change/validation path.
  await js(`(()=>{const transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(JSON.stringify(backup))}],'backup.json',{type:'application/json'}));const e=document.getElementById('backup-file');e.files=transfer.files;e.dispatchEvent(new Event('change'));})()`);
  await until("document.getElementById('confirm-dialog').open", 'import confirmation'); await click('confirm-ok'); await saved();
  assert.equal((await readRecord('real')).state.expenses.length, 1);
  checks.push('JSON download completes; the same file imports through the UI with validation and replacement confirmation.');
  const personal = (await readRecord('real')).state;
  await click('load-demo'); await saved(); await reload();
  assert.ok((await readRecord('demo')).state.demo);
  assert.deepEqual((await readRecord('real')).state, personal);
  await capture('dashboard-desktop');
  await click('exit-demo'); await saved();
  assert.equal((await readRecord('mode')).demo, false);
  assert.deepEqual((await readRecord('real')).state, personal);
  await click('load-demo'); await saved();
  checks.push('Demo persists independently through reload and leaves the personal profile intact on exit.');
  const arithmetic = await js(`(async()=>{const m=await import('./model.mjs'),s=m.demoState();s.settings.salary=17400;s.settings.payDays=21.75;s.settings.payDaysMode='manual';s.settings.payDaysMonth='2026-11';s.days['2026-11-03'].settings.salary=17400;for(const d of Object.values(s.days)){d.settings.payDays=21.75;delete d.settings.payDaysMode;delete d.settings.payDaysMonth;}const d=m.dayStats(s,'2026-11-03',m.at('2026-11-03','18:00'));return {earned:d.earned,net:d.net,costs:d.expenses+d.fixed,actual:d.actual,report:m.monthlyReport(s,'2026-11',m.at('2026-11-03','18:00')).earned};})()`);
  assert.equal(arithmetic.earned, 800); assert.ok(Math.abs(arithmetic.net - (800-arithmetic.costs)) < 1e-8); assert.equal(arithmetic.report, 800+12000/21.75);
  await fixture("(()=>{const s=m.demoState();s.settings.salary=17400;s.settings.payDays=21.75;s.settings.payDaysMode='manual';s.settings.payDaysMonth='2026-11';s.days['2026-11-03'].settings.salary=17400;for(const d of Object.values(s.days)){d.settings.payDays=21.75;delete d.settings.payDaysMode;delete d.settings.payDaysMonth;}return s;})()");
  assert.equal(await js("document.getElementById('purchase-amount').value='2000';document.getElementById('purchase-amount').dispatchEvent(new Event('input'));document.getElementById('purchase-time').textContent"), '约 2.5 天');
  await click('open-calendar'); await click('calendar-report');
  assert.equal(await js("document.getElementById('monthly-dialog').open"), true);
  await js("document.querySelector('[data-close=monthly-dialog]').click();document.querySelector('[data-close=calendar-dialog]').click()");
  await click('fish-toggle'); await js("document.getElementById('break-form').requestSubmit()"); await saved();
  assert.equal((await readRecord('demo')).state.days['2026-11-03'].breaks.length, 2);
  await js("document.getElementById('display-mode').value='hidden';document.getElementById('display-mode').dispatchEvent(new Event('change'))"); await saved();
  assert.match(await js("document.getElementById('hero-amount').textContent"), /•/);
  assert.equal(await js("document.querySelector('.hero-art').dataset.mood"), 'private');
  checks.push('800 yuan full shift, net subtraction, monthly total, 2.5-day purchase conversion, calendar/report, manual breaks and hidden money verified.');
  await js("document.getElementById('display-mode').value='today';document.getElementById('display-mode').dispatchEvent(new Event('change'))"); await saved();
  for (const width of [320, 375, 390, 760, 1024, 1440]) {
    win.setContentSize(width, 920); await delay(120);
    const layout = await js(`(()=>{const selectors=['.hero','.shift-card','.finance-card','.quick-card','.fixed-overview-card','.goal-card','.fish-card','.purchase-card'];return {width:innerWidth,scroll:document.documentElement.scrollWidth,cards:selectors.map(s=>({s,left:document.querySelector(s).getBoundingClientRect().left,right:document.querySelector(s).getBoundingClientRect().right})),buttons:['work-toggle','fish-toggle','display-mode'].map(id=>({id,width:document.getElementById(id).getBoundingClientRect().width})),demo:getComputedStyle(document.getElementById('load-demo')).display};})()`);
    assert.ok(layout.scroll <= width, JSON.stringify(layout)); assert.ok(layout.cards.every(r=>r.left>=0&&r.right<=width+1),JSON.stringify(layout)); assert.ok(layout.buttons.every(b=>b.width>=40)); assert.notEqual(layout.demo,'none');
    assert.equal(await js("(()=>{const a=document.getElementById('hero-amount').getBoundingClientRect(),c=document.querySelector('.hero-art').getBoundingClientRect();return a.left<c.right&&a.right>c.left&&a.top<c.bottom&&a.bottom>c.top;})()"),false,'Amount and cat do not overlap');
    await js("document.querySelector('nav [data-view=settings]').click()");
    assert.ok(await js('document.documentElement.scrollWidth<=innerWidth'));
    await js("document.querySelector('nav [data-view=dashboard]').click()");
    await click('open-calendar'); await click('calendar-report'); assert.ok(await js("document.getElementById('monthly-dialog').getBoundingClientRect().right<=innerWidth"));
    await js("document.querySelector('[data-close=monthly-dialog]').click();document.querySelector('[data-close=calendar-dialog]').click()");
    if ([375,390].includes(width)) await capture(`dashboard-mobile-${width}`);
    checks.push(`Responsive dashboard, settings and monthly dialog fit ${width}px without horizontal overflow.`);
  }
  // A stale tab cannot silently overwrite newer data, even for mode switches.
  win.setContentSize(1280,1000); const second = new BrowserWindow({ ...options, show: false }); attach(second);
  await second.loadURL(base); await until("document.documentElement.dataset.ready==='true'", 'second tab', second);
  await js("document.getElementById('display-mode').value='month';document.getElementById('display-mode').dispatchEvent(new Event('change'))"); await saved();
  await second.webContents.executeJavaScript("document.getElementById('display-mode').value='goal';document.getElementById('display-mode').dispatchEvent(new Event('change'))");
  await until("document.getElementById('save-status').textContent.includes('其他标签页')", 'stale tab refusal', second);
  assert.equal((await readRecord('demo')).state.display,'month'); second.destroy();
  checks.push('Concurrent tab stale write is refused; newer stored display mode remains intact.');
  const original = await readRecord('demo');
  await js("new Promise(resolve=>{const r=indexedDB.open('wonangfei-web-v1',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('records','readwrite');t.objectStore('records').put({revision:999},'demo');t.oncomplete=()=>{db.close();resolve();};};})");
  win.reload(); await delay(150); await until("document.getElementById('mode-copy').textContent.includes('阻止覆盖')",'corruption refusal');
  assert.equal((await readRecord('demo')).revision,999);
  await until("document.getElementById('boot-screen').hidden",'loading ends on a handled database error');
  await js(`new Promise(resolve=>{const r=indexedDB.open('wonangfei-web-v1',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('records','readwrite');t.objectStore('records').put(${JSON.stringify(original)},'demo');t.oncomplete=()=>{db.close();resolve();};};})`); await reload();
  checks.push('Malformed stored record produces a visible error and is preserved without overwrite.');
  await fixture("(()=>{const s=m.demoState();s.demo={time:m.at('2026-11-03','09:00'),wall:Date.now()};s.days['2026-11-03'].breaks=[];return s;})()");
  assert.equal(await js("document.querySelector('.hero-art').dataset.mood"),'anxious'); await capture('negative-balance-desktop');
  await fixture('m.demoState()'); await capture('dashboard-desktop');
  assert.deepEqual(errors, []);
  const applicationRequests = requests.filter(r=>r.method!=='GET' || !r.url.startsWith(new URL(base).origin));
  assert.deepEqual(applicationRequests, []);
  const result = { timestamp: new Date().toISOString(), base, browser: process.versions.chrome, checks, consoleErrors: errors, nonStaticRequests: applicationRequests, data: 'fictional only; temporary isolated browser session', limitations: 'Chromium desktop engine at phone viewport widths; physical Safari/iPhone not tested' };
  await fs.writeFile(path.join(evidence, 'browser-results.json'),JSON.stringify(result,null,2)); console.log(JSON.stringify(result,null,2));
  win.destroy(); app.exit(0);
}).catch(async error => { console.error(error); await fs.mkdir(evidence,{recursive:true}); await fs.writeFile(path.join(evidence,'failure.txt'),String(error.stack)); app.exit(1); });
