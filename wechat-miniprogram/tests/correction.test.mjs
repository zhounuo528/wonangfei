import { legacyStartWork as startWork } from './fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, getDay, at,  stopWork, clockOut, correctStartTime, addBreak, dayStats, monthStats, monthlyReport, saveMonthlyReview, goalStats, saveGoal, attendanceStatus, validateState } from '../core/model.js';
import { parseBackup } from '../core/backup.js';
const key = '2026-11-03', hour = 3600000;
function fixture(date = key) {
  const state = emptyState(new Date(at(date, '08:00')));
  state.onboarded = true; state.settings.salary = 17600; state.settings.payDays = 22; delete state.settings.payDaysMode; delete state.settings.payDaysMonth;
  return state;
}
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} ≈ ${expected}`);
const correct = (state, time, now, sessionIndex = 0, date = key) => correctStartTime(state, { date, sessionIndex, start: at(date, time) }, at(key, now));

test('late click correction replaces one start: gross, net, hours, month and goal recalculate without adding sessions', () => {
  const s = fixture(); startWork(s, at(key, '10:30')); saveGoal(s, {name:'测试目标',amount:10000},at(key,'10:30'));
  s.expenses.push({ id: 'coffee', name: '咖啡', date: key, amount: 18 });
  const result = correct(s, '09:00', '11:00');
  close(result.before.earned, 50); close(result.after.earned, 200);
  close(result.after.net, 182); close(result.after.worked, 2 * hour);
  close(monthStats(s, key, at(key, '11:00')).earned, 200); close(goalStats(s, at(key, '11:00')).pool, 182);
  assert.equal(s.days[key].sessions.length, 1); assert.equal(s.days[key].sessions[0].end, null);
  assert.equal(s.days[key].startCorrections[0].from, at(key, '10:30'));
  assert.equal(s.days[key].startCorrections[0].to, at(key, '09:00')); validateState(s);
});
test('correction respects the recorded salary snapshot, lunch, wage cap and unpaid overtime', () => {
  const s = fixture(); startWork(s, at(key, '10:00')); s.settings.salary = 35200; s.settings.end = '21:00';
  const result = correct(s, '08:00', '13:30'); close(result.after.earned, 350); close(result.after.worked, 3.5 * hour);
  const later = dayStats(s, key, at(key, '19:00')); close(later.earned, 800); close(later.overtime, hour); close(later.worked, 9 * hour);
  assert.equal(s.days[key].settings.end, '18:00'); assert.equal(s.days[key].settings.salary, 17600);
});
test('closed summary is restated without changing clock-out, status, costs or session count; repeated clock-out is idempotent', () => {
  const s = fixture(); startWork(s, at(key, '10:00'));
  s.expenses.push({ id: 'lunch', name: '午餐', date: key, amount: 20 });
  const old = structuredClone(clockOut(s, at(key, '18:00')));
  s.expenses.push({ id: 'later', name: '晚餐', date: key, amount: 30 });
  correct(s, '09:00', '20:00'); const summary = s.days[key].summary;
  close(old.earned, 700); close(summary.earned, 800); close(summary.net, 780);
  assert.equal(summary.expenses, old.expenses); assert.equal(summary.fixed, old.fixed);
  assert.equal(summary.clockOutAt, old.clockOutAt); assert.equal(summary.status, 'ontime'); assert.equal(summary.sessionCount, 1);
  close(summary.actual, 8 * hour); close(summary.hourly, 100);
  assert.equal(summary.recalculatedAt, at(key, '20:00')); assert.equal(attendanceStatus(s, key, at(key, '20:00')).status, 'ontime');
  const saved = JSON.stringify(summary); clockOut(s, at(key, '21:00')); assert.equal(JSON.stringify(s.days[key].summary), saved);
});
test('multiple sessions: only selected segment changes, gaps stay unfilled, overlap rejected, adjoining endpoints allowed', () => {
  const s = fixture(); startWork(s, at(key, '10:00')); stopWork(s, at(key, '11:00')); startWork(s, at(key, '14:00')); stopWork(s, at(key, '16:00'));
  const second = structuredClone(s.days[key].sessions[1]); correct(s, '09:00', '17:00');
  assert.deepEqual(s.days[key].sessions[1], second); close(dayStats(s, key, at(key, '17:00')).earned, 400);
  const saved = JSON.stringify(s); assert.throws(() => correct(s, '10:30', '17:00', 1), /重叠/); assert.equal(JSON.stringify(s), saved);
  correct(s, '11:00', '17:00', 1); close(dayStats(s, key, at(key, '17:00')).earned, 600); assert.equal(s.days[key].sessions.length, 2);
});
test('manual fish is preserved and a shorter interval that cannot contain it is rejected atomically', () => {
  const s = fixture(); startWork(s, at(key, '10:00')); addBreak(s, { date: key, minutes: 10, name: '喝点水' }, at(key, '10:30'));
  const saved = JSON.stringify(s); assert.throws(() => correct(s, '10:25', '10:30'), /少于已记.*摸鱼/); assert.equal(JSON.stringify(s), saved);
  correct(s, '10:10', '10:30'); const stats = dayStats(s, key, at(key, '10:30'));
  close(stats.worked, 20 * 60000); close(stats.fish, 10 * 60000); close(stats.actual, 10 * 60000); close(stats.hourly, 200);
  assert.equal(s.days[key].breaks.length, 1);
});
test('legacy timestamp fish is re-intersected with corrected paid intervals, not deleted', () => {
  const s = fixture(); startWork(s, at(key, '10:00')); s.days[key].fish.push({ start: at(key, '11:00'), end: at(key, '11:30') });
  correct(s, '11:20', '12:00'); const stats = dayStats(s, key, at(key, '12:00'));
  close(stats.legacyFish, 10 * 60000); close(stats.actual, 30 * 60000); assert.equal(s.days[key].fish.length, 1);
});
test('zero-length corrected closed interval is safe with no fish, including summary and report hourly rate', () => {
  const s = fixture(); startWork(s, at(key, '10:00')); clockOut(s, at(key, '11:00')); correct(s, '11:00', '12:00');
  const stats = dayStats(s, key, at(key, '12:00')); assert.equal(stats.earned, 0); assert.equal(stats.hourly, null); assert.equal(stats.secondly, null);
  assert.equal(s.days[key].summary.hourly, null); assert.equal(monthlyReport(s, '2026-11', at(key, '12:00')).hourly, null); validateState(s);
});
test('bad date, nonexistent record, future, malformed, end-before-start and bad indexes never mutate state', () => {
  const s = fixture(); startWork(s, at(key, '10:00')); clockOut(s, at(key, '11:00'));
  const cases = [
    { date: '2026-11-02', sessionIndex: 0, start: at('2026-11-02', '09:00') },
    { date: '2026-11-04', sessionIndex: 0, start: at('2026-11-04', '09:00') },
    { date: key, sessionIndex: 0, start: at('2026-11-02', '09:00') },
    { date: key, sessionIndex: 0, start: at(key, '13:00') },
    { date: key, sessionIndex: 0, start: at(key, '11:01') },
    { date: key, sessionIndex: -1, start: at(key, '09:00') },
    { date: key, sessionIndex: 0.5, start: at(key, '09:00') },
    { date: key, sessionIndex: 1, start: at(key, '09:00') },
    { date: key, sessionIndex: 0, start: NaN },
    { date: key, sessionIndex: 0, start: Infinity }, null,
  ];
  for (const record of cases) { const before = JSON.stringify(s); assert.throws(() => correctStartTime(s, record, at(key, '12:00'))); assert.equal(JSON.stringify(s), before); }
  const empty = fixture(); assert.throws(() => correct(empty, '09:00', '12:00'), /没有上班记录/); assert.deepEqual(empty.days, {});
  const open = fixture(); startWork(open, at(key, '10:00')); assert.throws(() => correct(open, '12:01', '12:00'), /晚于现在/);
});
test('correction does not introduce overlap with a prior date overnight session', () => {
  const s = fixture('2026-11-02');
  getDay(s, '2026-11-02', true).sessions.push({ start: at('2026-11-02', '09:00'), end: at(key, '10:00') });
  getDay(s, key, true).sessions.push({ start: at(key, '10:30'), end: null });
  const before = JSON.stringify(s); assert.throws(() => correct(s, '09:00', '11:00'), /重叠/); assert.equal(JSON.stringify(s), before);
  correct(s, '10:00', '11:00'); close(dayStats(s, key, at(key, '11:00')).earned, 100);
});
test('overnight correction stays with original month; saved report preserves cutoff and delivered flag', () => {
  const date = '2026-10-30', cutoff = at('2026-11-01', '01:00'), stamp = at('2026-11-01', '02:00');
  const s = fixture(date); startWork(s, at(date, '10:00'));
  saveMonthlyReview(s, monthlyReport(s, '2026-10', cutoff), true);
  saveMonthlyReview(s, monthlyReport(s, '2026-11', cutoff));
  const november = structuredClone(s.monthlyReviews.snapshots['2026-11']), shown = s.monthlyReviews.shown['2026-10'];
  const result = correctStartTime(s, { date, sessionIndex: 0, start: at(date, '09:00') }, stamp);
  close(result.after.earned - result.before.earned, 100); close(result.after.overtime, result.before.overtime);
  close(monthStats(s, date, stamp).earned, 800); close(monthStats(s, '2026-11-01', stamp).earned, 0);
  const october = s.monthlyReviews.snapshots['2026-10']; close(october.earned, 800); assert.equal(october.asOf, cutoff); assert.equal(october.recalculatedAt, stamp);
  assert.equal(s.monthlyReviews.shown['2026-10'], shown); assert.deepEqual(s.monthlyReviews.snapshots['2026-11'], november);
  assert.equal(s.days[date].sessions[0].end, null); assert.deepEqual(Object.keys(s.days), [date]); validateState(s);
});
test('repeated same correction adds no entries or earnings, reversing a correction retains audit history', () => {
  const s = fixture(); startWork(s, at(key, '10:00')); correct(s, '09:00', '11:00');
  const before = JSON.stringify(s); const result = correct(s, '09:00', '11:00'); assert.equal(result.changed, false); assert.equal(JSON.stringify(s), before);
  correct(s, '10:00', '11:00'); assert.equal(s.days[key].startCorrections.length, 2); close(dayStats(s, key, at(key, '11:00')).earned, 100);
});
test('later resumed session correction keeps prior partial summary cutoff and other dates unchanged', () => {
  const s = fixture('2026-11-02'); startWork(s, at(key, '09:00')); clockOut(s, at(key, '11:00')); startWork(s, at(key, '14:00'));
  getDay(s, '2026-11-02', true).sessions.push({ start: at('2026-11-02', '09:00'), end: at('2026-11-02', '18:00') });
  const other = structuredClone(s.days['2026-11-02']); correct(s, '13:00', '15:00', 1);
  assert.equal(s.days[key].summary.clockOutAt, at(key, '11:00')); assert.equal(s.days[key].summary.sessionCount, 1); close(s.days[key].summary.earned, 200);
  assert.deepEqual(s.days['2026-11-02'], other); close(dayStats(s, key, at(key, '15:00')).earned, 400);
});
test('corrected profile, original starts, summaries and reports survive browser backup serialization; old profiles remain valid', () => {
  const s = fixture(); startWork(s, at(key, '10:00')); clockOut(s, at(key, '18:00')); saveMonthlyReview(s, monthlyReport(s, '2026-11', at(key, '19:00')));
  validateState(s); assert.equal(parseBackup(JSON.stringify(s)).days[key].startCorrections, undefined);
  correct(s, '09:00', '20:00'); const loaded = parseBackup(JSON.stringify({ format: 'wonangfei-backup', state: s }));
  assert.deepEqual(loaded, s); assert.equal(loaded.days[key].startCorrections[0].from, at(key, '10:00'));
  close(loaded.days[key].summary.earned, 800); close(loaded.monthlyReviews.snapshots['2026-11'].earned, 800); validateState(loaded);
});
