// Rounding is presentation-only. No formatted value flows back into accounting.
const decimal = new Intl.NumberFormat('en-US', { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2, roundingMode: 'halfExpand' });
const amount = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const currency = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function roundedMoney(value) { if (!Number.isFinite(value)) throw Error('无效金额'); const rounded = Number(decimal.format(value)); return rounded === 0 ? 0 : rounded; }
export const formatAmount = value => amount.format(roundedMoney(value));
export const formatCurrency = value => currency.format(roundedMoney(value));
export const belowCentPerSecond = value => value > 0 && value < 0.01;
