const days = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });

export function formatWorkEquivalent(price, ratePerMs, workdayMs) {
  if (!Number.isFinite(price) || price < 0 || price > 1e9) return '请输入有效金额';
  if (!Number.isFinite(workdayMs) || workdayMs <= 0) return '当前排班无法换算';
  if (price === 0) return '0 分钟';
  if (!Number.isFinite(ratePerMs) || ratePerMs <= 0) return '当前薪资无法换算';
  const milliseconds = price / ratePerMs, workdays = milliseconds / workdayMs;
  if (!Number.isFinite(workdays)) return '当前薪资无法换算';
  if (workdays >= 1 - Number.EPSILON * 4) return `${Number.isInteger(workdays) ? '' : '约 '}${days.format(workdays)} 天`;
  const minutes = Math.floor(milliseconds / 60000);
  if (!minutes) return '不到 1 分钟';
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return [hours ? `${hours} 小时` : '', rest ? `${rest} 分钟` : ''].filter(Boolean).join(' ');
}
