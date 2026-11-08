import test from 'node:test';import assert from 'node:assert/strict';
import {emptyState,at,saveSettings,startWork,clockOut,resumeWork,addCurrentBreak,dayStats,monthStats,monthlyReport,weeklyReport,saveMonthlyReview,saveExtraIncome,setExtraIncomeVoided,undoExtraIncomeChange,undoableExtraIncomeChange,saveGoal,goalStats,settleGoal,markGoalNotified,dueGoalNotice,summaryFishStats,addFixed,editDailyFixedCosts,validateState} from '../core/model.js';
import {editCalendarDay,calendarInfo} from '../core/calendar.js';
const key='2026-11-03',now=at('2026-11-09','22:00'),h=3600000,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function fixture(){const s=emptyState(new Date(at('2026-11-01','08:00')));saveSettings(s,{...s.settings,salary:6720},'today',at('2026-11-01','08:00'));s.onboarded=true;return s;}
function work(s,date=key,end='14:00'){startWork(s,at(date,'09:00'));return clockOut(s,at(date,end));}
function add(s,amount=80,date=key,id='virtual-income'){return saveExtraIncome(s,{id,category:'奖金',amount,date,note:'virtual bonus'},now).record;}
function edit(s,id,changes){const r=s.extraIncomes.find(e=>e.id===id);return saveExtraIncome(s,{...r,...changes,existing:true,expectedRevision:r.revision},now);}

