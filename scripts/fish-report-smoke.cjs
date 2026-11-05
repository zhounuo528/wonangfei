const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
exports.run=async({win,store,root,web=false})=>{
  const out=process.env.WORKDAY_EVIDENCE_DIR;
  if(!out||!process.env.WORKDAY_DATA_DIR)throw Error('Explicit isolated directories required');
  await fs.mkdir(out,{recursive:true});
  const m=await import(pathToFileURL(path.join(root,'src/model.mjs')).href),stamp=m.at('2026-11-04','22:00'),checks=[],screenshots=[],errors=[];
  const js=code=>win.webContents.executeJavaScript(code,true),click=id=>js(`document.getElementById('${id}').click()`),text=id=>js(`document.getElementById('${id}').textContent`);
  async function until(code,label){for(let i=0;i<200;i++){if(await js(code))return;await delay(40);}throw Error('Timeout '+label);}
  async function saved(){await until(`document.getElementById('save-status').textContent===${JSON.stringify(web?'已保存在此浏览器':'已保存在本机')}`,'save');await store.tail;}
  async function change(id,value){await js(`{const e=document.getElementById('${id}');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));}`);}
  const close=()=>js("document.querySelectorAll('dialog[open]').forEach(d=>d.close())");
  let script;
  async function load(s){await close();await store.save(s);if(script)await win.webContents.debugger.sendCommand('Page.removeScriptToEvaluateOnNewDocument',{identifier:script});script=(await win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`{const D=Date;globalThis.Date=class extends D{constructor(...a){super(...(a.length?a:[${stamp}]));}static now(){return ${stamp};}};}`})).identifier;await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.reload();});await until("document.documentElement.dataset.ready==='true'",'ready');}
  async function capture(name,mobile=false){await delay(80);const data=mobile?Buffer.from((await win.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png'})).data,'base64'):(await win.webContents.capturePage()).toPNG();await fs.writeFile(path.join(out,name+'.png'),data);screenshots.push(name+'.png');}
  async function fit(){assert.equal(await js("document.documentElement.scrollWidth>innerWidth||[...document.querySelectorAll('dialog[open],dialog[open] .fish-recap,dialog[open] .fish-recap p')].some(e=>e.scrollWidth>e.clientWidth+1)"),false);}
  function fixture(){const s=m.emptyState(new Date(m.at('2026-11-01','08:00')));m.saveSettings(s,{...s.settings,salary:16800},'today',m.at('2026-11-01','08:00'));s.onboarded=true;for(const [date,minutes,end,fee]of [['2026-11-02',30,'18:00',null],['2026-11-03',60,'21:00',300]]){m.startWork(s,m.at(date,'09:00'));m.addCurrentBreak(s,{name:'虚拟休息',minutes},m.at(date,'16:00'));m.clockOut(s,m.at(date,end),fee?{kind:'paid',amount:fee}:undefined);}return s;}
  const report=async(status,error)=>fs.writeFile(path.join(out,'fish-report-results.json'),JSON.stringify({status,error,checks,screenshots,errors,web,data:'fictional isolated profile',published:false},null,2));
  win.webContents.on('console-message',(_e,...args)=>{const d=typeof args[0]==='object'?args[0]:{level:args[0],message:args[1]};if(d.level==='error'||d.level===3)errors.push(d.message);});
  win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Page.enable');
  try{
    await load(fixture());await click('show-summary');
    assert.equal(await text('summary-fish-recap'),'你今天累计摸鱼 1 小时，成功赚到 ¥100.00（估算）。');assert.equal(await text('summary-earned'),'¥1,100.00');assert.equal(await text('summary-fish'),'01:00:00');
    assert.match(await text('summary-fish-note'),/工资毛收入.*另记加班费.*上班总时长/);await fit();await capture('01-clockout-fish');checks.push('legacy-shaped clock-out summary derives fish pay; gross remains 1100 including single 300 fee');
    await close();await click('open-calendar');await click('calendar-report');await saved();assert.equal(await text('report-fish-recap'),'你本月累计摸鱼 1 小时 30 分钟，成功赚到 ¥150.00（估算）。');assert.equal(await text('report-earned'),'¥1,900.00');await capture('02-monthly-fish');checks.push('monthly report sums daily estimates 50+100, without adding them to 1900 gross');
    await change('report-period','week');assert.equal(await text('report-fish-recap'),'你本周累计摸鱼 1 小时 30 分钟，成功赚到 ¥150.00（估算）。');await fit();await capture('03-weekly-fish');checks.push('weekly switch scopes duration and earnings consistently');
    for(const width of [390,320]){await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});await fit();await capture(`04-weekly-${width}`,true);}await win.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');checks.push('390px and 320px report text wraps without horizontal overflow');
    await close();await change('display-mode','hidden');await saved();await click('show-summary');assert.match(await text('summary-fish-recap'),/赚到 ••••（估算）/);assert.equal(await text('summary-earned'),'••••');await capture('05-private-summary');
    await close();await click('calendar-report');assert.match(await text('report-fish-recap'),/赚到 ••••（估算）/);assert.equal(await text('report-earned'),'••••');checks.push('privacy hides fish earnings as well as gross in summaries and reports');
    await close();const s=fixture();s.days['2026-11-03'].breaks=[];await load(s);await click('show-summary');assert.equal(await text('summary-fish-recap'),'你今天累计摸鱼 0 分钟，成功赚到 ¥0.00（估算）。');assert.equal(await text('summary-actual'),'11:00:00');assert.equal(await text('summary-hourly'),'¥100.00 / 小时');checks.push('deleted records refresh old summary without migration or stale fish amount');
    await close();const empty=fixture();for(const d of Object.values(empty.days))d.breaks=[];await load(empty);await click('open-calendar');await click('calendar-report');assert.equal(await text('report-fish-recap'),'你本月累计摸鱼 0 分钟，成功赚到 ¥0.00（估算）。');await saved();await capture('06-zero-fish');checks.push('zero records show zero duration and two-decimal zero earnings');
    const final=(await store.load()).state;m.validateState(final);assert.equal(final.version,empty.version);assert.deepEqual(final.days,empty.days);checks.push('report viewing persists only normal report snapshot, retaining wage records and data format');
    assert.deepEqual(errors,[]);await report('passed');
  }catch(error){await capture('failure').catch(()=>{});await report('failed',error.stack);throw error;}finally{if(win.webContents.debugger.isAttached())win.webContents.debugger.detach();}
};
