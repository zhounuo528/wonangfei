import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {version}=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const output=path.join(root,`dist-release/v${version}`);
const payload=path.join(output,'payload/Wonangfei-win32-x64');
const compiler=path.join(process.env.WONANGFEI_NSIS_DIR??path.join(root,'.installer-tools/nsis-bundle'),'makensis');
const installer=path.join(output,`Wonangfei-Setup-${version}-x64.exe`);
try{await fs.access(installer);throw Error('安装包已存在，停止覆盖');}catch(error){if(error.code!=='ENOENT')throw error;}
async function walk(dir,relative=''){
  const files=[],dirs=[];
  for(const e of await fs.readdir(dir,{withFileTypes:true})){
    const rel=path.posix.join(relative,e.name);
    if(e.isSymbolicLink())throw Error('Windows payload 含意外符号链接 '+rel);
    if(e.isDirectory()){const next=await walk(path.join(dir,e.name),rel);files.push(...next.files);dirs.push(...next.dirs,rel);}
    else if(e.isFile())files.push(rel);
  }
  return {files,dirs};
}
const inventory=await walk(payload);
const quoted=p=>p.replaceAll('$','$$').replaceAll('"','$\\"').replaceAll('/', '\\');
const deletes=inventory.files.map(p=>'  Delete "$INSTDIR\\'+quoted(p)+'"').join('\n');
const directories=inventory.dirs.map(p=>'  RMDir "$INSTDIR\\'+quoted(p)+'"').join('\n');
const script=String.raw`Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "WinVer.nsh"
!include "x64.nsh"
Name "窝囊费"
OutFile "${installer}"
Icon "${path.join(root,'src/icons/Wonangfei.ico')}"
UninstallIcon "${path.join(root,'src/icons/Wonangfei.ico')}"
InstallDir "$LOCALAPPDATA\Programs\Wonangfei"
InstallDirRegKey HKCU "Software\WonangfeiTrial" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 32
CRCCheck force
ManifestDPIAware true
ManifestSupportedOS all
VIProductVersion "${version}.0"
VIAddVersionKey "ProductName" "窝囊费"
VIAddVersionKey "FileDescription" "窝囊费 安装程序（x64）"
VIAddVersionKey "FileVersion" "${version}"
VIAddVersionKey "ProductVersion" "${version}"
VIAddVersionKey "LegalCopyright" "Wonangfei"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "欢迎安装窝囊费"
!define MUI_WELCOMEPAGE_TEXT "让每一秒，都有一点回报。$\r$\n$\r$\n更新前请先导出 JSON 备份并退出已打开的窝囊费。格式 4 账本不能回退到 0.3.4。程序只为当前用户安装。"
!define MUI_DIRECTORYPAGE_TEXT_TOP "请选择窝囊费专用的新目录或已有窝囊费安装目录。"
!define MUI_FINISHPAGE_RUN "$INSTDIR\Wonangfei.exe"
!define MUI_FINISHPAGE_RUN_TEXT "打开窝囊费"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"
Function .onInit
  SetShellVarContext current
  SetRegView 64
  ${'${IfNot}'} ${'${AtLeastWin10}'}
    MessageBox MB_ICONSTOP "需要 Windows 10 或更新版本。 / Windows 10 or later is required."
    Abort
  ${'${EndIf}'}
  ${'${IfNot}'} ${'${RunningX64}'}
    MessageBox MB_ICONSTOP "需要 64 位 Windows。 / 64-bit Windows is required."
    Abort
  ${'${EndIf}'}
FunctionEnd
Function CheckDestination
  ClearErrors
  ReadINIStr $R1 "$INSTDIR\Wonangfei.install.ini" "App" "Id"
  StrCmp $R1 "local.wonangfei.trial" destination_ok
  ClearErrors
  FindFirst $R0 $R1 "$INSTDIR\*"
  IfErrors destination_ok
destination_loop:
  StrCmp $R1 "." destination_next
  StrCmp $R1 ".." destination_next
  StrCmp $R1 "" destination_empty
  FindClose $R0
  SetErrors
  Return
destination_next:
  FindNext $R0 $R1
  IfErrors destination_empty
  Goto destination_loop
destination_empty:
  FindClose $R0
destination_ok:
  ClearErrors
FunctionEnd
Function .onVerifyInstDir
  Call CheckDestination
FunctionEnd
Section "窝囊费" Main
  Call CheckDestination
  ${'${If}'} ${'${Errors}'}
    MessageBox MB_ICONSTOP "请选择一个专用空目录。 / Please select a dedicated empty folder."
    Abort
  ${'${EndIf}'}
  SetOutPath "$INSTDIR"
  SetOverwrite on
  File /r "${payload}/*"
  WriteINIStr "$INSTDIR\Wonangfei.install.ini" "App" "Id" "local.wonangfei.trial"
  WriteINIStr "$INSTDIR\Wonangfei.install.ini" "App" "Version" "${version}"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\窝囊费"
  CreateShortCut "$SMPROGRAMS\窝囊费\窝囊费.lnk" "$INSTDIR\Wonangfei.exe"
  CreateShortCut "$SMPROGRAMS\窝囊费\卸载窝囊费.lnk" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\WonangfeiTrial" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\WonangfeiTrial" "DisplayName" "窝囊费"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\WonangfeiTrial" "DisplayVersion" "${version}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\WonangfeiTrial" "Publisher" "Wonangfei"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\WonangfeiTrial" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\WonangfeiTrial" "DisplayIcon" "$INSTDIR\Wonangfei.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\WonangfeiTrial" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\WonangfeiTrial" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\WonangfeiTrial" "NoRepair" 1
SectionEnd
Function un.onInit
  SetShellVarContext current
  SetRegView 64
  ReadINIStr $R1 "$INSTDIR\Wonangfei.install.ini" "App" "Id"
  StrCmp $R1 "local.wonangfei.trial" +3
    MessageBox MB_ICONSTOP "未找到窝囊费安装标记。 / Installation marker not found."
    Abort
FunctionEnd
Section "Uninstall"
${deletes}
${directories}
  Delete "$INSTDIR\Wonangfei.install.ini"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  Delete "$SMPROGRAMS\窝囊费\窝囊费.lnk"
  Delete "$SMPROGRAMS\窝囊费\卸载窝囊费.lnk"
  RMDir "$SMPROGRAMS\窝囊费"
  DeleteRegKey HKCU "Software\WonangfeiTrial"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\WonangfeiTrial"
SectionEnd
`;
const scriptPath=path.join(output,`Wonangfei-${version}.nsi`);
await fs.writeFile(scriptPath,'\uFEFF'+script);
await fs.mkdir(path.join(root,`evidence/release-${version}`),{recursive:true});
await fs.writeFile(path.join(root,`evidence/release-${version}/windows-payload-inventory.json`),JSON.stringify(inventory,null,2));
execFileSync(compiler,['-V3',scriptPath],{stdio:'inherit'});
console.log(JSON.stringify({installer,version,appArch:'x64',installerBootstrap:'x86 Unicode NSIS',perUser:true,administratorRequired:false,authenticode:false,windowsRuntimeTested:false,uninstall:'explicit installed-file list; no recursive folder deletion; app data retained'},null,2));
