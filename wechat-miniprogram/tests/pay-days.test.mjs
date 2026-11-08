import { legacyStartWork as startWork } from './fixtures.mjs';
const addExpense = (s, e) => realAddExpense(s, e, at('2026-11-30','23:00'));
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, at, dateKey, datesInMonth, plannedPayDays, effectivePayDays, payDaysModeForDate, settingsForDate, migratePayDays, validateSettings, validateState, isWorkday, ratePerMs,  clockOut, dayStats, monthStats, monthlyReport, saveMonthlyReview, addFixed, addExpense as realAddExpense, fixedForDate, saveGoal, goalStats } from '../core/model.js';
import { parseBackup } from '../core/backup.js';
const close = (a, b) => assert.ok(Math.abs(a-b) < 1e-6, `${a} ≈ ${b}`);
function fixture(date='2026-11-01', mode='double') {
  const s=emptyState(new Date(at(date,'08:00')));s.onboarded=true;s.settings.salary=12345.67;s.settings.scheduleMode=mode;
  s.settings.weekdays=mode==='everyday'?[0,1,2,3,4,5,6]:['single','996'].includes(mode)?[1,2,3,4,5,6]:[1,2,3,4,5];
  s.settings.anchorWeek='2026-11-02';s.settings.anchorKind='double';if(mode==='996')s.settings.end='21:00';
  s.settings=settingsForDate(date,s.settings);return s;
}
function fullMonth(state,month){const dates=datesInMonth(month+'-01');for(const key of dates){if(!isWorkday(key,state.settings))continue;startWork(state,at(key,state.settings.start));clockOut(state,at(key,state.settings.end));}return monthStats(state,dates.at(-1),at(dates.at(-1),'23:00'));}
test('new users default to actual current-month days; five calendars have known November/December totals',()=>{
  const expected={double:[21,23],single:[25,27],alternating:[23,25],'996':[25,27],everyday:[30,31]};
  for(const [mode,counts]of Object.entries(expected)){const s=fixture('2026-11-01',mode);assert.equal(s.settings.payDaysMode,'auto');assert.equal(s.settings.payDays,counts[0]);assert.equal(plannedPayDays('2026-11-01',s.settings),counts[0]);assert.equal(effectivePayDays('2026-12-01',s.settings),counts[1]);}
});
test('a complete recorded month earns the configured salary across five calendars and 28/29/30/31-day months',()=>{
  for(const month of ['2027-02','2028-02','2028-04','2028-05','2000-02','2100-02'])for(const mode of ['double','single','alternating','996','everyday']){
    const s=fixture(month+'-01',mode),stats=fullMonth(s,month);close(stats.earned,s.settings.salary);close(stats.baseEarned??stats.earned,s.settings.salary);
    assert.equal(stats.recorded,plannedPayDays(month+'-01',s.settings));assert.equal(stats.days.filter(d=>d.worked>0).length,stats.recorded);validateState(s);
  }
});
test('month rollover recalculates automatic pay days without needing the settings screen or continuous runtime',()=>{
  const s=fixture();s.settings.salary=21000;startWork(s,at('2026-11-30','09:00'));clockOut(s,at('2026-11-30','18:00'));
  close(dayStats(s,'2026-11-30',at('2026-12-01','08:00')).earned,1000);startWork(s,at('2026-12-01','09:00'));clockOut(s,at('2026-12-01','18:00'));
  assert.equal(s.days['2026-11-30'].settings.payDays,21);assert.equal(s.days['2026-12-01'].settings.payDays,23);assert.equal(s.days['2026-12-01'].settings.payDaysMonth,'2026-12');close(dayStats(s,'2026-12-01',at('2026-12-01','18:00')).earned,21000/23);
});
test('manual override supports fractional days, is confined to its month, and defaults back to automatic next month',()=>{
  const s=fixture();s.settings={...s.settings,payDaysMode:'manual',payDays:22.5,payDaysMonth:'2026-11'};validateSettings(s.settings);
  startWork(s,at('2026-11-30','09:00'));clockOut(s,at('2026-11-30','18:00'));close(dayStats(s,'2026-11-30',at('2026-12-01','08:00')).earned,s.settings.salary/22.5);
  assert.equal(payDaysModeForDate('2026-12-01',s.settings),'auto');startWork(s,at('2026-12-01','09:00'));clockOut(s,at('2026-12-01','18:00'));assert.equal(s.days['2026-12-01'].settings.payDaysMode,'auto');assert.equal(s.days['2026-12-01'].settings.payDays,23);
  for(const patch of [{payDays:0},{payDays:-1},{payDays:32},{payDays:NaN},{payDaysMonth:'2026-13'},{payDaysMode:'other'}])assert.throws(()=>validateSettings({...s.settings,...patch}));
});
test('changing salary/calendar/override preserves recorded days and uses the new definition only on new dates',()=>{
  const s=fixture();s.settings.salary=21000;startWork(s,at('2026-11-02','09:00'));clockOut(s,at('2026-11-02','18:00'));const saved=structuredClone(s.days['2026-11-02']);
  s.settings={...s.settings,salary:25000,scheduleMode:'996',weekdays:[1,2,3,4,5,6],end:'21:00'};startWork(s,at('2026-11-03','09:00'));clockOut(s,at('2026-11-03','21:00'));
  assert.deepEqual(s.days['2026-11-02'],saved);close(dayStats(s,'2026-11-02',at('2026-11-03','21:00')).earned,1000);close(dayStats(s,'2026-11-03',at('2026-11-03','21:00')).earned,1000);
  s.settings={...s.settings,payDaysMode:'manual',payDays:20,payDaysMonth:'2026-11'};startWork(s,at('2026-11-04','09:00'));clockOut(s,at('2026-11-04','21:00'));close(dayStats(s,'2026-11-04',at('2026-11-04','21:00')).earned,1250);assert.equal(s.days['2026-11-03'].settings.payDays,25);
});
test('alternating weeks respect their anchor and custom weekdays across month boundaries',()=>{
  const s=fixture('2028-02-01','alternating');s.settings.anchorWeek='2028-01-31';assert.equal(plannedPayDays('2028-02-01',s.settings),23);assert.equal(isWorkday('2028-02-05',s.settings),false);
  s.settings.anchorKind='single';assert.equal(plannedPayDays('2028-02-01',s.settings),23);assert.equal(isWorkday('2028-02-05',s.settings),true);
  s.settings.weekdays=[1,2,3,4];s.settings.alternateWeekdays=[1,2,3,4,5];assert.equal(plannedPayDays('2028-02-01',s.settings),19);
  assert.throws(()=>plannedPayDays('2028-02-01',{...s.settings,anchorWeek:'2028-02-01'}),/基准/);
});
test('zero workdays has no income or infinite rate; future workdays are not fabricated as attendance',()=>{
  const s=fixture();s.settings.weekdays=[];s.settings=settingsForDate('2026-11-01',s.settings);validateSettings(s.settings);assert.equal(s.settings.payDays,0);assert.equal(ratePerMs('2026-11-03',s.settings),0);assert.equal(dayStats(s,'2026-11-03',at('2026-11-03','18:00')).daily,0);
  assert.throws(()=>startWork(s,at('2026-11-03','09:00')),/工作日/);assert.equal(monthStats(s,'2026-11-30',at('2026-11-30','23:00')).earned,0);assert.equal(monthlyReport(s,'2026-11',at('2026-11-30','23:00')).recorded,0);
});
test('auto denominator keeps late clock-in proportional, excludes lunch, and caps automatic salary at shift end',()=>{
  const s=fixture();s.settings.salary=21000;startWork(s,at('2026-11-03','10:00'));
  close(dayStats(s,'2026-11-03',at('2026-11-03','18:00')).earned,875);close(dayStats(s,'2026-11-03',at('2026-11-03','23:00')).earned,875);assert.equal(dayStats(s,'2026-11-03',at('2026-11-03','23:00')).overtime,5*3600000);
});
test('fixed/monthly costs and goal pool remain consistent: salary minus full costs, no double allocation',()=>{
  for(const mode of ['double','single','alternating','996','everyday']){const s=fixture('2026-11-01',mode);s.settings.salary=12000;addFixed(s,{name:'固定负担',amount:3000,period:'month',allocation:'workday'},'2026-11-01');addExpense(s,{name:'整月成本',amount:1000,date:'2026-11-01',month:'2026-11',scope:'month',category:'自定义'});saveGoal(s,{name:'目标',amount:99999},at('2026-11-01','08:00'));const stats=fullMonth(s,'2026-11');close(stats.fixed,3000);close(stats.expenses,1000);close(stats.net,8000);close(goalStats(s,at('2026-11-30','23:00')).pool,8000);assert.equal(s.expenses[0].allocationDates.length,plannedPayDays('2026-11-01',s.settings));}
});
test('legacy migration archives custom days once and leaves history, costs, summaries, report cutoffs and goals untouched',()=>{
  const s=fixture();delete s.settings.payDaysMode;delete s.settings.payDaysMonth;s.settings.payDays=21.75;
  addFixed(s,{name:'旧固定',amount:2100,period:'month',allocation:'workday'},'2026-11-01');addExpense(s,{name:'旧整月',amount:630,date:'2026-11-01',month:'2026-11',scope:'month',category:'自定义'});startWork(s,at('2026-11-03','09:00'));clockOut(s,at('2026-11-03','18:00'));saveGoal(s,{name:'旧目标',amount:99999},at('2026-11-01','08:00'));saveMonthlyReview(s,monthlyReport(s,'2026-11',at('2026-11-03','19:00')),true);
  const before=structuredClone(s),pool=goalStats(s,at('2026-11-03','19:00')).pool;assert.equal(migratePayDays(s,at('2026-11-04','08:00')),true);assert.equal(s.settings.payDaysMode,'auto');assert.equal(s.settings.payDays,21);assert.deepEqual(s.payDaysMigration.previousSettings,before.settings);
  for(const field of ['days','fixed','expenses','monthlyReviews','goal','goalPool'])assert.deepEqual(s[field],before[field]);close(goalStats(s,at('2026-11-03','19:00')).pool,pool);close(dayStats(s,'2026-11-03',at('2026-11-04','08:00')).earned,s.settings.salary/21.75);
  const encoded=JSON.stringify(s);assert.equal(migratePayDays(s,at('2026-12-01','08:00')),false);assert.equal(JSON.stringify(s),encoded);startWork(s,at('2026-11-04','09:00'));clockOut(s,at('2026-11-04','18:00'));close(dayStats(s,'2026-11-04',at('2026-11-04','18:00')).earned,s.settings.salary/21);validateState(s);
});
test('explicit manual choices are not migrated and JSON persistence preserves new settings plus old snapshots',async()=>{
  const s=fixture();s.settings={...s.settings,payDaysMode:'manual',payDays:22,payDaysMonth:'2026-11'};assert.equal(migratePayDays(s),false);startWork(s,at('2026-11-03','09:00'));clockOut(s,at('2026-11-03','18:00'));
  const loaded=parseBackup(JSON.stringify({format:'wonangfei-backup',state:s}));assert.deepEqual(loaded,s);validateState(loaded);
});
