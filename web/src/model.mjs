// All dates are local civil dates; money is CNY, durations are milliseconds.
export const DEFAULT_SETTINGS = Object.freeze({ salary: 0, payDays: 0, payDaysMode: 'auto', scheduleMode: 'double', weekdays: [1, 2, 3, 4, 5], alternateWeekdays: [1, 2, 3, 4, 5, 6], anchorWeek: '2026-11-02', anchorKind: 'double', start: '09:00', end: '18:00', lunch: true, lunchStart: '12:00', lunchEnd: '13:00' });
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
function validateCalendar(s) {
  if (!Array.isArray(s.weekdays) || s.weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) throw Error('工作日设置无效');
  if (s.scheduleMode !== undefined && !['double', 'single', 'alternating', '996', 'everyday'].includes(s.scheduleMode)) throw Error('请选择双休、单休、大小周、996 或全年无休');
  if (s.scheduleMode === 'everyday' && (s.weekdays.length !== 7 || new Set(s.weekdays).size !== 7)) throw Error('全年无休须包含星期日至星期六，每天均为工作日');
  if (s.scheduleMode === 'alternating' && (!isDateKey(s.anchorWeek) || localDate(s.anchorWeek).getDay() !== 1 || !['double', 'single'].includes(s.anchorKind) || !Array.isArray(s.alternateWeekdays) || s.alternateWeekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6))) throw Error('大小周须选择周一基准日期、该周单双休及两种工作日');
}
const validMonth = key => typeof key === 'string' && isDateKey(`${key}-01`);
export function validateSettings(s) {
  if (!s || !finite(s.salary) || s.salary < 0 || s.salary > 1e9) throw Error('月薪请输入 0 到 10 亿之间的数字');
  validateCalendar(s);
  if (s.payDaysMode !== undefined && !['auto', 'manual'].includes(s.payDaysMode)) throw Error('请选择自动计薪或手动调整本月');
  if (!finite(s.payDays) || s.payDays > 31 || (s.payDaysMode === 'auto' ? s.payDays < 0 : s.payDays <= 0)) throw Error('手动计薪天数必须大于 0 且不超过 31');
  if ((s.payDaysMode === 'manual' && !validMonth(s.payDaysMonth)) || (s.payDaysMonth !== undefined && !validMonth(s.payDaysMonth))) throw Error('计薪月份无效');
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
  if (s.scheduleMode === 'everyday') return isDateKey(key);
  if (s.scheduleMode !== 'alternating') return s.weekdays.includes(localDate(key).getDay());
  const ordinal = value => { const [y, m, d] = value.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
  const weekIndex = Math.floor((ordinal(key) - ordinal(s.anchorWeek)) / 7), parity = ((weekIndex % 2) + 2) % 2;
  const double = parity === 0 ? s.anchorKind === 'double' : s.anchorKind !== 'double';
  return (double ? s.weekdays : s.alternateWeekdays).includes(localDate(key).getDay());
}
export const expenseForDate = (expense, key) => expense.scope === 'month' ? expense.month === monthKey(key) && expense.allocationDates.includes(key) ? expense.amount / expense.allocationDates.length : 0 : expense.date === key ? expense.amount : 0;
export function plannedPayDays(key, settings) {
  if (!isDateKey(key)) throw Error('计薪日期无效');
  validateCalendar(settings);
  return datesInMonth(key).filter(date => isWorkday(date, settings)).length;
}
export function payDaysModeForDate(key, settings) {
  if (settings.payDaysMode === undefined) return 'legacy';
  return settings.payDaysMode === 'manual' && settings.payDaysMonth === monthKey(key) ? 'manual' : 'auto';
}
export function effectivePayDays(key, settings) {
  return payDaysModeForDate(key, settings) === 'auto' ? plannedPayDays(key, settings) : settings.payDays;
}
export function settingsForDate(key, settings) {
  const copy = structuredClone(settings), mode = payDaysModeForDate(key, settings);
  if (mode !== 'legacy') { copy.payDaysMode = mode; copy.payDaysMonth = monthKey(key); copy.payDays = effectivePayDays(key, settings); }
  return copy;
}
export function migratePayDays(state, now = Date.now()) {
  if (state.settings.payDaysMode !== undefined) return false;
  const key = dateKey(new Date(now));
  state.payDaysMigration = { version: 1, changedAt: now, from: key, previousSettings: structuredClone(state.settings) };
  state.settings = { ...state.settings, payDaysMode: 'auto', payDaysMonth: monthKey(key), payDays: plannedPayDays(key, state.settings) };
  return true;
}
// Salary changes are an ordered audit ledger; future changes never mutate old days.
export function salaryForDate(state, key) {
  let amount = state.salaryChanges?.[0]?.fromSalary ?? state.settings.salary;
  for (const change of state.salaryChanges ?? []) if (change.effectiveDate <= key) amount = change.salary;
  return amount;
}
export function settingsForDay(state, key) {
  return settingsForDate(key, { ...state.settings, salary: salaryForDate(state, key) });
}
export function saveSettings(state, input, salaryFrom = 'today', now = Date.now()) {
  if (!finite(now) || !['today', 'tomorrow'].includes(salaryFrom)) throw Error('请选择工资从今天或明天生效');
  validateSettings(input);
  const key = dateKey(new Date(now));
  if (!isDateKey(key) || key < state.trackingStart) throw Error('工资生效日期无效，请检查本机时间');
  const next = structuredClone(state), tomorrow = localDate(key); tomorrow.setDate(tomorrow.getDate() + 1);
  const effectiveDate = salaryFrom === 'today' ? key : dateKey(tomorrow);
  const day = next.days[key], oldSalary = state.settings.salary;
  const changed = input.salary !== oldSalary || salaryFrom === 'today' && (salaryForDate(state, key) !== input.salary || day && day.settings.salary !== input.salary);
  next.settings = structuredClone(input);
  if (changed) {
    (next.salaryChanges ??= []).push({ id: uid(), changedAt: now, effectiveDate, fromSalary: oldSalary, salary: input.salary });
    if (salaryFrom === 'today' && day) {
      // Revalue wages only: preserve schedule, paid-day denominator, all sessions and costs.
      const previous = day.settings.salary; day.settings.salary = input.salary;
      (day.salaryCorrections ??= []).push({ id: uid(), changedAt: now, fromSalary: previous, salary: input.salary });
      if (day.summary) {
        const stats = dayStats(next, key, day.summary.clockOutAt);
        for (const field of ['earned', 'overtimePay', 'fish', 'overtime', 'actual', 'hourly']) day.summary[field] = stats[field];
        day.summary.net = stats.earned - day.summary.expenses - day.summary.fixed;
        day.summary.recalculatedAt = now;
      }
      const month = monthKey(key), saved = next.monthlyReviews?.snapshots[month];
      if (saved) next.monthlyReviews.snapshots[month] = { ...monthlyReport(next, month, saved.asOf), recalculatedAt: now };
    }
  }
  const converted = convertLegacyFixed(next, key);
  validateState(next);
  Object.assign(state, next);
  return { changed, effectiveDate, converted, recalculated: changed && salaryFrom === 'today' && !!day };
}
export const ratePerMs = (key, s) => { const days = effectivePayDays(key, s), duration = scheduledMs(key, s); return days > 0 && duration > 0 ? s.salary / days / duration : 0; };
export function emptyState(now = new Date()) {
  const state = { version: 1, onboarded: false, trackingStart: dateKey(now), settings: structuredClone(DEFAULT_SETTINGS), days: {}, expenses: [], fixed: [], display: 'today', goal: null, reminder: { enabled: false, enabledAt: null, delivered: {} } };
  const monday = new Date(now); monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7); state.settings.anchorWeek = dateKey(monday);
  state.settings = settingsForDate(dateKey(now), state.settings);
  return state;
}
export function clockNow(state, wall = Date.now()) {
  return new Date(wall);
}
export function getDay(state, key, create = false) {
  if (!state.days[key] && create) state.days[key] = { settings: settingsForDay(state, key), sessions: [], fish: [], breaks: [] };
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
  const day = getDay(state, key), s = day?.settings ?? settingsForDay(state, key);
  const paid = paidIntervals(day, key, now);
  const elapsed = sum(paid.map(([a, b]) => b - a));
  const overtimeRanges = (day?.sessions ?? []).map(session => [Math.max(session.start, at(key, s.end)), Math.min(session.end ?? now, now)]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  const mergedOvertime = overtimeRanges.reduce((out, next) => { const prev = out.at(-1); if (prev && next[0] <= prev[1]) prev[1] = Math.max(prev[1], next[1]); else out.push([...next]); return out; }, []);
  const overtime = sum(mergedOvertime.map(([a, b]) => b - a)), worked = elapsed + overtime;
  const fishRanges = (day?.fish ?? []).map(f => [f.start, Math.min(f.end ?? now, now)]).sort((a, b) => a[0] - b[0]);
  const merged = fishRanges.reduce((a, f) => { const prev = a.at(-1); if (prev && f[0] <= prev[1]) prev[1] = Math.max(prev[1], f[1]); else a.push([...f]); return a; }, []);
  const legacyFish = Math.min(elapsed, sum(paid.flatMap(p => merged.map(f => overlap(p, f)))));
  const fish = legacyFish + sum((day?.breaks ?? []).map(record => record.durationMs));
  const overtimePay = sum((day?.overtimeDecisions ?? []).filter(entry => entry.clockOutAt <= now).map(entry => entry.amount));
  const baseEarned = elapsed * ratePerMs(key, s), earned = baseEarned + overtimePay, actual = Math.max(0, worked - fish);
  const expenses = sum(state.expenses.map(e => expenseForDate(e, key)));
  const fixed = fixedForDate(state, key);
  const payDays = effectivePayDays(key, s);
  return { earned, baseEarned, overtimePay, elapsed, worked, overtime, actual, fish, legacyFish, expenses, fixed, net: earned - expenses - fixed, hourly: actual > 0 ? earned / actual * 3600000 : null, secondly: actual > 0 ? earned / actual * 1000 : null, planned: scheduledMs(key, s), daily: payDays > 0 ? s.salary / payDays : 0, payDays, settings: s };
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
  if (!finite(now) || !isDateKey(key) || key < state.trackingStart) throw Error('上班日期无效，请检查本机时间');
  const open = activeShift(state, now);
  if (open) { if (open.key === key) return; throw Error('上一班次仍在进行，请先点击下班结算，再开始新班次'); }
  if (state.days[key]?.sessions.length) return resumeWork(state, key, now);
  const s = state.days[key]?.settings ?? settingsForDay(state, key);
  if (!isWorkday(key, s) || effectivePayDays(key, s) <= 0) throw Error('今天不在设定的工作日中，可先调整排班');
  const planned = at(key, s.start);
  let start = Math.min(planned, now);
  // Backfill only a new current-day shift, never overwrite or double-count older work.
  for (const day of Object.values(state.days)) for (const session of day.sessions) {
    if (session.end === null || session.end > now) throw Error('已有时段尚未结束，请先核对上班记录');
    if (session.end > start) start = session.end;
  }
  getDay(state, key, true).sessions.push({ start, end: null, clickedAt: now, startSource: 'schedule', overlapAdjusted: start > Math.min(planned, now) });
}
export function stopWork(state, now) {
  const key = activeShift(state, now)?.key ?? dateKey(new Date(now));
  const day = state.days[key];
  if (!day) return;
  day.sessions.forEach(s => { if (s.end === null) s.end = Math.max(s.start, now); });
  day.fish.forEach(f => { if (f.end === null) f.end = Math.max(f.start, Math.min(now, at(key, day.settings.end))); });
}
export function resumeWork(state, key, now) {
  const day = state.days[key];
  if (!isDateKey(key) || !day?.sessions.length || !finite(now) || dateKey(new Date(now)) < key) throw Error('请选择已下班的班次再返工');
  const open = activeShift(state, now);
  if (open) { if (open.key === key) return; throw Error('另一班次还在进行，请先下班'); }
  if (day.sessions.some(session => session.end === null) || Math.max(...day.sessions.map(session => session.end)) > now) throw Error('返工时间不能早于原下班记录');
  day.sessions.push({ start: now, end: null, resumed: true });
}
export function needsOvertimeDecision(state, now) {
  const shift = activeShift(state, now);
  return !!shift && dayStats(state, shift.key, now).overtime > 2 * 3600000;
}
export function clockOut(state, now, decision) {
  const key = activeShift(state, now)?.key ?? dateKey(new Date(now)), day = state.days[key];
  if (!day?.sessions.length) throw Error('请先开始上班，再查看下班总结');
  const hasOpen = day.sessions.some(session => session.end === null);
  if (!hasOpen && day.summary?.sessionCount === day.sessions.length) return day.summary;
  const needsDecision = hasOpen && needsOvertimeDecision(state, now);
  if (needsDecision && (!decision || !['free', 'paid'].includes(decision.kind) || !finite(decision.amount) || decision.amount < 0 || decision.amount > 1e9 || (decision.kind === 'free' ? decision.amount !== 0 : decision.amount <= 0))) throw Error('请选择免费加班，或填写大于 0、至多 10 亿的本次加班费');
  const indexes = day.sessions.map((session, index) => session.end === null ? index : -1).filter(index => index >= 0);
  stopWork(state, now);
  if (needsDecision) (day.overtimeDecisions ??= []).push({ id: uid(), sessions: indexes, clockOutAt: now, kind: decision.kind, amount: decision.amount });
  const stats = dayStats(state, key, now), time = new Date(now);
  const deltaMinutes = Math.floor(now / 60000) - Math.floor(at(key, day.settings.end) / 60000);
  day.summary = { clockOutAt: now, date: key, status: deltaMinutes < 0 ? 'early' : deltaMinutes > 0 ? 'late' : 'ontime', sessionCount: day.sessions.length, earned: stats.earned, overtimePay: stats.overtimePay, expenses: stats.expenses, fixed: stats.fixed, net: stats.net, fish: stats.fish, overtime: stats.overtime, actual: stats.actual, hourly: stats.hourly, scheduledEnd: day.settings.end };
  return day.summary;
}
export function correctStartTime(state, record, now = Date.now()) {
  const key = record?.date, index = record?.sessionIndex, start = record?.start;
  if (!finite(now) || !isDateKey(key) || key < state.trackingStart || key > dateKey(new Date(now))) throw Error('请选择已记录的上班日期');
  const day = state.days[key];
  if (!day?.sessions.length) throw Error('这一天还没有上班记录，请先点击开始上班');
  if (!Number.isInteger(index) || index < 0 || index >= day.sessions.length) throw Error('请选择要修正的上班时段');
  if (!finite(start) || dateKey(new Date(start)) !== dateKey(new Date(day.sessions[index].start))) throw Error('上班时间须在这一段原记录的日期内，不能移到其他日期');
  if (start > now) throw Error('实际上班时间不能晚于现在');
  const session = day.sessions[index];
  if (session.end !== null && start > session.end) throw Error('上班时间不能晚于这一段的实际下班时间');
  const before = dayStats(state, key, now);
  if (start === session.start) return { changed: false, before, after: before };
  // A correction edits one interval, never appends a paid interval or moves its date.
  const end = session.end ?? Infinity;
  for (const [otherKey, otherDay] of Object.entries(state.days)) for (const [otherIndex, other] of otherDay.sessions.entries()) {
    if (otherKey === key && otherIndex === index) continue;
    const otherEnd = other.end ?? Infinity;
    if (end > start && otherEnd > other.start && start < otherEnd && other.start < end) throw Error('修正后会与另一段上班记录重叠，请保留各段真实的起止时间');
  }
  const corrected = structuredClone(day), next = { ...state, days: { ...state.days, [key]: corrected } };
  corrected.sessions[index].start = start;
  const after = dayStats(next, key, now);
  if (after.fish > after.worked) throw Error(`修正后上班工时仅 ${Math.floor(after.worked / 60000)} 分钟，少于已记的 ${Math.ceil(after.fish / 60000)} 分钟摸鱼；请先在摸鱼记录中纠错`);
  (corrected.startCorrections ??= []).push({ id: uid(), sessionIndex: index, from: session.start, to: start, correctedAt: now });
  if (corrected.summary) {
    const stats = dayStats(next, key, corrected.summary.clockOutAt);
    for (const field of ['earned', 'overtimePay', 'fish', 'overtime', 'actual', 'hourly']) corrected.summary[field] = stats[field];
    corrected.summary.net = stats.earned - corrected.summary.expenses - corrected.summary.fixed;
    corrected.summary.recalculatedAt = now;
  }
  // Refresh only an existing report for this month, preserving its cutoff and shown flag.
  const month = monthKey(key), saved = state.monthlyReviews?.snapshots[month];
  if (saved) next.monthlyReviews = { ...state.monthlyReviews, snapshots: { ...state.monthlyReviews.snapshots, [month]: { ...monthlyReport(next, month, saved.asOf), recalculatedAt: now } } };
  validateState(next);
  state.days[key] = corrected;
  if (saved) state.monthlyReviews = next.monthlyReviews;
  return { changed: true, before, after };
}
export function addBreak(state, record, now = Date.now()) {
  const today = dateKey(new Date(now));
  if (!record || !isDateKey(record.date) || record.date < state.trackingStart || record.date > today || !Number.isInteger(record.minutes) || record.minutes < 1 || record.minutes > 1440 || typeof record.name !== 'string' || !record.name.trim() || record.name.length > 40) throw Error('请填写 1 到 1440 之间的整数分钟、有效日期和事项名称');
  const day = state.days[record.date];
  if (!day?.sessions.length) throw Error('该日期尚未记录计薪工时，请先开始上班');
  const stats = dayStats(state, record.date, now), available = Math.max(0, stats.worked - stats.fish), durationMs = record.minutes * 60000;
  if (durationMs > available) throw Error(`当前可计入 ${Math.floor(available / 60000)} 分 ${Math.floor(available / 1000) % 60} 秒，本次 ${record.minutes} 分钟超出；请选较短时长或稍后添加`);
  (day.breaks ??= []).push({ id: uid(), name: record.name.trim(), durationMs, createdAt: now });
}
export const breakDate = (state, now = Date.now()) => activeShift(state, now)?.key ?? dateKey(new Date(now));
export function addCurrentBreak(state, record, now = Date.now()) {
  return addBreak(state, { ...record, date: breakDate(state, now) }, now);
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
  const workedDays = days.filter(day => day.worked > 0).length;
  return { earned, actual, worked: total('worked'), overtime: total('overtime'), overtimePay: total('overtimePay'), fish: total('fish'), elapsed: total('elapsed'), hourly: actual > 0 ? earned / actual * 3600000 : null, secondly: actual > 0 ? earned / actual * 1000 : null, expenses: total('expenses'), fixed: total('fixed'), net: total('net'), averageDaily: workedDays > 0 ? total('net') / workedDays : null, workedDays, recorded: dates.filter(d => state.days[d]?.sessions.length).length, dates, days };
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
  return { month, asOf: now, earned: stats.earned, overtimePay: stats.overtimePay, expenses: stats.expenses, fixed: stats.fixed, costs: stats.expenses + stats.fixed, net: stats.net, worked: stats.worked, actual: stats.actual, fish: stats.fish, overtime: stats.overtime, hourly: stats.hourly, recorded: stats.recorded, ontimeDays, lateDays, earlyDays, activeDays, provisional: activeDays > 0 || month >= dateKey(new Date(now)).slice(0, 7) };
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
export function netIncomePool(state, from, now = Date.now()) {
  const through = dateKey(new Date(now));
  if (!isDateKey(from) || !isDateKey(through) || from < state.trackingStart || from > through || !finite(now)) throw Error('积累起始日须在已开始记录至今天之间');
  let earned = 0, costs = 0, days = 0;
  // Read the ledger, do not add deposits: edits and repeated reads cannot double count.
  for (let date = localDate(from), end = localDate(through); date <= end; date.setDate(date.getDate() + 1)) {
    const stats = dayStats(state, dateKey(date), now);
    earned += stats.earned; costs += stats.expenses + stats.fixed; days++;
  }
  return { from, through, earned, costs, net: earned - costs, days };
}
function validateGoalInput(goal) {
  if (!goal || typeof goal.name !== 'string' || !goal.name.trim() || goal.name.length > 40 || !finite(goal.amount) || goal.amount <= 0 || goal.amount > 1e9) throw Error('请填写目标名称和大于 0、至多 10 亿的金额');
}
export function migrateGoal(state, now = Date.now()) {
  if (!state.goal || state.goal.version === 2) return false;
  validateGoalInput(state.goal);
  if (!['day', 'month'].includes(state.goal.period)) throw Error('原目标记录无效');
  const legacy = structuredClone(state.goal), from = dateKey(new Date(now));
  if (!finite(now) || !isDateKey(from) || from < state.trackingStart) throw Error('目标升级日期无效');
  state.goalPool = { from, createdAt: now, settlements: [], legacyGoal: legacy };
  state.goal = { version: 2, id: uid(), name: legacy.name, amount: legacy.amount, createdAt: now, completedAt: null, notifiedAt: null };
  return true;
}
export function saveGoal(state, input, now = Date.now()) {
  validateGoalInput(input);
  if (!finite(now) || !isDateKey(dateKey(new Date(now)))) throw Error('目标设定时间无效');
  if (state.goal && state.goal.version !== 2) throw Error('请先升级旧目标，再修改');
  const active = state.goal && state.goal.completedAt === null;
  const goal = active ? { ...state.goal, name: input.name.trim(), amount: input.amount } : { version: 2, id: uid(), name: input.name.trim(), amount: input.amount, createdAt: now, completedAt: null, notifiedAt: null };
  const goalPool = state.goalPool ?? { from: dateKey(new Date(now)), createdAt: now, settlements: [] };
  const next = { ...state, goal, goalPool }; validateState(next);
  state.goal = goal; state.goalPool = goalPool; return goal;
}
export function goalStats(state, now = Date.now()) {
  const goal = state.goal;
  if (!goal) return { status: 'none', pool: 0, earned: 0, remaining: 0, progress: 0 };
  if (goal.version !== 2) return { status: 'legacy', pool: 0, earned: 0, remaining: goal.amount, progress: 0 };
  const ledger = netIncomePool(state, state.goalPool.from, now);
  const settled = sum(state.goalPool.settlements.map(entry => entry.amount)), pool = ledger.net - settled;
  const done = goal.completedAt !== null;
  return { ...ledger, pool, earned: pool, settled, remaining: done ? 0 : Math.max(0, goal.amount - pool), progress: done ? 1 : Math.min(1, pool / goal.amount), status: done ? 'done' : pool >= goal.amount ? 'ready' : 'saving' };
}
export function settleGoal(state, now = Date.now()) {
  const goal = state.goal;
  if (!goal || goal.version !== 2 || goal.completedAt !== null) return null;
  const stats = goalStats(state, now); if (stats.pool < goal.amount) return null;
  const entry = { id: uid(), goalId: goal.id, name: goal.name, amount: goal.amount, settledAt: now, poolBefore: stats.pool };
  state.goalPool.settlements.push(entry); goal.completedAt = now;
  return entry;
}
export function dueGoalNotice(state) {
  return state.goal?.version === 2 && state.goal.completedAt !== null && state.goal.notifiedAt === null ? { id: state.goal.id, name: state.goal.name, amount: state.goal.amount } : null;
}
export function markGoalNotified(state, id, now = Date.now()) {
  if (dueGoalNotice(state)?.id !== id || !finite(now)) return false;
  state.goal.notifiedAt = now; return true;
}
export function addExpense(state, expense, now = Date.now()) {
  if (!expense || !isDateKey(expense.date) || !finite(expense.amount) || expense.amount <= 0 || expense.amount > 1e9 || typeof expense.name !== 'string' || !expense.name.trim() || expense.name.length > 40) throw Error('请填写有效日期、名称和大于 0 的金额');
  const today = dateKey(new Date(now));
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
  if (state.payDaysMigration !== undefined) {
    const migration = state.payDaysMigration;
    if (!migration || migration.version !== 1 || !finite(migration.changedAt) || !isDateKey(migration.from) || !migration.previousSettings || migration.previousSettings.payDaysMode !== undefined) throw Error('计薪升级记录无效');
    validateSettings(migration.previousSettings);
  }
  if (state.salaryChanges !== undefined && (!Array.isArray(state.salaryChanges) || state.salaryChanges.length > 10000 || state.salaryChanges.some(c => !c || typeof c.id !== 'string' || !finite(c.changedAt) || !isDateKey(c.effectiveDate) || ![c.fromSalary, c.salary].every(v => finite(v) && v >= 0 && v <= 1e9)))) throw Error('工资调整记录无效');
  if (!['today', 'month', 'goal', 'hidden'].includes(state.display)) throw Error('金额显示模式无效');
  if (state.goal !== null) {
    validateGoalInput(state.goal);
    if (state.goal.version === 2) {
      const g = state.goal, pool = state.goalPool;
      if (typeof g.id !== 'string' || !g.id || !finite(g.createdAt) || (g.completedAt !== null && !finite(g.completedAt)) || (g.notifiedAt !== null && (!finite(g.notifiedAt) || g.completedAt === null))) throw Error('目标状态无效');
      if (!pool || !isDateKey(pool.from) || pool.from < state.trackingStart || !finite(pool.createdAt) || !Array.isArray(pool.settlements) || pool.settlements.length > 10000 || pool.settlements.some(e => !e || typeof e.id !== 'string' || typeof e.goalId !== 'string' || typeof e.name !== 'string' || !e.name.trim() || e.name.length > 40 || !finite(e.amount) || e.amount <= 0 || e.amount > 1e9 || !finite(e.settledAt) || !finite(e.poolBefore) || e.poolBefore < e.amount) || new Set(pool.settlements.map(e => e.goalId)).size !== pool.settlements.length) throw Error('目标积累池记录无效');
      const entry = pool.settlements.find(e => e.goalId === g.id);
      if ((g.completedAt === null && entry) || (g.completedAt !== null && (!entry || entry.amount !== g.amount || entry.settledAt !== g.completedAt))) throw Error('目标结算状态不一致');
      if (pool.legacyGoal) { validateGoalInput(pool.legacyGoal); if (!['day', 'month'].includes(pool.legacyGoal.period)) throw Error('原目标记录无效'); }
    } else if (!['day', 'month'].includes(state.goal.period)) throw Error('赚钱目标无效');
  }
  if (!state.days || typeof state.days !== 'object' || Object.keys(state.days).length > 20000 || !Array.isArray(state.expenses) || !Array.isArray(state.fixed) || state.expenses.length > 100000 || state.fixed.length > 10000) throw Error('本地记录结构无效');
  for (const [key, day] of Object.entries(state.days)) {
    if (!isDateKey(key) || key < state.trackingStart) throw Error('打卡日期无效');
    validateSettings(day.settings);
    for (const list of [day.sessions, day.fish]) {
      if (!Array.isArray(list) || list.length > 10000 || list.some(i => !finite(i.start) || (i.end !== null && (!finite(i.end) || i.end < i.start)) || i.start < at(key, '00:00') || (i.start >= at(dateKey(new Date(localDate(key).getTime() + 36e5 * 36)), '00:00') && !(list === day.sessions && i.resumed === true)))) throw Error('计时记录无效');
    }
    if (day.breaks !== undefined && (!Array.isArray(day.breaks) || day.breaks.length > 10000 || day.breaks.some(r => !r || typeof r.id !== 'string' || typeof r.name !== 'string' || !r.name.trim() || r.name.length > 40 || !finite(r.durationMs) || r.durationMs <= 0 || !finite(r.createdAt)))) throw Error('摸鱼时长记录无效');
    if (day.salaryCorrections !== undefined && (!Array.isArray(day.salaryCorrections) || day.salaryCorrections.length > 10000 || day.salaryCorrections.some(c => !c || typeof c.id !== 'string' || !finite(c.changedAt) || ![c.fromSalary, c.salary].every(v => finite(v) && v >= 0 && v <= 1e9)))) throw Error('当日工资修正记录无效');
    if (day.startCorrections !== undefined && (!Array.isArray(day.startCorrections) || day.startCorrections.length > 10000 || day.startCorrections.some(r => !r || typeof r.id !== 'string' || !Number.isInteger(r.sessionIndex) || r.sessionIndex < 0 || r.sessionIndex >= day.sessions.length || !finite(r.from) || !finite(r.to) || dateKey(new Date(r.from)) < key || dateKey(new Date(r.from)) !== dateKey(new Date(r.to)) || !finite(r.correctedAt)))) throw Error('上班修正记录无效');
    if (day.overtimeDecisions !== undefined) {
      const decisions = day.overtimeDecisions, indexes = Array.isArray(decisions) ? decisions.flatMap(entry => entry?.sessions ?? []) : [];
      if (!Array.isArray(decisions) || decisions.length > 10000 || decisions.some(entry => !entry || typeof entry.id !== 'string' || !finite(entry.clockOutAt) || !['free', 'paid'].includes(entry.kind) || !finite(entry.amount) || entry.amount < 0 || entry.amount > 1e9 || (entry.kind === 'free' ? entry.amount !== 0 : entry.amount <= 0) || !Array.isArray(entry.sessions) || !entry.sessions.length || entry.sessions.some(index => !Number.isInteger(index) || index < 0 || index >= day.sessions.length || day.sessions[index].end !== entry.clockOutAt)) || new Set(indexes).size !== indexes.length) throw Error('加班费记录无效');
    }
    if (day.summary?.recalculatedAt !== undefined && !finite(day.summary.recalculatedAt)) throw Error('总结重算时间无效');
    if (day.summary?.overtimePay !== undefined && (!finite(day.summary.overtimePay) || day.summary.overtimePay < 0)) throw Error('总结加班费无效');
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
  if (state.demo !== undefined && state.demo !== null) throw Error('旧演示档案不能作为个人记录使用，请保留原备份');
  if (state.reminder !== undefined) {
    const r = state.reminder;
    if (!r || typeof r.enabled !== 'boolean' || (r.enabledAt !== null && !finite(r.enabledAt)) || (r.enabled && r.enabledAt === null) || !r.delivered || typeof r.delivered !== 'object' || Object.entries(r.delivered).some(([key, entry]) => !isDateKey(key) || !finite(entry?.scheduledEnd) || !finite(entry?.deliveredAt))) throw Error('下班提醒设置无效');
  }
  if (state.monthlyReviews !== undefined) {
    const reviews = state.monthlyReviews;
    if (!reviews || !reviews.shown || !reviews.snapshots || Object.entries(reviews.shown).some(([key, stamp]) => !/^\d{4}-\d{2}$/.test(key) || !finite(stamp)) || Object.entries(reviews.snapshots).some(([key, report]) => report?.month !== key || !finite(report.asOf) || !['earned', 'expenses', 'fixed', 'costs', 'net', 'worked', 'actual', 'fish', 'overtime'].every(field => finite(report[field])) || (report.hourly !== null && !finite(report.hourly)))) throw Error('月报记录无效');
    if (Object.values(reviews.snapshots).some(report => report.recalculatedAt !== undefined && !finite(report.recalculatedAt))) throw Error('月报重算时间无效');
    if (Object.values(reviews.snapshots).some(report => report.overtimePay !== undefined && (!finite(report.overtimePay) || report.overtimePay < 0))) throw Error('月报加班费无效');
  }
  return state;
}
