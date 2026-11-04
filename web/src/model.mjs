// All dates are local civil dates; money is CNY, durations are milliseconds.
export const DEFAULT_SETTINGS = Object.freeze({ salary: 0, payDays: 0, payDaysMode: 'auto', scheduleMode: 'double', weekdays: [1, 2, 3, 4, 5], alternateWeekdays: [1, 2, 3, 4, 5, 6], anchorWeek: '2026-11-02', anchorKind: 'double', start: '09:00', end: '18:00', lunch: true, lunchStart: '12:00', lunchEnd: '13:00' });
export const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const localDate = key => new Date(`${key}T00:00:00`);
export const at = (key, time) => new Date(`${key}T${time}:00`).getTime();
export const monthKey = key => key.slice(0, 7);
export const recordingStart = state => [state.trackingStart, ...Object.keys(state.days ?? {}), ...(state.expenses ?? []).filter(e=>e&&e.scope!=='month').map(e=>e.date)].filter(isDateKey).sort()[0];
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
  if((s.payrollMonth!==undefined||s.payrollDays!==undefined)&&(!validMonth(s.payrollMonth)||!Number.isInteger(s.payrollDays)||s.payrollDays<0||s.payrollDays>31))throw Error('月度计薪分摊快照无效');
  validateCalendar(s);
  if ((s.calendarDate !== undefined || s.calendarIsWorkday !== undefined) && (!isDateKey(s.calendarDate) || typeof s.calendarIsWorkday !== 'boolean')) throw Error('单日排班设置无效');
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
  if (s.calendarDate === key) return s.calendarIsWorkday;
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
  const base = { ...settings }; delete base.calendarDate; delete base.calendarIsWorkday;
  return datesInMonth(key).filter(date => isWorkday(date, base)).length;
}
export function payDaysModeForDate(key, settings) {
  if (settings.payDaysMode === undefined) return 'legacy';
  return settings.payDaysMode === 'manual' && settings.payDaysMonth === monthKey(key) ? 'manual' : 'auto';
}
export function effectivePayDays(key, settings) {
  return payDaysModeForDate(key, settings) === 'auto' ? settings.payrollMonth===monthKey(key)?settings.payrollDays:plannedPayDays(key, settings) : settings.payDays;
}
export function payrollDaysForMonth(state,key,settings=state.settings){
  const base={...settings};delete base.calendarDate;delete base.calendarIsWorkday;
  return datesInMonth(key).filter(date=>{const policy=calendarPolicy(state,date);return policy?.kind==='work'?true:policy?.kind==='rest'?false:isWorkday(date,base);}).length;
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
export function salaryEvents(state) {
  const cancelled=new Set((state.salaryCancellations??[]).map(c=>c.changeId)), initial=state.salaryBaseline?.source==='legacy-confirmed'?state.salaryBaseline.legacyChangeId:null;
  return (state.salaryChanges??[]).map((c,index)=>({...c,index})).filter(c=>c.id!==initial&&!cancelled.has(c.id)).sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate)||a.index-b.index);
}
export function salaryKnownForDate(state,key) {
  const beginning=state.salaryBaseline?.effectiveDate??`${monthKey(state.trackingStart)}-01`;
  return key >= [beginning,...salaryEvents(state).map(c=>c.effectiveDate)].sort()[0];
}
export function salaryForDate(state, key) {
  if(!salaryKnownForDate(state,key))return 0;
  let amount = state.salaryBaseline?.salary ?? state.salaryChanges?.[0]?.fromSalary ?? state.settings.salary;
  for (const change of salaryEvents(state)) if (change.effectiveDate <= key) amount = change.salary;
  return amount;
}
// A legacy 0 -> first salary ledger entry cannot prove whether zero was intentional.
// Offer it only as an editable reference; never rewrite saved days or the ledger.
export function initialSalaryReference(state) {
  if (state.salaryBaseline) return { salary: state.salaryBaseline.salary, source: 'initial-setup' };
  const first = state.salaryChanges?.[0];
  if (first?.fromSalary === 0 && first.salary > 0 && dateKey(new Date(first.changedAt)) === state.trackingStart) return { salary: first.salary, source: 'legacy-reference' };
  return null;
}
export function backfillSalaryForDate(state, key) {
  const reference = initialSalaryReference(state);
  return key >= `${monthKey(state.trackingStart)}-01` && key < state.trackingStart && !state.days[key] && reference?.source === 'legacy-reference' ? reference.salary : salaryForDate(state, key);
}
export function settingsForDay(state, key) {
  const plan = state.dayPlans?.[key], base = plan?.settings ?? state.settings;
  const copy = settingsForDate(key, { ...base, salary: salaryForDate(state, key) });
  if (plan) { copy.calendarDate = key; copy.calendarIsWorkday = !isAbsent(plan); }
  if(payDaysModeForDate(key,copy)==='auto'){
    const days=payrollDaysForMonth(state,key,copy);if(days!==plannedPayDays(key,copy)){copy.payrollMonth=monthKey(key);copy.payrollDays=days;}else{delete copy.payrollMonth;delete copy.payrollDays;}
  }
  return copy;
}
export function salaryIsManual(day) {
  return day.salaryMode==='manual'||day.calendar?.payMode==='custom'||day.salaryMode===undefined&&day.sessions.some(s=>s.backfilled);
}
export function repriceAutomaticMonth(state,key,now=Date.now()){
  const changes=[],month=monthKey(key);
  for(const [date,day]of Object.entries(state.days)){
    if(monthKey(date)!==month||salaryIsManual(day)||payDaysModeForDate(date,day.settings)!=='auto')continue;
    const nextDays=payrollDaysForMonth(state,date,day.settings),beforeDays=effectivePayDays(date,day.settings);if(nextDays===beforeDays)continue;
    const before=dayStats(state,date,now);day.settings.payrollMonth=month;day.settings.payrollDays=nextDays;
    if(day.calendar){day.calendar.settings.payrollMonth=month;day.calendar.settings.payrollDays=nextDays;}
    if(state.dayPlans?.[date]){state.dayPlans[date].settings.payrollMonth=month;state.dayPlans[date].settings.payrollDays=nextDays;}
    (day.payrollCorrections??=[]).push({id:uid(),changedAt:now,sourceDate:key,fromDays:beforeDays,days:nextDays});
    const after=dayStats(state,date,now);changes.push({date,fromDays:beforeDays,days:nextDays,earnedBefore:before.earned,earnedAfter:after.earned,netBefore:before.net,netAfter:after.net});
    if(day.summary){const stats=dayStats(state,date,day.summary.clockOutAt);for(const field of ['earned','overtimePay','fish','overtime','actual','hourly'])day.summary[field]=stats[field];day.summary.net=stats.earned-day.summary.expenses-day.summary.fixed;day.summary.recalculatedAt=now;}
  }
  if(changes.length){state.version=Math.max(state.version,3);state.payrollOverlayVersion=1;const saved=state.monthlyReviews?.snapshots?.[month];if(saved)state.monthlyReviews.snapshots[month]={...monthlyReport(state,month,saved.asOf),recalculatedAt:now};}
  if(payDaysModeForDate(key,state.settings)==='auto'&&payrollDaysForMonth(state,key)!==plannedPayDays(key,state.settings)){state.version=Math.max(state.version,3);state.payrollOverlayVersion=1;}
  return changes;
}
function revalueSalaryDays(next,from,now,changeId) {
  const affectedDates=[],protectedDates=[];
  for(const [key,day]of Object.entries(next.days)) {
    if(key<from)continue;
    const salary=salaryForDate(next,key);
    if(day.settings.salary===salary)continue;
    if(salaryIsManual(day)){protectedDates.push(key);continue;}
    const previous=day.settings.salary;day.settings.salary=salary;
    if(day.calendar)day.calendar.settings.salary=salary;
    if(next.dayPlans?.[key])next.dayPlans[key].settings.salary=salary;
    (day.salaryCorrections??=[]).push({id:uid(),changedAt:now,fromSalary:previous,salary,source:'dated-adjustment',changeId});affectedDates.push(key);
    if(day.summary){const stats=dayStats(next,key,day.summary.clockOutAt);for(const field of ['earned','overtimePay','fish','overtime','actual','hourly'])day.summary[field]=stats[field];day.summary.net=stats.earned-day.summary.expenses-day.summary.fixed;day.summary.recalculatedAt=now;}
  }
  for(const month of new Set(affectedDates.map(monthKey))){const saved=next.monthlyReviews?.snapshots?.[month];if(saved)next.monthlyReviews.snapshots[month]={...monthlyReport(next,month,saved.asOf),recalculatedAt:now};}
  next.settings.salary=salaryForDate(next,dateKey(new Date(now)));
  return {affectedDates:affectedDates.sort(),protectedDates:protectedDates.sort()};
}
export function saveSettings(state, input, salaryFrom = 'today', now = Date.now(), options={}) {
  if (!finite(now) || !(['today', 'tomorrow'].includes(salaryFrom)||isDateKey(salaryFrom))) throw Error('请选择有效的工资生效日期');
  validateSettings(input);
  const key = dateKey(new Date(now));
  if (!isDateKey(key) || key < state.trackingStart) throw Error('工资生效日期无效，请检查本机时间');
  const next = structuredClone(state), tomorrow = localDate(key); tomorrow.setDate(tomorrow.getDate() + 1);
  const effectiveDate = salaryFrom === 'today' ? key : salaryFrom==='tomorrow'?dateKey(tomorrow):salaryFrom;
  const initialized = state.onboarded !== true && !state.salaryBaseline && !state.salaryChanges?.length && Object.keys(state.days).length === 0;
  let changed=!salaryKnownForDate(state,effectiveDate)||input.salary!==salaryForDate(state,effectiveDate);
  next.settings = structuredClone(input);
  let impact={affectedDates:[],protectedDates:[]},changeId;
  if (initialized) {
    next.salaryBaseline = { salary: input.salary, effectiveDate:`${monthKey(key)}-01`, createdAt: now, source: 'initial-setup' };next.version=Math.max(next.version,3);
  } else if (changed) {
    const legacy=initialSalaryReference(state);
    if(legacy?.source==='legacy-reference'){
      if(!['initial','actual-change'].includes(options.legacyChoice))throw Error('请确认旧档案首笔工资是首次填写，还是实际从零调薪');
      next.salaryBaseline={salary:options.legacyChoice==='initial'?legacy.salary:0,effectiveDate:`${monthKey(state.trackingStart)}-01`,createdAt:now,source:options.legacyChoice==='initial'?'legacy-confirmed':'legacy-real-change',legacyChangeId:state.salaryChanges[0].id};
    }
    const previousAtDate=next.salaryBaseline?salaryForDate(next,effectiveDate):salaryForDate(state,effectiveDate);
    changeId=uid();(next.salaryChanges??=[]).push({id:changeId,changedAt:now,effectiveDate,fromSalary:previousAtDate,salary:input.salary,source:'dated-adjustment'});next.version=Math.max(next.version,3);next.salaryTimelineVersion=1;
    impact=revalueSalaryDays(next,effectiveDate,now,changeId);
  }
  next.settings.salary=salaryForDate(next,key);
  const converted = convertLegacyFixed(next, key);
  validateState(next);
  Object.assign(state, next);
  return { changed, initialized, effectiveDate: initialized ? `${monthKey(key)}-01` : effectiveDate, converted, recalculated:impact.affectedDates.length>0,changeId,...impact,nextChange:salaryEvents(next).find(c=>c.effectiveDate>effectiveDate)??null };
}
export function undoSalaryChange(state,changeId,now=Date.now()){
  const change=state.salaryChanges?.find(c=>c.id===changeId&&c.source==='dated-adjustment');
  if(!finite(now)||!change||state.salaryCancellations?.some(c=>c.changeId===changeId))throw Error('这笔工资调整不可撤销或已经撤销');
  const next=structuredClone(state);(next.salaryCancellations??=[]).push({id:uid(),changeId,changedAt:now});next.version=Math.max(next.version,3);next.salaryTimelineVersion=1;const impact=revalueSalaryDays(next,change.effectiveDate,now,changeId);validateState(next);Object.assign(state,next);return {...impact,effectiveDate:change.effectiveDate};
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
  if (!state.days[key] && create) {
    state.days[key] = { settings: settingsForDay(state, key), sessions: [], fish: [], breaks: [] };
    if (state.dayPlans?.[key]) state.days[key].calendar = structuredClone(state.dayPlans[key]);
  }
  return state.days[key];
}
export const isAbsent = policy => ['leave', 'swap','rest'].includes(policy?.kind);
export const calendarPolicy = (state, key) => state.days[key]?.calendar ?? state.dayPlans?.[key];
export function migrateOvertimeExclusions(state,now=Date.now()){
  const dates=new Set();for(const [key,policy]of [...Object.entries(state.dayPlans??{}),...Object.entries(state.days).filter(([,d])=>d.calendar).map(([k,d])=>[k,d.calendar])]){
    if(policy.includeOvertimePay!==false||policy.excludedOvertimePayIds!==undefined)continue;
    policy.excludedOvertimePayIds=(state.days[key]?.overtimeDecisions??[]).filter(f=>f.clockOutAt<=policy.updatedAt).map(f=>f.id);dates.add(key);
  }
  if(!dates.size)return false;state.version=Math.max(state.version,3);state.overtimePolicyMigration={changedAt:now,dates:[...dates].sort()};return true;
}
export const earningRate = (key, day) => day?.calendar && day.calendar.payMode !== 'standard' ? 0 : ratePerMs(key, day.settings);
export function paidIntervals(day, key, now) {
  if (!day || isAbsent(day.calendar) || !isWorkday(key, day.settings)) return [];
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
  const day = getDay(state, key), s = day?.settings ?? settingsForDay(state, key), policy = calendarPolicy(state, key), absent = isAbsent(policy);
  const sessions = absent ? [] : day?.sessions ?? [];
  const paid = paidIntervals(day, key, now);
  const elapsed = sum(paid.map(([a, b]) => b - a));
  const overtimeRanges = sessions.map(session => [Math.max(session.start, at(key, s.end)), Math.min(session.end ?? now, now)]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  const mergedOvertime = overtimeRanges.reduce((out, next) => { const prev = out.at(-1); if (prev && next[0] <= prev[1]) prev[1] = Math.max(prev[1], next[1]); else out.push([...next]); return out; }, []);
  let overtime = sum(mergedOvertime.map(([a, b]) => b - a)), worked = elapsed + overtime;
  if (policy?.kind === 'overtime' && !absent) {
    const ranges = sessions.map(v => [Math.max(v.start, at(key, s.start)), Math.min(v.end ?? now, now)]).filter(([a,b]) => b > a).sort((a,b) => a[0]-b[0]);
    const merged = ranges.reduce((out, v) => { const prev=out.at(-1); if(prev && v[0]<=prev[1]) prev[1]=Math.max(prev[1],v[1]); else out.push([...v]); return out; }, []);
    worked = sum(merged.map(v => v[1]-v[0]-(s.lunch ? overlap(v,[at(key,s.lunchStart),at(key,s.lunchEnd)]) : 0))); overtime = worked;
  }
  const fishRanges = (absent ? [] : day?.fish ?? []).map(f => [f.start, Math.min(f.end ?? now, now)]).sort((a, b) => a[0] - b[0]);
  const merged = fishRanges.reduce((a, f) => { const prev = a.at(-1); if (prev && f[0] <= prev[1]) prev[1] = Math.max(prev[1], f[1]); else a.push([...f]); return a; }, []);
  const legacyFish = Math.min(elapsed, sum(paid.flatMap(p => merged.map(f => overlap(p, f)))));
  const fish = absent ? 0 : legacyFish + sum((day?.breaks ?? []).map(record => record.durationMs));
  const overtimePay = sum((day?.overtimeDecisions ?? []).filter(entry => entry.clockOutAt <= now && (policy?.includeOvertimePay!==false || (policy.excludedOvertimePayIds ? !policy.excludedOvertimePayIds.includes(entry.id) : entry.clockOutAt>policy.updatedAt))).map(entry => entry.amount));
  const payDays = effectivePayDays(key, s), standardDay = payDays > 0 ? s.salary / payDays : 0;
  const eligible = absent ? now >= at(key, s.end) : worked > 0;
  const calendarPay = policy && eligible && (absent && policy.payMode === 'standard' || policy.payMode === 'custom') ? policy.payMode === 'custom' ? policy.amount : standardDay : 0;
  const baseEarned = (absent || policy && policy.payMode !== 'standard' ? 0 : elapsed * ratePerMs(key, s)) + calendarPay, earned = baseEarned + overtimePay, actual = Math.max(0, worked - fish);
  const expenses = sum(state.expenses.map(e => expenseForDate(e, key)));
  const fixed = fixedForDate(state, key);
  return { calendarPay, policy, earned, baseEarned, overtimePay, elapsed, worked, overtime, actual, fish, legacyFish, expenses, fixed, net: earned - expenses - fixed, hourly: actual > 0 ? earned / actual * 3600000 : null, secondly: actual > 0 ? earned / actual * 1000 : null, planned: scheduledMs(key, s), daily: payDays > 0 ? s.salary / payDays : 0, payDays, settings: s };
}
export function activeSession(state, key, now) {
  const day = state.days[key];
  return isAbsent(day?.calendar) ? undefined : day?.sessions.find(s => s.end === null && s.start <= now);
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
  if (!isWorkday(key, s) || effectivePayDays(key, s) <= 0 && !['custom', 'unpaid'].includes(state.dayPlans?.[key]?.payMode)) throw Error('今天不在设定的工作日中，可先调整排班');
  const planned = at(key, s.start);
  let start = Math.min(planned, now);
  // Backfill only a new current-day shift, never overwrite or double-count older work.
  for (const day of Object.values(state.days).filter(d => !isAbsent(d.calendar))) for (const session of day.sessions) {
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
  if (isAbsent(day?.calendar)) throw Error('这一天已记为请假或调休，请先在日历恢复上班');
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
  if (isAbsent(day?.calendar)) throw Error('该日已记为请假或调休');
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
  day.summary = { clockOutAt: now, date: key, status: day.calendar?.kind === 'overtime' ? 'late' : deltaMinutes < 0 ? 'early' : deltaMinutes > 0 ? 'late' : 'ontime', sessionCount: day.sessions.length, earned: stats.earned, overtimePay: stats.overtimePay, expenses: stats.expenses, fixed: stats.fixed, net: stats.net, fish: stats.fish, overtime: stats.overtime, actual: stats.actual, hourly: stats.hourly, scheduledEnd: day.settings.end };
  return day.summary;
}
export function correctStartTime(state, record, now = Date.now()) {
  const key = record?.date, index = record?.sessionIndex, start = record?.start;
  if (!finite(now) || !isDateKey(key) || key < recordingStart(state) || key > dateKey(new Date(now))) throw Error('请选择已记录的上班日期');
  const day = state.days[key];
  if (isAbsent(day?.calendar)) throw Error('这一天已记为请假或调休，请先在日历恢复上班');
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
  for (const [otherKey, otherDay] of Object.entries(state.days).filter(([, d]) => !isAbsent(d.calendar))) for (const [otherIndex, other] of otherDay.sessions.entries()) {
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
  if (!record || !isDateKey(record.date) || record.date < recordingStart(state) || record.date > today || !Number.isInteger(record.minutes) || record.minutes < 1 || record.minutes > 1440 || typeof record.name !== 'string' || !record.name.trim() || record.name.length > 40) throw Error('请填写 1 到 1440 之间的整数分钟、有效日期和事项名称');
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
  const key = activeShift(state, now)?.key ?? dateKey(new Date(now)), settings = state.days[key]?.settings ?? settingsForDay(state, key);
  const end = at(key, settings.end);
  if (!isWorkday(key, settings) || now < end || reminder.enabledAt > end || reminder.delivered[key]) return null;
  return { date: key, scheduledEnd: end };
}
export function markReminderDelivered(state, reminder, now) {
  if (!state.reminder?.enabled || state.reminder.delivered[reminder.date]) return false;
  state.reminder.delivered[reminder.date] = { scheduledEnd: reminder.scheduledEnd, deliveredAt: now };
  return true;
}
export function configureClockInReminder(state, enabled, now) {
  if (typeof enabled !== 'boolean' || !finite(now)) throw Error('上班打卡提醒设置无效');
  if (!state.clockInReminder && !enabled) return;
  const reminder = state.clockInReminder ??= { enabled: false, enabledAt: null, delivered: {} };
  if (enabled && !reminder.enabled) reminder.enabledAt = now;
  reminder.enabled = enabled;
}
export function clockInReminderRelevant(state, reminder, now) {
  const r=state.clockInReminder, key=dateKey(new Date(now));
  if (!r?.enabled || !finite(r.enabledAt) || !finite(now) || key < state.trackingStart || activeShift(state,now)) return false;
  const day=state.days[key],policy=calendarPolicy(state,key),settings=day?.settings??settingsForDay(state,key);
  if (day?.sessions.length || isAbsent(policy) || !isWorkday(key,settings) && !['work','overtime'].includes(policy?.kind)) return false;
  const start=at(key,settings.start),end=at(key,settings.end);
  return reminder.date===key && reminder.scheduledStart===start && r.enabledAt<=start && now>=start && now<end;
}
export function dueClockInReminder(state, now) {
  const key=dateKey(new Date(now)),settings=state.days[key]?.settings??settingsForDay(state,key),reminder={date:key,scheduledStart:at(key,settings.start)};
  return state.clockInReminder?.delivered[key] || !clockInReminderRelevant(state,reminder,now) ? null : reminder;
}
export function markClockInReminderDelivered(state, reminder, now) {
  if (!clockInReminderRelevant(state,reminder,now) || state.clockInReminder.delivered[reminder.date]) return false;
  state.clockInReminder.delivered[reminder.date]={scheduledStart:reminder.scheduledStart,deliveredAt:now};
  return true;
}
export function attendanceStatus(state, key, now) {
  const day = state.days[key], policy = calendarPolicy(state, key);
  if (isAbsent(policy) && key <= dateKey(new Date(now))) return { status: policy.kind, label: {leave:'请假',swap:'调休',rest:'休息'}[policy.kind] };
  if (!day?.sessions.length) return null;
  if (policy?.kind === 'overtime' && dayStats(state,key,now).worked > 0) return { status: 'late', label: activeSession(state,key,now) ? '加班中' : '加班' };
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
  const override=state.days[key]?.fixedBurden;if(override)return override.enabled?override.amount:0;
  if (key < state.trackingStart) return 0;
  return sum(state.fixed.map(item => fixedItemForDate(item, key, item.settings ?? state.settings)));
}
export function monthStats(state, key, now = Date.now()) {
  const today = dateKey(new Date(now));
  const dates = datesInMonth(key).filter(d => d <= today);
  return periodStats(state,dates,now);
}
export function periodStats(state,dates,now=Date.now()){
  const days = dates.map(d => dayStats(state, d, now));
  const total = field => sum(days.map(d => d[field]));
  const actual = total('actual'), earned = total('earned'), net = total('net');
  const workedDays = days.filter(day => day.worked > 0).length;
  return { earned, actual, worked: total('worked'), overtime: total('overtime'), overtimePay: total('overtimePay'), fish: total('fish'), elapsed: total('elapsed'), hourly: actual > 0 ? net / actual * 3600000 : null, secondly: actual > 0 ? net / actual * 1000 : null, expenses: total('expenses'), fixed: total('fixed'), net, averageDaily: workedDays > 0 ? net / workedDays : null, workedDays, recorded: dates.filter(d => state.days[d]?.sessions.length && !isAbsent(calendarPolicy(state,d))).length, dates, days };
}
export function overtimeComparison(stats){
  const normal=stats.days.map(day=>({worked:Math.max(0,day.worked-day.overtime),actual:day.worked>0?day.actual*Math.max(0,day.worked-day.overtime)/day.worked:0}));
  const actual=sum(normal.map(d=>d.actual)),workedDays=normal.filter(d=>d.worked>0).length,net=stats.net-stats.overtimePay;
  return {overtime:stats.overtime,overtimePay:stats.overtimePay,baseline:{net,actual,workedDays,averageDaily:workedDays>0?net/workedDays:null,hourly:actual>0?net/actual*3600000:null,secondly:actual>0?net/actual*1000:null},actual:{net:stats.net,actual:stats.actual,workedDays:stats.workedDays,averageDaily:stats.averageDaily,hourly:stats.hourly,secondly:stats.secondly},fishAllocation:'proportional-to-worked-time'};
}
function attendanceCounts(state,stats,now){
  const result={ontimeDays:0,lateDays:0,earlyDays:0,activeDays:0,leaveDays:0,swapDays:0};
  for(const key of stats.dates){const status=attendanceStatus(state,key,now);if(!status)continue;if(activeSession(state,key,now))result.activeDays++;else{const field={ontime:'ontimeDays',late:'lateDays',early:'earlyDays',leave:'leaveDays',swap:'swapDays'}[status.status];if(field)result[field]++;}}
  return result;
}
export function weeklyReport(state,key,now=Date.now()){
  if(!isDateKey(key)||key>dateKey(new Date(now)))throw Error('请选择已发生的周');
  const monday=localDate(key);monday.setDate(monday.getDate()-(monday.getDay()+6)%7);const dates=[];
  for(let i=0;i<7;i++){const d=new Date(monday);d.setDate(d.getDate()+i);const date=dateKey(d);if(date<=dateKey(new Date(now)))dates.push(date);}
  const stats=periodStats(state,dates,now),last=new Date(monday);last.setDate(last.getDate()+6);
  return {period:'week',from:dateKey(monday),through:dateKey(last),asOf:now,...Object.fromEntries(['earned','overtimePay','expenses','fixed','net','worked','actual','fish','overtime','hourly','secondly','averageDaily','workedDays','recorded'].map(k=>[k,stats[k]])),costs:stats.expenses+stats.fixed,...attendanceCounts(state,stats,now),comparison:overtimeComparison(stats),provisional:dateKey(last)>=dateKey(new Date(now))};
}
export function monthlyReport(state, month, now) {
  if (!/^\d{4}-\d{2}$/.test(month) || !isDateKey(`${month}-01`)) throw Error('月份无效');
  const stats = monthStats(state, `${month}-01`, now);
  let ontimeDays = 0, lateDays = 0, earlyDays = 0, activeDays = 0, leaveDays = 0, swapDays = 0;
  for (const key of stats.dates) {
    const status = attendanceStatus(state, key, now); if (!status) continue;
    if (activeSession(state, key, now)) activeDays++;
    else if (status.status === 'ontime') ontimeDays++;
    else if (status.status === 'late') lateDays++;
    else if (status.status === 'early') earlyDays++;
    else if (status.status === 'leave') leaveDays++;
    else if (status.status === 'swap') swapDays++;
  }
  return { month,period:'month', asOf: now, earned: stats.earned, overtimePay: stats.overtimePay, expenses: stats.expenses, fixed: stats.fixed, costs: stats.expenses + stats.fixed, net: stats.net, worked: stats.worked, actual: stats.actual, fish: stats.fish, overtime: stats.overtime, hourly: stats.hourly, secondly: stats.secondly, averageDaily: stats.averageDaily, workedDays: stats.workedDays, recorded: stats.recorded, leaveDays, swapDays, ontimeDays, lateDays, earlyDays, activeDays, comparison:overtimeComparison(stats),provisional: activeDays > 0 || month >= dateKey(new Date(now)).slice(0, 7) };
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
    if (expense.category !== '自定义' || !isDateKey(`${month}-01`) || month < recordingStart(state).slice(0, 7) || month > today.slice(0, 7)) throw Error('请选择开始记录月至今的月份');
    const allocationDates = datesInMonth(`${month}-01`).filter(key => isWorkday(key, state.settings));
    if (!allocationDates.length) throw Error('这个月考勤工作日为 0，无法分摊；请选当日花销或调整考勤');
    state.expenses.push({ ...expense, date: `${month}-01`, name: expense.name.trim(), id: uid(), allocationDates, settings: structuredClone(state.settings) }); return;
  }
  if (expense.date > today || expense.date < recordingStart(state)) throw Error('花销日期须在开始记录日至今天之间');
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
  if (!state || ![1,2,3,4].includes(state.version) || !isDateKey(state.trackingStart)) throw Error('本地记录版本或日期无效');
  validateSettings(state.settings);
  if (state.salaryBaseline !== undefined && (!state.salaryBaseline || !finite(state.salaryBaseline.salary) || state.salaryBaseline.salary < 0 || state.salaryBaseline.salary > 1e9 || !finite(state.salaryBaseline.createdAt) || !isDateKey(state.salaryBaseline.effectiveDate) || !['initial-setup','legacy-confirmed','legacy-real-change'].includes(state.salaryBaseline.source) || state.salaryBaseline.source!=='initial-setup'&&!state.salaryChanges?.some(c=>c.id===state.salaryBaseline.legacyChangeId))) throw Error('首次工资参考无效');
  if(state.version<4&&(Object.values(state.days??{}).some(d=>d.fixedBurden!==undefined)||(state.calendarAudit??[]).some(e=>e.before?.expenses!==undefined||e.after?.expenses!==undefined)))throw Error('当日费用修改需要新版记录格式，请使用新版应用');
  if(state.payrollOverlayVersion!==undefined&&state.payrollOverlayVersion!==1)throw Error('月度分摊版本无效');
  if(state.overtimePolicyMigration!==undefined&&(!finite(state.overtimePolicyMigration?.changedAt)||!Array.isArray(state.overtimePolicyMigration?.dates)||state.overtimePolicyMigration.dates.some(d=>!isDateKey(d))))throw Error('加班费迁移记录无效');
  if(state.salaryTimelineVersion!==undefined&&state.salaryTimelineVersion!==1)throw Error('工资时间表版本无效');
  if(state.version<3&&(state.salaryBaseline!==undefined||state.salaryTimelineVersion!==undefined||state.salaryCancellations!==undefined||state.payrollOverlayVersion!==undefined||state.overtimePolicyMigration!==undefined||state.settings?.payrollMonth!==undefined||Object.values(state.dayPlans??{}).some(p=>p.settings?.payrollMonth!==undefined||p.excludedOvertimePayIds!==undefined)||Object.values(state.days??{}).some(d=>d.salaryMode!==undefined||d.payrollCorrections!==undefined||d.settings?.payrollMonth!==undefined||d.calendar?.excludedOvertimePayIds!==undefined)))throw Error('工资日期规则需要新版格式，请使用新版应用');
  if(state.salaryCancellations!==undefined&&(!Array.isArray(state.salaryCancellations)||state.salaryCancellations.length>10000||new Set(state.salaryCancellations.map(c=>c.changeId)).size!==state.salaryCancellations.length||state.salaryCancellations.some(c=>!c||typeof c.id!=='string'||!finite(c.changedAt)||!state.salaryChanges?.some(change=>change.id===c.changeId&&change.source==='dated-adjustment'))))throw Error('工资撤销记录无效');
  if (state.payDaysMigration !== undefined) {
    const migration = state.payDaysMigration;
    if (!migration || migration.version !== 1 || !finite(migration.changedAt) || !isDateKey(migration.from) || !migration.previousSettings || migration.previousSettings.payDaysMode !== undefined) throw Error('计薪升级记录无效');
    validateSettings(migration.previousSettings);
  }
  if (state.salaryChanges !== undefined && (!Array.isArray(state.salaryChanges) || state.salaryChanges.length > 10000 || state.salaryChanges.some(c => !c || typeof c.id !== 'string' || !finite(c.changedAt) || !isDateKey(c.effectiveDate) || ![c.fromSalary, c.salary].every(v => finite(v) && v >= 0 && v <= 1e9)))) throw Error('工资调整记录无效');
  if (state.version === 1 && (state.dayPlans !== undefined || state.calendarAudit !== undefined || Object.values(state.days ?? {}).some(d => d.calendar !== undefined))) throw Error('单日日历记录需要新版格式，请使用新版应用');
  if (state.settings.calendarDate !== undefined) throw Error('基础考勤不能包含单日计划');
  if (state.dayPlans !== undefined && (!state.dayPlans || Array.isArray(state.dayPlans) || typeof state.dayPlans !== 'object' || Object.keys(state.dayPlans).length > 20000)) throw Error('单日计划结构无效');
  for (const [key, plan] of Object.entries(state.dayPlans ?? {})) { if (!isDateKey(key) || key < state.trackingStart && !state.days?.[key]?.calendar) throw Error('单日计划日期无效'); validateDayPolicy(plan); }
  if (state.calendarAudit !== undefined && (!Array.isArray(state.calendarAudit) || state.calendarAudit.length > 2000 || state.calendarAudit.some(e => !e || typeof e.id !== 'string' || !isDateKey(e.date) || !finite(e.changedAt) || !['edit','undo'].includes(e.action) || (e.action === 'undo' && typeof e.undoOf !== 'string') || !e.before || !e.after || typeof e.before !== 'object' || typeof e.after !== 'object'))) throw Error('日历修改日志无效');
  for(const entry of state.calendarAudit??[])for(const side of ['before','after'])if(entry[side]?.expenses!==undefined){const rows=entry[side].expenses;if(!Array.isArray(rows)||rows.length>1000||rows.some(e=>!e||e.date!==entry.date||e.scope==='month'||typeof e.id!=='string'||typeof e.name!=='string'||!e.name.trim()||e.name.length>40||!finite(e.amount)||e.amount<=0||e.amount>1e9))throw Error('当日花销修改快照无效');}
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
  const earliestRecord = recordingStart(state);
  for (const [key, day] of Object.entries(state.days)) {
    if(day.fixedBurden!==undefined){const f=day.fixedBurden;if(!f||typeof f.enabled!=='boolean'||!finite(f.changedAt)||f.source!==(f.enabled?'snapshot':'excluded')||!Array.isArray(f.items)||f.items.length>1000||!finite(f.amount)||f.amount<0||f.amount>1e12||f.items.some(i=>!i||typeof i.id!=='string'||typeof i.name!=='string'||!i.name.trim()||i.name.length>40||!finite(i.amount)||i.amount<0||i.amount>1e9)||Math.abs(f.amount-f.items.reduce((v,i)=>v+i.amount,0))>1e-6||!f.enabled&&(f.amount!==0||f.items.length))throw Error('当日固定负担快照无效');}
    if(day.salaryMode!==undefined&&!['schedule','manual'].includes(day.salaryMode))throw Error('当日工资来源无效');
    if (!isDateKey(key) || key < state.trackingStart && (state.version < 2 || !day.calendar || !state.calendarAudit?.some(e=>e.date===key))) throw Error('打卡日期无效');
    validateSettings(day.settings);
    if (day.calendar !== undefined) validateDayPolicy(day.calendar);
    for (const list of [day.sessions, day.fish]) {
      if (!Array.isArray(list) || list.length > 10000 || list.some(i => !finite(i.start) || (i.end !== null && (!finite(i.end) || i.end < i.start)) || i.start < at(key, '00:00') || (i.start >= at(dateKey(new Date(localDate(key).getTime() + 36e5 * 36)), '00:00') && !(list === day.sessions && i.resumed === true)))) throw Error('计时记录无效');
    }
    if (day.breaks !== undefined && (!Array.isArray(day.breaks) || day.breaks.length > 10000 || day.breaks.some(r => !r || typeof r.id !== 'string' || typeof r.name !== 'string' || !r.name.trim() || r.name.length > 40 || !finite(r.durationMs) || r.durationMs <= 0 || !finite(r.createdAt)))) throw Error('摸鱼时长记录无效');
    if(day.payrollCorrections!==undefined&&(!Array.isArray(day.payrollCorrections)||day.payrollCorrections.length>10000||day.payrollCorrections.some(c=>!c||typeof c.id!=='string'||!finite(c.changedAt)||!isDateKey(c.sourceDate)||![c.fromDays,c.days].every(v=>finite(v)&&v>=0&&v<=31))))throw Error('月度分摊修正记录无效');
    if (day.salaryCorrections !== undefined && (!Array.isArray(day.salaryCorrections) || day.salaryCorrections.length > 10000 || day.salaryCorrections.some(c => !c || typeof c.id !== 'string' || !finite(c.changedAt) || ![c.fromSalary, c.salary].every(v => finite(v) && v >= 0 && v <= 1e9)))) throw Error('当日工资修正记录无效');
    if (day.startCorrections !== undefined && (!Array.isArray(day.startCorrections) || day.startCorrections.length > 10000 || day.startCorrections.some(r => !r || typeof r.id !== 'string' || !Number.isInteger(r.sessionIndex) || r.sessionIndex < 0 || r.sessionIndex >= day.sessions.length || !finite(r.from) || !finite(r.to) || dateKey(new Date(r.from)) < key || dateKey(new Date(r.from)) !== dateKey(new Date(r.to)) || !finite(r.correctedAt)))) throw Error('上班修正记录无效');
    if (day.overtimeDecisions !== undefined) {
      const decisions = day.overtimeDecisions, indexes = Array.isArray(decisions) ? decisions.flatMap(entry => entry?.sessions ?? []) : [];
      if (!Array.isArray(decisions) || decisions.length > 10000 || decisions.some(entry => !entry || typeof entry.id !== 'string' || !finite(entry.clockOutAt) || !['free', 'paid'].includes(entry.kind) || !finite(entry.amount) || entry.amount < 0 || entry.amount > 1e9 || (entry.kind === 'free' ? entry.amount !== 0 : entry.amount <= 0) || !Array.isArray(entry.sessions) || !entry.sessions.length || entry.sessions.some(index => !Number.isInteger(index) || index < 0 || index >= day.sessions.length || day.sessions[index].end === null)) || decisions.some(entry => entry.clockOutAt !== Math.max(...entry.sessions.map(index => day.sessions[index]?.end))) || new Set(indexes).size !== indexes.length) throw Error('加班费记录无效');
    }
    if (day.summary?.recalculatedAt !== undefined && !finite(day.summary.recalculatedAt)) throw Error('总结重算时间无效');
    if (day.summary?.overtimePay !== undefined && (!finite(day.summary.overtimePay) || day.summary.overtimePay < 0)) throw Error('总结加班费无效');
    if (day.summary && (!finite(day.summary.clockOutAt) || day.summary.date !== key || !['early', 'ontime', 'late'].includes(day.summary.status) || !Number.isInteger(day.summary.sessionCount) || !['earned', 'expenses', 'fixed', 'net', 'fish', 'actual'].every(field => finite(day.summary[field])) || (day.summary.hourly !== null && !finite(day.summary.hourly)) || !validTime(day.summary.scheduledEnd))) throw Error('下班总结无效');
  }
  for (const e of state.expenses) {
    if (!e || typeof e.id !== 'string' || !isDateKey(e.date) || (e.scope !== 'month' && e.date < earliestRecord) || typeof e.name !== 'string' || !e.name.trim() || e.name.length > 40 || !finite(e.amount) || e.amount <= 0 || e.amount > 1e9) throw Error('花销记录无效');
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
  if (state.clockInReminder !== undefined) {
    const r=state.clockInReminder;
    if(!r||typeof r.enabled!=='boolean'||r.enabledAt!==null&&!finite(r.enabledAt)||r.enabled&&r.enabledAt===null||!r.delivered||typeof r.delivered!=='object'||Array.isArray(r.delivered)||Object.keys(r.delivered).length>20000||Object.entries(r.delivered).some(([key,entry])=>!isDateKey(key)||!finite(entry?.scheduledStart)||!finite(entry?.deliveredAt)))throw Error('上班打卡提醒设置无效');
  }
  if (state.monthlyReviews !== undefined) {
    const reviews = state.monthlyReviews;
    if (!reviews || !reviews.shown || !reviews.snapshots || Object.entries(reviews.shown).some(([key, stamp]) => !/^\d{4}-\d{2}$/.test(key) || !finite(stamp)) || Object.entries(reviews.snapshots).some(([key, report]) => report?.month !== key || !finite(report.asOf) || !['earned', 'expenses', 'fixed', 'costs', 'net', 'worked', 'actual', 'fish', 'overtime'].every(field => finite(report[field])) || (report.hourly !== null && !finite(report.hourly)))) throw Error('月报记录无效');
    if(Object.values(reviews.snapshots).some(r=>r.comparison!==undefined&&(!r.comparison||!['baseline','actual'].every(k=>r.comparison[k]&&['averageDaily','hourly','secondly'].every(f=>r.comparison[k][f]===null||finite(r.comparison[k][f]))&&finite(r.comparison[k].net)&&finite(r.comparison[k].actual)&&Number.isInteger(r.comparison[k].workedDays)))))throw Error('加班均薪对比无效');
    if (Object.values(reviews.snapshots).some(report => report.recalculatedAt !== undefined && !finite(report.recalculatedAt))) throw Error('月报重算时间无效');
    if (Object.values(reviews.snapshots).some(report => report.overtimePay !== undefined && (!finite(report.overtimePay) || report.overtimePay < 0))) throw Error('月报加班费无效');
    if (Object.values(reviews.snapshots).some(report => ['secondly','averageDaily'].some(field => report[field] !== undefined && report[field] !== null && !finite(report[field])) || report.workedDays !== undefined && (!Number.isInteger(report.workedDays) || report.workedDays < 0))) throw Error('月报平均值无效');
  }
  return state;
}

function validateDayPolicy(p) {
  if (!p || !['work','overtime','leave','swap','rest'].includes(p.kind) || ['overtime','rest'].includes(p.kind) && p.payMode !== 'unpaid' || !['standard','unpaid','custom'].includes(p.payMode) || typeof p.includeOvertimePay !== 'boolean' || (p.payMode === 'custom' && (!finite(p.amount) || p.amount <= 0 || p.amount > 1e9)) || !finite(p.updatedAt)) throw Error('请明确选择当天类型与薪资处理');
  if(p.excludedOvertimePayIds!==undefined&&(!Array.isArray(p.excludedOvertimePayIds)||p.excludedOvertimePayIds.some(id=>typeof id!=='string')))throw Error('原加班费选择无效');
  validateSettings(p.settings);
}
