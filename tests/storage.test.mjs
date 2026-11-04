import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { emptyState, saveGoal } from '../src/model.mjs';
const { LocalStore } = createRequire(import.meta.url)('../desktop/storage.cjs');
test('atomic local persistence, retired virtual archive never replaces personal records, serialized last save', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workday-cheer-test-')), store = new LocalStore(directory);
  try {
    const real = emptyState(); saveGoal(real,{name:'测试目标',amount:9876}); await store.save(real);
    assert.equal((await store.load()).state.goal.amount, 9876);
    const archive = JSON.stringify({ demo: { time: 1, wall: 1 }, fictional: true });
    await fs.writeFile(path.join(directory, 'demo-state.json'), archive);
    await fs.writeFile(path.join(directory, 'mode.json'), '{"demo":true}');
    assert.equal((await store.load()).state.goal.amount, 9876);
    assert.equal((await store.load()).legacyModeRetired, true);
    await assert.rejects(() => store.save({ ...real, demo: { time: 1, wall: 1 } }), /旧演示/);
    assert.equal(await fs.readFile(path.join(directory, 'demo-state.json'), 'utf8'), archive);
    const a = structuredClone(real), b = structuredClone(real); a.goal.amount = 10; b.goal.amount = 20;
    await Promise.all([store.save(a), store.save(b)]); assert.equal((await store.load()).state.goal.amount, 20);
    assert.equal((await fs.stat(path.join(directory, 'state.json'))).mode & 0o777, 0o600);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
test('corrupt records are preserved and cannot silently be overwritten', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workday-cheer-test-')), store = new LocalStore(directory);
  try {
    const file = path.join(directory, 'state.json'); await fs.writeFile(file, 'broken-json');
    assert.ok((await store.load()).error); await assert.rejects(() => store.save(emptyState()), /阻止覆盖/);
    assert.equal(await fs.readFile(file, 'utf8'), 'broken-json');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
