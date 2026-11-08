import { legacyStartWork as startWork } from './fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, at, getDay,  clockOut, breakDate, addCurrentBreak, dayStats, monthStats, validateState } from '../core/model.js';
const key = '2026-11-03';
const fixture = () => emptyState(new Date(at(key, '08:00')));
test('current break ignores a supplied historical date and keeps duration, type and original records', () => {
  const s = fixture(); startWork(s, at(key, '09:00'));
  addCurrentBreak(s, { date:'1999-01-01', minutes:20, name:'喝点水' }, at(key, '10:00'));
  const record = s.days[key].breaks[0]; assert.equal(record.durationMs, 1200000); assert.equal(record.name, '喝点水'); assert.equal(record.createdAt, at(key, '10:00'));
  assert.equal(breakDate(s, at(key, '10:00')), key); assert.deepEqual(Object.keys(s.days), [key]); validateState(s);
});
test('cross-midnight break stays with open original shift, including month boundary; old records untouched', () => {
  const date = '2026-10-30', now = at('2026-11-01', '01:00'), s = emptyState(new Date(at(date, '08:00')));
  startWork(s, at(date, '09:00')); s.days[date].fish.push({ start:at(date, '10:00'), end:at(date, '10:10') });
  const legacy = structuredClone(s.days[date].fish); addCurrentBreak(s, { minutes:30, name:'假装很忙' }, now);
  assert.equal(breakDate(s, now), date); assert.equal(s.days[date].breaks[0].durationMs, 1800000);
  assert.deepEqual(s.days[date].fish, legacy); assert.equal(monthStats(s, '2026-11-01', now).fish, 0);
  assert.equal(dayStats(s, date, now).fish, 2400000); validateState(s);
});
test('no current-day shift does not silently append a break to a prior finished shift', () => {
  const s = fixture(); startWork(s, at(key, '09:00')); clockOut(s, at(key, '18:00'));
  const before = JSON.stringify(s); assert.throws(() => addCurrentBreak(s, { minutes:10, name:'喝水' }, at('2026-11-04', '10:00')), /尚未记录/);
  assert.equal(JSON.stringify(s), before);
});
test('submission chooses current date after midnight, keeps all presets and custom names; capacity and zero denominators remain safe', () => {
  const s = fixture(); startWork(s, at(key, '09:00')); clockOut(s, at(key, '18:00')); startWork(s, at('2026-11-04', '09:00'));
  for (const minutes of [10,20,30]) addCurrentBreak(s, { minutes, name:minutes===30?'伸个懒腰':'喝点水' }, at('2026-11-04', '10:00'));
  assert.equal(s.days[key].breaks.length, 0); assert.equal(s.days['2026-11-04'].breaks.length, 3);
  assert.equal(dayStats(s, '2026-11-04', at('2026-11-04', '10:00')).hourly, null);
  const before = JSON.stringify(s); assert.throws(() => addCurrentBreak(s, { minutes:10, name:'喝水' }, at('2026-11-04', '10:00')), /超出/); assert.equal(JSON.stringify(s), before);
  assert.throws(() => addCurrentBreak(s, { minutes:0.5, name:'喝水' }, at('2026-11-04', '11:00')), /整数分钟/); validateState(s);
});
