import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arch=process.argv[2]??'arm64';
if(!['arm64','x64'].includes(arch))throw Error('架构须为 arm64 或 x64');
const source=path.join(root,arch==='arm64'?'dist-trial/v0.2.1/窝囊费-darwin-arm64':'dist-installers/payload/窝囊费-darwin-x64');
const output=path.join(root,`dist-installers/Wonangfei-0.2.1-mac-${arch}.dmg`);
try{await fs.access(output);throw Error('DMG 已存在，停止覆盖');}catch(e){if(e.code!=='ENOENT')throw e;}
const stage=await fs.mkdtemp(path.join(root,'.mac-dmg-input-'));
try{
  execFileSync('/usr/bin/ditto',[path.join(source,'窝囊费.app'),path.join(stage,'窝囊费.app')]);
  await fs.symlink('/Applications',path.join(stage,'Applications'));
  const licenseDir=path.join(stage,'开源许可');await fs.mkdir(licenseDir);
  for(const name of ['LICENSE','LICENSES.chromium.html'])await fs.copyFile(path.join(source,name),path.join(licenseDir,name));
  const architectureText=arch==='arm64'?'Apple Silicon（M 系列）专用；运行时最低 macOS 13。本轮实测 macOS 27.2。Intel Mac 请选 x64 包。':'Intel x64 专用；运行时最低 macOS 13。为 Intel Core i5 等机型提供，Intel 实机与朋友的 macOS Sequoia 15.8.2 尚未实测。Apple Silicon 可选单独的 arm64 包。';
  await fs.writeFile(path.join(stage,'安装说明.txt'),`窝囊费 0.2.1 · Mac ${arch}\n\n把「窝囊费.app」拖到「Applications」文件夹，复制完成后从应用程序中打开，再推出此磁盘。\n${architectureText}\n\n首次填写考勤、薪资、上下班和午休，或先点「体验虚拟数据」。个人与演示档案分别保存在本机 ~/Library/Application Support/WonangfeiTrial/，设置中可以导出备份。\n\n本包为 ad-hoc 临时签名，没有 Developer ID 签名或 Apple 公证；下载后可能被系统拦截。若被阻止，请保留提示并反馈，不要求更改系统安全设置。\n\n内部体验版，未对外发布。\n`);
  execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',path.join(stage,'窝囊费.app')],{stdio:'inherit'});
  execFileSync('/usr/bin/hdiutil',['create','-volname','窝囊费 0.2.1','-srcfolder',stage,'-format','UDZO','-fs','HFS+',output],{stdio:'inherit'});
  console.log(JSON.stringify({output,version:'0.2.1',architecture:arch,minimumMacOS:'13.0',appSigning:'ad-hoc',developerId:false,notarized:false,dmgSigning:false},null,2));
}finally{await fs.rm(stage,{recursive:true,force:true});}
