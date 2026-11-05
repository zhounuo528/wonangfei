// Duration-only break records cannot locate a break inside paid/unpaid periods.
// Allocate the shift's gross income proportionally, before deducting break time.
// This is a view of existing income, never a ledger entry or extra payment.
export function estimateFishEarnings({ earned, worked, fish }) {
  if (![earned, worked, fish].every(Number.isFinite) || earned < 0 || worked < 0 || fish < 0) return null;
  if (fish === 0) return 0;
  if (worked === 0 || fish > worked) return null;
  return earned * (fish / worked);
}

export function formatFishDuration(ms) {
  if (ms === 0) return '0 分钟';
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds / 60) % 60;
  const parts = [];
  if (hours) parts.push(`${hours} 小时`);
  if (minutes) parts.push(`${minutes} 分钟`);
  if (seconds % 60) parts.push(`${seconds % 60} 秒`);
  return parts.join(' ') || '不足 1 秒';
}

export function fishRecap(scope, fish, fishEarned, money) {
  const result = fishEarned === null ? '摸鱼所得待核对' : `成功赚到 ${money(fishEarned)}（估算）`;
  return `你${scope}累计摸鱼 ${formatFishDuration(fish)}，${result}。`;
}

export const fishEarningsNote = '按每天工资毛收入（含另记加班费）× 摸鱼时长 ÷ 当天上班总时长估算，再逐日相加。';
