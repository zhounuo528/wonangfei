import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {packager} from '@electron/packager';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const zipDir=process.env.WONANGFEI_ELECTRON_ZIP_DIR;
if(!zipDir)throw Error('请指定现有官方 Electron 45.2.1 ZIP 缓存目录');
await fs.access(path.join(zipDir,'electron-v45.2.1-win32-x64.zip'));
const asar=path.join(root,'dist-trial/v0.2.1/窝囊费-darwin-arm64/窝囊费.app/Contents/Resources/app.asar');
await fs.access(asar);
const stage=await fs.mkdtemp(path.join(root,'.windows-build-input-'));
try{
  await fs.writeFile(path.join(stage,'package.json'),JSON.stringify({name:'wonangfei-trial',version:'0.2.1',main:'desktop/main.cjs'}));
  const outputs=await packager({dir:stage,prebuiltAsar:asar,name:'Wonangfei',executableName:'Wonangfei',appVersion:'0.2.1',buildVersion:'0.2.1.0',appCopyright:'Wonangfei',platform:'win32',arch:'x64',electronVersion:'45.2.1',electronZipDir:zipDir,out:path.join(root,'dist-installers','payload'),overwrite:false,prune:false,win32metadata:{CompanyName:'Wonangfei',FileDescription:'窝囊费 · 本地桌面试用版',ProductName:'窝囊费',InternalName:'Wonangfei',OriginalFilename:'Wonangfei.exe'}});
  console.log(JSON.stringify({outputs,arch:'x64',windowsMinimum:'10',authenticode:false,runtimeTested:false,sourceAsar:asar},null,2));
}finally{await fs.rm(stage,{recursive:true,force:true});}
