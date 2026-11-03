import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { emptyState, demoState, saveGoal } from '../src/model.mjs';
const { LocalStore } = createRequire(import.meta.url)('../desktop/storage.cjs');
test('atomic local persistence, separate virtual data and real records, serialized last save', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workday-cheer-test-')), store = new LocalStore(directory);
  try {
    const real = emptyState(); saveGoal(real,{name:'测试目标',amount:9876}); await store.save(real);
    assert.equal((await store.load()).state.goal.amount, 9876);
    await store.save(demoState()); assert.ok((await store.load()).state.demo);
    assert.equal((await store.loadReal()).state.goal.amount, 9876);
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
