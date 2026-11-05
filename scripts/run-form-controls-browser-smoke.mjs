import {mkdtemp,mkdir,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const profile=await mkdtemp(path.join(os.tmpdir(),'wonangfei-visual-browser-'));
const evidence=process.env.WORKDAY_EVIDENCE_DIR??path.join(root,'evidence',path.basename(profile));await mkdir(evidence,{recursive:true});
const server=spawn(process.execPath,['scripts/serve.mjs'],{cwd:path.join(root,'web'),env:{...process.env,PORT:'4201'},stdio:['ignore','pipe','inherit']});
try {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.once('exit',code=>reject(Error('Preview exited '+code)));server.stdout.once('data',resolve);});
  const executable=createRequire(import.meta.url)('electron');
  const command=process.platform==='darwin'?'/usr/bin/open':executable;
  const target=path.join(root,'web/scripts/form-controls-browser.cjs');
  const args=process.platform==='darwin'?['-n','-W',path.resolve(path.dirname(executable),'../..'),'--args',target]:[target];
  const child=spawn(command,args,{stdio:'inherit',env:{...process.env,WORKDAY_DATA_DIR:profile,WORKDAY_EVIDENCE_DIR:evidence,BASE_URL:'http://127.0.0.1:4201'}});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
  if(process.env.WORKDAY_SETTINGS_PROBE==='1'){console.log(JSON.stringify({probe:true,evidence,launcherExit:code}));if(code!==0)process.exitCode=1;}else{
  const result=JSON.parse(await readFile(path.join(evidence,'form-controls-results.json'),'utf8'));
  console.log(JSON.stringify({status:result.status,checks:result.checks.length,evidence,launcherExit:code}));
  if(code!==0||result.status!=='passed')process.exitCode=1;
}
} finally {server.kill('SIGTERM');}
