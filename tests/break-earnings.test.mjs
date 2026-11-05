import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateFishEarnings, formatFishDuration, fishRecap } from '../src/break-earnings.mjs';
import { emptyState, at, saveSettings, startWork, resumeWork, clockOut, addCurrentBreak, deleteBreak, dayStats, summaryFishStats, monthlyReport, weeklyReport, monthStats, addExpense, addFixed, saveMonthlyReview, validateState, saveGoal, goalStats } from '../src/model.mjs';
import { editCalendarDay, undoCalendarChange } from '../src/calendar.mjs';
const h = 3600000, key = '2026-11-03', end = at(key, '22:00');
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);
function fixture() {
  const s = emptyState(new Date(at('2026-11-01','08:00')));
  saveSettings(s,{...s.settings,salary:16800},'today',at('2026-11-01','08:00'));
  s.onboarded = true;
  return s;
}
function fullDay(s, date=key, minutes=60) {
  startWork(s,at(date,'09:00'));
  if(minutes) addCurrentBreak(s,{name:'虚拟休息',minutes},at(date,'16:00'));
  return clockOut(s,at(date,'18:00'));
}

test('daily estimate uses gross wages over pre-break hours, never effective hourly or net profit',()=>{
  const s=fixture(); fullDay(s);
  addExpense(s,{name:'virtual meal',amount:100,date:key},end);
  addFixed(s,{name:'virtual rent',amount:2100,period:'month',allocation:'workday'},'2026-11-01');
  const before=structuredClone(s),d=dayStats(s,key,end);
  close(d.earned,800);close(d.net,600);close(d.hourly,800/7);close(d.fishEarned,100);
  assert.deepEqual(s,before);close(monthStats(s,key,end).earned,800);close(monthStats(s,key,end).net,500);
});
test('no breaks and no work produce zero; impossible old durations are unknown rather than inflated money',()=>{
  const s=fixture();close(dayStats(s,key,end).fishEarned,0);close(monthlyReport(s,'2026-11',end).fishEarned,0);
  assert.equal(estimateFishEarnings({earned:100,worked:0,fish:1}),null);
  assert.equal(estimateFishEarnings({earned:100,worked:h,fish:2*h}),null);
  for(const value of [NaN,Infinity,-1])assert.equal(estimateFishEarnings({earned:value,worked:h,fish:h}),null);
});
test('all time recorded as fish remains bounded by gross wages even with no effective hours',()=>{
  const s=fixture();startWork(s,at(key,'09:00'));addCurrentBreak(s,{name:'virtual break',minutes:480},at(key,'18:00'));
  clockOut(s,at(key,'18:00'));const d=dayStats(s,key,end);assert.equal(d.actual,0);assert.equal(d.hourly,null);close(d.fishEarned,800);
});
test('partial shift, lunch and separate returned shifts exclude unworked gaps',()=>{
  const s=fixture();startWork(s,at(key,'09:00'));addCurrentBreak(s,{name:'virtual break',minutes:60},at(key,'11:00'));
  const summary=clockOut(s,at(key,'12:00'));close(summaryFishStats(s,summary).fishEarned,100);
  resumeWork(s,key,at(key,'14:00'));clockOut(s,at(key,'18:00'));
  const d=dayStats(s,key,end);close(d.worked,7*h);close(d.earned,700);close(d.fishEarned,100);
  close(summaryFishStats(s,summary).fishEarned,100); // later work is excluded at original cutoff
});
test('unpaid overtime dilutes the estimate; explicitly recorded overtime fee joins gross income once',()=>{
  const s=fixture();startWork(s,at(key,'09:00'));addCurrentBreak(s,{name:'virtual break',minutes:60},at(key,'16:00'));
  close(dayStats(s,key,at(key,'21:00')).fishEarned,800/11);
  const summary=clockOut(s,at(key,'21:00'),{kind:'paid',amount:300});
  close(summary.earned,1100);close(summaryFishStats(s,summary).fishEarned,100);
  const before=JSON.stringify(s);for(let i=0;i<3;i++){close(monthlyReport(s,'2026-11',end).fishEarned,100);close(weeklyReport(s,key,end).earned,1100);}assert.equal(JSON.stringify(s),before);
});
test('rest-day overtime with no wages earns no fish pay; actual fee is proportionally attributed',()=>{
  const s=fixture(),date='2026-11-07';editCalendarDay(s,{date,kind:'overtime',payMode:'unpaid',includeOvertimePay:true},end);
  startWork(s,at(date,'09:00'));addCurrentBreak(s,{name:'virtual break',minutes:30},at(date,'11:00'));
  close(dayStats(s,date,at(date,'12:00')).fishEarned,0);
  clockOut(s,at(date,'14:00'),{kind:'paid',amount:200});
  const d=dayStats(s,date,at(date,'15:00'));close(d.worked,4*h);close(d.earned,200);close(d.fishEarned,25);
});
test('manual daily wage is allocated once, while paid absence has no fish hours',()=>{
  const s=fixture();fullDay(s);
  editCalendarDay(s,{date:key,kind:'work',payMode:'custom',amount:400,includeOvertimePay:true},end);
  close(dayStats(s,key,end).fishEarned,50);
  editCalendarDay(s,{date:key,kind:'leave',payMode:'standard',includeOvertimePay:true},end);
  close(dayStats(s,key,end).fish,0);close(dayStats(s,key,end).fishEarned,0);
  undoCalendarChange(s,key,end);close(dayStats(s,key,end).fishEarned,50);
});
test('legacy timed fish merges overlaps; legacy and duration-only records survive export roundtrip',()=>{
  const s=fixture();fullDay(s, key,30);
  s.days[key].fish=[{start:at(key,'09:00'),end:at(key,'10:00')},{start:at(key,'09:30'),end:at(key,'10:30')}];
  const d=dayStats(s,key,end);close(d.legacyFish,1.5*h);close(d.fish,2*h);close(d.fishEarned,200);
  const round=JSON.parse(JSON.stringify(s));validateState(round);close(dayStats(round,key,end).fishEarned,200);assert.deepEqual(round,s);
});
test('week/month totals sum unrounded daily estimates using different daily wages, not period average',()=>{
  const s=fixture();fullDay(s,key,60);
  saveSettings(s,{...s.settings,salary:33600},'2026-11-04',at('2026-11-04','08:00'));fullDay(s,'2026-11-04',30);
  const stamp=at('2026-11-04','22:00'),r=weeklyReport(s,key,stamp),m=monthlyReport(s,'2026-11',stamp);
  close(r.fish,1.5*h);close(r.fishEarned,200);close(m.fishEarned,r.fishEarned);
  assert.notEqual(r.fishEarned,r.earned*r.fish/r.worked);
});
test('cross-midnight and cross-week/month shifts belong to original date without extra income or break records',()=>{
  const s=fixture();s.trackingStart='2026-10-01';const date='2026-10-30';
  startWork(s,at(date,'09:00'));addCurrentBreak(s,{name:'virtual overnight',minutes:90},at('2026-11-01','01:00'));
  clockOut(s,at('2026-11-02','01:00'),{kind:'paid',amount:200});const stamp=at('2026-11-02','08:00');
  const day=dayStats(s,date,stamp),oct=monthlyReport(s,'2026-10',stamp),nov=monthlyReport(s,'2026-11',stamp);
  close(oct.fish,1.5*h);close(oct.fishEarned,day.fishEarned);close(nov.fish,0);close(nov.fishEarned,0);
  close(weeklyReport(s,date,stamp).fishEarned,day.fishEarned);close(weeklyReport(s,'2026-11-02',stamp).fishEarned,0);
  assert.deepEqual(Object.keys(s.days),[date]);
});
test('legacy summary and saved report need no migration; opening and deleting fish does not alter wages or goal pool',()=>{
  const s=fixture();saveGoal(s,{name:'virtual target',amount:10000},at('2026-11-01','08:00'));const summary=fullDay(s);
  const report=monthlyReport(s,'2026-11',end);delete report.fishEarned;saveMonthlyReview(s,report);const before=structuredClone(s),pool=goalStats(s,end).pool;
  close(summaryFishStats(s,summary).fishEarned,100);validateState(s);assert.deepEqual(s,before);
  deleteBreak(s,key,s.days[key].breaks[0].id);close(summaryFishStats(s,summary).fishEarned,0);close(summaryFishStats(s,summary).fish,0);
  close(summaryFishStats(s,summary).actual,8*h);close(summaryFishStats(s,summary).hourly,100);
  close(goalStats(s,end).pool,pool);close(dayStats(s,key,end).earned,800);
  saveMonthlyReview(s,monthlyReport(s,'2026-11',end));validateState(s);assert.equal(s.version,before.version);
});
test('time and salary corrections refresh estimate with audit/undo while retaining fees and costs',()=>{
  const s=fixture();fullDay(s);const fees=structuredClone(s.days[key].overtimeDecisions);
  editCalendarDay(s,{date:key,kind:'work',payMode:'standard',includeOvertimePay:true,records:[{sessionIndex:0,start:at(key,'10:00'),end:at(key,'18:00')}]},end);
  close(dayStats(s,key,end).worked,7*h);close(dayStats(s,key,end).fishEarned,100);
  saveSettings(s,{...s.settings,salary:33600},key,end);close(dayStats(s,key,end).fishEarned,200);
  assert.deepEqual(s.days[key].overtimeDecisions,fees);validateState(s);
});
test('invalid legacy duration remains visible but has unknown estimate throughout report totals',()=>{
  const s=fixture();fullDay(s);s.days[key].breaks[0].durationMs=9*h;
  assert.equal(dayStats(s,key,end).fishEarned,null);assert.equal(weeklyReport(s,key,end).fishEarned,null);assert.equal(monthlyReport(s,'2026-11',end).fishEarned,null);
  assert.equal(s.days[key].breaks[0].durationMs,9*h);assert.match(fishRecap('本周',9*h,null,()=>''),/待核对/);
});
test('recaps preserve minutes/hours, two-decimal currency supplied by caller, and concealed money',()=>{
  assert.equal(formatFishDuration(0),'0 分钟');assert.equal(formatFishDuration(90*60000),'1 小时 30 分钟');assert.equal(formatFishDuration(7*60000),'7 分钟');
  assert.equal(fishRecap('今天',h,10.125,n=>`¥${n.toFixed(2)}`),'你今天累计摸鱼 1 小时，成功赚到 ¥10.13（估算）。');
  assert.equal(fishRecap('本月',h,1234,()=> '••••'),'你本月累计摸鱼 1 小时，成功赚到 ••••（估算）。');
});
