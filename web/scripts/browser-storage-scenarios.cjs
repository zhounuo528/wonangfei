// Real browser storage/backup regression; fictional fixtures in a fresh partition.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
exports.run=async({win,store,root})=>{
 const output=process.env.WORKDAY_EVIDENCE_DIR,checks=[];
 const js=code=>win.webContents.executeJavaScript(code),click=id=>js(`document.getElementById(${JSON.stringify(id)}).click()`);
 async function until(code,label){const end=Date.now()+10000;while(Date.now()<end){if(await js(code))return;await delay(50);}throw Error('Timeout '+label);}
 const ready=()=>until("document.documentElement.dataset.ready==='true'",'ready');
 async function reload(){await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload();});await ready();}
 const raw=key=>js(`new Promise((resolve,reject)=>{const r=indexedDB.open('wonangfei-web-v1',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,t=db.transaction('records'),q=t.objectStore('records').get(${JSON.stringify(key)});q.onsuccess=()=>resolve(q.result);t.oncomplete=()=>db.close();};})`);
 const upload=json=>js(`(()=>{const t=new DataTransfer();t.items.add(new File([${JSON.stringify(json)}],'fictional-backup.json',{type:'application/json'}));const e=document.getElementById('backup-file');e.files=t.files;e.dispatchEvent(new Event('change'));})()`);
 const model=await import(pathToFileURL(path.join(root,'src/model.mjs')).href),{emptyState,demoState,at,dateKey,startWork,clockOut,correctStartTime,saveGoal,settleGoal,goalStats,monthlyReport,saveMonthlyReview}=model;
 try{
  await ready();
  const demo=demoState();await store.save(demo);const originalDemo=await raw('demo');
  const legacy=emptyState(new Date(at('2026-10-30','08:00')));legacy.onboarded=true;legacy.settings.salary=17600;legacy.settings.payDays=22;legacy.settings.payDaysMode='manual';
  startWork(legacy,at('2026-10-30','09:00'));clockOut(legacy,at('2026-10-30','18:00'));legacy.goal={name:'旧档案目标',amount:5000,period:'month'};
  delete legacy.settings.scheduleMode;
  await store.save(legacy);await reload();const upgraded=await raw('real');
  assert.deepEqual(upgraded.state.days,legacy.days);assert.equal(upgraded.state.goal.name,legacy.goal.name);assert.equal(upgraded.state.goal.amount,5000);
  assert.deepEqual(upgraded.state.goalPool.legacyGoal,legacy.goal);assert.equal(upgraded.state.goalPool.from,dateKey(new Date()));
  assert.equal(goalStats(upgraded.state,Date.now()).pool,0);assert.deepEqual(await raw('demo'),originalDemo);
  await reload();await delay(1200);assert.deepEqual(await raw('real'),upgraded);
  checks.push('legacy personal profile upgrades once in real IndexedDB; goal name/amount/history retained, old income excluded, demo unchanged, reload does not rewrite');

  const rich=emptyState(new Date(at('2026-10-30','08:00')));rich.onboarded=true;rich.settings.salary=17600;rich.settings.payDays=22;rich.settings.payDaysMode='manual';
  saveGoal(rich,{name:'完整备份目标',amount:500},at('2026-10-30','09:00'));startWork(rich,at('2026-10-30','10:00'));
  clockOut(rich,at('2026-10-30','20:01'),{kind:'paid',amount:200});saveMonthlyReview(rich,monthlyReport(rich,'2026-10',at('2026-10-30','20:02')),true);
  correctStartTime(rich,{date:'2026-10-30',sessionIndex:0,start:at('2026-10-30','09:00')},at('2026-10-30','20:03'));settleGoal(rich,at('2026-10-30','20:03'));
  rich.goal.notifiedAt=at('2026-10-30','20:04');await store.save(rich);await reload();
  const backupPath=path.join(output,'fictional-full-backup.json');let downloaded;
  win.webContents.session.once('will-download',(_event,item)=>{item.setSavePath(backupPath);item.once('done',(_e,status)=>{downloaded=status;});});
  await js("document.querySelector('nav [data-view=settings]').click()");await click('export-data');
  for(let i=0;i<100&&!downloaded;i++)await delay(50);assert.equal(downloaded,'completed');
  const backup=JSON.parse(await fs.readFile(backupPath,'utf8'));assert.deepEqual(backup.state,rich);
  const changed=structuredClone(rich);changed.settings.salary=22000;await store.save(changed);await reload();
  await upload(JSON.stringify(backup));await until("document.getElementById('confirm-dialog').open",'import confirm');await click('confirm-ok');
  await until("document.getElementById('toast').textContent.includes('备份已导入')",'import done');
  assert.deepEqual((await raw('real')).state,rich);assert.deepEqual(await raw('demo'),originalDemo);await reload();assert.deepEqual((await raw('real')).state,rich);
  checks.push('real JSON download and confirmed UI import preserve paid fee, timestamp audit, goal settlement and saved report cutoff/delivered flags; opposite profile unchanged after reload');

  const beforeInvalid=await raw('real');await upload('{not json}');await until("document.getElementById('toast').textContent.includes('无法导入')",'invalid rejected');
  assert.deepEqual(await raw('real'),beforeInvalid);
  await js("(async()=>{const {browserApi}=await import('./browser-api.mjs');window.__originalSave=browserApi.save;browserApi.save=()=>Promise.reject(Error('测试：导入写入失败'));})()");
  await upload(JSON.stringify({format:'wonangfei-backup',state:changed}));await until("document.getElementById('confirm-dialog').open",'failure confirm');await click('confirm-ok');
  await until("document.getElementById('toast').textContent.includes('导入失败')",'import rejected');assert.deepEqual(await raw('real'),beforeInvalid);
  assert.equal(await js("Number(document.getElementById('settings-form').elements.salary.value)"),rich.settings.salary);
  await js("(async()=>{const {browserApi}=await import('./browser-api.mjs');browserApi.save=window.__originalSave;delete window.__originalSave;})()");
  checks.push('malformed backup and failed import leave both persisted profile and current settings intact');

  // Throw on the second put after the profile put has been queued. Both records
  // must roll back together, including synchronous quota/serialization errors.
  const beforeAtomic={real:await raw('real'),mode:await raw('mode')};
  const failure=await js(`(async()=>{const {browserApi}=await import('./browser-api.mjs');const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,key){if(this.name==='records'&&key==='mode')throw new DOMException('测试：第二条记录写入失败','QuotaExceededError');return original.call(this,value,key);};try{await browserApi.save(${JSON.stringify(changed)});return null;}catch(e){return e.message;}finally{IDBObjectStore.prototype.put=original;}})()`);
  assert.match(failure,/第二条/);await delay(100);assert.deepEqual(await raw('real'),beforeAtomic.real);assert.deepEqual(await raw('mode'),beforeAtomic.mode);
  assert.equal(await js("(async()=>{const {browserApi}=await import('./browser-api.mjs');return browserApi.pending;})()"),0);
  await js(`(async()=>{const {browserApi}=await import('./browser-api.mjs');await browserApi.save(${JSON.stringify(changed)});})()`);
  assert.deepEqual((await raw('real')).state,changed);assert.deepEqual(await raw('demo'),originalDemo);await reload();
  assert.equal(await js("Number(document.getElementById('settings-form').elements.salary.value)"),22000);
  checks.push('synchronous second-record write failure atomically rolls back profile and mode; pending count returns to zero; retry succeeds without stale revisions');
  for(const mode of ['996','everyday']){
   const state=structuredClone(changed);state.settings.scheduleMode=mode;state.settings.weekdays=mode==='996'?[1,2,3,4,5,6]:[0,1,2,3,4,5,6];state.settings.end='21:00';
   await store.save(state);await reload();assert.deepEqual((await raw('real')).state,state);
   const file=path.join(output,`fictional-${mode}-backup.json`);let status;
   win.webContents.session.once('will-download',(_event,item)=>{item.setSavePath(file);item.once('done',(_e,result)=>{status=result;});});
   await js("document.querySelector('nav [data-view=settings]').click()");await click('export-data');for(let i=0;i<100&&!status;i++)await delay(50);assert.equal(status,'completed');
   const json=await fs.readFile(file,'utf8');assert.deepEqual(JSON.parse(json).state,state);
   await store.save(changed);await reload();await upload(json);await until("document.getElementById('confirm-dialog').open",`${mode} confirm`);await click('confirm-ok');
   await until("document.getElementById('toast').textContent.includes('备份已导入')",`${mode} imported`);await reload();
   assert.deepEqual((await raw('real')).state,state);assert.deepEqual(await raw('demo'),originalDemo);assert.equal(await js("document.getElementById('schedule-mode').value"),mode);
   assert.deepEqual(state.days,changed.days);
  }
  checks.push('996 and year-round each survive real JSON download, confirmed import and reload; old shift definitions and separate demo profile remain exact');
  await fs.writeFile(path.join(output,'storage-results.json'),JSON.stringify({status:'passed',checks,storage:'real IndexedDB',data:'isolated fictional profiles only',download:'fictional-full-backup.json'},null,2));
 }catch(error){await fs.writeFile(path.join(output,'storage-results.json'),JSON.stringify({status:'failed',checks,error:String(error.stack)},null,2));throw error;}
};
