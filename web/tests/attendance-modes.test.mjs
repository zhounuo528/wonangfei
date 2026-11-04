import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, at, datesInMonth, isWorkday, validateSettings, validateState, startWork, clockOut, dayStats, monthStats, monthlyReport, saveMonthlyReview, addFixed, fixedForDate, addExpense, expenseForDate, dueReminder, scheduledMs } from '../src/model.mjs';
import { parseBackup } from '../src/browser-store.mjs';
const date = '2028-02-01', all = [0, 1, 2, 3, 4, 5, 6], six = [1, 2, 3, 4, 5, 6];
function fixture(mode = 'double') {
  const state = emptyState(new Date(at(date, '08:00'))); state.onboarded = true;
  state.settings.salary = 17600; state.settings.payDays = 22; delete state.settings.payDaysMode; delete state.settings.payDaysMonth; state.settings.scheduleMode = mode;
  state.settings.weekdays = mode === 'everyday' ? [...all] : ['996', 'single'].includes(mode) ? [...six] : [1, 2, 3, 4, 5];
  if (mode === '996') state.settings.end = '21:00';
  state.demo = { time: at('2028-02-29', '22:00'), wall: Date.now() + 3600000 };
  return state;
}
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} ≈ ${expected}`);

test('all five modes and legacy settings validate; year-round rejects missing or duplicate weekdays', () => {
  for (const mode of ['double', 'single', 'alternating', '996', 'everyday']) validateSettings(fixture(mode).settings);
  const legacy = fixture().settings; delete legacy.scheduleMode; validateSettings(legacy);
  for (const weekdays of [[], [1,2,3,4,5,6], [0,1,2,3,4,5,5], [0,1,2,3,4,5,6,6]]) assert.throws(() => validateSettings({ ...fixture('everyday').settings, weekdays }), /每天均为工作日/);
  assert.throws(() => validateSettings({ ...legacy, scheduleMode: 'unknown' }), /考勤|996/);
});
test('996 and year-round workday counts honor 28/29/30/31-day months and leap-century rules', () => {
  for (const [month, length, sixDays] of [['2027-02',28,24],['2028-02',29,25],['2028-03',31,27],['2028-04',30,25],['2100-02',28,24],['2000-02',29,25]]) {
    const dates = datesInMonth(month + '-01'); assert.equal(dates.length, length);
    assert.equal(dates.filter(key => isWorkday(key, fixture('everyday').settings)).length, length);
    assert.equal(dates.filter(key => isWorkday(key, fixture('996').settings)).length, sixDays);
  }
  for (const [year, expected] of [[2027,365],[2028,366],[2100,365],[2000,366]]) assert.equal(Array.from({length:12},(_,i)=>datesInMonth(`${year}-${String(i+1).padStart(2,'0')}-01`).filter(key=>isWorkday(key,fixture('everyday').settings)).length).reduce((a,b)=>a+b,0), expected);
});
test('996 pays recorded Saturdays until its recorded end; Sunday remains rest; custom hours remain valid', () => {
  const s = fixture('996'); startWork(s, at('2028-02-05', '09:00'));
  const stats = dayStats(s, '2028-02-05', at('2028-02-05', '21:00')); close(stats.earned,800); close(stats.elapsed,11*3600000); close(stats.hourly,800/11);
  close(dayStats(s,'2028-02-05',at('2028-02-05','22:00')).earned,800); close(dayStats(s,'2028-02-05',at('2028-02-05','22:00')).overtime,3600000);
  clockOut(s,at('2028-02-05','21:00')); assert.throws(()=>startWork(s,at('2028-02-06','09:00')),/工作日/);
  s.settings.start='08:30';s.settings.end='20:30';validateSettings(s.settings);startWork(s,at('2028-02-07','08:30'));
  assert.equal(s.days['2028-02-07'].settings.start,'08:30');assert.equal(s.days['2028-02-07'].settings.end,'20:30');close(dayStats(s,'2028-02-07',at('2028-02-07','20:30')).earned,800);validateState(s);
});
test('year-round pays an actually recorded Sunday at user hours, without inventing unrecorded attendance', () => {
  const s = fixture('everyday'); s.settings.start='10:00';s.settings.end='20:00';validateSettings(s.settings);
  assert.equal(monthStats(s,date,at('2028-02-29','22:00')).earned,0);assert.equal(monthlyReport(s,'2028-02',at('2028-02-29','22:00')).recorded,0);
  startWork(s,at('2028-02-06','10:00'));clockOut(s,at('2028-02-06','20:00'));
  close(scheduledMs('2028-02-06',s.settings),9*3600000);close(dayStats(s,'2028-02-06',at('2028-02-06','20:00')).earned,800);
  const report=monthlyReport(s,'2028-02',at('2028-02-29','22:00'));assert.equal(report.recorded,1);assert.equal(report.ontimeDays,1);close(report.earned,800);validateState(s);
});
test('new fixed and monthly custom costs share the selected calendar, distribute once, and never precharge future days', () => {
  for (const [mode,days] of [['996',25],['everyday',29]]) {
    const s=fixture(mode);addFixed(s,{name:'房租',amount:2900,period:'month',allocation:'workday'},date);
    addExpense(s,{name:'整月通勤',amount:1450,date,month:'2028-02',scope:'month',category:'自定义'});
    assert.equal(s.expenses[0].allocationDates.length,days);close(fixedForDate(s,date),2900/days);close(expenseForDate(s.expenses[0],date),1450/days);
    close(fixedForDate(s,'2028-02-06'),mode==='everyday'?100:0);close(expenseForDate(s.expenses[0],'2028-02-06'),mode==='everyday'?50:0);
    const first=monthStats(s,date,at(date,'11:00'));close(first.fixed,2900/days);close(first.expenses,1450/days);
    const total=monthStats(s,date,at('2028-02-29','22:00'));close(total.fixed,2900);close(total.expenses,1450);close(total.earned,0);close(total.net,-4350);validateState(s);
  }
});
test('switching modes preserves old shifts, summaries, report cutoffs and existing allocation snapshots', () => {
  const s=fixture();addFixed(s,{name:'旧房租',amount:2100,period:'month',allocation:'workday'},date);addExpense(s,{name:'旧整月花销',amount:2100,date,month:'2028-02',scope:'month',category:'自定义'});
  startWork(s,at(date,'09:00'));clockOut(s,at(date,'18:00'));saveMonthlyReview(s,monthlyReport(s,'2028-02',at(date,'18:00')),true);
  const original={day:structuredClone(s.days[date]),fixed:structuredClone(s.fixed),expenses:structuredClone(s.expenses),reviews:structuredClone(s.monthlyReviews)};
  s.settings={...s.settings,scheduleMode:'996',weekdays:[...six],start:'09:00',end:'21:00'};validateSettings(s.settings);
  s.settings={...s.settings,scheduleMode:'everyday',weekdays:[...all]};validateSettings(s.settings);
  assert.deepEqual(s.days[date],original.day);assert.deepEqual(s.fixed,original.fixed);assert.deepEqual(s.expenses,original.expenses);assert.deepEqual(s.monthlyReviews,original.reviews);
  close(dayStats(s,date,at(date,'21:00')).earned,800);assert.equal(s.days[date].settings.end,'18:00');close(fixedForDate(s,'2028-02-05'),0);close(expenseForDate(s.expenses[0],'2028-02-05'),0);
  addFixed(s,{name:'新计划',amount:2900,period:'month',allocation:'workday'},'2028-02-02');close(fixedForDate(s,date),100);close(fixedForDate(s,'2028-02-05'),100);
  startWork(s,at('2028-02-02','09:00'));clockOut(s,at('2028-02-02','21:00'));assert.equal(s.days['2028-02-02'].settings.scheduleMode,'everyday');
  const report=monthlyReport(s,'2028-02',at('2028-02-02','21:00'));close(report.earned,1600);close(report.net,1100);assert.equal(report.recorded,2);validateState(s);
});
test('year-round to alternating/double restores ordinary rules while past year-round snapshots stay seven-day', () => {
  const s=fixture('everyday');startWork(s,at('2028-02-06','09:00'));clockOut(s,at('2028-02-06','18:00'));
  const saved=structuredClone(s.days['2028-02-06']);s.settings={...s.settings,scheduleMode:'alternating',weekdays:[1,2,3,4,5],alternateWeekdays:[...six],anchorWeek:'2028-01-31',anchorKind:'double'};validateSettings(s.settings);
  assert.equal(isWorkday('2028-02-05',s.settings),false);assert.equal(isWorkday('2028-02-12',s.settings),true);assert.equal(isWorkday('2028-03-04',s.settings),false);
  s.settings.scheduleMode='double';assert.equal(isWorkday('2028-02-06',s.settings),false);assert.deepEqual(s.days['2028-02-06'],saved);close(dayStats(s,'2028-02-06',at('2028-02-06','21:00')).earned,800);validateState(s);
});
test('reminder uses Sunday workday rule, and mode changes do not alter the independent pay-day parameter', () => {
  const s=fixture('everyday'),stamp=at('2028-02-06','18:00');s.reminder={enabled:true,enabledAt:at('2028-02-06','09:00'),delivered:{}};assert.equal(dueReminder(s,stamp).date,'2028-02-06');
  s.settings={...s.settings,scheduleMode:'996',weekdays:[...six],end:'21:00'};assert.equal(dueReminder(s,at('2028-02-06','21:00')),null);assert.equal(s.settings.payDays,22);
});
test('both new modes and old snapshot definitions survive browser backup serialization', () => {
  for (const mode of ['996', 'everyday']) {
    const s = fixture(mode); startWork(s, at(date, s.settings.start)); clockOut(s, at(date, s.settings.end));
    const loaded = parseBackup(JSON.stringify({format:'wonangfei-backup',state:s}));
    assert.deepEqual(loaded, s); validateState(loaded);
  }
});
