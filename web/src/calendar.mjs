import { at, dateKey, localDate, monthKey, uid, isDateKey, isWorkday, isAbsent, calendarPolicy, emptyState, settingsForDay, backfillSalaryForDate, repriceAutomaticMonth, validateSettings, validateState, effectivePayDays, fixedItemForDate, fixedForDate, plannedPayDays, dayStats, monthStats, monthlyReport, attendanceStatus, goalStats } from './model.mjs';

export const KIND_LABELS = Object.freeze({ work: '上班', overtime: '休息日加班', leave: '请假', swap: '调休',rest:'休息' });
export const SCHEDULE_FIELDS = Object.freeze(['start','end','lunch','lunchStart','lunchEnd']);
const copy = value => value === undefined ? null : structuredClone(value);
const dailyExpenses=(state,key)=>state.expenses.filter(e=>e.scope!=='month'&&e.date===key);
const snapshot = (state, key, costs=false) => ({ day: copy(state.days[key]), plan: copy(state.dayPlans?.[key]),...(costs?{expenses:copy(dailyExpenses(state,key))}:{}) });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const finite = Number.isFinite;
function baseSettings(state, key) {
  const settings = structuredClone(state.days[key]?.settings ?? settingsForDay(state, key));
  if (!state.days[key]) settings.salary = backfillSalaryForDate(state, key);
  delete settings.calendarDate; delete settings.calendarIsWorkday;
  return settings;
}
export function calendarInfo(state, key, now = Date.now()) {
  const settings = baseSettings(state, key), policy = calendarPolicy(state, key), future = key > dateKey(new Date(now));
  const baseWorkday = isWorkday(key, settings), status = future ? null : attendanceStatus(state, key, now);
  const kind = policy?.kind ?? (baseWorkday ? 'work' : 'rest');
  return { date: key, future, baseWorkday, kind, policy, settings, recorded: !!state.days[key]?.sessions.length,
    profit: key < dateKey(new Date(now)) && !!state.days[key]?.sessions.some(v => v.start <= now) && !isAbsent(policy) ? dayStats(state,key,now).net : null,
    status: status?.status ?? (isAbsent(policy) ? kind : kind === 'overtime' ? 'plan-overtime' : ['leave','swap'].includes(kind) ? kind : kind === 'rest' ? 'plan-rest' : 'plan-work'),
    label: status?.label ?? (future ? `计划${KIND_LABELS[kind] ?? '休息'}` : policy ? `${KIND_LABELS[kind]} · 未记录工时` : baseWorkday ? '上班 · 未记录' : '休息'), editable: isDateKey(key) };
}
function validateDate(state, key, now) {
  if (!finite(now) || !isDateKey(key)) throw Error('日期无效');
}
function noOverlap(state, key) {
  const day = state.days[key]; if (!day || isAbsent(day.calendar)) return;
  for (const [i, session] of day.sessions.entries()) for (const [otherKey, otherDay] of Object.entries(state.days)) {
    if (isAbsent(otherDay.calendar)) continue;
    for (const [j, other] of otherDay.sessions.entries()) {
      if (key === otherKey && i === j) continue;
      const end = session.end ?? Infinity, otherEnd = other.end ?? Infinity;
      if (end > session.start && otherEnd > other.start && session.start < otherEnd && other.start < end) throw Error('修改后与已有上班时段重叠，请核对每段真实起止；原记录未改');
    }
  }
}
function restate(state, key, now) {
  const day = state.days[key];
  if (day) {
    if (!isAbsent(day.calendar)) {
      const stats = dayStats(state, key, now);
      if (stats.fish > stats.worked) throw Error('修改后的上班工时少于已有摸鱼时长，请先纠正摸鱼记录');
    }
    const closed = day.sessions.length && day.sessions.every(s => s.end !== null);
    const count = closed ? day.sessions.length : day.summary?.sessionCount;
    const ends = count ? day.sessions.slice(0, count).map(s => s.end) : [];
    const stamp = ends.length && ends.every(finite) ? Math.max(...ends) : day.summary?.clockOutAt;
    if (stamp !== undefined) {
      const stats = dayStats(state, key, stamp), delta = Math.floor(stamp / 60000) - Math.floor(at(key, day.settings.end) / 60000);
      day.summary = { ...day.summary, clockOutAt: stamp, date: key, sessionCount: count, scheduledEnd: day.settings.end,
        status: day.calendar?.kind === 'overtime' ? 'late' : delta < 0 ? 'early' : delta > 0 ? 'late' : 'ontime', attendanceKind: day.calendar?.kind ?? 'work', recalculatedAt: now };
      for (const field of ['earned','overtimePay','expenses','fixed','net','fish','overtime','actual','hourly']) day.summary[field] = stats[field];
    }
  }
  const month = monthKey(key), saved = state.monthlyReviews?.snapshots?.[month];
  if (saved) state.monthlyReviews.snapshots[month] = { ...monthlyReport(state, month, saved.asOf), recalculatedAt: now };
}
function commit(state, next, key, action, now, undoOf, payrollChanges=[],costs=false,preserveArrangement=false) {
  const before = snapshot(state, key,costs), after = snapshot(next, key,costs);
  if (same(before, after)&&!payrollChanges.length) return { changed: false };
  next.version = Math.max(next.version, 2);
  (next.calendarAudit ??= []).push({ id: uid(), date: key, action, changedAt: now, before, after, ...(undoOf ? { undoOf } : {}),...(payrollChanges.length?{payrollChanges}: {}),...(preserveArrangement?{preserveArrangement:true}:{}) });
  validateState(next); Object.assign(state, next); return { changed: true, date: key };
}
export function fixedBurdenQuote(state,key,now=Date.now()){
  const inherited=state.fixed.filter(f=>key>=f.from&&(!f.until||key<f.until)).map(f=>({id:f.id,name:f.name,amount:fixedItemForDate(f,key,f.settings??state.settings)})).filter(i=>i.amount>0);
  const today=dateKey(new Date(now));
  const current=state.fixed.filter(f=>today>=f.from&&(!f.until||today<f.until)).map(f=>{const settings=f.settings??state.settings,days=plannedPayDays(key,settings),monthly=f.amount/({month:1,quarter:3,year:12}[f.period]);return{id:f.id,name:f.name,amount:days>0?monthly/days:0};}).filter(i=>i.amount>0);
  const original=state.days[key]?.fixedBurden,items=original?.enabled?copy(original.items):inherited.length?inherited:current;
  const unallocatable=!original?.enabled&&!inherited.length&&state.fixed.some(f=>today>=f.from&&(!f.until||today<f.until)&&plannedPayDays(key,f.settings??state.settings)===0);
  return{unallocatable,items,amount:items.reduce((v,i)=>v+i.amount,0),source:original?.enabled?'saved':inherited.length?'historical':'current',originalAmount:fixedForDate(state,key)};
}
function editCosts(state,next,key,input,now){
  if(input.expenses!==undefined){
    if(!Array.isArray(input.expenses)||input.expenses.length>1000)throw Error('当日花销记录无效');const old=dailyExpenses(state,key),seen=new Set();
    const updated=input.expenses.map(row=>{if(!row||typeof row.name!=='string'||!row.name.trim()||row.name.trim().length>40||!finite(row.amount)||row.amount<=0||row.amount>1e9)throw Error('每笔花销请填写名称和大于 0 的金额');let original;if(row.id!==undefined){if(typeof row.id!=='string'||seen.has(row.id)||!(original=old.find(e=>e.id===row.id)))throw Error('花销来源已变化，请重新打开此日修改');seen.add(row.id);}return original?{...original,name:row.name===original.name?original.name:row.name.trim(),amount:row.amount}:{id:uid(),date:key,scope:'day',category:'自定义',name:row.name.trim(),amount:row.amount};});
    next.expenses=state.expenses.filter(e=>e.scope==='month'||e.date!==key).concat(updated);
  }
  if(input.fixedBurden!==undefined){
    if(typeof input.fixedBurden?.enabled!=='boolean')throw Error('请明确是否计入当日固定负担');const quote=fixedBurdenQuote(state,key,now),enabled=input.fixedBurden.enabled;if(enabled&&quote.unallocatable)throw Error('当月考勤工作日为 0，无法补计固定负担，请先核对考勤');
    next.days[key].fixedBurden={enabled,source:enabled?'snapshot':'excluded',items:enabled?quote.items:[],amount:enabled?quote.amount:0,changedAt:now};
  }
  next.version=Math.max(next.version,4);
}
export function editCalendarDay(state, input, now = Date.now()) {
  const key = input?.date; validateDate(state, key, now);
  const today = dateKey(new Date(now)), future = key > today, next = structuredClone(state),preserve=input.preserveArrangement===true,costs=input.expenses!==undefined||input.fixedBurden!==undefined; let requiresDecision=false;
  if(costs&&(future||!state.days[key]))throw Error('请先补记当日考勤，再修改当日花销与固定负担');
  if (input.reset === true) {
    if (!future || state.days[key]) throw Error('已有实际记录不能直接清空；请使用预览修改或撤销');
    if (next.dayPlans) delete next.dayPlans[key];
    return commit(state, next, key, 'edit', now,undefined,repriceAutomaticMonth(next,key,now));
  }
  if (!['work','overtime','leave','swap','rest'].includes(input.kind) || !['standard','unpaid','custom'].includes(input.payMode)) throw Error('请选择当天类型和薪资处理');
  if(input.kind==='rest'&&input.payMode!=='unpaid')throw Error('休息不记录基础工资，请假或调休可单独确认工资处理');
  if (input.kind === 'overtime' && input.payMode !== 'unpaid') throw Error('加班基础收入不增长，加班费在下班时另记');
  if (typeof input.includeOvertimePay !== 'boolean') throw Error('请明确是否保留已有加班费计入收入');
  if (input.payMode === 'custom' && (!finite(input.amount) || input.amount <= 0 || input.amount > 1e9)) throw Error('自定补薪须大于 0 且不超过 10 亿');
  const settings = state.days[key] ? baseSettings(state, key) : input.settings ? structuredClone(input.settings) : baseSettings(state, key);
  if (input.salaryCorrection !== undefined) {
    const correction = input.salaryCorrection;
    if (future || !state.days[key] || correction?.confirmed !== true || !finite(correction.salary) || correction.salary < 0 || correction.salary > 1e9) throw Error('请明确确认此日工资修正，金额须为 0 至 10 亿');
    settings.salary = correction.salary;
  }
  if (!state.days[key] && !future && key < today && input.confirmedBackfill !== true) throw Error('空白历史没有薪资和工时快照，请核对后勾选补录确认');
  // Schedule corrections may change only hours, keeping the captured salary,
  // pay-day denominator and attendance cycle independent of current settings.
  let schedule;
  if (input.schedule !== undefined) {
    if (!input.schedule || typeof input.schedule !== 'object' || Array.isArray(input.schedule)) throw Error('请填写有效的当天计划排班');
    schedule=Object.fromEntries(SCHEDULE_FIELDS.filter(field=>Object.hasOwn(input.schedule,field)).map(field=>[field,input.schedule[field]]));
    Object.assign(settings,schedule);
  }
  delete settings.calendarDate; delete settings.calendarIsWorkday; validateSettings(settings);
  if (input.kind === 'overtime' && isWorkday(key,settings)) throw Error('基础工作日请保留上班类型，通过实际下班时间记录延时加班');
  if (input.payMode === 'standard' && isAbsent({kind:input.kind}) && !isWorkday(key, settings)) throw Error('基础休息日没有标准工资可保留，请选择不计薪或自定补薪');
  if (input.payMode === 'standard' && effectivePayDays(key, settings) <= 0) throw Error('基准计薪天数为 0，请选不计薪或自定补薪');
  const previousPolicy=calendarPolicy(state,key);if(preserve&&(!state.days[key]||future||input.kind!==(previousPolicy?.kind??'work')||input.payMode!==(previousPolicy?.payMode??'standard')||input.amount!==(previousPolicy?.amount??undefined)&&input.payMode==='custom'||input.salaryCorrection!==undefined||input.includeOvertimePay!==(previousPolicy?.includeOvertimePay!==false)))throw Error('修改排班、时间与费用时不能同时改写当天类型和工资规则');
  const keepArrangement=preserve||!!(schedule&&!future&&state.days[key]&&!input.salaryCorrection&&input.kind===(previousPolicy?.kind??'work')&&input.payMode===(previousPolicy?.payMode??'standard')&&(input.payMode!=='custom'||input.amount===previousPolicy.amount)&&input.includeOvertimePay===(previousPolicy?.includeOvertimePay!==false));
  const includeOvertimePay=future?true:input.includeOvertimePay;
  const excludedOvertimePayIds=includeOvertimePay?[]:previousPolicy?.includeOvertimePay===false&&!input.refreshExcludedFees?previousPolicy.excludedOvertimePayIds??(state.days[key]?.overtimeDecisions??[]).filter(f=>f.clockOutAt<=previousPolicy.updatedAt).map(f=>f.id):(state.days[key]?.overtimeDecisions??[]).map(f=>f.id);
  const plan = { kind: input.kind, payMode: input.payMode, amount: input.payMode === 'custom' ? input.amount : null, includeOvertimePay, ...(includeOvertimePay?{}:{excludedOvertimePayIds}), settings, updatedAt: now };if(!includeOvertimePay||input.kind==='rest')next.version=Math.max(next.version,3);
  if(!keepArrangement)(next.dayPlans ??= {})[key] = plan;
  if (future) {
    if (input.record || input.records?.length || state.days[key]?.sessions.length) throw Error('未来只能安排计划，不能提前补录实际工时');
  } else {
    const day = next.days[key] ??= { settings: structuredClone(settings), sessions: [], fish: [], breaks: [] };
    if(input.salaryMode!==undefined){if(!['manual','schedule'].includes(input.salaryMode))throw Error('请选择此日工资来源');if(!state.days[key]){day.salaryMode=input.salaryMode;next.version=Math.max(next.version,3);}}
    if (input.salaryCorrection && day.settings.salary !== settings.salary) {
      (day.salaryCorrections ??= []).push({ id: uid(), changedAt: now, fromSalary: day.settings.salary, salary: settings.salary, source: 'calendar-confirmed' });
      day.settings.salary = settings.salary;
    }
    if(input.salaryCorrection){day.salaryMode='manual';next.version=Math.max(next.version,3);}
    if(!keepArrangement){day.calendar = structuredClone(plan);day.settings = { ...day.settings, calendarDate: key, calendarIsWorkday: !isAbsent(plan) };}
    if(schedule){
      Object.assign(day.settings,schedule);
      if(keepArrangement){if(day.calendar)Object.assign(day.calendar.settings,schedule);if(next.dayPlans?.[key])Object.assign(next.dayPlans[key].settings,schedule);}
    }
    const records = input.records ?? (input.record ? [input.record] : []);
    if (!Array.isArray(records) || records.length > 10000 || new Set(records.filter(r=>r.sessionIndex!=='new').map(r=>r.sessionIndex)).size !== records.filter(r=>r.sessionIndex!=='new').length) throw Error('时段修改数据无效');
    const closing = [], changedIndexes = [];
    for (const record of records) {
      if (isAbsent(plan)) throw Error('请假或调休会归档原时段，不能同时改写原工时');
      const { sessionIndex, start, end } = record, adding = sessionIndex === 'new';
      const old = adding ? null : day.sessions[sessionIndex];
      if (!adding && (!Number.isInteger(sessionIndex) || !old)) throw Error('需要修正的时段不存在');
      if (!finite(start) || start > now || dateKey(new Date(start)) !== (old ? dateKey(new Date(old.start)) : key)) throw Error('上班时间须在原时段日期内，且不能晚于现在');
      if (end === null ? !old || old.end !== null : !finite(end) || end < start || end > now) throw Error('下班时间须在上班之后、现在之前；已结束时段不能重新变成进行中');
      if (adding) { day.sessions.push({ start, end, backfilled: true }); closing.push(day.sessions.length-1); }
      else if (start !== old.start || end !== old.end) { day.sessions[sessionIndex] = { ...old, start, end }; changedIndexes.push(sessionIndex); if(old.end===null&&end!==null) closing.push(sessionIndex); }
    }
    for (const fee of day.overtimeDecisions ?? []) if (fee.sessions.some(i=>changedIndexes.includes(i))) {
      fee.originalClockOutAt ??= fee.clockOutAt;
      fee.clockOutAt = Math.max(...fee.sessions.map(i => day.sessions[i].end));
    }
    noOverlap(next,key);
    requiresDecision = closing.length > 0 && dayStats(next,key,now).overtime > 2*3600000;
    if (requiresDecision) {
      const d=input.closeDecision;
      if(!d||!['free','paid'].includes(d.kind)||!finite(d.amount)||d.amount<0||d.amount>1e9||(d.kind==='free'?d.amount!==0:d.amount<=0)) {
        const error=Error('本次实际下班后累计加班超过两小时，请选择免费加班或填写本次额外加班费');error.calendarFeeRequired=true;throw error;
      }
      (day.overtimeDecisions??=[]).push({id:uid(),sessions:closing,clockOutAt:Math.max(...closing.map(i=>day.sessions[i].end)),kind:d.kind,amount:d.amount,source:'calendar-correction'});
    }
    if(costs)editCosts(state,next,key,input,now);
    noOverlap(next, key); restate(next, key, now);
  }
  const payrollChanges=keepArrangement?[]:repriceAutomaticMonth(next,key,now);
  return { ...commit(state, next, key, 'edit', now,undefined,payrollChanges,costs,keepArrangement), needsFeeDecision:requiresDecision,payrollChanges };
}
export function undoableCalendarChange(state, key) {
  const undone = new Set((state.calendarAudit ?? []).filter(e => e.action === 'undo').map(e => e.undoOf));
  const entry = (state.calendarAudit ?? []).filter(e => e.date === key && e.action === 'edit' && !undone.has(e.id)).at(-1);
  if (!entry) return null;
  return { entry, safe: same(snapshot(state, key,entry.after.expenses!==undefined), entry.after) };
}
export function undoCalendarChange(state, key, now = Date.now()) {
  validateDate(state, key, now); const target = undoableCalendarChange(state, key);
  if (!target) throw Error('没有可撤销的日历修改');
  if (!target.safe) throw Error('这一天后来已有新记录，请在编辑中修正，不能覆盖后续记录');
  const next = structuredClone(state), before = target.entry.before,costs=before.expenses!==undefined;
  if(costs)next.expenses=state.expenses.filter(e=>e.scope==='month'||e.date!==key).concat(copy(before.expenses));
  if (before.day) next.days[key] = structuredClone(before.day); else delete next.days[key];
  next.dayPlans ??= {}; if (before.plan) next.dayPlans[key] = structuredClone(before.plan); else delete next.dayPlans[key];
  noOverlap(next,key);
  // Restore exact day snapshot. Only report aggregates are refreshed, with original cutoff retained.
  const month = monthKey(key), saved = next.monthlyReviews?.snapshots?.[month];
  if (saved) next.monthlyReviews.snapshots[month] = { ...monthlyReport(next, month, saved.asOf), recalculatedAt: now };
  return commit(state, next, key, 'undo', now, target.entry.id,target.entry.preserveArrangement?[]:repriceAutomaticMonth(next,key,now),costs,!!target.entry.preserveArrangement);
}
export function calendarImpact(before, after, key, now = Date.now()) {
  const future = key > dateKey(new Date(now)), forPreview = state => { const d=dayStats(state,key,now); return future ? {...d,net:0,expenses:0,fixed:0} : d; };
  const dayBefore = forPreview(before), dayAfter = forPreview(after), monthBefore = monthStats(before,key,now), monthAfter = monthStats(after,key,now);
  return { before: dayBefore, after: dayAfter, monthBefore, monthAfter, goalBefore: goalStats(before,now).pool, goalAfter: goalStats(after,now).pool };
}
