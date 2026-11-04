import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {version}=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const arch=process.argv[2]??'arm64';
if(!['arm64','x64'].includes(arch))throw Error('架构须为 arm64 或 x64');
const source=path.join(root,`dist-release/v${version}/payload/窝囊费-darwin-${arch}`);
const output=path.join(root,`dist-release/v${version}/Wonangfei-${version}-mac-${arch}.dmg`);
try{await fs.access(output);throw Error('DMG 已存在，停止覆盖');}catch(e){if(e.code!=='ENOENT')throw e;}
const stage=await fs.mkdtemp(path.join(root,'.mac-dmg-input-'));
try{
  execFileSync('/usr/bin/ditto',[path.join(source,'窝囊费.app'),path.join(stage,'窝囊费.app')]);
  await fs.symlink('/Applications',path.join(stage,'Applications'));
  const licenseDir=path.join(stage,'开源许可');await fs.mkdir(licenseDir);
  for(const name of ['LICENSE','LICENSES.chromium.html'])await fs.copyFile(path.join(source,name),path.join(licenseDir,name));
  const architectureText=arch==='arm64'?'Apple Silicon（M 系列）专用；运行时最低 macOS 13。本轮实测 macOS 27.2。Intel Mac 请选 x64 包。':'Intel x64 专用；运行时最低 macOS 13。为 Intel Core i5 等机型提供，Intel 实机与朋友的 macOS Sequoia 15.8.2 尚未实测。Apple Silicon 可选单独的 arm64 包。';
  await fs.writeFile(path.join(stage,'安装说明.txt'),`窝囊费 ${version} · Mac ${arch}\n\n先退出旧版并导出备份，再把「窝囊费.app」拖到「Applications」文件夹，复制完成后从应用程序中打开，再推出此磁盘。\n${architectureText}\n\n新版包括单日排班、历史请假/调休/补录、日历净利润，以及直接修正上下班和多段返工。忘记点下班时可补填实际结束时间；原加班费、摸鱼和目标结算保留。首次填写到手工资、考勤、上下班与午休；演示入口已移除，旧演示档案只归档、不混入个人记录。\n\n沿用本机 ~/Library/Application Support/WonangfeiTrial/。升级前先在旧版设置导出 JSON 备份。首次保存新日历或时间修正会升级到记录格式 2，旧版拒绝读取；回滚旧程序必须配合升级前备份，不能只替换程序或强改格式号。不会清空或自动合并旧档案。\n\n本包为 ad-hoc 临时签名，没有 Developer ID 签名或 Apple 公证；下载后可能被系统拦截。若被阻止，请保留提示并反馈，不要求更改系统安全设置。\n\n公开预发布体验版，尚未完成全部平台实机验收。\n`);
  execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',path.join(stage,'窝囊费.app')],{stdio:'inherit'});
  execFileSync('/usr/bin/hdiutil',['create','-volname',`窝囊费 ${version} ${arch}`,'-srcfolder',stage,'-format','UDZO','-fs','HFS+',output],{stdio:'inherit'});
  console.log(JSON.stringify({output,version,architecture:arch,minimumMacOS:'13.0',appSigning:'ad-hoc',developerId:false,notarized:false,dmgSigning:false},null,2));
}finally{await fs.rm(stage,{recursive:true,force:true});}
