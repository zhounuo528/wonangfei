import test from 'node:test';
import assert from 'node:assert/strict';
import { roundedMoney, formatAmount, formatCurrency, belowCentPerSecond } from '../src/money.mjs';
test('money display uses two decimals and half-expand rounding without negative zero', () => {
  assert.equal(formatAmount(1.005), '1.01'); assert.equal(formatAmount(2.675), '2.68');
  assert.equal(formatAmount(-0.004), '0.00'); assert.equal(formatAmount(-0), '0.00'); assert.equal(formatAmount(-0.005), '-0.01');
  assert.equal(Object.is(roundedMoney(-0.001), -0), false); assert.equal(formatAmount(1234), '1,234.00');
  assert.match(formatCurrency(10), /10\.00$/); assert.throws(() => formatCurrency(NaN));
});
test('presentation rounding does not accumulate into the underlying total or hide sub-cent rates', () => {
  const rate = 0.004; assert.equal(formatAmount(rate), '0.00'); assert.equal(belowCentPerSecond(rate), true); assert.equal(belowCentPerSecond(0), false);
  assert.equal(formatAmount(rate * 1000), '4.00'); assert.equal(rate, 0.004);
  assert.equal(formatAmount(-0.006), '-0.01'); assert.equal(formatAmount(0.006), '0.01');
});
