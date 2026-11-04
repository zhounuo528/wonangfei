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
  await fs.writeFile(path.join(stage,'安装说明.txt'),`窝囊费 ${version} · Mac ${arch}\n\n先退出旧版并导出备份，再把「窝囊费.app」拖到「Applications」文件夹，复制完成后从应用程序中打开，再推出此磁盘。\n${architectureText}\n\n新版首次工资从本月 1 日生效，支持按自选日期调薪、修复零工资补录、普通补班重分整月自动工资，以及周/月加班均薪对比。日历区分未来安排、历史补记与已有记录修正。忘记点下班时可补填实际结束时间；原加班费、摸鱼和目标结算保留。首次填写到手工资、考勤、上下班与午休；演示入口已移除，旧演示档案只归档、不混入个人记录。\n\n沿用本机 ~/Library/Application Support/WonangfeiTrial/。升级前先在旧版设置导出 JSON 备份。本版支持记录格式 1/2/3/4。日期调薪等使用格式 3；修改单日花销或固定负担会采用格式 4，0.3.4 及更早安装包不支持格式 4。历史计划排班可与实际考勤分开修正，保留当日工资基准和原记录。回滚程序不会回滚账本：先保留新记录，再配合升级前备份处理，不能只替换程序或强改格式号。不会清空或自动合并旧档案。\n\n本包为 ad-hoc 临时签名，没有 Developer ID 签名或 Apple 公证；下载后可能被系统拦截。若被阻止，请保留提示并反馈，不要求更改系统安全设置。\n\n上班打卡提醒默认关闭，仅在应用内弹窗，退出应用或电脑未运行时不能提醒。

公开预发布体验版，尚未完成全部平台实机验收。\n`);
  execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',path.join(stage,'窝囊费.app')],{stdio:'inherit'});
  execFileSync('/usr/bin/hdiutil',['create','-volname',`窝囊费 ${version} ${arch}`,'-srcfolder',stage,'-format','UDZO','-fs','HFS+',output],{stdio:'inherit'});
  console.log(JSON.stringify({output,version,architecture:arch,minimumMacOS:'13.0',appSigning:'ad-hoc',developerId:false,notarized:false,dmgSigning:false},null,2));
}finally{await fs.rm(stage,{recursive:true,force:true});}
