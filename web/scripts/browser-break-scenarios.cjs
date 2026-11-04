const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
exports.run = async ({ app, win, store, root }) => {
  const output = process.env.WORKDAY_EVIDENCE_DIR;
  if (!output || !process.env.WORKDAY_DATA_DIR) throw Error('Break smoke requires explicit isolated data and evidence directories');
  await fs.mkdir(output, { recursive:true });
  const checks=[],screenshots=[],errors=[];
  win.webContents.on('console-message', event => { if(event.level==='error')errors.push(event.message); });
  const js = code => win.webContents.executeJavaScript(code), click = id => js(`document.getElementById(${JSON.stringify(id)}).click()`);
  const content = id => js(`document.getElementById(${JSON.stringify(id)}).textContent`);
  async function until(code,label) { const end=Date.now()+10000;while(Date.now()<end){if(await js(code))return;await delay(50);}throw Error('Timeout: '+label); }
  const ready=()=>until("document.documentElement.dataset.ready==='true'",'bootstrap');
  const value=()=>js("Number(document.getElementById('break-minutes').value)");
  const set=number=>js(`(() => {const e=document.getElementById('break-minutes');e.value=${JSON.stringify(String(number))};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const submit=()=>js("document.getElementById('break-form').requestSubmit()");
  async function saved(){await until("!document.getElementById('break-dialog').open && document.getElementById('save-status').textContent==='已保存在此浏览器'",'break saved');await store.tail;}
  async function load(s){await store.save(s);await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.reload();});await ready();}
  async function screenshot(name){await js("document.getElementById('toast').hidden=true");await delay(100);await fs.writeFile(path.join(output,name+'.png'),(await win.webContents.capturePage()).toPNG());screenshots.push(name+'.png');}
  async function report(status,error){await fs.writeFile(path.join(output,'break-results.json'),JSON.stringify({status,error,checks,screenshots,consoleErrors:errors,platform:process.platform,arch:process.arch,macOS:process.getSystemVersion(),electron:process.versions.electron,input:'Chromium input protocol; no physical touch device tested',data:'temporary fictional profile only'},null,2));}
  const {emptyState,at,startWork,dayStats}=await import(pathToFileURL(path.join(root,'src/model.mjs')).href),key='2026-11-03';
  function fixture(date=key){const s=emptyState(new Date(at(date,'08:00')));s.onboarded=true;s.settings.salary=17600;s.settings.payDays=22;s.settings.payDaysMode='manual';s.demo={time:at(date,'15:00'),wall:Date.now()+3600000};startWork(s,at(date,'09:00'));return s;}
  let attached=false;
  try{
    await ready();app.focus({steal:true});win.show();win.focus();await load(fixture());await click('fish-toggle');assert.equal(await value(),15);
    assert.equal(await js("document.querySelector('#break-form input[type=date]')===null"),true);assert.match(await content('break-date-note'),/自动记入今天/);
    await screenshot('01-default-fifteen-minutes');
    await click('break-plus');assert.equal(await value(),20);await click('break-minus');assert.equal(await value(),15);
    checks.push('date input removed; default 15; accessible button clicks change by five exactly once');
    win.webContents.debugger.attach('1.3');attached=true;const cdp=(method,params)=>win.webContents.debugger.sendCommand(method,params);
    // Keep protocol input focused even when other local test windows activate.
    // Cancellation paths below still dispatch blur/cancel explicitly.
    await cdp('Emulation.setFocusEmulationEnabled',{enabled:true});
    const center=async id=>js(`(() => {const r=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    const mouse=async(type,point)=>cdp('Input.dispatchMouseEvent',{type,...point,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1});
    await js("window.__holdEvents=[];for(const type of ['pointerdown','pointerup','pointercancel','lostpointercapture','blur','focus'])document.getElementById('break-plus').addEventListener(type,e=>window.__holdEvents.push({type,t:performance.now(),visibility:document.visibilityState}));window.addEventListener('blur',()=>window.__holdEvents.push({type:'window-blur',t:performance.now()}));");
    app.focus({steal:true});win.focus();await delay(100);
    let point=await center('break-plus');await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',...point,button:'none',buttons:0});await mouse('mousePressed',point);assert.equal(await value(),20);await delay(450);let held=await value();
    await fs.writeFile(path.join(output,'hold-events.json'),JSON.stringify({held,events:await js('window.__holdEvents'),focused:win.isFocused(),visibility:await js('document.visibilityState')},null,2));
    assert.ok(held>=25,`held value ${held}; see hold-events.json`);
    await mouse('mouseReleased',{x:2,y:2});let released=await value();await delay(450);assert.equal(await value(),released);assert.equal(released,held);
    await screenshot('02-held-and-released');checks.push('real Chromium mouse down repeats; release outside button stops with no duplicate click');
    await set(15);point=await center('break-plus');await mouse('mousePressed',point);await delay(400);await js("window.dispatchEvent(new Event('blur'))");released=await value();await delay(450);assert.equal(await value(),released);await mouse('mouseReleased',point);
    await set(15);point=await center('break-plus');await mouse('mousePressed',point);await delay(400);await js("document.getElementById('break-plus').dispatchEvent(new PointerEvent('pointercancel'))");released=await value();await delay(450);assert.equal(await value(),released);await mouse('mouseReleased',point);
    checks.push('window blur and pointer cancellation terminate pending hold timers');
    await set(15);await js("document.getElementById('break-plus').focus()");
    await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});assert.equal(await value(),20);
    await delay(450);await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});released=await value();await delay(400);assert.equal(await value(),released);
    await set(15);await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});assert.equal(await value(),20);
    checks.push('keyboard Space hold and Enter tap adjust without scrolling, submitting or double increments');
    await set(15);await cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});point=await center('break-plus');
    await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,radiusX:1,radiusY:1,force:1}]});assert.equal(await value(),20);
    await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(150);assert.equal(await value(),20);
    await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,radiusX:1,radiusY:1,force:1}]});await delay(500);
    await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});released=await value();await delay(450);assert.equal(await value(),released);assert.ok(released>=30);
    await cdp('Emulation.setTouchEmulationEnabled',{enabled:false});checks.push('emulated touch tap increments once; long press repeats and touch release stops');
    await set(1);assert.equal(await js("document.getElementById('break-minus').disabled"),true);await click('break-minus');assert.equal(await value(),1);
    await set(1439);await click('break-plus');assert.equal(await value(),1440);assert.equal(await js("document.getElementById('break-plus').disabled"),true);
    for(const invalid of [0,1441,7.5,'']){await set(invalid);assert.equal(await js("document.getElementById('break-form').checkValidity()"),false);await submit();assert.equal((await store.load()).state.days[key].breaks.length,0);}
    checks.push('explicit 1–1440 integer bounds; lower/upper buttons disabled; invalid/empty/decimal values blocked by form and model');
    await set(7);await screenshot('03-seven-minute-input');await submit();await saved();assert.equal((await store.load()).state.days[key].breaks.at(-1).durationMs,420000);
    await click('fish-toggle');assert.equal(await value(),15);await set(400);await submit();await until("document.getElementById('break-error').textContent.includes('超出')",'capacity error');
    assert.equal((await store.load()).state.days[key].breaks.length,1);await screenshot('04-over-capacity');
    await set(90);await js("document.getElementById('break-kind').value='自定义';document.getElementById('break-kind').dispatchEvent(new Event('change'));document.getElementById('break-custom').value='伸个长长的懒腰'");
    await screenshot('05-ninety-minute-custom');await submit();await saved();let stored=(await store.load()).state;
    assert.equal(stored.days[key].breaks.at(-1).durationMs,5400000);assert.equal(stored.days[key].breaks.at(-1).name,'伸个长长的懒腰');assert.equal(stored.days[key].breaks.length,2);
    assert.equal(dayStats(stored,key,at(key,'15:00')).fish,97*60000);checks.push('direct 7 and 90 minute custom records save exactly; over-capacity input rejects without truncating or adding records');
    await load(stored);assert.equal((await store.load()).state.days[key].breaks.length,2);
    await click('fish-toggle');await set(15);point=await center('break-plus');await mouse('mousePressed',point);await delay(400);await js("document.getElementById('break-dialog').close()");released=await value();await delay(400);assert.equal(await value(),released);await mouse('mouseReleased',point);
    checks.push('closing dialog during hold cancels timer; reload preserves arbitrary minute durations');
    const overnight=fixture('2026-10-30');overnight.demo.time=at('2026-11-01','01:00');await load(overnight);await click('fish-toggle');
    assert.match(await content('break-date-note'),/跨日班次.*2026-10-30/);await screenshot('06-overnight-auto-date');await set(90);await submit();await saved();stored=(await store.load()).state;
    assert.equal(stored.days['2026-10-30'].breaks[0].durationMs,5400000);assert.deepEqual(Object.keys(stored.days),['2026-10-30']);checks.push('cross-midnight auto assignment follows original active shift and never creates a current-day wage record');
    assert.deepEqual(errors,[]);await report('passed');
  }catch(error){await report('failed',error.stack);throw error;}finally{if(attached&&win.webContents.debugger.isAttached())win.webContents.debugger.detach();}
};
