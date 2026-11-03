import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {packager} from '@electron/packager';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const zipDir=path.join(root,'.installer-tools');
await fs.access(path.join(zipDir,'electron-v45.2.1-darwin-x64.zip'));
const stage=await fs.mkdtemp(path.join(root,'.intel-build-input-'));
const asar=path.join(root,'dist-trial/v0.2.1/窝囊费-darwin-arm64/窝囊费.app/Contents/Resources/app.asar');
try{
  await fs.writeFile(path.join(stage,'package.json'),JSON.stringify({name:'wonangfei-trial',version:'0.2.1',main:'desktop/main.cjs'}));
  const outputs=await packager({dir:stage,prebuiltAsar:asar,name:'窝囊费',executableName:'Wonangfei',appBundleId:'local.wonangfei.trial',helperBundleId:'local.wonangfei.trial.helper',appVersion:'0.2.1',buildVersion:'20261103.2',platform:'darwin',arch:'x64',electronVersion:'45.2.1',electronZipDir:zipDir,out:path.join(root,'dist-installers/payload'),overwrite:false,extendInfo:{CFBundleDisplayName:'窝囊费',LSMinimumSystemVersion:'13.0'},osxSign:{identity:'-',identityValidation:false,continueOnError:false,preAutoEntitlements:false,preEmbedProvisioningProfile:false,strictVerify:true,optionsForFile:()=>({timestamp:'none',hardenedRuntime:false,entitlements:['com.apple.security.cs.allow-jit']})}});
  const output=outputs[0];
  for(const name of ['LICENSE','LICENSES.chromium.html'])await fs.copyFile(path.join(root,'node_modules/electron/dist',name),path.join(output,name));
  execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',path.join(output,'窝囊费.app')],{stdio:'inherit'});
  console.log(JSON.stringify({output,architecture:'x64',minimumMacOS:'13.0',signing:'ad-hoc',developerId:false,notarized:false,intelHardwareTested:false},null,2));
}finally{await fs.rm(stage,{recursive:true,force:true});}
