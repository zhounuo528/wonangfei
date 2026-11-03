import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, demoState, dateKey, at, validateSettings, validateState, startWork, stopWork, activeShift, clockOut, addBreak, deleteBreak, dueReminder, markReminderDelivered, attendanceStatus, monthlyReport, dueMonthlyReview, saveMonthlyReview, isWorkday, datesInMonth, expenseForDate, convertLegacyFixed, settle, dayStats, monthStats, goalStats, addFixed, fixedForDate, fixedItemForDate, clockNow, addExpense } from '../src/model.mjs';
const key = '2026-11-03';
const stateFor = () => { const s = emptyState(new Date(at(key, '08:00'))); s.settings.salary = 17600; s.settings.payDays = 22; return s; };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} ≈ ${b}`);

test('8-hour shift earns daily pay, excludes lunch, and caps at shift end', () => {
  const s = stateFor(); startWork(s, at(key, '08:00'));
  close(dayStats(s, key, at(key, '12:00')).earned, 300);
  close(dayStats(s, key, at(key, '13:00')).earned, 300);
  close(dayStats(s, key, at(key, '22:00')).earned, 800);
  close(dayStats(s, key, at(key, '22:00')).elapsed, 8 * 3600000);
});
test('fish keeps gross pay, deducts only paid overlaps, merges duplicate intervals', () => {
  const s = stateFor(); startWork(s, at(key, '09:00')); s.days[key].fish.push({ start: at(key, '11:30'), end: at(key, '13:30') });
  const d = dayStats(s, key, at(key, '14:00'));
  close(d.earned, 400); close(d.fish, 3600000); close(d.actual, 3 * 3600000); close(d.hourly, 400 / 3);
  s.days[key].fish.push({ ...s.days[key].fish[0] }); s.days[key].sessions.push({ ...s.days[key].sessions[0] });
  close(dayStats(s, key, at(key, '14:00')).earned, 400); close(dayStats(s, key, at(key, '14:00')).fish, 3600000);
});
test('zero denominator returns null and never Infinity', () => {
  const s = stateFor(); assert.equal(dayStats(s, key).hourly, null);
  startWork(s, at(key, '09:00')); addBreak(s, { date: key, minutes: 10, name: '喝点水' }, at(key, '09:10'));
  const d = dayStats(s, key, at(key, '09:10')); close(d.earned, 100 / 6); assert.equal(d.hourly, null); assert.equal(d.secondly, null);
});
test('stop/resume pays no gap; duplicate start is idempotent', () => {
  const s = stateFor(); startWork(s, at(key, '09:00')); startWork(s, at(key, '09:01')); stopWork(s, at(key, '10:00')); startWork(s, at(key, '11:00'));
  assert.equal(s.days[key].sessions.length, 2); close(dayStats(s, key, at(key, '12:00')).earned, 200);
});
test('JSON restore recovers elapsed timestamps after sleep/close, without future day pay', () => {
  let s = stateFor(); startWork(s, at(key, '09:00')); addBreak(s, { date: key, minutes: 20, name: '假装很忙' }, at(key, '10:00'));
  s = JSON.parse(JSON.stringify(s)); validateState(s); close(dayStats(s, key, at(key, '15:00')).earned, 500);
  settle(s, at('2026-11-05', '12:00'));
  assert.equal(s.days[key].sessions[0].end, null); assert.equal(s.days[key].breaks[0].durationMs, 1200000); assert.ok(dayStats(s, key, at('2026-11-05', '12:00')).overtime > 0);
  close(dayStats(s, '2026-11-04', at('2026-11-05', '12:00')).earned, 0); close(monthStats(s, key, at('2026-11-05', '12:00')).earned, 800);
});
test('new month has no invented salary and goals reset by their period', () => {
  const s = emptyState(new Date(at('2026-10-30', '08:00'))); startWork(s, at('2026-10-30', '09:00'));
  const stamp = at('2026-11-02', '10:00'); settle(s, stamp);
  close(monthStats(s, '2026-11-02', stamp).earned, 0); assert.equal(goalStats(s, stamp).earned, 0);
});
test('salary and schedule snapshots preserve already recorded days', () => {
  const s = stateFor(); startWork(s, at(key, '09:00')); s.settings.salary = 35200; s.settings.end = '20:00';
  close(dayStats(s, key, at(key, '18:00')).earned, 800);
  stopWork(s, at(key, '18:00'));
  startWork(s, at('2026-11-04', '09:00')); close(dayStats(s, '2026-11-04', at('2026-11-04', '20:00')).earned, 1600);
});
test('working-day allocation, quarter/year monthly equivalence and stopping history', () => {
  const s = stateFor(); s.trackingStart = '2026-11-01';
  addFixed(s, { name: '房租', amount: 2100, period: 'month', allocation: 'workday' }, '2026-11-01');
  addFixed(s, { name: '保险', amount: 26400, period: 'year', allocation: 'workday' }, '2026-11-01');
  close(fixedForDate(s, key), 100 + 2200 / 21); close(fixedForDate(s, '2026-11-07'), 0);
  close(fixedItemForDate({ ...s.fixed[0], amount: 6300, period: 'quarter' }, key, s.settings), 100);
  s.fixed[0].until = key; close(fixedForDate(s, '2026-11-02'), 100 + 2200 / 21); close(fixedForDate(s, key), 2200 / 21);
});
test('fixed burdens include unrecorded elapsed days but never future days or dates before tracking', () => {
  const s = stateFor(); s.trackingStart = '2026-11-01'; addFixed(s, { name: '房租', amount: 2100, period: 'month', allocation: 'workday' }, '2026-11-01');
  close(monthStats(s, key, at(key, '14:00')).fixed, 200); close(fixedForDate(s, '2026-10-31'), 0);
});
test('goals return precise lunch-aware estimates, done, unreachable and zero salary', () => {
  const s = stateFor(); startWork(s, at(key, '09:00')); s.goal = { name: '今日', amount: 400, period: 'day' };
  let g = goalStats(s, at(key, '11:00')); assert.equal(g.status, 'estimated'); assert.equal(g.eta, at(key, '14:00')); close(g.remaining, 200);
  s.goal.amount = 900; assert.equal(goalStats(s, at(key, '11:00')).status, 'unreachable');
  s.goal.amount = 100; assert.equal(goalStats(s, at(key, '11:00')).status, 'done');
  s.goal.amount = 1000; s.goal.period = 'month'; assert.equal(goalStats(s, at(key, '11:00')).eta, at('2026-11-04', '11:00'));
  s.settings.salary = 0; s.days[key].settings.salary = 0; assert.equal(goalStats(s, at(key, '11:00')).status, 'unreachable');
});
test('month goal estimate never crosses its month, weekend rolls to next configured workday', () => {
  const s = stateFor(); s.goal = { name: '大目标', amount: 1000000, period: 'month' };
  assert.equal(goalStats(s, at('2026-11-30', '17:00')).status, 'unreachable');
  s.goal.amount = 100; assert.equal(goalStats(s, at('2026-11-07', '09:00')).eta, at('2026-11-09', '10:00'));
});
test('reject invalid zero shifts, overnight, invalid weekdays, lunch and pay days', () => {
  const s = stateFor().settings;
  for (const patch of [{ payDays: 0 }, { start: '09:00', end: '09:00' }, { start: '22:00', end: '06:00' }, { weekdays: [9] }, { lunchStart: '09:00', lunchEnd: '18:00' }, { lunchStart: '08:00' }, { salary: NaN }]) assert.throws(() => validateSettings({ ...s, ...patch }));
  assert.throws(() => startWork(stateFor(), at('2026-11-07', '10:00'))); assert.throws(() => startWork(stateFor(), at(key, '18:01')));
});
test('temporary expense changes net once and rejects invalid/future dates', () => {
  const s = demoState(); const stamp = clockNow(s).getTime(), d = dayStats(s, key, stamp);
  addExpense(s, { name: '晚餐', category: '晚餐', amount: 20, date: key }); close(dayStats(s, key, stamp).net, d.net - 20);
  assert.throws(() => addExpense(s, { name: 'x', amount: -5, date: key })); assert.throws(() => addExpense(s, { name: 'x', amount: 5, date: '2026-11-04' }));
});
test('demo state is valid and demo clock recovers its elapsed wall time', () => {
  const s = demoState(1000); validateState(s); assert.equal(clockNow(s, 61000).getTime(), at(key, '14:37'));
  assert.equal(dateKey(clockNow(s, 0)), key);
});
test('manual break presets enforce paid-time capacity without truncating, deletion restores effective hours', () => {
  const s = stateFor(); startWork(s, at(key, '09:00'));
  assert.throws(() => addBreak(s, { date: key, minutes: 10, name: '抽一根' }, at(key, '09:05')), /5 分.*超出/);
  assert.equal(s.days[key].breaks.length, 0);
  for (const minutes of [10, 20, 30]) addBreak(s, { date: key, minutes, name: minutes === 30 ? '自定义打个盹' : '喝点水' }, at(key, '11:00'));
  let d = dayStats(s, key, at(key, '11:00')); close(d.fish, 3600000); close(d.earned, 200); close(d.hourly, 200);
  deleteBreak(s, key, s.days[key].breaks[0].id); d = dayStats(s, key, at(key, '11:00')); close(d.fish, 3000000); close(d.earned, 200);
  assert.throws(() => addBreak(s, { date: key, minutes: 15, name: 'x' }, at(key, '11:00')));
  validateState(s);
});
test('manual break records persist through sleep and month totals agree with date totals', () => {
  let s = stateFor(); startWork(s, at(key, '09:00')); addBreak(s, { date: key, minutes: 20, name: '上个厕所' }, at(key, '10:00'));
  s = JSON.parse(JSON.stringify(s)); stopWork(s, at(key, '18:00')); settle(s, at('2026-11-04', '10:00'));
  startWork(s, at('2026-11-04', '09:00')); addBreak(s, { date: '2026-11-04', minutes: 10, name: '喝点水' }, at('2026-11-04', '10:00'));
  const stamp = at('2026-11-04', '10:00'), m = monthStats(s, key, stamp);
  close(m.fish, 30 * 60000); close(m.actual, m.elapsed - m.fish); close(m.hourly, m.earned / m.actual * 3600000);
  deleteBreak(s, key, s.days[key].breaks[0].id); close(monthStats(s, key, stamp).fish, 10 * 60000);
});
test('clock-out summaries classify by minute, persist snapshots, and do not double accrue or pay overtime', () => {
  let s = stateFor(); startWork(s, at(key, '09:00'));
  const first = clockOut(s, at(key, '17:59') + 59000); assert.equal(first.status, 'early');
  assert.equal(clockOut(s, at(key, '18:02')).clockOutAt, first.clockOutAt); close(dayStats(s, key, at(key, '22:00')).earned, first.earned);
  s = JSON.parse(JSON.stringify(s)); validateState(s); assert.equal(s.days[key].summary.status, 'early');
  for (const [time, extra, status] of [['18:00', 59000, 'ontime'], ['18:01', 0, 'late']]) {
    const a = stateFor(); startWork(a, at(key, '09:00')); const summary = clockOut(a, at(key, time) + extra);
    assert.equal(summary.status, status); close(summary.earned, 800); close(summary.net, summary.earned - summary.expenses - summary.fixed);
  }
});
test('clock-out supports zero effective hours and recalculates a resumed shift without duplication', () => {
  const s = stateFor(); startWork(s, at(key, '09:00')); addBreak(s, { date: key, minutes: 10, name: '喝点水' }, at(key, '09:10'));
  let summary = clockOut(s, at(key, '09:10')); assert.equal(summary.hourly, null); close(summary.actual, 0);
  startWork(s, at(key, '10:00')); summary = clockOut(s, at(key, '11:00')); close(summary.earned, 100 + 100 / 6); close(summary.actual, 3600000); assert.equal(summary.sessionCount, 2);
});
test('today net begins negative, crosses zero, tracks expense edits and keeps fixed commute separate', () => {
  const s = stateFor(); addFixed(s, { name: '固定通勤', amount: 1680, period: 'month', allocation: 'workday' }, key);
  assert.equal(s.expenses.length, 0); s.expenses.push({ id: 'test', date: key, name: '咖啡', category: '咖啡', amount: 20 });
  startWork(s, at(key, '09:00')); close(dayStats(s, key, at(key, '09:00')).net, -100); close(dayStats(s, key, at(key, '10:00')).net, 0);
  close(dayStats(s, key, at(key, '11:00')).net, 100); s.expenses = []; close(dayStats(s, key, at(key, '11:00')).net, 120);
  s.fixed[0].until = key; close(dayStats(s, key, at(key, '11:00')).net, 200);
  const noCosts = stateFor(); startWork(noCosts, at(key, '09:00')); close(dayStats(noCosts, key, at(key, '09:00')).net, 0);
});
test('fixed costs always use attendance workdays and reject new natural-day plans', () => {
  for (const scheduleMode of ['double', 'single', 'alternating']) {
    const s = stateFor(); s.settings.scheduleMode = scheduleMode; if (scheduleMode === 'single') s.settings.weekdays = [1, 2, 3, 4, 5, 6];
    const amount = datesInMonth(key).filter(date => isWorkday(date, s.settings)).length * 100;
    addFixed(s, { name: '房贷', amount, period: 'month', allocation: 'workday' }, key); startWork(s, at(key, '09:00'));
    close(dayStats(s, key, at(key, '09:00')).net, -100);
  }
  assert.throws(() => addFixed(stateFor(), { name: '房租', amount: 100, period: 'month', allocation: 'calendar' }, key), /工作日/);
});
test('unpaid overtime reuses timestamps, caps wages and lowers effective hourly rate', () => {
  const s = stateFor(); startWork(s, at(key, '09:00'));
  let d = dayStats(s, key, at(key, '18:00')); close(d.earned, 800); close(d.overtime, 0); close(d.hourly, 100);
  d = dayStats(s, key, at(key, '19:00')); close(d.earned, 800); close(d.overtime, 3600000); close(d.worked, 9 * 3600000); close(d.hourly, 800 / 9);
  const summary = clockOut(s, at(key, '19:00')); close(summary.overtime, 3600000); close(summary.hourly, 800 / 9);
  close(dayStats(s, key, at(key, '23:00')).overtime, 3600000); close(dayStats(s, key, at(key, '23:00')).hourly, 800 / 9);
});
test('overnight open shift restores once, stays with its start date and accepts manual breaks', () => {
  let s = stateFor(); startWork(s, at(key, '09:00')); s = JSON.parse(JSON.stringify(s));
  const stamp = at('2026-11-04', '01:00'); settle(s, stamp);
  assert.equal(activeShift(s, stamp).key, key); close(dayStats(s, key, stamp).overtime, 7 * 3600000); close(dayStats(s, '2026-11-04', stamp).earned, 0);
  assert.throws(() => startWork(s, stamp), /上一班次/);
  addBreak(s, { date: key, minutes: 30, name: '加班喝水' }, stamp);
  const summary = clockOut(s, stamp); assert.equal(summary.date, key); assert.equal(summary.status, 'late'); close(summary.earned, 800); close(summary.actual, 14.5 * 3600000);
  assert.equal(activeShift(s, stamp), null); validateState(s);
});
test('overnight at month boundary never transfers old wages or break records to the new month', () => {
  const s = emptyState(new Date(at('2026-10-30', '08:00'))); startWork(s, at('2026-10-30', '09:00'));
  const stamp = at('2026-11-01', '01:00'); close(monthStats(s, '2026-11-01', stamp).earned, 0);
  const summary = clockOut(s, stamp); assert.equal(summary.date, '2026-10-30'); assert.ok(summary.overtime > 0); assert.equal(summary.status, 'late');
});
test('reminder defaults off, records delivery before repeat, survives reload and re-enabling', () => {
  let s = stateFor(); assert.equal(dueReminder(s, at(key, '18:00')), null);
  s.reminder.enabled = true; s.reminder.enabledAt = at(key, '09:00');
  assert.equal(dueReminder(s, at(key, '17:59')), null);
  const reminder = dueReminder(s, at(key, '18:00')); assert.equal(reminder.date, key); assert.equal(markReminderDelivered(s, reminder, at(key, '18:00')), true);
  s = JSON.parse(JSON.stringify(s)); validateState(s); assert.equal(dueReminder(s, at(key, '19:00')), null); assert.equal(markReminderDelivered(s, reminder, at(key, '19:00')), false);
});
test('reminder skips non-working days and late enablement; ongoing overnight shift does not get a second reminder', () => {
  const s = stateFor(); s.reminder.enabled = true; s.reminder.enabledAt = at(key, '18:01');
  assert.equal(dueReminder(s, at(key, '19:00')), null); assert.equal(dueReminder(s, at('2026-11-07', '19:00')), null);
  assert.equal(dueReminder(s, at('2026-11-04', '18:00')).date, '2026-11-04');
  s.reminder.enabledAt = at(key, '09:00'); startWork(s, at(key, '09:00')); const due = dueReminder(s, at('2026-11-04', '01:00')); assert.equal(due.date, key);
  markReminderDelivered(s, due, at('2026-11-04', '01:00')); assert.equal(dueReminder(s, at('2026-11-04', '19:00')), null);
});
test('calendar status requires actual shifts and distinguishes minute-based on-time, early and late', () => {
  const s = emptyState(new Date(at('2026-11-02', '08:00')));
  for (const [key, end, expected] of [['2026-11-02', '18:00', 'ontime'], ['2026-11-03', '17:00', 'early'], ['2026-11-04', '19:00', 'late']]) {
    startWork(s, at(key, '09:00')); clockOut(s, at(key, end)); assert.equal(attendanceStatus(s, key, at('2026-11-05', '12:00')).status, expected);
  }
  assert.equal(attendanceStatus(s, '2026-10-30', at('2026-11-05', '12:00')), null);
  startWork(s, at('2026-11-05', '09:00')); assert.equal(attendanceStatus(s, '2026-11-05', at('2026-11-05', '12:00')).status, 'working');
  assert.equal(attendanceStatus(s, '2026-11-05', at('2026-11-05', '19:00')).label, '加班中');
});
test('monthly report sums actual shifts, working-day costs, manual breaks and final attendance once', () => {
  const s = stateFor(); s.trackingStart = '2026-11-01'; addFixed(s, { name: '房租', amount: 2100, period: 'month', allocation: 'workday' }, '2026-11-01');
  startWork(s, at('2026-11-02', '09:00')); clockOut(s, at('2026-11-02', '18:00'));
  startWork(s, at(key, '09:00')); addBreak(s, { date: key, minutes: 20, name: '喝点水' }, at(key, '12:00')); clockOut(s, at(key, '19:00'));
  s.expenses.push({ id: 'meal', date: key, name: '午餐', amount: 50, category: '午餐' });
  const report = monthlyReport(s, '2026-11', at(key, '20:00')); close(report.earned, 1600); close(report.costs, 250); close(report.net, 1350);
  close(report.worked, 17 * 3600000); close(report.hourly, 96); close(report.overtime, 3600000); assert.equal(report.ontimeDays, 1); assert.equal(report.lateDays, 1); assert.equal(report.recorded, 2);
  saveMonthlyReview(s, report); saveMonthlyReview(s, report); assert.equal(Object.keys(s.monthlyReviews.snapshots).length, 1); close(s.monthlyReviews.snapshots['2026-11'].earned, 1600); validateState(s);
});
test('month-end report triggers at most once, survives reload, and labels open shifts as provisional', () => {
  let s = stateFor(); startWork(s, at(key, '09:00')); clockOut(s, at(key, '18:00'));
  assert.equal(dueMonthlyReview(s, at('2026-11-29', '19:00')), null);
  const report = dueMonthlyReview(s, at('2026-11-30', '19:00')); assert.ok(report); saveMonthlyReview(s, report, true);
  s = JSON.parse(JSON.stringify(s)); assert.equal(dueMonthlyReview(s, at('2026-11-30', '21:00')), null);
  const ongoing = stateFor(); startWork(ongoing, at(key, '09:00')); const partial = monthlyReport(ongoing, '2026-11', at(key, '14:00'));
  assert.equal(partial.provisional, true); assert.equal(partial.activeDays, 1); assert.equal(partial.ontimeDays + partial.lateDays + partial.earlyDays, 0);
});
test('monthly report handles empty months, zero denominators and cross-month ongoing work without duplicate wages', () => {
  const s = emptyState(new Date(at('2026-10-30', '08:00'))); assert.equal(monthlyReport(s, '2026-10', at('2026-10-31', '19:00')).hourly, null);
  startWork(s, at('2026-10-30', '09:00')); const stamp = at('2026-11-01', '01:00');
  const old = monthlyReport(s, '2026-10', stamp), current = monthlyReport(s, '2026-11', stamp);
  assert.equal(old.provisional, true); assert.equal(old.activeDays, 1); close(current.earned, 0); assert.equal(current.recorded, 0); assert.ok(old.overtime > 0);
});
test('double, single and alternating calendars honor an explicit anchor across months and DST weeks', () => {
  const s = stateFor().settings; assert.equal(isWorkday('2026-11-07', s), false);
  s.scheduleMode = 'single'; s.weekdays = [1, 2, 3, 4, 5, 6]; assert.equal(isWorkday('2026-11-07', s), true);
  s.scheduleMode = 'alternating'; s.weekdays = [1, 2, 3, 4, 5]; s.alternateWeekdays = [1, 2, 3, 4, 5, 6]; s.anchorWeek = '2026-11-02'; s.anchorKind = 'double'; validateSettings(s);
  for (const [date, expected] of [['2026-10-31', true], ['2026-11-07', false], ['2026-11-14', true], ['2026-11-28', true], ['2026-12-05', false]]) assert.equal(isWorkday(date, s), expected, date);
  s.anchorKind = 'single'; assert.equal(isWorkday('2026-11-07', s), true);
  assert.throws(() => validateSettings({ ...s, anchorWeek: '2026-11-03' }), /基准/); assert.throws(() => validateSettings({ ...s, anchorKind: '' }));
});
test('whole-month custom costs spread once over saved attendance dates, never rest days or another month', () => {
  const s = stateFor(); s.settings.scheduleMode = 'alternating'; s.demo = { time: at(key, '14:00'), wall: Date.now() };
  addExpense(s, { name: '整月计划', amount: 2300, category: '自定义', scope: 'month', month: '2026-11', date: '2026-11-01' });
  const expense = s.expenses[0]; assert.equal(expense.allocationDates.length, 23); close(expenseForDate(expense, key), 100); close(expenseForDate(expense, '2026-11-07'), 0); close(expenseForDate(expense, '2026-11-14'), 100);
  close(monthStats(s, key, at(key, '14:00')).expenses, 200); close(monthStats(s, key, at('2026-11-30', '23:00')).expenses, 2300); close(monthStats(s, '2026-12-01', at('2026-12-01', '23:00')).expenses, 0);
  s.settings.weekdays = []; s.settings.alternateWeekdays = []; close(expenseForDate(expense, key), 100); validateState(s);
});
test('zero-workday plans reject monthly allocation without altering records; daily costs still work', () => {
  const s = stateFor(); s.settings.weekdays = []; validateSettings(s.settings);
  assert.throws(() => addFixed(s, { name: '房贷', amount: 100, period: 'month', allocation: 'workday' }, key), /为 0/);
  assert.throws(() => addExpense(s, { name: '整月计划', amount: 100, category: '自定义', scope: 'month', month: '2026-11', date: '2026-11-01' }), /为 0/);
  assert.equal(s.expenses.length, 0); assert.equal(s.fixed.length, 0); assert.throws(() => startWork(s, at(key, '09:00')));
  s.demo = { time: at(key, '14:00'), wall: Date.now() }; addExpense(s, { name: '当日花销', amount: 10, category: '自定义', date: key, scope: 'day' }); close(dayStats(s, key, at(key, '14:00')).expenses, 10);
});
test('calendar changes preserve day snapshots and existing allocation tables; legacy switch is prospective and idempotent', () => {
  const s = stateFor(); s.trackingStart = '2026-11-01'; startWork(s, at(key, '09:00')); s.settings.scheduleMode = 'single'; s.settings.weekdays.push(6); assert.equal(isWorkday('2026-11-07', s.days[key].settings), false);
  s.fixed.push({ id: 'legacy', name: '旧房租', amount: 3000, period: 'month', allocation: 'calendar', from: '2026-11-01', until: null, settings: structuredClone(s.settings) });
  close(fixedForDate(s, '2026-11-02'), 100); assert.equal(convertLegacyFixed(s, key), 1); close(fixedForDate(s, '2026-11-02'), 100); assert.equal(s.fixed[0].until, key); assert.equal(s.fixed[1].allocation, 'workday'); assert.equal(convertLegacyFixed(s, key), 0); validateState(s);
});