test('windfall raises total and day/month averages but never wages, salary settings or worked time',()=>{
 const s=fixture();work(s);const settings=structuredClone(s.settings),sessions=structuredClone(s.days[key].sessions),before=dayStats(s,key,now);near(before.earned,160);near(before.hourly,40);
 add(s);const after=dayStats(s,key,now);near(after.earned,240);near(after.wageEarned,160);near(after.extraIncome,80);near(after.hourly,60);near(after.secondly,60/3600);near(after.actual,4*h);assert.deepEqual(s.settings,settings);assert.deepEqual(s.days[key].sessions,sessions);
 const month=monthStats(s,key,now);near(month.earned,240);near(month.hourly,60);near(month.averageDaily,240);assert.equal(month.workedDays,1);validateState(s);
});
test('rest date with only extra income creates no attendance; zero effective time yields null averages',()=>{
 const s=fixture();add(s,80,'2026-11-07');const d=dayStats(s,'2026-11-07',now),m=monthStats(s,key,now);near(d.earned,80);near(d.actual,0);assert.equal(d.hourly,null);assert.equal(d.secondly,null);assert.equal(m.hourly,null);assert.equal(m.averageDaily,null);assert.equal(m.workedDays,0);assert.deepEqual(s.days,{});assert.equal(calendarInfo(s,'2026-11-07',now).profit,null);
 work(s);near(monthStats(s,key,now).hourly,60);assert.equal(monthStats(s,key,now).workedDays,1);
});
test('income remains available on leave/rest and does not change fixed cost eligibility',()=>{
 const s=fixture();editCalendarDay(s,{date:key,kind:'leave',payMode:'unpaid',includeOvertimePay:true,confirmedBackfill:true},now);addFixed(s,{name:'virtual meal',amount:30,period:'day',repeat:'daily',allocation:'workday'},'2026-11-01',now);add(s);
 const d=dayStats(s,key,now);near(d.net,50);near(d.wageEarned,0);assert.equal(d.hourly,null);assert.equal(s.days[key].sessions.length,0);
});
test('windfalls never increase fish earnings, standard wage rates or overtime fees',()=>{
 const s=fixture();startWork(s,at(key,'09:00'));addCurrentBreak(s,{minutes:30,name:'virtual rest'},at(key,'11:00'));clockOut(s,at(key,'21:00'),{kind:'paid',amount:80});
 const before=dayStats(s,key,now),fees=structuredClone(s.days[key].overtimeDecisions);add(s);const after=dayStats(s,key,now);near(after.earned,before.earned+80);near(after.fishEarned,before.fishEarned);near(after.daily,before.daily);near(after.overtimePay,80);assert.deepEqual(s.days[key].overtimeDecisions,fees);near(summaryFishStats(s,s.days[key].summary).fishEarned,before.fishEarned);
 const comparison=monthlyReport(s,'2026-11',now).comparison;near(comparison.baseline.net,after.net-80);near(comparison.actual.net,after.net);
});
test('cross-month edit removes the old contribution, refreshes reports and leaves attendance untouched',()=>{
 const s=fixture();work(s);saveMonthlyReview(s,monthlyReport(s,'2026-10',now));saveMonthlyReview(s,monthlyReport(s,'2026-11',now));const days=structuredClone(s.days);add(s,80,'2026-10-31');near(monthlyReport(s,'2026-10',now).earned,80);
 edit(s,'virtual-income',{date:key,amount:120});near(monthlyReport(s,'2026-10',now).earned,0);near(monthlyReport(s,'2026-11',now).earned,280);near(s.monthlyReviews.snapshots['2026-10'].extraIncome,0);near(s.monthlyReviews.snapshots['2026-11'].extraIncome,120);assert.deepEqual(s.days[key].sessions,days[key].sessions);assert.equal(s.extraIncomes.length,1);
 undoExtraIncomeChange(s,'virtual-income',now);near(monthlyReport(s,'2026-10',now).earned,80);near(monthlyReport(s,'2026-11',now).earned,160);validateState(s);
});
test('a cross-midnight active shift does not pull today income into the preceding month',()=>{
 const s=fixture();s.trackingStart='2026-10-01';startWork(s,at('2026-10-30','09:00'));add(s,80,'2026-11-01');const d=dayStats(s,'2026-10-30',at('2026-11-01','01:00'));near(d.extraIncome,0);near(dayStats(s,'2026-11-01',at('2026-11-01','01:00')).extraIncome,80);assert.equal(s.days['2026-11-01'],undefined);near(monthStats(s,'2026-11-01',at('2026-11-01','01:00')).earned,80);assert.equal(monthStats(s,'2026-11-01',at('2026-11-01','01:00')).workedDays,0);
});
test('void, restore and repeated operations are idempotent with recoverable audit history',()=>{
 const s=fixture();work(s);add(s);const audit=s.extraIncomeAudit.length;add(s);assert.equal(s.extraIncomeAudit.length,audit);assert.equal(s.extraIncomes.length,1);
 setExtraIncomeVoided(s,'virtual-income',true,now);near(dayStats(s,key,now).earned,160);const count=s.extraIncomeAudit.length;setExtraIncomeVoided(s,'virtual-income',true,now);assert.equal(s.extraIncomeAudit.length,count);
 setExtraIncomeVoided(s,'virtual-income',false,now);near(dayStats(s,key,now).earned,240);assert.equal(s.extraIncomes.length,1);assert.equal(s.extraIncomeAudit.length,audit+2);validateState(s);
});
test('distinct legitimate records of the same amount count independently, while duplicate ids are rejected',()=>{
 const s=fixture();add(s,80,key,'first');add(s,80,key,'second');near(dayStats(s,key,now).extraIncome,160);
 const copy=structuredClone(s);copy.extraIncomes.push(structuredClone(copy.extraIncomes[0]));assert.throws(()=>validateState(copy),/记录无效/);
 assert.throws(()=>saveExtraIncome(s,{id:'first',category:'奖金',amount:90,date:key,note:'virtual bonus'},now),/标识已存在/);
});
test('goal uses date of attribution including all creation-day income, never earlier dates',()=>{
 const s=fixture();add(s,80,'2026-11-02','before');add(s,80,key,'same-day');saveGoal(s,{name:'virtual goal',amount:1000},at(key,'15:00'));near(goalStats(s,now).pool,80);
 edit(s,'before',{date:'2026-11-04'});near(goalStats(s,now).pool,160);edit(s,'same-day',{date:'2026-11-01'});near(goalStats(s,now).pool,80);
});
test('completed goal settlements remain immutable after void and restore, allowing the remaining pool to go negative',()=>{
 const s=fixture();saveGoal(s,{name:'virtual goal',amount:200},at(key,'08:00'));work(s);add(s);settleGoal(s,now);markGoalNotified(s,s.goal.id,now);const settlements=structuredClone(s.goalPool.settlements);near(goalStats(s,now).pool,40);
 setExtraIncomeVoided(s,'virtual-income',true,now);near(goalStats(s,now).pool,-40);assert.deepEqual(s.goalPool.settlements,settlements);assert.equal(dueGoalNotice(s),null);
 setExtraIncomeVoided(s,'virtual-income',false,now);near(goalStats(s,now).pool,40);assert.equal(settleGoal(s,now),null);assert.deepEqual(s.goalPool.settlements,settlements);
});
test('salary/time corrections revalue wages but preserve manual income and fish estimate exclusion',()=>{
 const s=fixture();work(s);add(s);const ledger=structuredClone(s.extraIncomes);saveSettings(s,{...s.settings,salary:8400},key,now);near(dayStats(s,key,now).earned,280);near(s.days[key].summary.wageEarned,200);near(s.days[key].summary.extraIncome,80);
 editCalendarDay(s,{date:key,kind:'work',payMode:'standard',includeOvertimePay:true,preserveArrangement:true,records:[{sessionIndex:0,start:at(key,'10:00'),end:at(key,'14:00')}]},now);near(dayStats(s,key,now).earned,230);assert.deepEqual(s.extraIncomes,ledger);near(s.days[key].summary.earned,230);validateState(s);
});
test('returning to work or repeated clock-out cannot add the same windfall twice',()=>{
 const s=fixture();work(s);add(s);resumeWork(s,key,at(key,'15:00'));clockOut(s,at(key,'18:00'));near(dayStats(s,key,now).extraIncome,80);near(dayStats(s,key,now).earned,360);clockOut(s,at(key,'18:00'));near(s.days[key].summary.extraIncome,80);assert.equal(s.extraIncomes.length,1);
});
test('old summaries and report cutoffs are recomputed by attribution date without introducing future dates',()=>{
 const s=fixture();work(s);delete s.days[key].summary.wageEarned;delete s.days[key].summary.extraIncome;const old=monthlyReport(s,'2026-11',at('2026-11-04','18:00'));saveMonthlyReview(s,old);add(s,80,'2026-11-05','later');near(s.monthlyReviews.snapshots['2026-11'].extraIncome,0);add(s,80,key,'historical');near(s.monthlyReviews.snapshots['2026-11'].extraIncome,80);near(summaryFishStats(s,s.days[key].summary).earned,240);assert.ok(s.monthlyReviews.snapshots['2026-11'].recalculatedAt);
});
test('new ledger upgrades only on use, old formats remain unchanged and later daily-cost edits cannot downgrade format',()=>{
 const s=fixture(),old=structuredClone(s);validateState(s);assert.deepEqual(s,old);add(s);assert.equal(s.version,6);const bad=structuredClone(s);bad.version=5;assert.throws(()=>validateState(bad),/新版/);
 addFixed(s,{name:'virtual meal',amount:5,period:'day',repeat:'daily',allocation:'workday'},key,now);editDailyFixedCosts(s,{date:key,items:[{fixedId:s.fixed.at(-1).id,amount:0}]},now);assert.equal(s.version,6);const round=JSON.parse(JSON.stringify(s));validateState(round);assert.deepEqual(round,s);
});
test('invalid data and stale concurrent edit fail atomically even when timestamps are equal',()=>{
 const s=fixture();add(s);const old=structuredClone(s.extraIncomes[0]);edit(s,old.id,{amount:90});const before=JSON.stringify(s);
 assert.throws(()=>saveExtraIncome(s,{...old,existing:true,amount:100,expectedRevision:old.revision},now),/已有新修改/);assert.equal(JSON.stringify(s),before);
 for(const changes of [{amount:0},{amount:-1},{amount:1.234},{amount:1e9+1},{date:'2026-11-10'},{date:'2026-02-30'},{category:'加班费'},{note:'x'.repeat(121)}]){assert.throws(()=>saveExtraIncome(s,{category:'红包',amount:80,date:key,...changes},now));assert.equal(JSON.stringify(s),before);}
});
test('income cannot masquerade as an existing overtime decision source',()=>{
 const s=fixture();startWork(s,at(key,'09:00'));clockOut(s,at(key,'21:00'),{kind:'paid',amount:80});const before=JSON.stringify(s);assert.throws(()=>add(s,80,key,s.days[key].overtimeDecisions[0].id),/来源重复/);assert.equal(JSON.stringify(s),before);
});
