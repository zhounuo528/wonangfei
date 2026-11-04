const https=require('node:https');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const API='https://api.github.com/repos/zhounuo528/wonangfei/releases';
const policy=()=>import(pathToFileURL(path.join(__dirname,'../src/update-policy.mjs')).href);
function requestJSON(url,{timeoutMs,version}){
  return new Promise((resolve,reject)=>{
    let timer;const finish=value=>{clearTimeout(timer);resolve(value);},fail=error=>{clearTimeout(timer);reject(error);};
    const request=https.get(url,{headers:{Accept:'application/vnd.github+json','User-Agent':`Wonangfei-Manual-Update/${version}`,'X-GitHub-Api-Version':'2022-11-28'}},response=>{
      if(response.statusCode!==200){response.resume();const e=Error('http');e.reason=[403,429].includes(response.statusCode)?'rate':'http';e.httpStatus=response.statusCode;fail(e);return;}
      let size=0;const chunks=[];response.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024){const e=Error('invalid');e.reason='invalid';request.destroy(e);}else chunks.push(chunk);});
      response.on('error',fail);response.on('end',()=>{try{finish({data:JSON.parse(Buffer.concat(chunks).toString('utf8')),next:/rel="next"/.test(response.headers.link??'')});}catch{const e=Error('invalid');e.reason='invalid';fail(e);}});
    });
    timer=setTimeout(()=>{const e=Error('timeout');e.reason='timeout';request.destroy(e);},timeoutMs);request.on('error',fail);
  });
}
function createUpdateService({version,platform,arch,request=requestJSON}){
  let inFlight,checkedURL=null;
  return{
    check(includePrerelease){
      if(typeof includePrerelease!=='boolean')return Promise.reject(Error('更新范围无效'));
      if(inFlight)return inFlight;
      inFlight=(async()=>{
        checkedURL=null;
        try{
          const p=await policy();if(!p.parseVersion(version))throw Error('invalid-version');
          if(!['darwin','win32'].includes(platform)||platform==='win32'&&arch!=='x64'||platform==='darwin'&&!['arm64','x64'].includes(arch))return{status:'unsupported',platform,arch};
          const releases=[],start=Date.now();for(let page=1;page<=5;page++){
            const remaining=12000-(Date.now()-start);if(remaining<=0){const e=Error('timeout');e.reason='timeout';throw e;}
            const result=await request(`${API}?per_page=100&page=${page}`,{timeoutMs:Math.min(8000,remaining),version});if(!Array.isArray(result.data))throw Error('invalid-catalogue');releases.push(...result.data);
            if(!result.next){const selected=p.selectDesktopRelease(releases,{version,platform,arch,includePrerelease});checkedURL=selected.releaseURL??null;return selected;}
          }return{status:'error',reason:'catalogue-limit'};
        }catch(error){return{status:'error',reason:error.reason??(/invalid/.test(error.message)?'invalid':'network'),...(Number.isInteger(error.httpStatus)?{httpStatus:error.httpStatus}:{})};}
      })().finally(()=>{inFlight=null;});return inFlight;
    },
    checkedReleaseURL:()=>checkedURL
  };
}
module.exports={createUpdateService,requestJSON};
