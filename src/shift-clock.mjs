import { activeShift, at, calendarPolicy, dateKey, dayStats, isAbsent, isDateKey, isWorkday, localDate, settingsForDay } from './model.mjs';

// Presentation only: do not create records, start shifts or change payroll snapshots.
function plannedShift(state, key) {
  const day = state.days[key], policy = calendarPolicy(state, key);
  if (isAbsent(policy) || day?.sessions.length) return null;
  const settings = day?.settings ?? settingsForDay(state, key);
  if (!isWorkday(key, settings) && !['work', 'overtime'].includes(policy?.kind)) return null;
  const start = at(key, settings.start), end = at(key, settings.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { key, start, end, settings, kind: policy?.kind ?? 'work' };
}
export function nextPlannedShift(state, now = Date.now()) {
  const today = dateKey(new Date(now));
  if (!Number.isFinite(now) || !isDateKey(today)) return null;
  const special = new Set([...Object.keys(state.dayPlans ?? {}), ...Object.keys(state.days ?? {})]);
  if (state.settings.calendarDate) special.add(state.settings.calendarDate);
  let explicit;
  for (const key of [...special].filter(key => isDateKey(key) && key >= today).sort()) {
    explicit = plannedShift(state, key); if (explicit) break;
  }
  const cursor = localDate(today);
  // A repeating attendance cycle is at most 14 days. Each blocked candidate
  // needs an explicit date entry, so this bound covers every finite override.
  const recurring = Array.from({ length: 14 }, (_, i) => {
    const day = localDate(today); day.setDate(day.getDate() + i);
    return isWorkday(dateKey(day), state.settings);
  }).some(Boolean);
  if (!recurring) return explicit ?? null;
  for (let i = 0; i < 14 * (special.size + 2); i++, cursor.setDate(cursor.getDate() + 1)) {
    const key = dateKey(cursor);
    if (!isDateKey(key)) break;
    if (explicit && key >= explicit.key) return explicit;
    if (isWorkday(key, state.settings)) {
      const candidate = plannedShift(state, key);
      if (candidate) return candidate;
    }
  }
  return explicit ?? null;
}
export function shiftClock(state, now = Date.now()) {
  const active = activeShift(state, now);
  if (active) {
    const stats = dayStats(state, active.key, now);
    const overtime = stats.policy?.kind === 'overtime' || now >= at(active.key, stats.settings.end);
    return { mode: overtime ? 'overtime' : 'working', key: active.key, settings: stats.settings,
      milliseconds: overtime ? stats.overtime : Math.max(0, at(active.key, stats.settings.end) - now),
      label: overtime ? '已加班' : '距离下班', miniLabel: overtime ? '已加班' : '距下班' };
  }
  const next = nextPlannedShift(state, now);
  if (!next) return { mode: 'unscheduled', milliseconds: null, label: '暂无上班安排', miniLabel: '待安排' };
  const due = next.start <= now;
  return { ...next, mode: due ? 'due' : 'upcoming', milliseconds: Math.max(0, next.start - now),
    label: due ? '上班时间已到' : '距离上班', miniLabel: due ? '上班时间已到' : '距上班' };
}
