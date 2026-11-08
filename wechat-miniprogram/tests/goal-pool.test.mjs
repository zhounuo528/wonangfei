import { legacyStartWork as startWork } from './fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, at,  clockOut, saveGoal, migrateGoal, goalStats, settleGoal, dueGoalNotice, markGoalNotified, correctStartTime, validateState } from '../core/model.js';
const key='2026-11-03';
function fixture(){const s=emptyState(new Date(at(key,'08:00')));s.settings.salary=17600;s.settings.payDays=22; delete s.settings.payDaysMode; delete s.settings.payDaysMonth;return s;}
test('signed net pool -100 plus 300 becomes 200; settling 5000 at 5200 carries 200 to the next goal without recounting today',()=>{
  const s=fixture();saveGoal(s,{name:'第一目标',amount:5000},at(key,'10:00'));
  s.expenses.push({id:'day1',name:'成本',date:key,amount:100});assert.equal(goalStats(s,at(key,'18:00')).pool,-100);
  startWork(s,at('2026-11-04','09:00'));clockOut(s,at('2026-11-04','12:00'));assert.equal(goalStats(s,at('2026-11-04','18:00')).pool,200);
  s.settings.salary=132000;startWork(s,at('2026-11-05','09:00'));clockOut(s,at('2026-11-05','18:00'));
  s.expenses.push({id:'day3',name:'成本',date:'2026-11-05',amount:1000});const now=at('2026-11-05','18:00');
  assert.equal(goalStats(s,now).pool,5200);assert.equal(goalStats(s,now).status,'ready');
  const completedId=s.goal.id;settleGoal(s,now);assert.equal(goalStats(s,now).pool,200);assert.equal(goalStats(s,now).status,'done');
  for(let i=0;i<4;i++)assert.equal(settleGoal(s,now),null);assert.equal(s.goalPool.settlements.length,1);
  saveGoal(s,{name:'下一目标',amount:1000},now);assert.notEqual(s.goal.id,completedId);assert.equal(s.goalPool.from,key);
  assert.equal(goalStats(s,now).pool,200);assert.equal(goalStats(s,now).remaining,800);assert.equal(s.goalPool.settlements.length,1);
  const immutable=structuredClone(s.goalPool.settlements);
  s.expenses[0].amount=150;assert.equal(goalStats(s,now).pool,150);
  correctStartTime(s,{date:'2026-11-04',sessionIndex:0,start:at('2026-11-04','10:00')},now);
  assert.equal(goalStats(s,now).pool,50);assert.deepEqual(s.goalPool.settlements,immutable);validateState(s);
});
test('old target migrates once, preserves name/amount and full old definition, starts at upgrade day with no invented old balance',()=>{
  const s=fixture();s.goal={name:'旧月目标',amount:5000,period:'month'};startWork(s,at(key,'09:00'));clockOut(s,at(key,'18:00'));
  const upgrade=at('2026-11-04','12:00');assert.equal(migrateGoal(s,upgrade),true);assert.equal(s.goal.name,'旧月目标');assert.equal(s.goal.amount,5000);
  assert.deepEqual(s.goalPool.legacyGoal,{name:'旧月目标',amount:5000,period:'month'});assert.equal(s.goalPool.from,'2026-11-04');assert.equal(goalStats(s,upgrade).pool,0);
  const before=JSON.stringify(s);assert.equal(migrateGoal(s,at('2026-11-05','10:00')),false);assert.equal(JSON.stringify(s),before);validateState(s);
});
test('completion notice persists before display; repeated reads/reloads/cost regressions cannot rededuct or notify again',()=>{
  const s=fixture();saveGoal(s,{name:'目标',amount:100},at(key,'09:00'));startWork(s,at(key,'09:00'));clockOut(s,at(key,'11:00'));
  assert.equal(dueGoalNotice(s),null);settleGoal(s,at(key,'11:00'));const notice=dueGoalNotice(s);assert.equal(notice.id,s.goal.id);
  assert.equal(markGoalNotified(s,notice.id,at(key,'11:00')),true);assert.equal(markGoalNotified(s,notice.id,at(key,'11:01')),false);
  const restored=JSON.parse(JSON.stringify(s));assert.equal(dueGoalNotice(restored),null);assert.equal(settleGoal(restored,at(key,'12:00')),null);
  restored.expenses.push({id:'expense',name:'补记成本',date:key,amount:250});assert.equal(goalStats(restored,at(key,'12:00')).pool,-150);
  assert.equal(restored.goal.completedAt,at(key,'11:00'));assert.equal(dueGoalNotice(restored),null);assert.equal(restored.goalPool.settlements.length,1);validateState(restored);
});
test('editing active goal preserves anchor; a new goal uses only carry; sufficient carry can complete once after explicit creation',()=>{
  const s=fixture();saveGoal(s,{name:'目标',amount:100},at(key,'09:00'));const id=s.goal.id;
  saveGoal(s,{name:'修改名称',amount:150},at(key,'10:00'));assert.equal(s.goal.id,id);assert.equal(s.goalPool.from,key);
  startWork(s,at(key,'09:00'));clockOut(s,at(key,'12:00'));settleGoal(s,at(key,'12:00'));assert.equal(goalStats(s,at(key,'12:00')).pool,150);
  saveGoal(s,{name:'第二目标',amount:100},at(key,'12:00'));assert.equal(s.goal.completedAt,null);settleGoal(s,at(key,'12:00'));
  assert.equal(goalStats(s,at(key,'12:00')).pool,50);assert.equal(s.goalPool.settlements.length,2);validateState(s);
});
test('no goal and zero salary are safe; bad amounts never replace old data or create a target',()=>{
  const s=fixture();assert.equal(goalStats(s,at(key,'09:00')).status,'none');assert.equal(settleGoal(s,at(key,'09:00')),null);
  for(const amount of [0,-1,NaN,Infinity,1e9+1]){const before=JSON.stringify(s);assert.throws(()=>saveGoal(s,{name:'目标',amount},at(key,'09:00')));assert.equal(JSON.stringify(s),before);}
  s.settings.salary=0;saveGoal(s,{name:'目标',amount:100},at(key,'09:00'));startWork(s,at(key,'09:00'));assert.equal(goalStats(s,at(key,'18:00')).progress,0);assert.equal(settleGoal(s,at(key,'18:00')),null);
});
test('upgrade during an overnight older shift excludes old-day wages, and repeated timestamps never add deposits',()=>{
  const date='2026-10-30',s=emptyState(new Date(at(date,'08:00')));startWork(s,at(date,'09:00'));s.goal={name:'旧目标',amount:1000,period:'day'};
  const now=at('2026-11-01','01:00');migrateGoal(s,now);assert.equal(goalStats(s,now).pool,0);
  correctStartTime(s,{date,sessionIndex:0,start:at(date,'08:00')},now);assert.equal(goalStats(s,now).pool,0);validateState(s);
});
