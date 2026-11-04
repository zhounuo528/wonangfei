export const RELEASES_PAGE='https://github.com/zhounuo528/wonangfei/releases';
export const RELEASE_API='https://api.github.com/repos/zhounuo528/wonangfei/releases';
export function parseVersion(value){
  if(typeof value!=='string'||value.length>100)return null;
  const match=/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value);
  if(!match)return null;
  const numbers=match.slice(1,4).map(Number),pre=match[4]?.split('.')??[];
  if(numbers.some(n=>!Number.isSafeInteger(n))||pre.some(s=>!s||/^\d+$/.test(s)&&s.length>1&&s.startsWith('0')))return null;
  return {numbers,pre,version:value.replace(/^v/,'')};
}
export function compareVersions(a,b){
  const x=parseVersion(a),y=parseVersion(b);if(!x||!y)throw Error('invalid-version');
  for(let i=0;i<3;i++)if(x.numbers[i]!==y.numbers[i])return x.numbers[i]>y.numbers[i]?1:-1;
  if(!x.pre.length||!y.pre.length)return x.pre.length===y.pre.length?0:x.pre.length?-1:1;
  for(let i=0;i<Math.max(x.pre.length,y.pre.length);i++){
    if(x.pre[i]===undefined)return-1;if(y.pre[i]===undefined)return 1;
    const p=x.pre[i],q=y.pre[i];if(p===q)continue;const pn=/^\d+$/.test(p),qn=/^\d+$/.test(q);
    if(pn&&qn)return p.length!==q.length?p.length>q.length?1:-1:p>q?1:-1;
    if(pn!==qn)return pn?-1:1;return p>q?1:-1;
  }return 0;
}
export function releasePage(tag){return /^v?[0-9A-Za-z.+-]+$/.test(tag??'')&&parseVersion(tag)?`${RELEASES_PAGE}/tag/${encodeURIComponent(tag)}`:RELEASES_PAGE;}
export function selectDesktopRelease(releases,{version,platform,arch,includePrerelease=false}){
  if(!parseVersion(version)||typeof includePrerelease!=='boolean'||!Array.isArray(releases))throw Error('invalid-catalogue');
  const suffix=platform==='darwin'&&['arm64','x64'].includes(arch)?`mac-${arch}.dmg`:platform==='win32'&&arch==='x64'?'x64.exe':null;
  if(!suffix)return{status:'unsupported',platform,arch};
  const candidates=releases.filter(r=>r&&r.draft===false&&typeof r.prerelease==='boolean'&&parseVersion(r.tag_name)&&(!r.prerelease&&!parseVersion(r.tag_name).pre.length||includePrerelease)).filter(r=>{
    const v=parseVersion(r.tag_name).version,name=platform==='win32'?`Wonangfei-Setup-${v}-${suffix}`:`Wonangfei-${v}-${suffix}`;
    return Array.isArray(r.assets)&&r.assets.some(a=>a?.name===name&&a.state==='uploaded'&&a.size>0&&a.browser_download_url===`https://github.com/zhounuo528/wonangfei/releases/download/${encodeURIComponent(r.tag_name)}/${encodeURIComponent(name)}`);
  }).sort((a,b)=>compareVersions(b.tag_name,a.tag_name));
  if(!candidates.length)return{status:'none',includePrerelease,platform,arch};
  const latest=candidates[0],comparison=compareVersions(latest.tag_name,version);
  return{status:comparison>0?'available':comparison<0?'ahead':'current',version:parseVersion(latest.tag_name).version,prerelease:latest.prerelease,releaseURL:releasePage(latest.tag_name),includePrerelease,platform,arch};
}
export function validateWebInfo(info){
  if(!info||info.stream!=='web'||!parseVersion(info.version)||!/^\w{64}$/.test(info.revision??'')||!/^[a-f0-9]{64}$/.test(info.revision)||info.sourceCommit!==null&&!/^[a-f0-9]{40}$/.test(info.sourceCommit??''))throw Error('invalid-web-info');
  return info;
}
export function compareWebInfo(current,remote){
  validateWebInfo(current);validateWebInfo(remote);const order=compareVersions(remote.version,current.version);
  return{status:order>0||order===0&&current.revision!==remote.revision?'available':order<0?'ahead':'current',version:remote.version,revision:remote.revision,sourceCommit:remote.sourceCommit};
}
export async function checkWebUpdate(current,{fetcher=globalThis.fetch,location=globalThis.location,timeoutMs=8000}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const url=new URL('version.json',location.href);if(url.origin!==location.origin||!['http:','https:'].includes(url.protocol))return{status:'error',reason:'origin'};
    const response=await fetcher(url.href,{method:'GET',credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',redirect:'error',signal:controller.signal});
    if(!response.ok)return{status:'error',reason:response.status===404?'missing':'http',httpStatus:response.status};
    if(response.url&&new URL(response.url).origin!==url.origin)return{status:'error',reason:'origin'};
    const reader=response.body?.getReader();let text='';
    if(reader){const decoder=new TextDecoder();let size=0;for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>65536){await reader.cancel();return{status:'error',reason:'invalid'};}text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}
    else text=await response.text();
    if(new TextEncoder().encode(text).length>65536)return{status:'error',reason:'invalid'};
    return compareWebInfo(current,JSON.parse(text));
  }catch(error){return{status:'error',reason:controller.signal.aborted?'timeout':error instanceof SyntaxError||/invalid-web-info/.test(error.message)?'invalid':'network'};}
  finally{clearTimeout(timer);}
}
