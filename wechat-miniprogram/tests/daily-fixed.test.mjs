import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,at,saveSettings,startWork,clockOut,addFixed,stopFixed,fixedForDate,periodicFixedForDate,dailyFixedRows,dayStats,monthStats,monthlyReport,saveMonthlyReview,editDailyFixedCosts,undoDailyFixedChange,undoableDailyFixedChange,validateState,saveGoal,goalStats,settleGoal} from '../core/model.js';
import {editCalendarDay,undoCalendarChange,fixedBurdenQuote} from '../core/calendar.js';
const now=at('2026-11-09','22:00'),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function fixture(key='2026-11-01') {const s=emptyState(new Date(at(key,'08:00')));saveSettings(s,{...s.settings,salary:3360},'today',at(key,'08:00'));s.onboarded=true;return s;}
function daily(s,repeat='workday',amount=12,from='2026-11-03'){addFixed(s,{name:`virtual ${repeat}`,amount,period:'day',repeat,allocation:'workday'},from,now);return s.fixed.at(-1).id;}
function plan(s,date,kind,payMode=kind==='work'?'standard':'unpaid',stamp=now){return editCalendarDay(s,{date,kind,payMode,includeOvertimePay:true,confirmedBackfill:true},stamp);}
function work(s,date){startWork(s,at(date,'09:00'));clockOut(s,at(date,'18:00'));}

