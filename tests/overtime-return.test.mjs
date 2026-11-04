import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, at, startWork, resumeWork, clockOut, needsOvertimeDecision, dayStats, monthStats, monthlyReport, addBreak, correctStartTime, saveGoal, goalStats, validateState } from '../src/model.mjs';
const key='2026-11-03',hour=3600000;
function fixture(date=key){const s=emptyState(new Date(at(date,'08:00')));s.settings.salary=17600;s.settings.payDays=22; delete s.settings.payDaysMode; delete s.settings.payDaysMonth;return s;}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} ≈ ${b}`);
test('return before planned end adds only actual paid intervals; stop-return gaps are neither paid nor overtime',()=>{
 const s=fixture();startWork(s,at(key,'09:00'));clockOut(s,at(key,'11:00'));resumeWork(s,key,at(key,'12:30'));resumeWork(s,key,at(key,'12:30'));
 assert.equal(s.days[key].sessions.length,2);assert.equal(needsOvertimeDecision(s,at(key,'18:00')),false);
 const summary=clockOut(s,at(key,'18:00'));close(summary.earned,700);close(summary.actual,7*hour);assert.equal(summary.overtime,0);assert.equal(summary.status,'ontime');validateState(s);
});
test('strictly greater than two hours requires a decision; exactly two does not; cancelling validation changes nothing',()=>{
 let s=fixture();startWork(s,at(key,'09:00'));assert.equal(needsOvertimeDecision(s,at(key,'20:00')),false);clockOut(s,at(key,'20:00'));assert.equal(s.days[key].overtimeDecisions,undefined);
 s=fixture();startWork(s,at(key,'09:00'));const now=at(key,'20:00')+1,before=JSON.stringify(s);assert.equal(needsOvertimeDecision(s,now),true);
 for(const decision of [undefined,{kind:'paid',amount:0},{kind:'paid',amount:NaN},{kind:'free',amount:10},{kind:'paid',amount:1e9+1}]){assert.throws(()=>clockOut(s,now,decision),/请选择免费加班/);assert.equal(JSON.stringify(s),before);}
 const summary=clockOut(s,now,{kind:'free',amount:0});assert.equal(summary.earned,800);assert.equal(summary.overtimePay,0);assert.equal(s.days[key].overtimeDecisions.length,1);validateState(s);
});
test('paid overtime is a single audited income entry; repeated clock-out never adds again; later return adds only its own fee',()=>{
 const s=fixture();saveGoal(s,{name:'目标',amount:5000},at(key,'09:00'));startWork(s,at(key,'09:00'));
 s.expenses.push({id:'cost',name:'成本',date:key,amount:100});const first=clockOut(s,at(key,'20:01'),{kind:'paid',amount:200});assert.equal(first.earned,1000);assert.equal(first.net,900);
 clockOut(s,at(key,'20:02'),{kind:'paid',amount:200});assert.equal(s.days[key].overtimeDecisions.length,1);assert.equal(dayStats(s,key,at(key,'20:30')).earned,1000);
 resumeWork(s,key,at(key,'21:00'));resumeWork(s,key,at(key,'21:00'));const last=clockOut(s,at(key,'22:00'),{kind:'paid',amount:50});
 assert.equal(last.earned,1050);assert.equal(last.overtimePay,250);assert.equal(s.days[key].sessions.length,2);assert.equal(s.days[key].overtimeDecisions.length,2);
 close(last.actual,11*hour+60000);assert.equal(monthlyReport(s,'2026-11',at(key,'22:00')).earned,1050);assert.equal(goalStats(s,at(key,'22:00')).pool,950);
 assert.equal(dayStats(s,key,at(key,'23:00')).overtime,last.overtime);validateState(s);
});
test('cross-date/month returning intervals keep original shift attribution and permit correcting the resumed actual date',()=>{
 const date='2026-10-30',s=fixture(date);saveGoal(s,{name:'目标',amount:5000},at(date,'09:00'));startWork(s,at(date,'09:00'));clockOut(s,at(date,'19:00'));
 resumeWork(s,date,at('2026-11-01','01:00'));const end=at('2026-11-01','02:01');clockOut(s,end,{kind:'paid',amount:150});
 const stats=dayStats(s,date,end);assert.equal(stats.earned,950);close(stats.overtime,hour+end-at('2026-11-01','01:00'));assert.equal(monthStats(s,'2026-11-01',end).earned,0);assert.equal(monthStats(s,date,end).earned,950);
 correctStartTime(s,{date,sessionIndex:1,start:at('2026-11-01','01:30')},end);
 assert.equal(s.days[date].sessions[1].start,at('2026-11-01','01:30'));assert.equal(s.days[date].summary.overtimePay,150);assert.equal(s.days[date].summary.earned,950);
 close(s.days[date].summary.overtime,hour+end-at('2026-11-01','01:30'));assert.equal(goalStats(s,end).pool,950);validateState(s);
});
test('averages use income including fees over effective time excluding fish; monthly daily average uses net over positive-work days',()=>{
 const s=fixture();startWork(s,at(key,'09:00'));addBreak(s,{date:key,minutes:90,name:'休息'},at(key,'12:00'));
 s.expenses.push({id:'cost',name:'成本',date:key,amount:100});let d=dayStats(s,key,at(key,'18:00'));close(d.actual,6.5*hour);close(d.hourly,800/6.5);
 const later=dayStats(s,key,at(key,'19:00'));close(later.earned,800);assert.ok(later.hourly<d.hourly);
 clockOut(s,at(key,'20:01'),{kind:'paid',amount:100});startWork(s,at('2026-11-04','09:00'));clockOut(s,at('2026-11-04','09:00'));
 const m=monthStats(s,key,at('2026-11-04','12:00'));assert.equal(m.workedDays,1);assert.equal(m.averageDaily,800);close(m.hourly,m.earned/m.actual*hour);
 const empty=monthStats(fixture(),key,at(key,'09:00'));assert.equal(empty.averageDaily,null);assert.equal(empty.hourly,null);assert.equal(empty.secondly,null);
});
