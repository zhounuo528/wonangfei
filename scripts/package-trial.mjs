import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { packager } from '@electron/packager';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('此内部试用构建目前只核验 Apple Silicon Mac');
const cache=process.env.WONANGFEI_ELECTRON_ZIP_DIR;
if(!cache)throw Error('请指定已存在的 Electron 45.2.1 官方缓存目录；本脚本不自动下载或安装依赖');
await fs.access(path.join(cache,'electron-v45.2.1-darwin-arm64.zip'));
const stage=await fs.mkdtemp(path.join(root,'.trial-build-input-'));
try{
  for(const folder of ['desktop','src'])await fs.cp(path.join(root,folder),path.join(stage,folder),{recursive:true});
  await fs.writeFile(path.join(stage,'package.json'),JSON.stringify({name:'wonangfei-trial',version:'0.2.1',main:'desktop/main.cjs',description:'窝囊费 · Mac 内部试用版',author:'Wonangfei'},null,2));
  // Ad-hoc identities have no Team ID. Hardened-runtime library validation would reject
  // Electron's own framework before main() with a Team-ID mismatch. This is a local
  // trial signature, without hardened runtime; Gatekeeper remains fully unchanged.
  const outputs=await packager({dir:stage,name:'窝囊费',executableName:'Wonangfei',appBundleId:'local.wonangfei.trial',helperBundleId:'local.wonangfei.trial.helper',appVersion:'0.2.1',buildVersion:'20261103.2',platform:'darwin',arch:'arm64',electronVersion:'45.2.1',electronZipDir:cache,out:path.join(root,'dist-trial','v0.2.1'),overwrite:false,asar:true,prune:false,extendInfo:{CFBundleDisplayName:'窝囊费',LSMinimumSystemVersion:'13.0'},osxSign:{identity:'-',identityValidation:false,continueOnError:false,preAutoEntitlements:false,preEmbedProvisioningProfile:false,strictVerify:true,optionsForFile:()=>({timestamp:'none',hardenedRuntime:false,entitlements:['com.apple.security.cs.allow-jit']})}});
  for(const output of outputs){const app=path.join(output,'窝囊费.app');execFileSync('/usr/bin/codesign',['--verify','--deep','--strict','--verbose=2',app],{stdio:'inherit'});}
  console.log(JSON.stringify({outputs,arch:'arm64',minimumMacOS:'13.0',signed:'ad-hoc',developerId:false,notarized:false},null,2));
}finally{await fs.rm(stage,{recursive:true,force:true});}
