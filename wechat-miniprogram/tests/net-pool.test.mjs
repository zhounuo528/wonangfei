import { legacyStartWork as startWork } from './fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, at,  clockOut, correctStartTime, addExpense, addFixed, netIncomePool, validateState } from '../core/model.js';
const key = '2026-11-03';
function fixture() { const s = emptyState(new Date(at(key,'08:00'))); s.settings.salary=17600; s.settings.payDays=22; delete s.settings.payDaysMode; delete s.settings.payDaysMonth; return s; }
test('net pool includes creation day loss and next day profit: -100 plus 300 equals 200, with no repeated accumulation', () => {
  const s = fixture(); s.expenses.push({ id:'cost',name:'当日成本',date:key,amount:100 });
  assert.equal(netIncomePool(s,key,at(key,'18:00')).net,-100);
  startWork(s,at('2026-11-04','09:00')); clockOut(s,at('2026-11-04','12:00'));
  const before=JSON.stringify(s); for(let i=0;i<4;i++) assert.equal(netIncomePool(s,key,at('2026-11-04','18:00')).net,200);
  assert.equal(JSON.stringify(s),before); validateState(s);
});
test('same-day live wages, backdated expenses and clock-in correction recalculate pool without writing deposits', () => {
  const s = fixture(); startWork(s,at(key,'10:00'));
  assert.equal(netIncomePool(s,key,at(key,'11:00')).net,100); assert.equal(netIncomePool(s,key,at(key,'11:30')).net,150);
  s.expenses.push({ id:'cost',name:'午餐',date:key,amount:50 }); assert.equal(netIncomePool(s,key,at(key,'11:30')).net,100);
  correctStartTime(s,{date:key,sessionIndex:0,start:at(key,'09:00')},at(key,'11:30'));
  assert.equal(netIncomePool(s,key,at(key,'11:30')).net,200);
  s.expenses[0].amount=70; assert.equal(netIncomePool(s,key,at(key,'11:30')).net,180);
  s.expenses=[]; assert.equal(netIncomePool(s,key,at(key,'11:30')).net,250);
});
test('pool crosses month boundaries, excludes earlier dates, charges elapsed unrecorded workday fixed costs only', () => {
  const date='2026-10-30', s=emptyState(new Date(at(date,'08:00'))); s.settings.salary=17600; s.settings.payDays=22; delete s.settings.payDaysMode; delete s.settings.payDaysMonth;
  addFixed(s,{name:'房租',amount:2200,period:'month',allocation:'workday'},date);
  startWork(s,at(date,'09:00')); clockOut(s,at(date,'18:00')); startWork(s,at(key,'09:00')); clockOut(s,at(key,'12:00'));
  const october=netIncomePool(s,date,at(date,'18:00'));
  const total=netIncomePool(s,date,at(key,'12:00')); assert.equal(total.earned,1100); assert.equal(total.days,5); assert.ok(total.costs>october.costs);
  const later=netIncomePool(s,'2026-11-01',at(key,'12:00')); assert.equal(later.earned,300); assert.equal(later.days,3);
  assert.equal(later.costs,2200 / 21 * 2); assert.equal(later.net,300 - 2200 / 21 * 2);
});
test('future starts and unknown history are rejected rather than guessed, negative totals remain signed', () => {
  const s=fixture(); s.expenses.push({id:'cost',name:'成本',date:key,amount:5000});
  assert.equal(netIncomePool(s,key,at(key,'09:00')).net,-5000);
  for(const from of ['2026-11-02','2026-11-04','bad']) assert.throws(()=>netIncomePool(s,from,at(key,'09:00')));
});
