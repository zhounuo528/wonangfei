const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
exports.run=async({win,store,root})=>{
 const output=process.env.WORKDAY_EVIDENCE_DIR,checks=[],screenshots=[];
 const js=code=>win.webContents.executeJavaScript(code),click=id=>js(`document.getElementById(${JSON.stringify(id)}).click()`);
 async function until(code,label){const end=Date.now()+10000;while(Date.now()<end){if(await js(code))return;await delay(50);}throw Error('Timeout '+label);}
 const {emptyState,at,startWork}=await import(pathToFileURL(path.join(root,'src/model.mjs')).href);
 const s=emptyState(new Date(at('2026-11-03','08:00')));s.onboarded=true;s.settings.salary=17600;s.settings.payDays=22;s.settings.payDaysMode='manual';s.demo={time:at('2026-11-03','20:01'),wall:Date.now()+3600000};startWork(s,at('2026-11-03','09:00'));
 const close=id=>js(`document.querySelector('[data-close=${id}]').click()`);
 async function shot(name){await delay(100);await fs.writeFile(path.join(output,name+'.png'),(await win.webContents.capturePage()).toPNG());screenshots.push(name+'.png');}
 async function fits(id){const r=await js(`(()=>{const d=document.getElementById(${JSON.stringify(id)}),r=d.getBoundingClientRect();return {open:d.open,left:r.left,right:r.right,scroll:d.scrollWidth,client:d.clientWidth,width:innerWidth,body:document.documentElement.scrollWidth};})()`);assert.ok(r.open&&r.left>=-1&&r.right<=r.width+1&&r.scroll<=r.client+1&&r.body<=r.width+1,JSON.stringify({id,...r}));}
 try{
  await until("document.documentElement.dataset.ready==='true'",'initial');await store.save(s);await new Promise(r=>{win.webContents.once('did-finish-load',r);win.reload();});await until("document.documentElement.dataset.ready==='true'",'fixture');
  for(const width of [320,375,390,760,1024,1440]){
   win.setContentSize(width,920);await delay(120);await js('window.scrollTo(0,0)');assert.equal(await js('document.documentElement.scrollWidth>innerWidth'),false,`dashboard ${width}`);
   if(width===390)await shot('01-mobile-overtime-dashboard');
   for(const [button,dialog] of [['correct-start','correction-dialog'],['quick-add-fixed','fixed-dialog'],['edit-goal','goal-dialog'],['fish-toggle','break-dialog']]){
    await click(button);await fits(dialog);if(width===390&&dialog==='correction-dialog')await shot('02-mobile-time-correction');await close(dialog);
   }
   await click('work-toggle');await fits('overtime-fee-dialog');await click('overtime-paid');await fits('overtime-fee-dialog');if(width===390)await shot('03-mobile-overtime-fee');await close('overtime-fee-dialog');
   await click('open-calendar');await fits('calendar-dialog');await click('calendar-report');await fits('monthly-dialog');if(width===390)await shot('04-mobile-monthly-report');await close('monthly-dialog');await close('calendar-dialog');
   checks.push(`${width}px dashboard and eight dialog states stay within viewport without horizontal overflow`);
  }
  assert.equal((await store.load()).state.days['2026-11-03'].sessions[0].end,null);
  await fs.writeFile(path.join(output,'responsive-results.json'),JSON.stringify({status:'passed',checks,screenshots,viewports:[320,375,390,760,1024,1440],data:'isolated fictional profile only',limitation:'Chromium responsive viewports; no physical mobile Safari tested'},null,2));
 }catch(error){await fs.writeFile(path.join(output,'responsive-results.json'),JSON.stringify({status:'failed',checks,error:String(error.stack)},null,2));throw error;}
};
