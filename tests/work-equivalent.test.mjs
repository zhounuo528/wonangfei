import test from 'node:test';
import assert from 'node:assert/strict';
import { formatWorkEquivalent } from '../src/work-equivalent.mjs';
const hour = 3600000, day = 8 * hour, rate = 800 / day;
test('consumption conversion uses configured workdays, excludes lunch, and switches at one day', () => {
  assert.equal(formatWorkEquivalent(800, rate, day), '1 天');
  assert.equal(formatWorkEquivalent(2000, rate, day), '约 2.5 天');
  assert.equal(formatWorkEquivalent(799.99, rate, day), '7 小时 59 分钟');
  assert.equal(formatWorkEquivalent(150, rate, day), '1 小时 30 分钟');
  assert.equal(formatWorkEquivalent(2000, rate, 5 * hour), '4 天');
  assert.equal(formatWorkEquivalent(0, rate, day), '0 分钟');
  assert.equal(formatWorkEquivalent(0.01, rate, day), '不到 1 分钟');
});
test('consumption conversion handles large input, zero salary and invalid working duration safely', () => {
  assert.equal(formatWorkEquivalent(1e9, rate, day), '1,250,000 天');
  for (const invalid of [0,-1,NaN,Infinity]) assert.equal(formatWorkEquivalent(100,rate,invalid), '当前排班无法换算');
  assert.equal(formatWorkEquivalent(100,0,day), '当前薪资无法换算');
  for (const price of [-1,NaN,Infinity,1e9+1]) assert.equal(formatWorkEquivalent(price,rate,day), '请输入有效金额');
});
