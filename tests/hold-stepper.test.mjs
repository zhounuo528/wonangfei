import test from 'node:test';
import assert from 'node:assert/strict';
import { createHoldStepper } from '../src/hold-stepper.mjs';
function harness(initial = 15) {
  let value = initial, now = 0, id = 0; const jobs = new Map();
  const controller = createHoldStepper({
    step(direction) { const next = Math.min(1440, Math.max(1, value + direction * 5)); const changed = next !== value; value = next; return changed; },
    schedule(callback, delay) { jobs.set(++id, { callback, at: now + delay }); return id; },
    cancel(token) { jobs.delete(token); },
  });
  function advance(ms) {
    const end = now + ms;
    while (true) { const next = [...jobs].sort((a,b)=>a[1].at-b[1].at)[0]; if (!next || next[1].at > end) break; jobs.delete(next[0]); now = next[1].at; next[1].callback(); }
    now = end;
  }
  return { controller, advance, value:()=>value, pending:()=>jobs.size, callbacks:()=>[...jobs.values()].map(x=>x.callback) };
}
test('tap changes five once; hold waits then repeats; release cancels all later increments', () => {
  const h = harness(); h.controller.start(1); assert.equal(h.value(),20); h.advance(349); assert.equal(h.value(),20);
  h.advance(181); assert.equal(h.value(),35); h.controller.stop(); h.advance(1000); assert.equal(h.value(),35); assert.equal(h.pending(),0);
});
test('cancellation invalidates even a queued callback, and a new direction replaces the old repeat loop', () => {
  const h = harness(); h.controller.start(1); const stale = h.callbacks()[0]; h.controller.stop(); stale(); assert.equal(h.value(),20); assert.equal(h.pending(),0);
  h.controller.start(1); h.controller.start(-1); h.advance(350); assert.equal(h.value(),15); assert.equal(h.pending(),1); h.controller.stop();
});
test('minimum and maximum clamp explicitly and terminate repeats without lingering timers', () => {
  let h = harness(3); h.controller.start(-1); assert.equal(h.value(),1); h.advance(500); assert.equal(h.value(),1); assert.equal(h.pending(),0);
  h = harness(1438); h.controller.start(1); assert.equal(h.value(),1440); h.advance(1000); assert.equal(h.value(),1440); assert.equal(h.pending(),0);
});
