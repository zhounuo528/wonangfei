import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimestampTicker } from '../src/live.mjs';
import { at, emptyState, startWork, dayStats } from '../src/model.mjs';

test('smooth presentation reads absolute timestamps; dropped frames, lunch and resume do not change pay', () => {
  const key = '2026-11-03', state = emptyState(new Date(at(key, '08:00')));
  state.settings.salary = 17600; state.settings.payDays = 22; delete state.settings.payDaysMode; delete state.settings.payDaysMonth; startWork(state, at(key, '09:00'));
  let stamp = at(key, '09:00'), nextId = 0;
  const frames = new Map(), values = [];
  const ticker = createTimestampTicker({ readClock: () => stamp, write: now => values.push(dayStats(state, key, now).earned), requestFrame: fn => { const id = ++nextId; frames.set(id, fn); return id; }, cancelFrame: id => frames.delete(id) });
  const pump = time => { const [id, fn] = frames.entries().next().value; frames.delete(id); fn(time); };
  ticker.setEnabled(true); assert.equal(values.at(-1), 0);
  stamp += 50; pump(50); assert.ok(values.at(-1) > 0 && values.at(-1) < 0.01);
  // One late frame must show the full timestamp-based value, not a frame-based increment.
  stamp = at(key, '12:15'); pump(100000); assert.equal(values.at(-1), 300);
  stamp = at(key, '12:55'); pump(200000); assert.equal(values.at(-1), 300);
  ticker.setEnabled(false); assert.equal(frames.size, 0); const count = values.length;
  stamp = at(key, '14:00'); assert.equal(values.length, count);
  ticker.setEnabled(true); assert.equal(values.at(-1), 400);
  stamp = at(key, '22:00'); pump(300000); assert.equal(values.at(-1), 800); ticker.stop();
});
test('frame cadence is bounded and disabled loops schedule no animation frames', () => {
  let callback, reads = 0, canceled = 0;
  const ticker = createTimestampTicker({ readClock: () => ++reads, write: () => {}, requestFrame: fn => { callback = fn; return 1; }, cancelFrame: () => canceled++, fps: 30 });
  ticker.setEnabled(false); assert.equal(callback, undefined);
  ticker.setEnabled(true); callback(0); callback(16); callback(32); callback(48);
  assert.equal(reads, 3); ticker.setEnabled(false); assert.equal(canceled, 1); callback(64); assert.equal(reads, 3);
});
