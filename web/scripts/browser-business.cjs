// Browser transport for the reviewed fixed-snapshot business scenarios.
// The page has no preload, Node integration, native storage, or Electron bridge.
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const suite = process.env.BROWSER_SUITE || 'iteration';
if (!['iteration','break','correction','storage','responsive','attendance','paydays'].includes(suite)) throw Error('Unknown business suite');
const evidence = path.join(root,'evidence',`browser-${suite}`);
process.env.WORKDAY_EVIDENCE_DIR = evidence;
process.env.WORKDAY_DATA_DIR = path.join(root,'.test-browser',`browser-${suite}`);
app.setPath('userData',process.env.WORKDAY_DATA_DIR);
app.commandLine.appendSwitch('no-proxy-server');
app.on('window-all-closed',()=>{});
const base=process.env.BASE_URL||'http://127.0.0.1:4173';
app.whenReady().then(async()=>{
  await fs.mkdir(evidence,{recursive:true});
  await fs.rm(path.join(evidence,'failure.txt'),{force:true});
  const isolated=session.fromPartition(`business-${suite}-${Date.now()}`), requests=[];
  isolated.webRequest.onBeforeRequest((details,callback)=>{requests.push({method:details.method,url:details.url});callback({});});
  const win=new BrowserWindow({width:1280,height:1000,show:true,webPreferences:{session:isolated,sandbox:true,contextIsolation:true,nodeIntegration:false}});
  const js=code=>win.webContents.executeJavaScript(code,true);
  const store={
    tail:Promise.resolve(),
    save(state){
      const operation=this.tail.then(()=>js(`(async()=>{const {browserStore}=await import('./browser-api.mjs');await browserStore.save(${JSON.stringify(state)});})()`));
      this.tail=operation.catch(()=>{});return operation;
    },
    async load(){
      await this.tail;
      return js("(async()=>{const {BrowserStore}=await import('./browser-store.mjs');const store=new BrowserStore();const result=await store.load();(await store.open()).close();return result;})()");
    }
  };
  await win.loadURL(base);
  assert.equal(await js('typeof window.workday'),'undefined');
  await require(`./browser-${suite}-scenarios.cjs`).run({app,win,store,root});
  assert.deepEqual(requests.filter(r=>r.method!=='GET'||!r.url.startsWith(new URL(base).origin)),[]);
  await fs.writeFile(path.join(evidence,'browser-transport.json'),JSON.stringify({suite,storage:'real IndexedDB',nativeBridge:false,preload:false,nodeIntegration:false,nonStaticRequests:[],data:'isolated fictional fixtures only',deployed:false},null,2));
  console.log(JSON.stringify({suite,status:'passed',evidence},null,2));win.destroy();app.exit(0);
}).catch(async error=>{console.error(error);await fs.mkdir(evidence,{recursive:true});await fs.writeFile(path.join(evidence,'failure.txt'),String(error.stack));app.exit(1);});
