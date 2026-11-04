import {RELEASES_PAGE,parseVersion}from'./update-policy.mjs';
const $=id=>document.getElementById(id);
const errors={network:'网络不可用，请联网后重试。',timeout:'检查超时，请稍后重试。',rate:'GitHub 暂时限制了请求，请稍后重试或打开下载页。',missing:'当前站点还没有版本信息，请稍后再检查。',invalid:'版本信息格式有误，请稍后重试。',origin:'只能检查当前站点的网页版更新。','catalogue-limit':'发行列表过长，请打开下载页查看。',http:'更新服务暂时不可用，请稍后重试。'};
export function createAboutUI({api,flushSaves=async()=>{},reload=()=>location.reload(),toast=()=>{}}){
  let info,busy=false;
  async function initialize(){
    try{
      info=await api.about();if(!['web','desktop'].includes(info?.stream)||!parseVersion(info.version)||!Array.isArray(info.changes))throw Error('版本信息不可用');
      $('about-version-button').textContent=`关于窝囊费 · ${info.stream==='web'?'网页版':'桌面版'} v${info.version} ↗`;
      $('about-current').textContent=`${info.stream==='web'?'网页版':'桌面版'} v${info.version}`;
      $('about-context').textContent=info.stream==='web'?`检查当前站点的网页版更新${info.development?' · 开发构建':''}`:`${{darwin:'macOS',win32:'Windows',linux:'Linux'}[info.platform]??info.platform} · ${info.arch}${info.packaged?'':' · 开发源码'}；安装要求见发行说明。`;
      $('about-preview-label').hidden=info.stream==='web';$('about-preview').checked=info.channel==='preview';
      $('about-check-note').textContent=info.stream==='web'?'点击检查时，仅获取本站公开版本文件。发现更新后，由你选择刷新。':'点击检查时，仅访问 GitHub 公开发行列表。默认包含体验版，可关闭只看正式版。';
      const list=$('about-changes');list.replaceChildren();
      for(const entry of info.changes){const section=document.createElement('section'),heading=document.createElement('h3'),ul=document.createElement('ul');heading.textContent=`v${entry.version}`;for(const message of entry.items){const li=document.createElement('li');li.textContent=message;ul.append(li);}section.append(heading,ul);list.append(section);}
      $('about-download').href=RELEASES_PAGE;$('about-check').disabled=false;
    }catch{ $('about-version-button').textContent='关于窝囊费 · 版本信息不可用';$('about-status').textContent='无法读取构建版本，请重新打开应用或重新构建网页。';}
  }
  $('about-version-button').addEventListener('click',()=>{if(!$('about-dialog').open)$('about-dialog').showModal();});
  $('about-download').addEventListener('click',event=>{if(info?.stream==='desktop'){event.preventDefault();api.openDownloadPage().catch(()=>toast('下载页暂时无法打开，请稍后重试。'));}});
  $('about-preview').addEventListener('change',()=>{$('about-status').textContent='发行范围已调整，请手动重新检查。';$('about-open-release').hidden=true;});
  $('about-check').addEventListener('click',async()=>{
    if(!info||busy)return;busy=true;$('about-preview').disabled=true;$('about-check').disabled=true;$('about-check').textContent='正在检查…';$('about-refresh').hidden=true;$('about-open-release').hidden=true;$('about-status').textContent='正在获取公开版本信息…';
    try{
      const result=await api.checkUpdate($('about-preview').checked);
      if(result.status==='error')$('about-status').textContent=errors[result.reason]??errors.http;
      else if(result.status==='unsupported')$('about-status').textContent='当前系统或应用架构暂无适配安装包，请查看 Mac & Windows 版下载。';
      else if(result.status==='none')$('about-status').textContent=$('about-preview').checked?'暂无匹配当前系统与架构的公开发行版。':'暂无适配的正式版；可勾选包含预发布体验版。';
      else if(result.status==='available'){$('about-status').textContent=`发现${info.stream==='web'?result.version===info.version?'网页版新构建':'网页版':result.prerelease?'体验版':'正式版'} v${result.version}${info.stream==='web'?'，可保存后刷新。':'，可前往发行页下载。'}`;$(info.stream==='web'?'about-refresh':'about-open-release').hidden=false;}
      else if(result.status==='current'){$('about-status').textContent=`当前已是${info.stream==='web'?'本站最新版':'此发行范围内的最新适配版'} v${info.version}。`;if(info.stream==='desktop')$('about-open-release').hidden=false;}
      else if(result.status==='ahead'){$('about-status').textContent=`当前${info.stream==='web'?'页面':'开发版本'}比${info.stream==='web'?'本站':'最新公开适配版'} v${result.version} 新${info.stream==='web'?'，暂不刷新。':'，尚无更高的公开适配版。'}`;if(info.stream==='desktop')$('about-open-release').hidden=false;}
      else $('about-status').textContent=errors.invalid;
    }catch{$('about-status').textContent=errors.network;}
    finally{busy=false;$('about-preview').disabled=false;$('about-check').disabled=false;$('about-check').textContent='手动检查更新';}
  });
  $('about-open-release').addEventListener('click',()=>api.openCheckedRelease().catch(()=>toast('发行页暂时无法打开，请重新检查后重试。')));
  $('about-refresh').addEventListener('click',async()=>{if(busy)return;busy=true;$('about-refresh').disabled=true;try{await flushSaves();reload();}catch(error){$('about-status').textContent=error.message||'还有记录尚未保存，请先完成保存。';}finally{busy=false;$('about-refresh').disabled=false;}});
  return{initialize};
}
