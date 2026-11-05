const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path');
const out=process.env.WORKDAY_EVIDENCE_DIR,profile=process.env.WORKDAY_DATA_DIR;
if(!out||!profile)throw Error('Isolated profile and evidence required');
app.setPath('userData',path.join(profile,'chromium'));
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 const isolated=session.fromPartition('form-controls-'+Date.now());
 const win=new BrowserWindow({width:1380,height:960,show:true,webPreferences:{session:isolated,sandbox:true,contextIsolation:true,nodeIntegration:false}});
 const js=c=>win.webContents.executeJavaScript(c,true);
 await win.loadURL(process.env.BASE_URL||'http://127.0.0.1:4201');
 const store={save:s=>js(`(async()=>{const {browserStore}=await import('./browser-api.mjs');await browserStore.save(${JSON.stringify(s)});})()`)};
 await require('../../scripts/form-controls-smoke.cjs').run({win,store,root:path.resolve(__dirname,'../..'),web:true});
 win.destroy();app.exit(0);
}).catch(async e=>{console.error(e);await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'failure.txt'),e.stack);app.exit(1);});
