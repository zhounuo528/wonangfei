// Fictional records for tests only; never included in application assets.
import { emptyState, at, saveGoal, getDay, uid, dateKey, settle, activeShift, isWorkday, activeSession } from '../core/model.js';
export function fictionalState(wall = Date.now()) {
  // Fictional Tuesday; clock advances from 14:36, independently of the user's shift.
  const key = '2026-11-03', now = at(key, '14:36');
  const state = emptyState(new Date(now));
  state.onboarded = true;
  state.trackingStart = '2026-11-01';
  saveGoal(state, { name: '给自己一副新耳机', amount: 1500 }, at('2026-11-01', '09:00'));
  for (const d of ['2026-11-02', key]) {
    const day = getDay(state, d, true);
    day.sessions.push({ start: at(d, '09:00'), end: d === key ? null : at(d, '18:00') });
    day.breaks.push({ id: uid(), name: '喝点水', durationMs: 20 * 60000, createdAt: at(d, '10:40') });
  }
  for (const [name, amount, category] of [['早餐', 12, '早餐'], ['午餐', 28, '午餐'], ['咖啡', 18, '咖啡'], ['通勤', 8, '通勤']]) state.expenses.push({ id: uid(), name, amount, category, date: key });
  for (const [name, amount] of [['房租', 2400], ['车贷', 900]]) state.fixed.push({ id: uid(), name, amount, period: 'month', allocation: 'workday', from: '2026-11-01', until: null, settings: structuredClone(state.settings) });
  return state;
}

// Reconstruct an already-saved pre-upgrade actual-click interval.
export function legacyStartWork(state, now) {
  const key = dateKey(new Date(now));
  settle(state, now);
  const open = activeShift(state, now);
  if (open && open.key !== key) throw Error('上一班次仍在进行，请先点击下班结算，再开始新班次');
  const s = state.days[key]?.settings ?? state.settings;
  if (!isWorkday(key, s)) throw Error('今天不在设定的工作日中，可先调整排班');
  if (now >= at(key, s.end)) throw Error('今天的排班已结束，请调整排班或明天再开始');
  if (activeSession(state, key, now)) return;
  getDay(state, key, true).sessions.push({ start: now, end: null });
}
