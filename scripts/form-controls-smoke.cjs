const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
exports.run=async({win,store,root,web=false})=>{
 const out=process.env.WORKDAY_EVIDENCE_DIR;await fs.mkdir(out,{recursive:true});
 const m=await import(require('node:url').pathToFileURL(path.join(root,'src/model.mjs')).href);
 const fixture=m.emptyState(new Date(m.at('2026-11-05','08:00')));fixture.onboarded=true;
 m.saveSettings(fixture,{...fixture.settings,salary:6000},'today',m.at('2026-11-05','08:00'));
 await store.save(fixture);await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload();});
 const js=c=>win.webContents.executeJavaScript(c,true),checks=[];
 for(let i=0;i<200&&!await js("document.documentElement.dataset.ready==='true'");i++)await delay(40);
 win.webContents.debugger.attach('1.3');
 const cdp=(method,args={})=>win.webContents.debugger.sendCommand(method,args);
 async function shot(name){await delay(80);await fs.writeFile(path.join(out,name+'.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));}
 async function key(key,modifiers=0){const codes={Enter:13,ArrowDown:40,ArrowUp:38,Escape:27,Tab:9};win.focus();win.webContents.focus();await cdp('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:codes[key],modifiers,...(key==='Enter'?{text:'\r'}:{})});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:codes[key],modifiers});await delay(90);}
 try{
  await cdp('Page.enable');
  await js("document.querySelector('nav [data-view=settings]').click();scrollTo(0,0)");
  const geometry=await js(`(()=>{const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom+scrollY,display:getComputedStyle(e).display}};return{viewport:{width:innerWidth,height:innerHeight},pageHeight:document.documentElement.scrollHeight,nodes:Object.fromEntries(['main','#settings-view','#settings-form','footer','#dashboard-view','#expenses-view','.app-info-bar'].map(s=>[s,document.querySelector(s)?rect(document.querySelector(s)):null])),large:[...document.querySelectorAll('body *')].map(e=>({id:e.id,tag:e.tagName,...rect(e)})).filter(e=>e.height>1400).slice(0,20)}})()`);
  await fs.writeFile(path.join(out,'settings-geometry.json'),JSON.stringify(geometry,null,2));
  await shot('settings-desktop');
  if(process.env.WORKDAY_SETTINGS_PROBE==='1')return;
  assert.equal(await js("CSS.supports('appearance','base-select')"),true);
  await js("document.getElementById('schedule-mode').focus()");
  const styles=await js("(()=>{const e=document.getElementById('schedule-mode'),s=getComputedStyle(e);return{appearance:s.appearance,outline:s.outlineStyle,border:s.borderTopColor,radius:getComputedStyle(e,'::picker(select)').borderTopLeftRadius};})()");
  assert.equal(styles.appearance,'base-select');assert.equal(styles.outline,'none');assert.equal(styles.border,'rgb(8, 121, 95)');assert.equal(styles.radius,'20px');
  await key('Enter');assert.equal(await js("document.getElementById('schedule-mode').matches(':open')"),true);
  await shot('dropdown-desktop');
  await key('ArrowDown');await key('Enter');
  assert.equal(await js("document.getElementById('schedule-mode').value"),'single');
  assert.equal(await js("document.activeElement.id"),'schedule-mode');
  checks.push('native select semantics with rounded picker; Enter, arrows and commit return focus to trigger');
  await key('Enter');await key('ArrowDown');await key('Escape');
  assert.equal(await js("document.getElementById('schedule-mode').matches(':open')"),false);
  assert.equal(await js("document.getElementById('schedule-mode').value"),'single');
  assert.equal(await js('document.activeElement.id'),'schedule-mode');
  await key('Tab');assert.notEqual(await js('document.activeElement.id'),'schedule-mode');
  checks.push('Escape cancels pending selection and returns focus; Tab continues through ordinary form order');
  await cdp('Accessibility.enable');
  const ax=await cdp('Accessibility.getFullAXTree');
  assert.ok(ax.nodes.some(n=>n.role?.value==='combobox'&&n.name?.value.includes('每周怎么上班')));
  checks.push('accessibility tree retains labeled combobox; no duplicated custom controls');
  await js("document.querySelector('[data-expense=自定义]').click()");
  await js("document.getElementById('expense-name').focus()");
  assert.equal(await js("getComputedStyle(document.getElementById('expense-name')).outlineStyle"),'none');
  assert.equal(await js("getComputedStyle(document.getElementById('expense-name')).borderTopColor"),'rgb(8, 121, 95)');
  await shot('input-focus-desktop');
  await js("document.querySelector('#expense-dialog .close-button').click()");
  assert.equal(await js("document.getElementById('expense-dialog').open"),false);
  checks.push('input focus uses own border and ordinary close button still closes dialog');
  for(const width of web?[390,320]:[900,760]){
   await cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:web});
   await js("document.querySelector('nav [data-view=settings]').click();scrollTo(0,0);document.getElementById('schedule-mode').focus()");
   await key('Enter');assert.equal(await js("document.getElementById('schedule-mode').matches(':open')"),true);
   const bounds=await js("[...document.querySelectorAll('#schedule-mode option')].map(e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom}})");
   assert.ok(bounds.every(r=>r.left>=0&&r.right<=width+1&&r.top>=0&&r.bottom<=844));
   assert.equal(await js('document.documentElement.scrollWidth>innerWidth'),false);
   await shot('dropdown-'+width);await key('Escape');
   await js("document.getElementById('settings-form').scrollIntoView({block:'end'})");
   await shot('settings-bottom-'+width);
  }
  await cdp('Emulation.clearDeviceMetricsOverride');
  checks.push((web?'320/390px':'760/900px')+' picker stays within viewport, long labels wrap and settings bottom remains accessible');
  await fs.writeFile(path.join(out,'form-controls-results.json'),JSON.stringify({status:'passed',checks,web,fictionalData:true},null,2));
 }catch(e){await shot('failure').catch(()=>{});await fs.writeFile(path.join(out,'form-controls-results.json'),JSON.stringify({status:'failed',checks,error:e.stack},null,2));throw e;}
 finally{win.webContents.debugger.detach();}
};
