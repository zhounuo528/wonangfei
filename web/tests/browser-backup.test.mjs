import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, demoState, at, startWork, clockOut, correctStartTime, saveGoal, settleGoal, migrateGoal, goalStats, monthlyReport, saveMonthlyReview, validateState } from '../src/model.mjs';
import { parseBackup } from '../src/browser-store.mjs';

test('imports both desktop JSON and browser backup envelopes without changing calculations', () => {
  const personal = emptyState();
  assert.deepEqual(parseBackup(JSON.stringify(personal)), personal);
  const demo = demoState();
  assert.deepEqual(parseBackup(JSON.stringify({ format: 'wonangfei-backup', state: demo })), demo);
});
test('rejects malformed, unsupported and oversized imports before storage is touched', () => {
  for (const value of ['not json', '{}', '{"version":2}', ' '.repeat(16 * 1024 * 1024 + 1)]) assert.throws(() => parseBackup(value));
  const invalid = emptyState(); invalid.settings.payDays = 0; delete invalid.settings.payDaysMode; delete invalid.settings.payDaysMonth;
  assert.throws(() => parseBackup(JSON.stringify(invalid)));
});
test('legacy browser and desktop goals retain original history and migrate only once', () => {
  const date = '2026-11-03', state = emptyState(new Date(at(date,'08:00')));
  state.goal = { name: '旧浏览器目标', amount: 5000, period: 'month' };
  state.settings.salary=17600; state.settings.payDays=22; delete state.settings.payDaysMode; delete state.settings.payDaysMonth;
  startWork(state,at(date,'09:00')); clockOut(state,at(date,'18:00'));
  const migrated = parseBackup(JSON.stringify({format:'wonangfei-backup',state}));
  const originalDays = structuredClone(migrated.days), upgrade=at('2026-11-04','12:00');
  assert.equal(migrateGoal(migrated,upgrade),true);
  assert.deepEqual(migrated.days,originalDays); assert.deepEqual(migrated.goalPool.legacyGoal,state.goal);
  assert.equal(goalStats(migrated,upgrade).pool,0); assert.equal(migrated.goalPool.from,'2026-11-04');
  const restored=parseBackup(JSON.stringify(migrated));
  assert.equal(migrateGoal(restored,at('2026-11-05','12:00')),false); assert.deepEqual(restored,migrated);
});
test('backup roundtrip preserves paid overtime, corrections, goal settlements and report cutoffs', () => {
  const date='2026-11-03', state=emptyState(new Date(at(date,'08:00')));
  state.settings.salary=17600;state.settings.payDays=22; delete state.settings.payDaysMode; delete state.settings.payDaysMonth;
  saveGoal(state,{name:'测试目标',amount:500},at(date,'09:00'));
  startWork(state,at(date,'10:00'));clockOut(state,at(date,'20:01'),{kind:'paid',amount:200});
  saveMonthlyReview(state,monthlyReport(state,'2026-11',at(date,'20:02')),true);
  correctStartTime(state,{date,sessionIndex:0,start:at(date,'09:00')},at(date,'20:03'));
  settleGoal(state,at(date,'20:03'));validateState(state);
  const restored=parseBackup(JSON.stringify({format:'wonangfei-backup',state}));
  assert.deepEqual(restored,state);assert.equal(restored.days[date].summary.earned,1000);
  assert.equal(restored.days[date].overtimeDecisions[0].amount,200);
  assert.equal(restored.goalPool.settlements.length,1);
  assert.equal(restored.monthlyReviews.snapshots['2026-11'].asOf,at(date,'20:02'));
  assert.equal(restored.monthlyReviews.shown['2026-11'],at(date,'20:02'));
});
