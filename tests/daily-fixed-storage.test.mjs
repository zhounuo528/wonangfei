import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {emptyState,at,addFixed} from '../src/model.mjs';
const {LocalStore}=createRequire(import.meta.url)('../desktop/storage.cjs');
async function setup(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'daily-fixed-storage-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const store=new LocalStore(dir),s=emptyState(new Date(at('2026-11-01','08:00')));await store.save(s);const old=structuredClone(s);addFixed(s,{name:'virtual commute',amount:8,period:'day',repeat:'workday',allocation:'workday'},'2026-11-01');return{dir,store,s,old};}
test('native daily upgrade keeps exact pre-upgrade state once, subsequent writes/reload preserve version 5',async t=>{
 const {dir,store,s,old}=await setup(t);await store.save(s);const backup=path.join(dir,'state-before-daily-fees.json');assert.deepEqual(JSON.parse(await fs.readFile(backup)),old);s.settings.salary=100;await store.save(s);assert.deepEqual(JSON.parse(await fs.readFile(backup)),old);assert.deepEqual((await new LocalStore(dir).load()).state,s);
});
test('occupied invalid backup blocks upgrade atomically and leaves original file untouched',async t=>{
 const {dir,store,s,old}=await setup(t);await fs.writeFile(path.join(dir,'state-before-daily-fees.json'),'not a valid backup');await assert.rejects(()=>store.save(s));assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir,'state.json'))),old);
});
