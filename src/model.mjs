// All dates are local civil dates; money is CNY, durations are milliseconds.
export const DEFAULT_SETTINGS = Object.freeze({ salary: 12000, payDays: 21.75, scheduleMode: 'double', weekdays: [1, 2, 3, 4, 5], alternateWeekdays: [1, 2, 3, 4, 5, 6], anchorWeek: '2026-11-02', anchorKind: 'double', start: '09:00', end: '18:00', lunch: true, lunchStart: '12:00', lunchEnd: '13:00' });
export const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const localDate = key => new Date(`${key}T00:00:00`);
export const at = (key, time) => new Date(`${key}T${time}:00`).getTime();
export const monthKey = key => key.slice(0, 7);
export const uid = () => globalThis.crypto.randomUUID();
const sum = values => values.reduce((a, b) => a + b, 0);
const overlap = (a, b) => Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
const finite = x => typeof x === 'number' && Number.isFinite(x);
const validTime = x => typeof x === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(x);
export function isDateKey(key) {
  return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key) && !Number.isNaN(localDate(key).getTime()) && dateKey(localDate(key)) === key;
}
export function validateSettings(s) {
  if (!s || !finite(s.salary) || s.salary < 0 || s.salary > 1e9) throw Error('月薪请输入 0 到 10 亿之间的数字');
  if (!finite(s.payDays) || s.payDays <= 0 || s.payDays > 31) throw Error('计薪天数必须大于 0 且不超过 31');
  if (!Array.isArray(s.weekdays) || s.weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) throw Error('工作日设置无效');
  if (s.scheduleMode !== undefined && !['double', 'single', 'alternating'].includes(s.scheduleMode)) throw Error('请选择双休、单休或大小周');
  if (s.scheduleMode === 'alternating' && (!isDateKey(s.anchorWeek) || localDate(s.anchorWeek).getDay() !== 1 || !['double', 'single'].includes(s.anchorKind) || !Array.isArray(s.alternateWeekdays) || s.alternateWeekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6))) throw Error('大小周须选择周一基准日期、该周单双休及两种工作日');
  if (!validTime(s.start) || !validTime(s.end) || s.end <= s.start) throw Error('下班时间须晚于上班时间；本版仅支持同日班次');
  if (typeof s.lunch !== 'boolean') throw Error('午休选项无效');
  if (s.lunch && (!validTime(s.lunchStart) || !validTime(s.lunchEnd) || s.lunchStart < s.start || s.lunchEnd > s.end || s.lunchEnd <= s.lunchStart)) throw Error('午休须在上班与下班之间，且结束晚于开始');
  if (scheduledMs('2026-11-03', s) <= 0) throw Error('有效排班时长须大于 0');
  return s;
}
export function windows(key, s) {
  const start = at(key, s.start), end = at(key, s.end);
  return s.lunch ? [[start, at(key, s.lunchStart)], [at(key, s.lunchEnd), end]].filter(([a, b]) => b > a) : [[start, end]];
}
export const scheduledMs = (key, s) => sum(windows(key, s).map(([a, b]) => b - a));
export function isWorkday(key, s) {
  if (s.scheduleMode !== 'alternating') return s.weekdays.includes(localDate(key).getDay());
  const ordinal = value => { const [y, m, d] = value.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
  const weekIndex = Math.floor((ordinal(key) - ordinal(s.anchorWeek)) / 7), parity = ((weekIndex % 2) + 2) % 2;
  const double = parity === 0 ? s.anchorKind === 'double' : s.anchorKind !== 'double';
  return (double ? s.weekdays : s.alternateWeekdays).includes(localDate(key).getDay());
}
export const expenseForDate = (expense, key) => expense.scope === 'month' ? expense.month === monthKey(key) && expense.allocationDates.includes(key) ? expense.amount / expense.allocationDates.length : 0 : expense.date === key ? expense.amount : 0;
export const ratePerMs = (key, s) => s.salary / s.payDays / scheduledMs(key, s);
export function emptyState(now = new Date()) {
  const state = { version: 1, onboarded: false, trackingStart: dateKey(now), settings: structuredClone(DEFAULT_SETTINGS), days: {}, expenses: [], fixed: [], display: 'today', goal: { name: '攒一份好心情', amount: 1000, period: 'month' }, reminder: { enabled: false, enabledAt: null, delivered: {} }, demo: null };
  const monday = new Date(now); monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7); state.settings.anchorWeek = dateKey(monday);
  return state;
}
export function clockNow(state, wall = Date.now()) {
  return new Date(state.demo ? state.demo.time + Math.max(0, wall - state.demo.wall) : wall);
}
export function getDay(state, key, create = false) {
  if (!state.days[key] && create) state.days[key] = { settings: structuredClone(state.settings), sessions: [], fish: [], breaks: [] };
  return state.days[key];
}
export function paidIntervals(day, key, now) {
  if (!day || !isWorkday(key, day.settings)) return [];
  const result = [];
  for (const session of day.sessions) {
    const interval = [session.start, Math.min(session.end ?? now, now)];
    for (const [a, b] of windows(key, day.settings)) {
      const start = Math.max(a, interval[0]), end = Math.min(b, interval[1]);
      if (end > start) result.push([start, end]);
    }
  }
  // Merge intervals so malformed duplicate records cannot double pay.
  result.sort((a, b) => a[0] - b[0]);
  return result.reduce((out, next) => {
    const prev = out.at(-1);
    if (prev && next[0] <= prev[1]) prev[1] = Math.max(prev[1], next[1]);
    else out.push([...next]);
    return out;
  }, []);
}
export function dayStats(state, key, now = Date.now()) {
  const day = getDay(state, key), s = day?.settings ?? state.settings;
  const paid = paidIntervals(day, key, now);
  const elapsed = sum(paid.map(([a, b]) => b - a));
  const overtimeRanges = (day?.sessions ?? []).map(session => [Math.max(session.start, at(key, s.end)), Math.min(session.end ?? now, now)]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  const mergedOvertime = overtimeRanges.reduce((out, next) => { const prev = out.at(-1); if (prev && next[0] <= prev[1]) prev[1] = Math.max(prev[1], next[1]); else out.push([...next]); return out; }, []);
  const overtime = sum(mergedOvertime.map(([a, b]) => b - a)), worked = elapsed + overtime;
  const fishRanges = (day?.fish ?? []).map(f => [f.start, Math.min(f.end ?? now, now)]).sort((a, b) => a[0] - b[0]);
  const merged = fishRanges.reduce((a, f) => { const prev = a.at(-1); if (prev && f[0] <= prev[1]) prev[1] = Math.max(prev[1], f[1]); else a.push([...f]); return a; }, []);
  const legacyFish = Math.min(elapsed, sum(paid.flatMap(p => merged.map(f => overlap(p, f)))));
  const fish = legacyFish + sum((day?.breaks ?? []).map(record => record.durationMs));
  const earned = elapsed * ratePerMs(key, s), actual = Math.max(0, worked - fish);
  const expenses = sum(state.expenses.map(e => expenseForDate(e, key)));
  const fixed = fixedForDate(state, key);
  return { earned, elapsed, worked, overtime, actual, fish, legacyFish, expenses, fixed, net: earned - expenses - fixed, hourly: actual > 0 ? earned / actual * 3600000 : null, secondly: actual > 0 ? earned / actual * 1000 : null, planned: scheduledMs(key, s), daily: s.salary / s.payDays, settings: s };
}
export function activeSession(state, key, now) {
  const day = state.days[key];
  return day?.sessions.find(s => s.end === null && s.start <= now);
}
export function activeShift(state, now) {
  for (const key of Object.keys(state.days).sort().reverse()) {
    const session = activeSession(state, key, now);
    if (session) return { key, day: state.days[key], session };
  }
  return null;
}
export function settle(state, now) {
  // Open shifts deliberately remain open until the user clicks clock-out.
  // paidIntervals caps wages; dayStats derives unpaid overtime from timestamps.
}
export function startWork(state, now) {
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
export function stopWork(state, now) {
  const key = activeShift(state, now)?.key ?? dateKey(new Date(now));
  const day = state.days[key];
  if (!day) return;
  day.sessions.forEach(s => { if (s.end === null) s.end = Math.max(s.start, now); });
  day.fish.forEach(f => { if (f.end === null) f.end = Math.max(f.start, Math.min(now, at(key, day.settings.end))); });
}
export function clockOut(state, now) {
  const key = activeShift(state, now)?.key ?? dateKey(new Date(now)), day = state.days[key];
  if (!day?.sessions.length) throw Error('请先开始上班，再查看下班总结');
  const hasOpen = day.sessions.some(session => session.end === null);
  if (!hasOpen && day.summary?.sessionCount === day.sessions.length) return day.summary;
  stopWork(state, now);
  const stats = dayStats(state, key, now), time = new Date(now);
  const deltaMinutes = Math.floor(now / 60000) - Math.floor(at(key, day.settings.end) / 60000);
  day.summary = { clockOutAt: now, date: key, status: deltaMinutes < 0 ? 'early' : deltaMinutes > 0 ? 'late' : 'ontime', sessionCount: day.sessions.length, earned: stats.earned, expenses: stats.expenses, fixed: stats.fixed, net: stats.net, fish: stats.fish, overtime: stats.overtime, actual: stats.actual, hourly: stats.hourly, scheduledEnd: day.settings.end };
  return day.summary;
}
export function addBreak(state, record, now = Date.now()) {
  const today = dateKey(new Date(now));
  if (!record || !isDateKey(record.date) || record.date < state.trackingStart || record.date > today || ![10, 20, 30].includes(record.minutes) || typeof record.name !== 'string' || !record.name.trim() || record.name.length > 40) throw Error('请选择有效日期、10/20/30 分钟和事项名称');
  const day = state.days[record.date];
  if (!day?.sessions.length) throw Error('该日期尚未记录计薪工时，请先开始上班');
  const stats = dayStats(state, record.date, now), available = Math.max(0, stats.worked - stats.fish), durationMs = record.minutes * 60000;
  if (durationMs > available) throw Error(`当前可计入 ${Math.floor(available / 60000)} 分 ${Math.floor(available / 1000) % 60} 秒，本次 ${record.minutes} 分钟超出；请选较短时长或稍后添加`);
  (day.breaks ??= []).push({ id: uid(), name: record.name.trim(), durationMs, createdAt: now });
}
export function deleteBreak(state, date, id) {
  const day = state.days[date];
  if (!day) throw Error('未找到这条摸鱼记录');
  if (id === 'legacy') { day.fish = []; return; }
  const index = (day.breaks ?? []).findIndex(record => record.id === id);
  if (index < 0) throw Error('未找到这条摸鱼记录');
  day.breaks.splice(index, 1);
}
export function dueReminder(state, now) {
  const reminder = state.reminder;
  if (!reminder?.enabled || !finite(reminder.enabledAt)) return null;
  const key = activeShift(state, now)?.key ?? dateKey(new Date(now)), settings = state.days[key]?.settings ?? state.settings;
  const end = at(key, settings.end);
  if (!isWorkday(key, settings) || now < end || reminder.enabledAt > end || reminder.delivered[key]) return null;
  return { date: key, scheduledEnd: end };
}
export function markReminderDelivered(state, reminder, now) {
  if (!state.reminder?.enabled || state.reminder.delivered[reminder.date]) return false;
  state.reminder.delivered[reminder.date] = { scheduledEnd: reminder.scheduledEnd, deliveredAt: now };
  return true;
}
export function attendanceStatus(state, key, now) {
  const day = state.days[key];
  if (!day?.sessions.length) return null;
  if (activeSession(state, key, now)) return now >= at(key, day.settings.end) ? { status: 'late', label: '加班中' } : { status: 'working', label: '进行中' };
  const end = Math.max(...day.sessions.map(session => session.end ?? session.start));
  const delta = Math.floor(end / 60000) - Math.floor(at(key, day.settings.end) / 60000);
  const status = day.summary?.sessionCount === day.sessions.length ? day.summary.status : delta < 0 ? 'early' : delta > 0 ? 'late' : 'ontime';
  return { status, label: { early: '提前下班', ontime: '准时下班', late: '加班' }[status] };
}
export function datesInMonth(key) {
  const first = localDate(`${monthKey(key)}-01`), result = [];
  for (let day = new Date(first); day.getMonth() === first.getMonth(); day.setDate(day.getDate() + 1)) result.push(dateKey(day));
  return result;
}
export function fixedItemForDate(item, key, settings) {
  if (key < item.from || (item.until && key >= item.until)) return 0;
  const dates = datesInMonth(key), monthly = item.amount / ({ month: 1, quarter: 3, year: 12 }[item.period]);
  if (item.allocation === 'calendar') return monthly / dates.length;
  const workdays = dates.filter(d => isWorkday(d, settings));
  return isWorkday(key, settings) && workdays.length ? monthly / workdays.length : 0;
}
export function fixedForDate(state, key) {
  if (key < state.trackingStart) return 0;
  return sum(state.fixed.map(item => fixedItemForDate(item, key, item.settings ?? state.settings)));
}
export function monthStats(state, key, now = Date.now()) {
  const today = dateKey(new Date(now));
  const dates = datesInMonth(key).filter(d => d <= today);
  const days = dates.map(d => dayStats(state, d, now));
  const total = field => sum(days.map(d => d[field]));
  const actual = total('actual'), earned = total('earned');
  return { earned, actual, worked: total('worked'), overtime: total('overtime'), fish: total('fish'), elapsed: total('elapsed'), hourly: actual > 0 ? earned / actual * 3600000 : null, secondly: actual > 0 ? earned / actual * 1000 : null, expenses: total('expenses'), fixed: total('fixed'), net: total('net'), recorded: dates.filter(d => state.days[d]?.sessions.length).length, dates, days };
}
export function monthlyReport(state, month, now) {
  if (!/^\d{4}-\d{2}$/.test(month) || !isDateKey(`${month}-01`)) throw Error('月份无效');
  const stats = monthStats(state, `${month}-01`, now);
  let ontimeDays = 0, lateDays = 0, earlyDays = 0, activeDays = 0;
  for (const key of stats.dates) {
    const status = attendanceStatus(state, key, now); if (!status) continue;
    if (activeSession(state, key, now)) activeDays++;
    else if (status.status === 'ontime') ontimeDays++;
    else if (status.status === 'late') lateDays++;
    else if (status.status === 'early') earlyDays++;
  }
  return { month, asOf: now, earned: stats.earned, expenses: stats.expenses, fixed: stats.fixed, costs: stats.expenses + stats.fixed, net: stats.net, worked: stats.worked, actual: stats.actual, fish: stats.fish, overtime: stats.overtime, hourly: stats.hourly, recorded: stats.recorded, ontimeDays, lateDays, earlyDays, activeDays, provisional: activeDays > 0 || month >= dateKey(new Date(now)).slice(0, 7) };
}
export function dueMonthlyReview(state, now) {
  const key = dateKey(new Date(now)), month = key.slice(0, 7);
  if (key !== datesInMonth(key).at(-1) || state.monthlyReviews?.shown?.[month]) return null;
  const report = monthlyReport(state, month, now);
  return report.recorded || report.costs ? report : null;
}
export function saveMonthlyReview(state, report, automatic = false) {
  state.monthlyReviews ??= { shown: {}, snapshots: {} };
  state.monthlyReviews.snapshots[report.month] = structuredClone(report);
  if (automatic) state.monthlyReviews.shown[report.month] ??= report.asOf;
}
export function goalStats(state, now = Date.now()) {
  const key = dateKey(new Date(now)), goal = state.goal;
  const earned = goal.period === 'day' ? dayStats(state, key, now).earned : monthStats(state, key, now).earned;
  let remaining = Math.max(0, goal.amount - earned);
  const base = { earned, remaining, progress: Math.min(1, earned / goal.amount) };
  if (!remaining) return { ...base, eta: now, status: 'done' };
  const dates = goal.period === 'day' ? [key] : datesInMonth(key).filter(d => d >= key);
  for (const d of dates) {
    const s = state.days[d]?.settings ?? state.settings;
    if (!isWorkday(d, s)) continue;
    const rate = ratePerMs(d, s);
    if (!(rate > 0)) continue;
    for (const [start, end] of windows(d, s)) {
      const from = Math.max(start, now), available = Math.max(0, end - from) * rate;
      if (remaining <= available && available > 0) return { ...base, eta: from + remaining / rate, status: 'estimated' };
      remaining -= available;
    }
  }
  return { ...base, eta: null, status: 'unreachable' };
}
export function addExpense(state, expense) {
  if (!expense || !isDateKey(expense.date) || !finite(expense.amount) || expense.amount <= 0 || expense.amount > 1e9 || typeof expense.name !== 'string' || !expense.name.trim() || expense.name.length > 40) throw Error('请填写有效日期、名称和大于 0 的金额');
  const today = dateKey(clockNow(state));
  if (expense.scope === 'month') {
    const month = expense.month;
    if (expense.category !== '自定义' || !isDateKey(`${month}-01`) || month < state.trackingStart.slice(0, 7) || month > today.slice(0, 7)) throw Error('请选择开始记录月至今的月份');
    const allocationDates = datesInMonth(`${month}-01`).filter(key => isWorkday(key, state.settings));
    if (!allocationDates.length) throw Error('这个月考勤工作日为 0，无法分摊；请选当日花销或调整考勤');
    state.expenses.push({ ...expense, date: `${month}-01`, name: expense.name.trim(), id: uid(), allocationDates, settings: structuredClone(state.settings) }); return;
  }
  if (expense.date > today || expense.date < state.trackingStart) throw Error('花销日期须在开始记录日至今天之间');
  state.expenses.push({ ...expense, scope: 'day', name: expense.name.trim(), id: uid() });
}
export function addFixed(state, item, key) {
  if (!item || !finite(item.amount) || item.amount <= 0 || item.amount > 1e9 || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 40 || !['month', 'quarter', 'year'].includes(item.period) || item.allocation !== 'workday') throw Error('固定费用统一按考勤工作日分摊');
  if (item.allocation === 'workday' && !datesInMonth(key).some(date => isWorkday(date, state.settings))) throw Error('当月考勤工作日为 0，无法分摊；请先调整考勤');
  state.fixed.push({ ...item, name: item.name.trim(), id: uid(), from: key, until: null, settings: structuredClone(state.settings) });
}
export function convertLegacyFixed(state, key) {
  const legacy = state.fixed.filter(item => item.allocation === 'calendar' && !item.until);
  if (!legacy.length) return 0;
  if (!datesInMonth(key).some(date => isWorkday(date, state.settings))) throw Error('旧方案切换需要至少一个考勤工作日；请先调整考勤');
  for (const item of legacy) {
    item.until = key;
    state.fixed.push({ ...item, id: uid(), allocation: 'workday', from: key, until: null, settings: structuredClone(state.settings), replaces: item.id });
  }
  return legacy.length;
}
export function validateState(state) {
  if (!state || state.version !== 1 || !isDateKey(state.trackingStart)) throw Error('本地记录版本或日期无效');
  validateSettings(state.settings);
  if (!['today', 'month', 'goal', 'hidden'].includes(state.display)) throw Error('金额显示模式无效');
  if (!state.goal || typeof state.goal.name !== 'string' || !state.goal.name.trim() || state.goal.name.length > 40 || !finite(state.goal.amount) || state.goal.amount <= 0 || state.goal.amount > 1e9 || !['day', 'month'].includes(state.goal.period)) throw Error('赚钱目标无效');
  if (!state.days || typeof state.days !== 'object' || Object.keys(state.days).length > 20000 || !Array.isArray(state.expenses) || !Array.isArray(state.fixed) || state.expenses.length > 100000 || state.fixed.length > 10000) throw Error('本地记录结构无效');
  for (const [key, day] of Object.entries(state.days)) {
    if (!isDateKey(key) || key < state.trackingStart) throw Error('打卡日期无效');
    validateSettings(day.settings);
    for (const list of [day.sessions, day.fish]) {
      if (!Array.isArray(list) || list.length > 10000 || list.some(i => !finite(i.start) || (i.end !== null && (!finite(i.end) || i.end < i.start)) || i.start < at(key, '00:00') || i.start >= at(dateKey(new Date(localDate(key).getTime() + 36e5 * 36)), '00:00'))) throw Error('计时记录无效');
    }
    if (day.breaks !== undefined && (!Array.isArray(day.breaks) || day.breaks.length > 10000 || day.breaks.some(r => !r || typeof r.id !== 'string' || typeof r.name !== 'string' || !r.name.trim() || r.name.length > 40 || !finite(r.durationMs) || r.durationMs <= 0 || !finite(r.createdAt)))) throw Error('摸鱼时长记录无效');
    if (day.summary && (!finite(day.summary.clockOutAt) || day.summary.date !== key || !['early', 'ontime', 'late'].includes(day.summary.status) || !Number.isInteger(day.summary.sessionCount) || !['earned', 'expenses', 'fixed', 'net', 'fish', 'actual'].every(field => finite(day.summary[field])) || (day.summary.hourly !== null && !finite(day.summary.hourly)) || !validTime(day.summary.scheduledEnd))) throw Error('下班总结无效');
  }
  for (const e of state.expenses) {
    if (!e || typeof e.id !== 'string' || !isDateKey(e.date) || (e.scope !== 'month' && e.date < state.trackingStart) || typeof e.name !== 'string' || !e.name.trim() || e.name.length > 40 || !finite(e.amount) || e.amount <= 0 || e.amount > 1e9) throw Error('花销记录无效');
    if (e.scope === 'month') { if (!isDateKey(`${e.month}-01`) || !Array.isArray(e.allocationDates) || !e.allocationDates.length || new Set(e.allocationDates).size !== e.allocationDates.length || e.allocationDates.some(key => !isDateKey(key) || key.slice(0, 7) !== e.month)) throw Error('整月花销分摊记录无效'); validateSettings(e.settings); }
  }
  for (const f of state.fixed) {
    if (!f || typeof f.id !== 'string' || typeof f.name !== 'string' || !f.name.trim() || f.name.length > 40 || !finite(f.amount) || f.amount <= 0 || f.amount > 1e9 || !isDateKey(f.from) || (f.until !== null && (!isDateKey(f.until) || f.until < f.from)) || !['month', 'quarter', 'year'].includes(f.period) || !['calendar', 'workday'].includes(f.allocation)) throw Error('固定费用记录无效');
    validateSettings(f.settings);
  }
  if (state.demo !== null && (!finite(state.demo?.time) || !finite(state.demo?.wall))) throw Error('演示时钟无效');
  if (state.reminder !== undefined) {
    const r = state.reminder;
    if (!r || typeof r.enabled !== 'boolean' || (r.enabledAt !== null && !finite(r.enabledAt)) || (r.enabled && r.enabledAt === null) || !r.delivered || typeof r.delivered !== 'object' || Object.entries(r.delivered).some(([key, entry]) => !isDateKey(key) || !finite(entry?.scheduledEnd) || !finite(entry?.deliveredAt))) throw Error('下班提醒设置无效');
  }
  if (state.monthlyReviews !== undefined) {
    const reviews = state.monthlyReviews;
    if (!reviews || !reviews.shown || !reviews.snapshots || Object.entries(reviews.shown).some(([key, stamp]) => !/^\d{4}-\d{2}$/.test(key) || !finite(stamp)) || Object.entries(reviews.snapshots).some(([key, report]) => report?.month !== key || !finite(report.asOf) || !['earned', 'expenses', 'fixed', 'costs', 'net', 'worked', 'actual', 'fish', 'overtime'].every(field => finite(report[field])) || (report.hourly !== null && !finite(report.hourly)))) throw Error('月报记录无效');
  }
  return state;
}
export function demoState(wall = Date.now()) {
  // Fictional Tuesday; clock advances from 14:36, independently of the user's shift.
  const key = '2026-11-03', now = at(key, '14:36');
  const state = emptyState(new Date(now));
  state.onboarded = true;
  state.demo = { time: now, wall };
  state.trackingStart = '2026-11-01';
  state.goal = { name: '给自己一副新耳机', amount: 1500, period: 'month' };
  for (const d of ['2026-11-02', key]) {
    const day = getDay(state, d, true);
    day.sessions.push({ start: at(d, '09:00'), end: d === key ? null : at(d, '18:00') });
    day.breaks.push({ id: uid(), name: '喝点水', durationMs: 20 * 60000, createdAt: at(d, '10:40') });
  }
  for (const [name, amount, category] of [['早餐', 12, '早餐'], ['午餐', 28, '午餐'], ['咖啡', 18, '咖啡'], ['通勤', 8, '通勤']]) state.expenses.push({ id: uid(), name, amount, category, date: key });
  for (const [name, amount] of [['房租', 2400], ['车贷', 900]]) state.fixed.push({ id: uid(), name, amount, period: 'month', allocation: 'workday', from: '2026-11-01', until: null, settings: structuredClone(state.settings) });
  return state;
}
