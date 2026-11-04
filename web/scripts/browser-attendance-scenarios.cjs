const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
exports.run=async({app,win,store,root})=>{
 const output=process.env.WORKDAY_EVIDENCE_DIR;if(!output||!process.env.WORKDAY_DATA_DIR)throw Error('Explicit isolated data and evidence paths required');await fs.mkdir(output,{recursive:true});
 const checks=[],screenshots=[],errors=[];win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
 const js=code=>win.webContents.executeJavaScript(code),click=id=>js(`document.getElementById(${JSON.stringify(id)}).click()`),text=id=>js(`document.getElementById(${JSON.stringify(id)}).textContent`);
 async function until(code,label){const end=Date.now()+10000;while(Date.now()<end){if(await js(code))return;await delay(50);}throw Error('Timeout: '+label);}
 const ready=()=>until("document.documentElement.dataset.ready==='true'",'ready');
 const change=(id,value)=>js(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const fields=values=>js(`(()=>{const f=document.getElementById('settings-form');for(const [key,value]of Object.entries(${JSON.stringify(values)}))f.elements[key].value=value;})()`);
 const selected=()=>js("[...document.querySelectorAll('#weekdays input:checked')].map(e=>Number(e.value))");
 const submit=()=>js("document.getElementById('settings-form').requestSubmit()");
 async function saved(){await until("document.getElementById('save-status').textContent==='已保存在此浏览器'",'saved');await store.tail;}
 async function load(s){await store.save(s);await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.reload();});await ready();}
 async function settings(){await js("document.querySelector('nav [data-view=settings]').click()");}
 async function screenshot(name,mobile=false){app.focus({steal:true});win.show();win.focus();await js("document.getElementById('toast').hidden=true");await Promise.race([js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'),delay(400)]);await delay(80);const bytes=mobile?Buffer.from((await win.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'):(await win.webContents.capturePage()).toPNG();await fs.writeFile(path.join(output,name+'.png'),bytes);screenshots.push(name+'.png');}
 const {emptyState,at,addFixed,addExpense,monthlyReport,dayStats,validateState}=await import(pathToFileURL(path.join(root,'src/model.mjs')).href),key='2028-02-05';
 const report=async(status,error)=>fs.writeFile(path.join(output,'attendance-results.json'),JSON.stringify({status,error,checks,screenshots,consoleErrors:errors,platform:process.platform,arch:process.arch,macOS:process.getSystemVersion(),electron:process.versions.electron,data:'isolated fictional states only; no personal profile read'},null,2));
 try{
  await ready();app.focus({steal:true});win.show();win.focus();let s=emptyState(new Date(at('2028-02-01','08:00')));s.demo={time:at(key,'08:30'),wall:Date.now()+3600000};await load(s);
  assert.deepEqual(await js("[...document.getElementById('schedule-mode').options].map(e=>e.value)"),['double','single','alternating','996','everyday']);
  await change('pay-days-mode','manual');await fields({salary:'17600',payDays:'22'});await change('schedule-mode','996');assert.deepEqual(await selected(),[1,2,3,4,5,6]);
  assert.equal(await js("document.getElementById('settings-form').elements.start.value"),'09:00');assert.equal(await js("document.getElementById('settings-form').elements.end.value"),'21:00');assert.equal(await js("document.getElementById('settings-form').elements.payDays.value"),'22');
  await screenshot('01-996-default-settings');await fields({start:'08:30',end:'20:30'});await submit();await saved();let stored=(await store.load()).state;
  assert.equal(stored.onboarded,true);assert.equal(stored.settings.scheduleMode,'996');assert.equal(stored.settings.end,'20:30');assert.equal(stored.settings.payDays,22);
  await click('work-toggle');await saved();assert.equal((await store.load()).state.days[key].settings.start,'08:30');
  stored=(await store.load()).state;stored.demo.time=at(key,'20:30');await load(stored);assert.equal(await text('hero-amount'),'800.00');await click('work-toggle');await until("document.getElementById('summary-dialog').open",'996 Saturday summary');assert.equal(await text('summary-earned'),'¥800.00');await js("document.querySelector('[data-close=summary-dialog]').click()");
  await settings();assert.equal(await js("document.getElementById('settings-form').elements.start.value"),'08:30');assert.equal(await js("document.getElementById('settings-form').elements.end.value"),'20:30');checks.push('five options retained; selecting 996 defaults Mon–Sat 09–21; custom hours persist and Saturday earns exactly one configured daily wage');

  stored=(await store.load()).state;addFixed(stored,{name:'旧房租',amount:2500,period:'month',allocation:'workday'},'2028-02-01');addExpense(stored,{name:'旧整月花销',amount:1250,date:'2028-02-01',month:'2028-02',scope:'month',category:'自定义'});await load(stored);await settings();
  const before=structuredClone((await store.load()).state);await change('schedule-mode','everyday');assert.deepEqual(await selected(),[0,1,2,3,4,5,6]);assert.equal(await js("[...document.querySelectorAll('#weekdays input')].every(e=>e.disabled)"),true);
  assert.equal(await js("document.getElementById('settings-form').elements.start.value"),'08:30');assert.equal(await js("document.getElementById('settings-form').elements.end.value"),'20:30');
  await fields({start:'10:00',end:'19:00'});await screenshot('02-everyday-custom-settings');await submit();await saved();stored=(await store.load()).state;
  assert.equal(stored.settings.scheduleMode,'everyday');assert.deepEqual(stored.settings.weekdays,[0,1,2,3,4,5,6]);assert.equal(stored.settings.start,'10:00');assert.equal(stored.settings.payDays,22);
  for(const field of ['days','fixed','expenses'])assert.deepEqual(stored[field],before[field]);assert.match(await text('settings-feedback'),/已有日期和已保存分摊表保持原口径/);
  checks.push('year-round selects and locks all seven weekdays; disabled controls serialize correctly; hours remain editable; saved days and existing cost tables unchanged');

  stored.demo.time=at('2028-02-06','10:00');await load(stored);await click('quick-add-fixed');await js("document.getElementById('fixed-form').elements.name.value='新每日计划';document.getElementById('fixed-form').elements.amount.value='2900';document.getElementById('fixed-form').requestSubmit()");await saved();
  await js("document.querySelector('[data-expense=自定义]').click();const f=document.getElementById('expense-form');f.elements.name.value='新整月花销';f.elements.amount.value='1450';document.getElementById('expense-scope').value='month';document.getElementById('expense-scope').dispatchEvent(new Event('change'));f.requestSubmit()");await saved();
  await click('work-toggle');await saved();stored=(await store.load()).state;assert.equal(stored.days['2028-02-06'].settings.scheduleMode,'everyday');assert.equal(stored.fixed.at(-1).settings.scheduleMode,'everyday');assert.equal(stored.expenses.at(-1).allocationDates.length,29);assert.equal(stored.expenses[0].allocationDates.length,25);
  assert.equal(dayStats(stored,'2028-02-06',at('2028-02-06','10:00')).fixed,100);assert.equal(dayStats(stored,'2028-02-06',at('2028-02-06','10:00')).expenses,50);
  stored.demo.time=at('2028-02-06','19:00');await load(stored);await click('work-toggle');await until("document.getElementById('summary-dialog').open",'Sunday summary');assert.equal(await text('summary-earned'),'¥800.00');
  stored=(await store.load()).state;const month=monthlyReport(stored,'2028-02',at('2028-02-06','19:00'));assert.equal(month.recorded,2);assert.equal(month.earned,1600);assert.equal(month.costs,1150);await js("document.querySelector('[data-close=summary-dialog]').click()");
  await click('open-calendar');await click('calendar-report');assert.equal(await text('report-earned'),'¥1,600.00');await screenshot('03-mixed-schedules-monthly-report');await js("document.querySelector('[data-close=monthly-dialog]').click();document.querySelector('[data-close=calendar-dialog]').click()");
  checks.push('year-round Sunday wage and new fixed/monthly costs use leap-February 29 days; old 996 table remains 25; month report counts two actual records only');

  const historical=structuredClone((await store.load()).state);await settings();await change('schedule-mode','double');assert.deepEqual(await selected(),[1,2,3,4,5]);assert.equal(await js("[...document.querySelectorAll('#weekdays input')].every(e=>!e.disabled)"),true);
  await change('schedule-mode','single');assert.deepEqual(await selected(),[1,2,3,4,5,6]);await change('schedule-mode','alternating');assert.equal(await js("document.getElementById('alternating-settings').hidden"),false);await fields({anchorWeek:'2028-01-31',anchorKind:'double'});await submit();await saved();stored=(await store.load()).state;
  assert.equal(stored.settings.scheduleMode,'alternating');for(const field of ['days','fixed','expenses'])assert.deepEqual(stored[field],historical[field]);assert.equal(monthlyReport(stored,'2028-02',at('2028-02-06','19:00')).earned,1600);
  await load(stored);await settings();assert.equal(await js("document.getElementById('schedule-mode').value"),'alternating');validateState((await store.load()).state);checks.push('switching back to all three prior modes restores editable weekdays and alternating controls, without touching historical records or allocation tables; reload preserves selection');

  const persisted=JSON.stringify((await store.load()).state);await change('schedule-mode','996');await fields({lunchStart:'22:00',lunchEnd:'22:30'});await submit();assert.match(await text('settings-feedback'),/午休须/);assert.equal(JSON.stringify((await store.load()).state),persisted);
  await fields({lunchStart:'12:00',lunchEnd:'13:00'});await submit();await saved();stored=(await store.load()).state;assert.equal(stored.settings.scheduleMode,'996');assert.equal(stored.settings.end,'21:00');checks.push('incompatible custom lunch is rejected before saving; corrected lunch saves 996 successfully with original data retained');
  await settings();win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(100);assert.equal(await js('document.documentElement.scrollWidth>innerWidth'),false);await screenshot('04-mobile-attendance-settings',true);await win.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');win.webContents.debugger.detach();checks.push('new mode selector and seven-day controls fit a 390-pixel emulated mobile viewport');
  assert.deepEqual(errors,[]);await report('passed');
 }catch(error){await report('failed',error.stack);throw error;}finally{if(win.webContents.debugger.isAttached())win.webContents.debugger.detach();}
};