test('daily amount repeats exactly, independently of month length and number of attendance workdays',()=>{
  const s=fixture();daily(s,'daily',8,'2026-11-01');for(const key of ['2026-11-01','2026-11-07','2026-11-30','2026-12-01','2028-02-29'])near(fixedForDate(s,key),8);
  near(monthStats(s,'2026-11-01',at('2026-11-30','23:00')).fixed,30*8);near(monthStats(s,'2026-12-01',at('2026-12-31','23:00')).fixed,31*8);near(monthStats(s,'2028-02-01',at('2028-02-29','23:00')).fixed,29*8);validateState(s);
});
test('workday rules respect makeup, unpaid rest-day overtime, leave, swap and rest with no future accumulation',()=>{
  const s=fixture();daily(s);near(fixedForDate(s,'2026-11-07'),0);plan(s,'2026-11-07','work');near(fixedForDate(s,'2026-11-07'),12);
  plan(s,'2026-11-08','overtime');near(fixedForDate(s,'2026-11-08'),12);
  for(const kind of ['leave','swap','rest']){plan(s,'2026-11-06',kind);near(fixedForDate(s,'2026-11-06'),0);}
  near(monthStats(s,'2026-11-01',at('2026-11-05','23:00')).fixed,3*12);assert.equal(s.days['2026-11-08'].sessions.length,0);near(dayStats(s,'2026-11-08',now).earned,0);
});
test('per-date cancel/custom/reset never changes the rule, adjacent days or other item amounts',()=>{
  const s=fixture(),a=daily(s),b=daily(s,'daily',5),rules=structuredClone(s.fixed);
  editDailyFixedCosts(s,{date:'2026-11-04',items:[{fixedId:a,amount:0},{fixedId:b,amount:7}]},now);
  near(fixedForDate(s,'2026-11-04'),7);near(fixedForDate(s,'2026-11-03'),17);near(fixedForDate(s,'2026-11-05'),17);assert.deepEqual(s.fixed,rules);
  editDailyFixedCosts(s,{date:'2026-11-04',reset:true},now);near(fixedForDate(s,'2026-11-04'),17);undoDailyFixedChange(s,'2026-11-04',now);near(fixedForDate(s,'2026-11-04'),7);validateState(s);
});
test('single date overrides work without attendance records, including future or rest dates, without creating wage days',()=>{
  const s=fixture(),id=daily(s);editDailyFixedCosts(s,{date:'2026-11-14',items:[{fixedId:id,amount:6}]},now);
  near(fixedForDate(s,'2026-11-14'),6);assert.equal(s.days['2026-11-14'],undefined);near(monthStats(s,'2026-11-01',now).fixed,5*12);near(dayStats(s,'2026-11-14',now).earned,0);
});
test('monthly snapshots and daily fees are separate; toggling periodic inclusion never duplicates or excludes daily fees',()=>{
  const s=fixture();addFixed(s,{name:'virtual rent',amount:2100,period:'month',allocation:'workday'},'2026-11-01');work(s,'2026-11-03');
  plan(s,'2026-11-03','work');editCalendarDay(s,{date:'2026-11-03',kind:'work',payMode:'standard',includeOvertimePay:true,preserveArrangement:true,fixedBurden:{enabled:false}},now);
  const id=daily(s);near(periodicFixedForDate(s,'2026-11-03'),0);near(fixedForDate(s,'2026-11-03'),12);assert.equal(fixedBurdenQuote(s,'2026-11-03',now).items.length,1);
  editCalendarDay(s,{date:'2026-11-03',kind:'work',payMode:'standard',includeOvertimePay:true,preserveArrangement:true,fixedBurden:{enabled:true}},now);
  near(fixedForDate(s,'2026-11-03'),112);editDailyFixedCosts(s,{date:'2026-11-03',items:[{fixedId:id,amount:0}]},now);near(fixedForDate(s,'2026-11-03'),100);
  assert.ok(s.days['2026-11-03'].fixedBurden.items.every(row=>row.id!==id));validateState(s);
});
test('start is inclusive, stop is exclusive and stops future custom dates while preserving past overrides',()=>{
  const s=fixture(),id=daily(s,'daily',10,'2026-11-03');near(fixedForDate(s,'2026-11-02'),0);near(fixedForDate(s,'2026-11-03'),10);
  editDailyFixedCosts(s,{date:'2026-11-04',items:[{fixedId:id,amount:3}]},now);editDailyFixedCosts(s,{date:'2026-12-01',items:[{fixedId:id,amount:99}]},now);
  const history=structuredClone(s.dailyFixedOverrides);stopFixed(s,id,'2026-11-05',now);near(fixedForDate(s,'2026-11-04'),3);near(fixedForDate(s,'2026-11-05'),0);near(fixedForDate(s,'2026-12-01'),0);assert.deepEqual(s.dailyFixedOverrides,history);
  const future=daily(s,'daily',20,'2026-12-01');stopFixed(s,future,'2026-11-09',now);near(fixedForDate(s,'2026-12-01'),0);validateState(s);
});
test('global attendance changes keep historical amounts, captured days and explicit plans while changing future unrecorded dates',()=>{
  const s=fixture();daily(s,'workday',10,'2026-11-01');work(s,'2026-11-06');plan(s,'2026-11-14','rest');
  const old=structuredClone(s.days['2026-11-06']);saveSettings(s,{...s.settings,scheduleMode:'everyday',weekdays:[0,1,2,3,4,5,6]},'today',now);
  near(fixedForDate(s,'2026-11-07'),0);near(fixedForDate(s,'2026-11-15'),10);near(fixedForDate(s,'2026-11-14'),0);assert.deepEqual(s.days['2026-11-06'],old);
  saveSettings(s,{...s.settings,scheduleMode:'double',weekdays:[1,2,3,4,5]},'today',at('2026-11-16','08:00'));near(fixedForDate(s,'2026-11-15'),10);near(fixedForDate(s,'2026-11-21'),0);validateState(s);
});
test('daily workday choices follow alternating weeks over month boundary and all supported attendance modes',()=>{
  for(const [mode,weekdays,expected]of [['double',[1,2,3,4,5],0],['single',[1,2,3,4,5,6],9],['996',[1,2,3,4,5,6],9],['everyday',[0,1,2,3,4,5,6],9]]){
    const s=fixture();saveSettings(s,{...s.settings,scheduleMode:mode,weekdays},'today',at('2026-11-01','08:00'));daily(s,'workday',9,'2026-11-01');near(fixedForDate(s,'2026-11-07'),expected);
  }
  const s=fixture();saveSettings(s,{...s.settings,scheduleMode:'alternating',anchorWeek:'2026-11-02',anchorKind:'double',weekdays:[1,2,3,4,5],alternateWeekdays:[1,2,3,4,5,6]},'today',at('2026-11-01','08:00'));daily(s,'workday',9,'2026-11-01');near(fixedForDate(s,'2026-11-28'),9);near(fixedForDate(s,'2026-12-05'),0);
});
test('no-workday calendars can save everyday fees without division, and workday fees remain zero',()=>{
  const s=fixture();s.settings.weekdays=[];daily(s,'daily',5);daily(s,'workday',10);near(fixedForDate(s,'2026-11-04'),5);validateState(s);
});
test('daily cost corrections refresh summary/month/goal once, retain completed settlements and preserve attendance',()=>{
  const s=fixture();saveGoal(s,{name:'virtual goal',amount:100},at('2026-11-01','08:00'));work(s,'2026-11-03');settleGoal(s,now);const settled=structuredClone(s.goalPool.settlements),sessions=structuredClone(s.days['2026-11-03'].sessions);
  saveMonthlyReview(s,monthlyReport(s,'2026-11',now));const before=monthStats(s,'2026-11-01',now).net,pool=goalStats(s,now).pool,id=daily(s,'daily',10);
  near(s.days['2026-11-03'].summary.fixed,10);editDailyFixedCosts(s,{date:'2026-11-03',items:[{fixedId:id,amount:25}]},now);
  near(s.days['2026-11-03'].summary.fixed,25);near(s.days['2026-11-03'].summary.net,135);near(monthStats(s,'2026-11-01',now).net,before-85);near(goalStats(s,now).pool,pool-85);
  near(s.monthlyReviews.snapshots['2026-11'].fixed,85);assert.deepEqual(s.goalPool.settlements,settled);assert.deepEqual(s.days['2026-11-03'].sessions,sessions);
  undoDailyFixedChange(s,'2026-11-03',now);near(s.days['2026-11-03'].summary.fixed,10);validateState(s);
});
test('cross-midnight work does not duplicate daily fees, and correcting day plans recalculates only that date',()=>{
  const s=fixture();daily(s,'daily',10);daily(s,'workday',5);startWork(s,at('2026-11-06','09:00'));clockOut(s,at('2026-11-07','01:00'),{kind:'free',amount:0});
  near(fixedForDate(s,'2026-11-06'),15);near(fixedForDate(s,'2026-11-07'),10);plan(s,'2026-11-07','work');near(fixedForDate(s,'2026-11-07'),15);near(fixedForDate(s,'2026-11-06'),15);undoCalendarChange(s,'2026-11-07',now);near(fixedForDate(s,'2026-11-07'),10);
});
test('invalid entries fail atomically, cannot inject other item ids, duplicate costs or downgrade format',()=>{
  const s=fixture(),id=daily(s),before=JSON.stringify(s);
  for(const items of [[{fixedId:id,amount:-1}],[{fixedId:id,amount:NaN}],[{fixedId:'not-real',amount:2}],[{fixedId:id,amount:2},{fixedId:id,amount:4}]]){assert.throws(()=>editDailyFixedCosts(s,{date:'2026-11-03',items},now));assert.equal(JSON.stringify(s),before);}
  const down=structuredClone(s);down.version=4;assert.throws(()=>validateState(down),/新版/);
  editDailyFixedCosts(s,{date:'2026-11-03',items:[{fixedId:id,amount:0}]},now);assert.equal(undoableDailyFixedChange(s,'2026-11-03').safe,true);
  const round=JSON.parse(JSON.stringify(s));validateState(round);assert.deepEqual(round,s);
});
