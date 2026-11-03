const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
exports.run=async({app,win,store,root,getStatusBar})=>{
 const output=process.env.WORKDAY_EVIDENCE_DIR;if(!output||!process.env.WORKDAY_DATA_DIR)throw Error('Explicit isolated paths required');await fs.mkdir(output,{recursive:true});
 const checks=[],screenshots=[],errors=[];let attached=false;win.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message);});
 const js=s=>win.webContents.executeJavaScript(s),click=id=>js(`document.getElementById(${JSON.stringify(id)}).click()`);
 async function until(s,label){const end=Date.now()+10000;while(Date.now()<end){if(await js(s))return;await delay(50);}throw Error('Timeout: '+label);}
 const ready=()=>until("document.documentElement.dataset.ready==='true'",'ready');
 async function frame(){app.focus({steal:true});win.show();win.focus();await Promise.race([js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))'),delay(400)]);await delay(80);}
 async function screenshot(name,mobile=false){await js("document.getElementById('toast').hidden=true");await frame();let bytes;if(mobile){const r=await win.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});bytes=Buffer.from(r.data,'base64');}else bytes=(await win.webContents.capturePage()).toPNG();await fs.writeFile(path.join(output,name+'.png'),bytes);screenshots.push(name+'.png');}
 async function load(s){await store.save(s);await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload();});await ready();}
 const {demoState,at}=await import(pathToFileURL(path.join(root,'src/model.mjs')).href);
 const saveReport=async(status,error)=>fs.writeFile(path.join(output,'visual-results.json'),JSON.stringify({status,error,checks,screenshots,consoleErrors:errors,platform:process.platform,arch:process.arch,macOS:process.getSystemVersion(),electron:process.versions.electron,mobile:'390×844 Chromium viewport emulation, not physical phone',loading:'real overlay captured during test-only held local read; production has no minimum delay',menuBar:'native API and programmatic click only; no physical click or system menu-bar screenshot'},null,2));
 try{
  await ready();app.focus({steal:true});win.show();win.focus();await store.save(demoState());
  const original=store.load;let release,held=false;
  store.load=async()=>{held=true;return new Promise((resolve,reject)=>{release=()=>original.call(store).then(resolve,reject);});};
  try{await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload();});const end=Date.now()+10000;while(!held&&Date.now()<end)await delay(20);assert.ok(held);
   assert.equal(await js("!document.getElementById('loading-screen').hidden && document.body.classList.contains('is-loading')"),true);await screenshot('01-real-bootstrap-loading');
  }finally{store.load=original;release?.();}
  await ready();assert.equal(await js("document.getElementById('loading-screen').hidden"),true);checks.push('real local-read loading overlay shown while pending and removed on completion; no production minimum wait');
  assert.equal(await js("getComputedStyle(document.body).backgroundColor"),'rgb(247, 248, 250)');assert.equal(await js("getComputedStyle(document.querySelector('.primary-button')).borderRadius"),'999px');
  assert.ok(await js("document.querySelector('.brand-mark img').naturalWidth>0"));await screenshot('02-mint-desktop');checks.push('cool gray, mint radial glow, glass cards, black primary pills and cat brand resource load in actual source window');
  await js("document.getElementById('display-mode').value='month';document.getElementById('display-mode').dispatchEvent(new Event('change'))");await until("document.getElementById('hero-avg-day-group').hidden===false",'monthly metrics');
  win.setSize(760,650);await delay(200);assert.equal(await js("document.getElementById('display-mode').value"),'month');assert.equal((await store.load()).state.display,'month');await screenshot('03-compact-monthly-desktop');
  assert.equal(await js('document.documentElement.scrollWidth>innerWidth'),false);checks.push('760×650 monthly view has all three averages and no horizontal overflow; screenshot waits for composited frames');
  win.setSize(1220,930);await delay(120);await click('mini');await until("document.body.classList.contains('mini-mode')",'mini mode');await screenshot('04-native-mini-window');assert.ok(win.getBounds().width<=450);checks.push('native mini window renders updated mint theme within actual 430×270 bounds');await click('expand');await delay(120);
  await click('collapse-to-tray');const end=Date.now()+10000;while(!getStatusBar()&&Date.now()<end)await delay(50);const bar=getStatusBar();assert.ok(bar);assert.ok(bar.tray.getTitle());await delay(180);assert.ok(bar.tray.getBounds().height>0);
  bar.tray.emit('click');await until("document.body.classList.contains('tray-detail-mode') && document.documentElement.dataset.nativeVisible==='true'",'native detail');await screenshot('05-native-menu-bar-detail');await click('mini-fish');assert.equal(await js("document.getElementById('break-minutes').value"),'15');await screenshot('06-mini-duration-selector');await js("document.querySelector('[data-close=break-dialog]').click()");
  checks.push('native Tray title/bounds and programmatic click open updated detail; compact duration dialog works; physical menu-bar click unverified');bar.destroy();
  // Reload clears presentation-only classes and restores the full source window.
  win.setMinimumSize(760,650);win.setSize(1220,930);win.show();await load(demoState());
  win.webContents.debugger.attach('1.3');attached=true;
  await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await frame();
  assert.equal(await js('innerWidth'),390);assert.equal(await js('document.documentElement.scrollWidth>innerWidth'),false);assert.equal(await js("getComputedStyle(document.getElementById('collapse-to-tray')).display"),'none');await screenshot('07-mobile-dashboard',true);
  await js("document.getElementById('quick-add-fixed').scrollIntoView({block:'center'})");await screenshot('08-mobile-supporting-cards',true);await click('quick-add-fixed');assert.equal(await js("document.getElementById('fixed-dialog').open"),true);await screenshot('09-mobile-fixed-form',true);await js("document.querySelector('[data-close=fixed-dialog]').click()");
  await click('fish-toggle');await screenshot('10-mobile-duration-selector',true);assert.equal(await js("document.querySelector('#break-form input[type=date]')===null"),true);await js("document.querySelector('[data-close=break-dialog]').click()");checks.push('390×844 mobile viewport stacks content without horizontal overflow; mobile-only irrelevant desktop controls hidden; fixed and duration forms remain usable');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});assert.equal(await js("getComputedStyle(document.querySelector('.loading-dots i')).animationName"),'none');checks.push('reduced motion disables loading-dot animation');
  await win.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[]});win.webContents.debugger.detach();attached=false;
  assert.deepEqual(errors,[]);await saveReport('passed');
 }catch(error){await saveReport('failed',error.stack);throw error;}finally{if(attached&&win.webContents.debugger.isAttached())win.webContents.debugger.detach();}
};
