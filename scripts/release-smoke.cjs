const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
exports.run=async context=>{
 const {app,store}=context,output=process.env.WORKDAY_EVIDENCE_DIR,profile=process.env.WORKDAY_DATA_DIR;
 assert.ok(output&&profile,'Explicit isolated paths are required');await fs.mkdir(output,{recursive:true});
 const phase=process.env.WORKDAY_RELEASE_PHASE||'calendar';
 try{
  assert.equal(app.isPackaged,true);assert.equal(app.getVersion(),'0.3.5');assert.ok(app.getAppPath().endsWith('app.asar'));assert.equal((await store.load()).state,null,'Fresh fictional profile required');
  const scripts={calendar:['calendar-smoke.cjs','calendar-results.json',20],salary:['salary-start-smoke.cjs','salary-start-results.json',15],hotfix:['hotfix-smoke.cjs','hotfix-results.json',13],plan:['historical-plan-smoke.cjs','historical-plan-results.json',11],costs:['day-edit-smoke.cjs','day-edit-results.json',9],clock:['shift-clock-smoke.cjs','shift-clock-results.json',13],reminder:['clock-in-reminder-smoke.cjs','clock-in-reminder-results.json',13],links:['public-links-smoke.cjs','public-links-results.json',7],about:['about-smoke.cjs','about-desktop-results.json',7]};assert.ok(scripts[phase]);
  const [script,report,count]=scripts[phase];await require('./'+script).run(context);const result=JSON.parse(await fs.readFile(path.join(output,report),'utf8'));assert.equal(result.status,'passed');assert.equal(result.checks.length,count);
  const record={status:'passed',version:app.getVersion(),packaged:app.isPackaged,arch:process.arch,translated:app.runningUnderARM64Translation,macOS:process.getSystemVersion(),electron:process.versions.electron,launch:process.env.WORKDAY_LAUNCH_ROUTE,phase,groups:count,data:'fresh isolated fictional profile',physicalFinderDoubleClick:'not-run',physicalStatusBarClick:'not-run',timestamp:new Date().toISOString()};
  await fs.writeFile(path.join(output,'release-results.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record));
 }catch(error){await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({status:'failed',phase,error:error.stack},null,2)+'\n');throw error;}
};
