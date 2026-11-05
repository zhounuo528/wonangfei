import {paintChange,changeMeaning} from './money-change.mjs';
import { configureAutomaticAttendance, reconcileAutomaticAttendance, automaticAttendanceDue } from './model.mjs';
import { configureClockInReminder, dueClockInReminder, markClockInReminderDelivered, clockInReminderRelevant } from './model.mjs';
import { shiftClock } from './shift-clock.mjs';
import { fishRecap, fishEarningsNote } from './break-earnings.mjs';
import { summaryFishStats, extraIncomeForDate } from './model.mjs';
import { createAboutUI } from './about-ui.mjs';
import { createSalaryEditor } from './salary-ui.mjs';
import { createTimeEditor } from './time-editor.mjs';
import { createExtraIncomeUI } from './extra-income-ui.mjs';
import { createDailyFixedEditor } from './daily-fixed-ui.mjs';
import { dailyFixedRows, stopFixed } from './model.mjs';
import { calendarInfo } from './calendar.mjs';
import { createCalendarEditor } from './calendar-ui.mjs';
import { calendarPolicy, isAbsent, earningRate, recordingStart } from './model.mjs';
import { dateKey, at, emptyState, clockNow, getDay, activeSession, activeShift, settle, startWork, resumeWork, needsOvertimeDecision, clockOut, breakDate, addCurrentBreak, deleteBreak, dueReminder, markReminderDelivered, attendanceStatus, datesInMonth, dayStats, monthStats, monthlyReport, dueMonthlyReview, saveMonthlyReview, migrateGoal, saveGoal, goalStats, settleGoal, dueGoalNotice, markGoalNotified, fixedItemForDate, addExpense, addFixed, convertLegacyFixed, expenseForDate, validateSettings, validateState, windows, ratePerMs, isWorkday, paidIntervals } from './model.mjs';
import { createTimestampTicker } from './live.mjs';
import { formatAmount, formatCurrency, belowCentPerSecond, roundedMoney } from './money.mjs';
import { formatWorkEquivalent } from './work-equivalent.mjs';
import { createHoldStepper } from './hold-stepper.mjs';
import { monthKey, plannedPayDays, payDaysModeForDate, migratePayDays, saveSettings, salaryForDate, salaryEvents, weeklyReport, migrateOvertimeExclusions } from './model.mjs';

const $ = id => document.getElementById(id);
const api = window.workday;
let state, period = 'day', currentView = 'dashboard', mini = false, pinned = false, confirmAction, toastTimer;
let saveTail = Promise.resolve(), saveRevision = 0, liveSnapshot, housekeeper, nativeVisible = true, nativeVisibilityObserved = false, tickHousekeeper;
let checkingReminder = false, reminderRetryAfter = 0;
let checkingAutomaticAttendance=false,automaticRetryAfter=0,tickRunning=false;
let checkingClockIn = false, clockInRetryAfter = 0, queuedClockIn;
let calendarMonth, calendarDetailKey, calendarSignature;
let calendarEditor, timeEditor, salaryEditor, dailyFixedEditor, extraIncomeUI;
let checkingMonthlyReview = false, monthlyRetryAfter = 0, queuedReminder, queuedMonthlyReview;
let workActionBusy = false, pendingClockOut;
let checkingGoal = false, goalRetryAfter = 0, queuedGoal;
let payDaysFormMonth;
const timeText = stamp => new Date(stamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
const yuan = formatCurrency;
const number = formatAmount;
const duration = ms => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(v => String(v).padStart(2, '0')).join(':');
};
const text = (id, value) => { const string = String(value), element = $(id); if (element.textContent !== string) element.textContent = string; element.classList.toggle('negative-money', /^[-−](?:[¥￥]|\d)|^[¥￥][-−]/.test(string)); };
const now = () => clockNow(state).getTime();
const money = value => state.display === 'hidden' ? '••••' : yuan(value);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const isVisible = () => nativeVisible && document.visibilityState === 'visible';
function amountText(id, value) {
  text(id, value);
  $(id).classList.toggle('long-value', value.length > 9);
  $(id).classList.toggle('very-long-value', value.length > 13);
  if (id === 'hero-amount') document.querySelector('.hero').classList.toggle('large-amount', value.length > 9);
}
function paintCharacter(net, hidden, overtime = false) {
  // Privacy always uses the same cheerful face, independent of the concealed balance.
  const mood = overtime ? 'overtime' : hidden ? 'private' : net < 0 ? 'anxious' : 'happy';
  const source = mood === 'overtime' ? 'mascot-overtime.png' : mood === 'anxious' ? 'mascot-anxious.png' : 'mascot-happy.png';
  for (const image of document.querySelectorAll('.state-mascot')) {
    if (image.dataset.mood === mood) continue;
    image.dataset.mood = mood;
    if (image.getAttribute('src') !== source) image.src = source;
  }
}
function paintLive(stamp) {
  if (!liveSnapshot || state.display === 'hidden') return;
  const { key, monthBeforeToday, rate, costs, monthCosts, goalBase, goalIncludesDay, goalStatus } = liveSnapshot;
  if (dateKey(new Date(stamp)) !== key) return;
  const paid = paidIntervals(state.days[key], key, stamp);
  const earned = paid.reduce((total, [a, b]) => total + b - a, 0) * rate + liveSnapshot.overtimePay + liveSnapshot.extraIncome;
  const monthEarned = monthBeforeToday + earned;
  const net = earned - costs;
  paintCharacter(net, false, liveSnapshot.overtime);
  const pool = goalBase + (goalIncludesDay ? earned : 0);
  const goal = goalPresentation(pool, goalStatus);
  const primary = state.display === 'goal' ? goal.value : number(state.display === 'month' ? monthEarned : net);
  amountText('hero-amount', primary);
  amountText('mini-amount', state.display === 'goal' ? primary : `¥${primary}`);
  text('sum-earned', money(period === 'day' ? earned : monthEarned));
  text('income-wages',money(period==='day'?earned-liveSnapshot.overtimeFee-liveSnapshot.extraIncome:monthEarned-liveSnapshot.monthOvertimePay-liveSnapshot.monthExtraIncome));text('income-overtime',money(period==='day'?liveSnapshot.overtimeFee:liveSnapshot.monthOvertimePay));text('income-extra',money(period==='day'?liveSnapshot.extraIncome:liveSnapshot.monthExtraIncome));
  text('sum-net', money(period === 'day' ? net : monthEarned - monthCosts));
  text('tray-gross', money(earned)); text('tray-net', money(net));
  const current = dayStats(state, key, stamp), workedDays = liveSnapshot.monthWorkedDaysBefore + (current.worked > 0 ? 1 : 0);
  paintAverages(current, { earned: monthEarned, net: monthEarned - monthCosts, actual: liveSnapshot.monthActualBefore + current.actual, averageDaily: workedDays ? (monthEarned - monthCosts) / workedDays : null });
  paintOvertimeMonth({ net: monthEarned - monthCosts, actual: liveSnapshot.monthActualBefore + current.actual, workedDays });
  paintGoal(pool, goalStatus);
  if (state.display === 'goal') text('hero-caption', goal.caption);
  if (state.display === 'today') updateNetTitle(net);
}
function updateNetTitle(net) {
  const overnight = liveSnapshot?.key !== dateKey(new Date(now()));
  const label = overnight ? `${liveSnapshot.key.slice(5).replace('-', '/')} 班次${net < 0 ? '还欠' : '已赚'}` : net < 0 ? '今日还欠' : '今日已赚';
  for (const id of ['display-mode', 'mini-display']) { const option = $(id).querySelector('option[value=today]'); if (option.textContent !== label) option.textContent = label; }
  const rent = state.fixed.some(item => /房租/.test(item.name) && !item.until);
  text('hero-caption', net < 0 ? roundedMoney(net) === 0 ? '离替自己上班，还差不到 ¥0.01。' : rent ? '今天的班，先替房东上了。' : '先回本，再轮到自己。' : rent ? '房东的份够了，接下来替自己上班。' : '成本下班了，终于轮到你赚钱。');
  if (overnight) text('hero-caption', `跨日班次归属 ${liveSnapshot.key}，工资已封顶；后续时间计入无薪加班。`);
  document.querySelector('.hero').classList.toggle('uncovered', net < 0);
  document.body.classList.toggle('net-uncovered', net < 0);
}
const liveTicker = createTimestampTicker({ readClock: now, write: paintLive, requestFrame: callback => requestAnimationFrame(callback), cancelFrame: id => cancelAnimationFrame(id), fps: 30 });
function syncLive() {
  if (!state) return;
  const stamp = now(), key = dateKey(new Date(stamp)), s = state.days[key]?.settings ?? state.settings;
  const visible = isVisible();
  const active = visible && !reducedMotion.matches && (mini || currentView === 'dashboard') && state.display !== 'hidden' && !!activeSession(state, key, stamp) && !isAbsent(calendarPolicy(state,key)) && (earningRate(key,{settings:s,calendar:calendarPolicy(state,key)}) > 0 && windows(key, s).some(([a, b]) => stamp >= a && stamp < b) || stamp >= at(key,s.end) || calendarPolicy(state,key)?.kind === 'overtime');
  document.documentElement.dataset.liveMode = !visible ? 'paused' : reducedMotion.matches ? 'reduced' : active ? 'smooth' : 'idle';
  liveTicker.setEnabled(active);
}
function visibilityChanged() {
  syncLive(); clearTimeout(housekeeper);
  if (!tickHousekeeper) return;
  if (isVisible()) tickHousekeeper();
  else housekeeper = setTimeout(tickHousekeeper, 30000);
}
document.addEventListener('visibilitychange', visibilityChanged);
api?.onVisibility(visible => { nativeVisibilityObserved = true; nativeVisible = visible; document.documentElement.dataset.nativeVisible = String(visible); visibilityChanged(); });
function toast(message) { text('toast', message); $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000); }
function requireSetup() { if (state.onboarded) return true; showView('settings'); toast('先选考勤、填工资，再开始挣窝囊费。'); return false; }
function ask(title, copy, action) { text('confirm-title', title);if(typeof copy==='string')text('confirm-copy',copy);else{$('confirm-copy').classList.remove('negative-money');$('confirm-copy').replaceChildren(copy);} confirmAction = action; $('confirm-dialog').showModal(); }
function persist() {
  settleGoal(state, now());
  validateState(state);
  const snapshot = structuredClone(state), rev = ++saveRevision;
  text('save-status', '正在保存…');
  saveTail = saveTail.catch(() => {}).then(async () => {
    if (!api) throw Error('请通过桌面应用运行，以便保存数据');
    await api.save(snapshot);
    if (rev === saveRevision) text('save-status', '已保存在本机');
    return true;
  }).catch(error => { text('save-status', `保存失败：${error.message}`); toast('保存失败，请保持应用打开并导出备份'); return false; });
  return saveTail;
}
function mutate(action) {
  try { action(); persist(); render(); renderLists(); }
  catch (error) { toast(error.message); }
}
function showView(view) {
  currentView = view;
  window.scrollTo(0,0);
  for (const name of ['dashboard', 'expenses', 'settings']) $(`${name}-view`).hidden = name !== view;
  document.querySelectorAll('nav [data-view]').forEach(button => { button.classList.toggle('active', button.dataset.view === view); if (button.dataset.view === view) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
  text('page-title', { dashboard: '上班不一定快乐，数字至少要动。', expenses: '花得明白，班才不白上。', settings: '先谈钱，再谈理想。' }[view]);
  if (view === 'settings') populateSettings();
  renderLists();
  syncLive();
  if ($('calendar-dialog').open) renderCalendar();
  if ($('calendar-detail-dialog').open) renderCalendarDetail(calendarDetailKey);
}
function renderAutomaticAttendanceStatus() {
  const auto=state.automaticAttendance,checked=$('automatic-attendance-enabled').checked,enabled=!!auto?.enabled;
  const pending=checked!==enabled;
  const manual=Object.values(state.days).some(day=>day.automaticAttendance?.status==='released'&&day.sessions.some(session=>session.end===null));
  text('automatic-attendance-status',pending?checked?'保存后开启，从今天的排班时间补记。':'保存后关闭，当前未结束班次需手动下班。':enabled?`已开启 · 从 ${auto.from} 起${auto.nextDate<dateKey(new Date(now()))?'，正在补记历史工作日':'按排班记录'}${manual?'；当前已有手动接管班次，请手动下班':''}。`:'当前关闭');
}
async function maybeAutomaticAttendance() {
  if(checkingAutomaticAttendance||Date.now()<automaticRetryAfter||!automaticAttendanceDue(state,now()))return;
  checkingAutomaticAttendance=true;
  try {
    const stamp=now(),result=reconcileAutomaticAttendance(state,stamp);
    if(!result.changed)return;const saving=persist();render();renderLists();
    if(!await saving){automaticRetryAfter=Date.now()+30000;return;}
    if(isVisible()&&(result.created.length||result.closed.length))toast('已按排班自动记录，可在小日历核对和修正。');
  } catch(error){automaticRetryAfter=Date.now()+30000;toast(`自动记录暂未保存：${error.message}`);}
  finally {checkingAutomaticAttendance=false;}
}
function populateSettings() {
  const form = $('settings-form');
  for (const [key, value] of Object.entries(state.settings)) {
    if (Array.isArray(value) || !form.elements[key]) continue;
    if (key === 'lunch') form.elements[key].checked = value;
    else form.elements[key].value = key === 'salary' ? !state.onboarded && value === 0 ? '' : Number(value).toFixed(2) : value;
  }
  for (const [container, field, selected] of [['weekdays', 'weekday', state.settings.weekdays], ['alternate-weekdays', 'weekdayB', state.settings.alternateWeekdays ?? [1, 2, 3, 4, 5, 6]]]) {
    $(container).replaceChildren();
    for (const [i, name] of ['日', '一', '二', '三', '四', '五', '六'].entries()) {
      const label = document.createElement('label'), input = document.createElement('input'), span = document.createElement('span');
      input.type = 'checkbox'; input.name = field; input.value = i; input.checked = selected.includes(i); input.setAttribute('aria-label', `${field === 'weekdayB' ? '单休周' : ''}星期${name}`); span.textContent = name;
      label.append(input, span); $(container).append(label);
    }
  }
  form.elements.scheduleMode.value = state.settings.scheduleMode ?? 'double';
  form.elements.anchorWeek.value = state.settings.anchorWeek ?? emptyState(clockNow(state)).settings.anchorWeek;
  form.elements.anchorKind.value = state.settings.anchorKind ?? '';
  const key = dateKey(new Date(now()));
  const pending=salaryEvents(state).filter(c=>c.effectiveDate>key);
  form.elements.salary.value=!state.onboarded?'':salaryForDate(state,key).toFixed(2);
  $('salary-actions').hidden=!state.onboarded;$('salary-date-undo').hidden=!salaryEditor?.latest();
  text('salary-effective-note',!state.onboarded?'首次填写从本月 1 日生效。':pending.length?`今天按 ${money(salaryForDate(state,key))}；待生效：${pending.map(c=>`${c.effectiveDate} ${money(c.salary)}`).join('；')}`:'调整工资时可选择过去、今天或未来日期；保存前查看影响。');
  payDaysFormMonth = monthKey(key);
  form.elements.payDaysMode.value = payDaysModeForDate(key, state.settings) === 'manual' ? 'manual' : 'auto';
  updateScheduleFields();
  updateLunchFields();
  $('reminder-enabled').checked = !!state.reminder?.enabled;
  $('clock-in-reminder-enabled').checked = !!state.clockInReminder?.enabled;
  $('automatic-attendance-enabled').checked=!!state.automaticAttendance?.enabled;renderAutomaticAttendanceStatus();
  $('legacy-allocation-note').hidden = !state.fixed.some(item => item.allocation === 'calendar' && !item.until);
}
function updateScheduleFields() {
  const form = $('settings-form'), mode = form.elements.scheduleMode.value, alternating = mode === 'alternating', everyday = mode === 'everyday';
  $('alternating-settings').hidden = !alternating; $('alternate-weekdays-field').hidden = !alternating;
  form.elements.anchorWeek.required = alternating; form.elements.anchorKind.required = alternating;
  for (const input of document.querySelectorAll('#weekdays input')) { input.disabled = everyday; if (everyday) input.checked = true; }
  text('weekday-legend', everyday ? '全年无休：每天均为工作日' : alternating ? '大小周：双休周的工作日（可调整）' : '工作日（可调整）');
  const notes = {
    double: '双休默认周一至周五工作，可调整。节假日及调休需自行设置。',
    single: '单休默认周一至周六工作，可调整。节假日及调休需自行设置。',
    alternating: '双休周默认周一至周五，单休周默认周一至周六；按基准周交替，不随月份重置。节假日及调休需自行设置。',
    '996': '996 默认周一至周六、09:00–21:00，工作日和具体时间均可调整；午休按下方设置。',
    everyday: '每一天均为考勤工作日；上下班时间和午休请按实际设置。'
  };
  text('schedule-note', notes[mode] ?? notes.double);
  syncPayDaysForm();
}
function readSettingsForm() {
  const form = $('settings-form'), f = new FormData(form);
  return { salary: Number(f.get('salary')), payDays: Number(f.get('payDays')), payDaysMode: f.get('payDaysMode'), payDaysMonth: monthKey(dateKey(new Date(now()))), scheduleMode: f.get('scheduleMode'), weekdays: f.get('scheduleMode') === 'everyday' ? [0, 1, 2, 3, 4, 5, 6] : f.getAll('weekday').map(Number), alternateWeekdays: f.getAll('weekdayB').map(Number), anchorWeek: f.get('anchorWeek'), anchorKind: f.get('anchorKind'), start: f.get('start'), end: f.get('end'), lunch: f.get('lunch') === 'on', lunchStart: form.elements.lunchStart.value, lunchEnd: form.elements.lunchEnd.value };
}
function syncPayDaysForm() {
  const form = $('settings-form'), key = dateKey(new Date(now())), month = monthKey(key);
  if (payDaysFormMonth && payDaysFormMonth !== month) form.elements.payDaysMode.value = 'auto';
  payDaysFormMonth = month;
  const automatic = form.elements.payDaysMode.value === 'auto';
  form.elements.payDays.readOnly = automatic;
  text('pay-days-month', `${month.slice(0, 4)} 年 ${Number(month.slice(5))} 月`);
  try {
    const settings = readSettingsForm(), planned = plannedPayDays(key, settings);
    if (automatic) form.elements.payDays.value = String(planned);
    const days = automatic ? planned : Number(form.elements.payDays.value);
    text('pay-days-note', planned === 0 ? '本月还没选工作日，勾选后就能计算日薪。' : !Number.isFinite(days) || days <= 0 || days > 31 ? '手动计薪天数要大于 0、最多 31；拿不准可选自动计算。' : `本月计划 ${planned} 个工作日 · 日薪约 ${money(settings.salary / days)}。${automatic ? '下个月按新月份的排班自动算。' : '你填的天数仅用于本月，下月恢复自动。'}`);
  } catch (error) {
    if (automatic) form.elements.payDays.value = '';
    text('pay-days-note', error.message);
  }
}
async function maybeClockInReminder() {
  if (checkingClockIn || !isVisible() || Date.now() < clockInRetryAfter || document.querySelector('dialog[open]')) return;
  if (queuedClockIn) {
    const queued = queuedClockIn; queuedClockIn = null;
    if (queued.state === state && clockInReminderRelevant(state, queued.reminder, now())) { $('clock-in-reminder-dialog').showModal(); return; }
  }
  const reminder = dueClockInReminder(state, now()); if (!reminder) return;
  checkingClockIn = true; const markedState = state;
  if (!markClockInReminderDelivered(markedState, reminder, now())) { checkingClockIn = false; return; }
  try {
    const saved = await persist();
    if (!saved) { delete markedState.clockInReminder.delivered[reminder.date]; clockInRetryAfter = Date.now() + 30000; return; }
    if (state === markedState && clockInReminderRelevant(state, reminder, now())) {
      queuedClockIn = { state: markedState, reminder };
      if (isVisible() && !document.querySelector('dialog[open]')) { queuedClockIn = null; $('clock-in-reminder-dialog').showModal(); }
    }
  } finally { checkingClockIn = false; }
}
async function maybeRemind() {
  if (checkingReminder || !isVisible() || Date.now() < reminderRetryAfter || document.querySelector('dialog[open]')) return;
  if (queuedReminder) {
    if (queuedReminder.state === state) { queuedReminder = null; $('reminder-dialog').showModal(); return; }
    queuedReminder = null;
  }
  const reminder = dueReminder(state, now());
  if (!reminder) return;
  checkingReminder = true;
  const markedState = state;
  markReminderDelivered(markedState, reminder, now());
  try {
    const saved = await persist();
    if (!saved) { delete markedState.reminder.delivered[reminder.date]; reminderRetryAfter = Date.now() + 30000; return; }
    if (state === markedState) {
      queuedReminder = { state: markedState };
      if (isVisible() && !document.querySelector('dialog[open]')) { queuedReminder = null; $('reminder-dialog').showModal(); }
    }
  } finally { checkingReminder = false; }
}
async function maybeMonthlyReview() {
  if (checkingMonthlyReview || !isVisible() || Date.now() < monthlyRetryAfter || document.querySelector('dialog[open]')) return;
  if (queuedMonthlyReview) {
    const queued = queuedMonthlyReview; queuedMonthlyReview = null;
    if (queued.state === state) { showMonthlyReport(queued.report); return; }
  }
  const report = dueMonthlyReview(state, now()); if (!report) return;
  checkingMonthlyReview = true;
  const markedState = state;
  try {
    saveMonthlyReview(state, report, true); const saved = await persist();
    if (!saved) { delete markedState.monthlyReviews.shown[report.month]; monthlyRetryAfter = Date.now() + 30000; return; }
    if (state === markedState) {
      queuedMonthlyReview = { state: markedState, report };
      if (isVisible() && !document.querySelector('dialog[open]')) { queuedMonthlyReview = null; showMonthlyReport(report); }
    }
  }
  finally { checkingMonthlyReview = false; }
}
function updateLunchFields() { for (const name of ['lunchStart', 'lunchEnd']) $('settings-form').elements[name].disabled = !$('settings-form').elements.lunch.checked; }
function goalPresentation(pool, status) {
  if (!state.goal) return { value: '未设定', caption: '先给努力定个小目标。', progress: 0, remaining: 0 };
  const done = status === 'done', progress = done ? 1 : Math.min(1, pool / state.goal.amount), remaining = done ? 0 : Math.max(0, state.goal.amount - pool);
  return { value: `${(progress * 100).toFixed(1)}%`, progress, remaining, caption: done ? `目标已完成 · 剩余净赚 ${money(pool)}` : `${state.goal.name} · 还差 ${money(remaining)}` };
}
function paintGoal(pool, status) {
  const goal = goalPresentation(pool, status), hidden = state.display === 'hidden', done = status === 'done';
  text('goal-name', state.goal?.name ?? '给努力一个盼头');
  text('edit-goal', done ? '建立下个目标 ↗' : state.goal ? '修改目标 ↗' : '设置目标 ↗');
  text('goal-amounts', hidden ? '目标金额已隐藏' : !state.goal ? '工资减去开销，净赚一点一点攒。' : done ? `留给下个目标 ${yuan(pool)} · 已完成 ${yuan(state.goal.amount)}` : `已攒净赚 ${yuan(pool)} / 目标 ${yuan(state.goal.amount)}`);
  text('goal-percent', hidden || !state.goal ? '—' : done ? '已完成' : `${(goal.progress * 100).toFixed(1)}%`);
  $('goal-progress').value = hidden ? 0 : Math.max(0, goal.progress * 100);
  text('goal-eta', hidden ? '工资扣掉开销后的净赚，继续为目标累计。' : !state.goal ? '不限时，从设目标当天开始攒；亏损也会扣减累计数。' : done ? '本目标金额已从累计中扣除，剩余净赚留给下一个。' : `从 ${state.goalPool.from} 开始 · ${pool < 0 ? '先回本，再攒目标。' : '不限时，慢慢攒。'}还差 ${yuan(goal.remaining)}。`);
}
function openGoalEditor() {
  const active = state.goal && state.goal.completedAt === null;
  $('goal-form').elements.amount.type = state.display === 'hidden' ? 'password' : 'number';
  $('goal-form').elements.name.value = active ? state.goal.name : '';
  $('goal-form').elements.amount.value = active ? state.goal.amount.toFixed(2) : '';
  text('goal-form-title', active ? '修改赚钱目标' : '给努力一个新目标');
  const stats = goalStats(state, now());
  text('goal-form-pool', state.goalPool ? active ? `已为目标攒下净赚 ${money(stats.pool)}，修改目标后继续累计。` : `留给下个目标的净赚 ${money(stats.pool)}，新目标会接着这份累计。` : '从设目标当天开始攒，亏损也会扣减累计数。');
  text('goal-error', ''); $('goal-dialog').showModal();
}
function showGoalNotice() {
  const stats = goalStats(state, now());
  text('goal-complete-name', `拿下「${state.goal.name}」！`);
  text('goal-complete-amount', money(state.goal.amount)); text('goal-complete-pool', money(stats.pool));
  $('goal-complete-dialog').showModal();
}
async function maybeGoalCompletion() {
  if (checkingGoal || !isVisible() || Date.now() < goalRetryAfter || document.querySelector('dialog[open]')) return;
  if (queuedGoal) {
    const queued = queuedGoal; queuedGoal = null;
    if (state.goal?.id === queued) { showGoalNotice(); return; }
  }
  settleGoal(state, now()); const notice = dueGoalNotice(state); if (!notice) return;
  checkingGoal = true; markGoalNotified(state, notice.id, now());
  try {
    const saved = await persist();
    if (!saved) { if (state.goal?.id === notice.id) state.goal.notifiedAt = null; goalRetryAfter = Date.now() + 30000; return; }
    if (state.goal?.id === notice.id) { render(); queuedGoal = notice.id; if (!document.querySelector('dialog[open]')) { queuedGoal = null; showGoalNotice(); } }
  } finally { checkingGoal = false; }
}
function workContextKey(stamp) {
  const shift = activeShift(state, stamp); if (shift) return shift.key;
  const today = dateKey(new Date(stamp)); if (state.days[today]?.sessions.length) return today;
  return today;
}
function paintAverages(day, month) {
  const stats = state.display === 'month' ? month : day, actual = stats.actual;
  const income = state.display === 'month' ? stats.net : stats.earned;
  const seconds = actual > 0 ? income / actual * 1000 : null, hourly = actual > 0 ? income / actual * 3600000 : null;
  text('hero-avg-second', seconds === null ? '—' : money(seconds)); text('hero-avg-hour', hourly === null ? '—' : money(hourly));
  $('hero-avg-day-group').hidden = state.display !== 'month';
  text('hero-avg-day', month.averageDaily === null ? '—' : money(month.averageDaily));
  text('hero-rate-note',state.display==='hidden'?'':`${state.display==='month'?'本月净收入 ÷ 有效工时 / 实际工作日':belowCentPerSecond(seconds)?'实际秒薪低于 ¥0.01':''}${stats.extraIncome>0?(actual>0?' · 含意外之财':'暂无有效工时，均薪显示 —'):''}`);
}
function paintOvertimeMonth(month) {
  text('overtime-month-day', month.workedDays > 0 ? money(month.net / month.workedDays) : '—');
  text('overtime-month-hour', month.actual > 0 ? money(month.net / month.actual * 3600000) : '—');
  text('overtime-month-second', month.actual > 0 ? money(month.net / month.actual * 1000) : '—');
}
function render() {
  renderAutomaticAttendanceStatus();
  const stamp = now(), time = new Date(stamp), todayKey = dateKey(time), shift = activeShift(state, stamp), key = workContextKey(stamp), day = getDay(state, key), d = dayStats(state, key, stamp), m = monthStats(state, todayKey, stamp), g = goalStats(state, stamp);
  const running = !!shift, overtime = running && (d.policy?.kind === 'overtime' || stamp >= at(key, d.settings.end)), inPaid = windows(key, d.settings).some(([a, b]) => stamp >= a && stamp < b), isLunch = running && !inPaid && stamp >= at(key, d.settings.start) && !overtime;
  const absent = isAbsent(d.policy);
  const clock = shiftClock(state, stamp), waiting = !running, targetDate = clock.key ? new Date(clock.start).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' }) : '';
  const absentName = { leave: '请假', swap: '调休', rest: '休息' }[d.policy?.kind];
  const status = absent ? `今日${absentName} · 原时段保留归档` : running ? (overtime ? d.policy?.kind === 'overtime' ? '加班中 · 基础工资不增长' : '加班中 · 工资已封顶' : isLunch ? '午休中 · 暂停计薪' : stamp < at(key, d.settings.start) ? '等待上班时间' : '正在上班') : day?.sessions.length ? '已下班 · 辛苦了' : clock.mode === 'due' ? '上班时间已到 · 尚未开始' : clock.mode === 'unscheduled' ? '暂无上班安排' : !isWorkday(key, d.settings) ? '今日休息' : '尚未开始';
  const countdown = clock.milliseconds;
  const hidden = state.display === 'hidden';
  paintCharacter(d.net, hidden, overtime);
  const goalIncludesDay = !!state.goalPool && key >= state.goalPool.from;
  liveSnapshot = { key, monthBeforeToday: m.earned - d.earned, rate: earningRate(key,{settings:d.settings,calendar:d.policy}), costs: d.expenses + d.fixed, monthCosts: m.expenses + m.fixed, goalBase: g.pool - (goalIncludesDay ? d.earned : 0), goalIncludesDay, goalStatus: g.status, overtimePay: d.overtimePay + d.calendarPay, overtimeFee:d.overtimePay,extraIncome:d.extraIncome,monthExtraIncome:m.extraIncome,monthOvertimePay:m.overtimePay, overtime, monthActualBefore: m.actual - (key.slice(0,7) === todayKey.slice(0,7) ? d.actual : 0), monthWorkedDaysBefore: m.days.filter((day,index) => m.dates[index] !== key && day.worked > 0).length };
  document.body.classList.toggle('amounts-hidden', hidden);
  document.body.classList.toggle('net-uncovered', !hidden && state.display === 'today' && d.net < 0);
  $('display-mode').value = state.display; $('mini-display').value = state.display;
  const goalMode = state.display === 'goal';
  text('hero-prefix', hidden ? '' : goalMode ? '' : '¥');
  amountText('hero-amount', hidden ? '••••••' : goalMode ? goalPresentation(g.pool, g.status).value : number(state.display === 'month' ? m.earned : d.net));
  document.querySelector('.hero').classList.toggle('uncovered', !hidden && state.display === 'today' && d.net < 0);
  text('hero-caption', hidden ? '安心专注，金额已隐藏。' : goalMode ? goalPresentation(g.pool, g.status).caption : state.display === 'month' ? `本月总收入（含加班费和意外之财）· ${m.workedDays} 个有工时日。` : '已扣除今日花销与固定负担。');
  text('work-status', status); paintAverages(d, m);
  text('shift-label-text', clock.label); text('shift-end', waiting ? clock.key ? `${clock.key === todayKey ? '今天' : clock.key.slice(5).replace('-', '/')} ${clock.settings.start}` : '到日历安排' : d.settings.end); text('countdown', countdown === null ? '—' : duration(countdown));
  text('shift-progress-label', waiting ? clock.mode === 'due' ? '尚未开始上班' : '下一次上班安排' : overtime ? '加班按实际时长累计' : d.policy?.payMode && d.policy.payMode !== 'standard' ? '计划工时进度' : '计薪工时进度');
  text('shift-percent', waiting ? clock.mode === 'unscheduled' ? '待安排' : clock.kind === 'overtime' ? '休息日加班' : clock.mode === 'due' ? '等待开始' : '待上班' : overtime ? '无预设上限' : `${Math.min(100, d.elapsed / d.planned * 100).toFixed(1)}%`); $('shift-progress').value = Math.min(100, d.elapsed / d.planned * 100); $('shift-progress').hidden = waiting || overtime || absent;
  text('shift-summary', waiting ? clock.mode === 'unscheduled' ? '还没有下一班，去日历安排一下。' : clock.mode === 'due' ? `今日计划 ${clock.settings.start}–${clock.settings.end}；点击开始后按计划时间补算。` : `${targetDate} ${clock.settings.start}–${clock.settings.end}${clock.kind === 'overtime' ? ' · 休息日加班' : ''}` : overtime ? '加班这么久，领导肯定很器重你吧。' : `上班 ${d.settings.start} · ${d.settings.lunch ? `午休 ${d.settings.lunchStart}–${d.settings.lunchEnd}` : '不扣午休'}`);
  const workLabel = running ? '下班，看看今天  ✓' : day?.sessions.length ? '起来加班  →' : '开始上班  →';
  text('work-toggle', absent ? '在日历调整这一天' : workLabel);
  $('work-toggle').disabled = absent; $('mini-work').disabled = absent;
  $('overtime-month-rates').hidden = !overtime; paintOvertimeMonth(m); $('show-summary').hidden = !day?.summary;
  const firstStart = day?.sessions.length ? Math.min(...day.sessions.map(session => session.start)) : null;
  text('recorded-start', firstStart === null ? '今日上班 · 尚未记录' : `${key === todayKey ? '今日上班' : `${key.slice(5).replace('-', '/')} 上班`} ${timeText(firstStart)}`);
  $('correct-start').hidden = firstStart === null || absent;
  const summary = period === 'day' ? d : m;
  text('income-wages',money(summary.baseEarned));text('income-overtime',money(summary.overtimePay));text('income-extra',money(summary.extraIncome));
  text('sum-earned', money(summary.earned)); text('sum-expenses', money(summary.expenses)); text('sum-fixed', money(summary.fixed)); text('sum-net', money(summary.net));
  text('quick-total', money(d.expenses)); text('fixed-total', money(d.fixed)); text('quick-income-total',money(extraIncomeForDate(state,todayKey,now())));
  text('period-caption', period === 'day' ? key === todayKey ? '今日' : '本班次' : '本月');
  text('ledger-note', period === 'day' ? '固定负担为当日分摊；净赚 = 总收入 − 花销 − 固定负担。' : `本月已记录 ${m.recorded} 天工资。固定负担累计至今日，无打卡日也按规则分摊。`);
  for (const p of ['day', 'month']) { $(`period-${p}`).classList.toggle('active', period === p); $(`period-${p}`).setAttribute('aria-pressed', String(period === p)); }
  const breakStats = period === 'day' ? d : m;
  text('fish-time', duration(breakStats.fish)); text('actual-time', duration(breakStats.actual)); text('fish-caption', `${period === 'day' ? '今日' : '本月'}已记录摸鱼 · 有效工时扣除这段休息`);
  text('effective-hour', breakStats.hourly === null ? '—' : money(breakStats.hourly)); text('effective-second', breakStats.secondly === null ? '—' : money(breakStats.secondly));
  text('effective-rate-note', !hidden && belowCentPerSecond(breakStats.secondly) ? '实际有效秒薪低于 ¥0.01/秒；显示为 ¥0.00，内部仍保留精度。' : '');
  paintGoal(g.pool, g.status);
  const price = Number($('purchase-amount').value), rate = ratePerMs(key, d.settings);
  text('purchase-time', hidden ? '已隐藏' : formatWorkEquivalent(price, rate, d.planned));
  // Price itself is a money value and is concealed in privacy mode too.
  $('purchase-amount').type = hidden ? 'password' : 'number';
  amountText('mini-amount', hidden ? '••••••' : goalMode ? goalPresentation(g.pool, g.status).value : `¥${number(state.display === 'month' ? m.earned : d.net)}`);
  text('mini-time-label', clock.miniLabel); text('mini-time-value', countdown === null ? '—' : duration(countdown)); text('mini-time-status', waiting && clock.key ? `${clock.mode === 'due' ? '今日计划' : '下次'} ${clock.key === todayKey ? '今天' : clock.key.slice(5).replace('-', '/')} ${clock.settings.start}${clock.kind === 'overtime' ? ' · 休息日加班' : ''}` : status); $('mini-progress').value = d.elapsed / d.planned * 100; $('mini-progress').hidden = waiting || overtime || absent;
  document.body.classList.toggle('overtime-mode', overtime); document.body.classList.remove('overtime-ended');
  text('mini-work', running ? '下班' : day?.sessions.length ? '起来加班' : '开始上班');
  text('tray-gross', money(d.earned)); text('tray-costs', money(d.fixed + d.expenses)); text('tray-net', money(d.net));
  text('date-label', `${time.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })} · 本机时间`);
  $('mode-notice').hidden = !!state.onboarded;
  text('mode-copy', !state.onboarded ? '先选上班安排，再填每月到手工资和时间。花销、目标可以以后再加。' : '按你的考勤和记录计算，班不能白上。');
  text('mini-notice', overtime ? '加班这么久，领导肯定很器重你吧。' : '今天的班，也得上出点数字。');
  paintLive(stamp);
  if (state.display === 'today') updateNetTitle(d.net);
  const previousSummary = latestSummary();
  $('show-summary').hidden = !previousSummary;
  text('show-summary', previousSummary?.date === todayKey ? '查看下班总结 ↗' : '查看上次下班总结 ↗');
  syncLive();
  if ($('calendar-dialog').open) renderCalendar();
  if ($('calendar-detail-dialog').open) renderCalendarDetail(calendarDetailKey);
  if ($('break-dialog').open) updateBreakCapacity();
}
function makeRow(title, detail, amount, actionLabel, action) {
  const row = document.createElement('div'); row.className = 'list-row';
  const left = document.createElement('div'), name = document.createElement('span'), small = document.createElement('small'); name.textContent = title; small.textContent = detail; left.append(name, small);
  const right = document.createElement('div'), value = document.createElement('span'), button = document.createElement('button'); value.className = 'row-value'; value.textContent = money(amount); button.type = 'button'; button.className = 'text-button'; button.textContent = actionLabel; button.addEventListener('click', action); right.append(value, button); row.append(left, right); return row;
}
function placeholder(container, message) { const el = document.createElement('div'); el.className = 'empty'; el.textContent = message; container.append(el); }
function renderLists() {
  const key = activeShift(state, now())?.key ?? dateKey(new Date(now()));
  const todayExpenses = state.expenses.filter(e => expenseForDate(e, key) > 0);
  text('expense-preview', !todayExpenses.length ? '还没花，先赚着。' : `今日记了 ${todayExpenses.length} 笔。每一笔，都得靠上班。`);
  $('quick-expense-list').replaceChildren();
  for (const expense of todayExpenses.slice(-3)) { const row = document.createElement('div'), name = document.createElement('span'), value = document.createElement('b'); row.className = 'overview-cost-row'; name.textContent = `${expense.name}${expense.scope === 'month' ? '（整月分摊）' : ''}`; value.textContent = money(expenseForDate(expense, key)); row.append(name, value); $('quick-expense-list').append(row); }
  $('expense-list').replaceChildren(); $('fixed-list').replaceChildren();
  for (const e of [...state.expenses].sort((a, b) => b.date.localeCompare(a.date))) $('expense-list').append(makeRow(e.name, e.scope === 'month' ? `${e.month} 整月 · ${e.allocationDates.length} 个考勤工作日 · 每日 ${money(e.amount / e.allocationDates.length)}` : `${e.date} 当日 · ${e.category}`, e.amount, '删除', () => ask('删除这笔花销？', `将移除「${e.name}」，对应日期净赚会重新计算。`, () => mutate(() => { state.expenses = state.expenses.filter(x => x.id !== e.id); }))));
  if (!state.expenses.length) placeholder($('expense-list'), '还没有记录，先从一杯咖啡开始。');
  const active = state.fixed.filter(f => !f.until);
  $('fixed-overview-list').replaceChildren();
  for (const item of active.slice(0, 3)) { const row = document.createElement('div'), name = document.createElement('span'), value = document.createElement('b'); row.className = 'overview-cost-row'; name.textContent = item.name; value.textContent = money(fixedItemForDate(item, key, item.settings, state)); row.append(name, value); $('fixed-overview-list').append(row); }
  if (!active.length) placeholder($('fixed-overview-list'), '添加一笔固定负担');
  for (const f of active) {
    const description=f.period==='day'?`${f.repeat==='daily'?'每天':'每个工作日'} ${money(f.amount)} · ${f.from} 起`: `${{month:'每月',quarter:'每季度',year:'每年'}[f.period]} ${money(f.amount)} · ${f.allocation==='calendar'?'旧方案，保存考勤后从当日起切换':'考勤工作日分摊'}`;
    $('fixed-list').append(makeRow(f.name,`${description} · 今日 ${money(fixedItemForDate(f,key,f.settings,state))}`,f.amount,'停止',()=>ask('停止这项固定费用？',`「${f.name}」从今天起停止，之前日期保留；尚未生效的规则会取消。`,()=>mutate(()=>stopFixed(state,f.id,key,now())))));
  }
  if (!active.length) placeholder($('fixed-list'), '添加房租、房贷或车贷，把每日负担看清楚。');
  renderBreakList();extraIncomeUI?.refresh();
}
function updateBreakCapacity() {
  const stamp = now(), key = breakDate(state, stamp), d = dayStats(state, key, stamp);
  text('break-date-note', key === dateKey(new Date(stamp)) ? `自动记入今天 · ${key}` : `跨日班次 · 记入 ${key}，与这班的工资、工时放在一起。`);
  text('break-capacity', `班次累计工时 ${duration(d.worked)}（含无薪加班），已记摸鱼 ${duration(d.fish)}；可添加 ${duration(Math.max(0, d.worked - d.fish))}。超出不保存。`);
}
function updateBreakStepper() {
  const value = Number($('break-minutes').value);
  $('break-minus').disabled = Number.isFinite(value) && value <= 1;
  $('break-plus').disabled = Number.isFinite(value) && value >= 1440;
}
function adjustBreakMinutes(direction) {
  const input = $('break-minutes'), value = input.valueAsNumber;
  const previous = Number.isInteger(value) && value >= 1 && value <= 1440 ? value : 15;
  const next = Math.min(1440, Math.max(1, previous + direction * 5));
  input.value = next; input.dispatchEvent(new Event('input', { bubbles: true }));
  return next !== previous;
}
const breakStepper = createHoldStepper({ step: adjustBreakMinutes });
let pointerClickUntil = 0;
for (const [id, direction] of [['break-minus', -1], ['break-plus', 1]]) {
  const button = $(id);
  button.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault(); button.focus({ preventScroll: true }); pointerClickUntil = performance.now() + 600;
    button.setPointerCapture(event.pointerId); breakStepper.start(direction);
  });
  button.addEventListener('pointerup', () => { pointerClickUntil = performance.now() + 600; breakStepper.stop(); });
  button.addEventListener('pointercancel', () => breakStepper.stop());
  button.addEventListener('lostpointercapture', () => breakStepper.stop());
  button.addEventListener('blur', () => breakStepper.stop());
  button.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    event.preventDefault(); if (!event.repeat) breakStepper.start(direction);
  });
  button.addEventListener('keyup', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); breakStepper.stop(); } });
  button.addEventListener('click', event => {
    if (event.detail > 0 && performance.now() < pointerClickUntil) return;
    adjustBreakMinutes(direction);
  });
  button.addEventListener('contextmenu', event => event.preventDefault());
}
for (const event of ['pointerup', 'pointercancel', 'blur']) window.addEventListener(event, () => breakStepper.stop());
window.addEventListener('keyup', event => { if (['Enter', ' '].includes(event.key)) breakStepper.stop(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) breakStepper.stop(); });
$('break-dialog').addEventListener('close', () => breakStepper.stop());
$('break-minutes').addEventListener('input', () => { updateBreakStepper(); text('break-error', ''); });
function openBreak() {
  if (!requireSetup()) return;
  $('break-form').reset(); $('break-kind').value = '喝点水'; $('break-custom-label').hidden = true; $('break-custom').required = false;
  breakStepper.stop(); text('break-error', ''); updateBreakStepper(); updateBreakCapacity(); $('break-dialog').showModal();
}
function renderBreakList() {
  $('break-list').replaceChildren(); let count = 0;
  for (const key of Object.keys(state.days).sort().reverse()) {
    const day = state.days[key]; if (isAbsent(day.calendar)) continue;
    const records = [...(day.breaks ?? [])].reverse();
    const legacy = dayStats(state, key, now()).legacyFish;
    if (legacy > 0) records.push({ id: 'legacy', name: '历史计时记录', durationMs: legacy });
    for (const record of records) {
      const row = makeRow(record.name, key, 0, '删除', () => ask('删除这条摸鱼记录？', `将删除 ${key} 的「${record.name}」，恢复对应有效工时，工资不变。`, () => mutate(() => deleteBreak(state, key, record.id))));
      row.querySelector('.row-value').textContent = `${Math.round(record.durationMs / 60000 * 10) / 10} 分钟`; row.querySelector('button').dataset.breakId = record.id; $('break-list').append(row); count++;
    }
  }
  if (!count) placeholder($('break-list'), '还没有摸鱼记录。添加一点喘口气的时间。');
}
function showSummary(summary) {
  if (!summary) return;
  const policy = calendarPolicy(state,summary.date);
  if (isAbsent(policy)) summary = { ...summary, ...dayStats(state,summary.date,now()) };
  summary = { ...summary, ...summaryFishStats(state, summary) };
  text('summary-title', isAbsent(policy) ? policy.kind === 'leave' ? '这一天，已记为请假。' : '这一天，已记为调休。' : { early: '今天提前下班。', ontime: '准时下班，刚刚好。', late: '加班啦，今天辛苦了。' }[summary.status]);
  text('summary-date', `${summary.date} 班次 · ${new Date(summary.clockOutAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })} 下班`);
  text('summary-wages',money(summary.wageEarned));text('summary-extra',money(summary.extraIncome));
  text('summary-earned', money(summary.earned)); text('summary-actual', duration(summary.actual));
  text('summary-fish', duration(summary.fish));
  text('summary-fish-recap', fishRecap('今天', summary.fish, summary.fishEarned, money));
  text('summary-fish-note', fishEarningsNote);
  text('summary-overtime', duration(summary.overtime ?? 0)); text('summary-overtime-pay', money(summary.overtimePay ?? 0));
  text('summary-hourly', summary.hourly === null ? '—' : `${money(summary.hourly)} / 小时`);
  text('summary-costs', money(summary.expenses + summary.fixed)); text('summary-net', money(summary.net));
  text('summary-note', `${isAbsent(policy) ? '请假 / 调休按当前结算，补薪在当日排班结束后计入；原时段保留。' : summary.recalculatedAt ? '已按修正记录重算。' : ''}工资自动计到 ${summary.scheduledEnd}，加班费按下班记录另计；加班工时计入有效工时分母。`);
  $('summary-dialog').showModal();
}
async function finishClockOut(stamp, decision) {
  if (workActionBusy) return; workActionBusy = true;
  try { const summary = clockOut(state, stamp, decision); const saved = await persist(); render(); if (saved) showSummary(summary); else toast('下班记录保存失败，请保持窗口打开并重试保存。'); }
  catch (error) { toast(error.message); }
  finally { workActionBusy = false; }
}
async function workAction() {
  if (workActionBusy || pendingClockOut || !requireSetup() || isAbsent(calendarPolicy(state,workContextKey(now())))) return;
  const stamp = now(), shift = activeShift(state, stamp), key = workContextKey(stamp), day = state.days[key];
  if (shift) {
    if (needsOvertimeDecision(state, stamp)) {
      pendingClockOut = { stamp, key: shift.key, start: shift.session.start };
      $('overtime-fee-form').hidden = true; $('overtime-choice').hidden = false; $('overtime-fee-form').reset(); text('overtime-fee-error', '');
      text('overtime-fee-duration', `本班次累计加班 ${duration(dayStats(state, shift.key, stamp).overtime)}，填写本次下班的加班费。`);
      $('overtime-fee-dialog').showModal(); return;
    }
    await finishClockOut(stamp); return;
  }
  workActionBusy = true;
  try { if (day?.sessions.length) resumeWork(state, key, stamp); else startWork(state, stamp); await persist(); render(); renderLists(); }
  catch (error) { toast(error.message); }
  finally { workActionBusy = false; }
}
async function settlePendingOvertime(kind, amount) {
  const pending = pendingClockOut; if (!pending || workActionBusy) return;
  const shift = activeShift(state, now());
  if (!shift || shift.key !== pending.key || shift.session.start !== pending.start) { text('overtime-fee-error', '班次已变化，请关闭后重新点击下班。'); return; }
  if (!Number.isFinite(amount) || amount < 0 || amount > 1e9 || (kind === 'paid' && amount <= 0)) { text('overtime-fee-error', '请填写大于 0、至多 10 亿的本次加班费'); return; }
  pendingClockOut = null; $('overtime-fee-dialog').close(); await finishClockOut(pending.stamp, { kind, amount });
}
function latestSummary() { return Object.values(state.days).map(day => day.summary).filter(Boolean).sort((a, b) => b.clockOutAt - a.clockOutAt)[0]; }
function openStartCorrection(key) { timeEditor.open(key); }
function renderCalendar() {
  calendarMonth ??= dateKey(new Date(now())).slice(0, 7);
  const [year, month] = calendarMonth.split('-').map(Number); text('calendar-month', `${year} 年 ${month} 月`);
  const dates = datesInMonth(`${calendarMonth}-01`), today = dateKey(new Date(now()));
  text('calendar-tracking-note', `原记录起点 ${state.trackingStart} · 空白历史补录须核对当日排班、工资和时段；固定负担不向前扩散。`);
  const signature = JSON.stringify([calendarMonth,state.display,dates.map(key=>{const i=calendarInfo(state,key,now());return [i,dayStats(state,key,now()).net];})]);
  if (signature === calendarSignature) return; calendarSignature=signature;
  $('calendar-grid').replaceChildren();const padding=(new Date(`${calendarMonth}-01T00:00:00`).getDay()+6)%7;
  for(let i=0;i<padding;i++){const blank=document.createElement('span');blank.className='calendar-blank';$('calendar-grid').append(blank);}
  for(const key of dates){
    const info=calendarInfo(state,key,now()),button=document.createElement('button'),num=document.createElement('span'),label=document.createElement('small');
    button.className=`calendar-day ${info.status}${key===today?' today':''}`;button.dataset.calendarDate=key;num.textContent=String(Number(key.slice(-2)));label.textContent=info.future ? {work:'上班',rest:'休息',overtime:'休息日加班',leave:'请假',swap:'调休'}[info.kind] : {ontime:'准时',early:'提前',late:'加班',working:'进行中',leave:'请假',swap:'调休'}[info.status] ?? (info.kind==='rest'?'休息':'未记录');button.append(num,label);button.disabled=!info.editable;
    let aria=`${key} ${info.label}${info.editable?'':` 早于记录起点 ${state.trackingStart}，只读`}`;
    if(info.profit!==null){const stats=dayStats(state,key,now()),value=document.createElement('b');value.className=`calendar-net ${state.display==='hidden'?'private':stats.net<0?'loss':stats.net===0?'zero':'gain'}`;value.textContent=money(stats.net).replace('¥','');value.title=`当日净利润 ${money(stats.net)}`;button.append(value);aria+=` 净利润 ${money(stats.net)}`;}
    const hasIncome=!info.future&&(state.extraIncomes??[]).some(entry=>entry.date===key);
    if(hasIncome){const badge=document.createElement('small'),amount=dayStats(state,key,now()).extraIncome;badge.className='calendar-extra-income';badge.textContent=amount>0?(state.display==='hidden'?'有意外之财':`＋${money(amount)}`):'收入已撤销';button.append(badge);aria+=amount>0?' · 有意外之财':' · 收入已撤销';}
    button.setAttribute('aria-label',aria);button.addEventListener('click',()=>{calendarDetailKey=key;if(info.future||!info.recorded&&!hasIncome){calendarEditor.open(key);return;}renderCalendarDetail(key);$('calendar-detail-dialog').showModal();});$('calendar-grid').append(button);
  }
}
function renderCalendarDetail(key) {
  const day=state.days[key],info=calendarInfo(state,key,now()),stats=dayStats(state,key,now());
  const start=day?.sessions.length?Math.min(...day.sessions.map(v=>v.start)):null,end=day?.sessions.length?Math.max(...day.sessions.map(v=>v.end??v.start)):null;
  const format=stamp=>stamp===null?'未记录':new Date(stamp).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
  text('calendar-detail-title',`${key} 的一天`);text('calendar-detail-plan',`${stats.settings.start}–${stats.settings.end}${stats.settings.lunch?` · 午休 ${stats.settings.lunchStart}–${stats.settings.lunchEnd}`:''}`);text('calendar-detail-status',info.label);text('calendar-detail-start',format(start));text('calendar-detail-end',activeSession(state,key,now())?'尚未点击下班':format(end));
  for(const field of ['earned','expenses','fixed','net'])text(`calendar-detail-${field}`,money(stats[field]));
  text('calendar-detail-wages',money(stats.wageEarned));text('calendar-detail-extra',money(stats.extraIncome));text('calendar-edit-day',info.recorded?'修改':'补记或调整上班');
  text('calendar-detail-overtime-pay',money(stats.overtimePay));text('calendar-detail-fish',duration(stats.fish));text('calendar-detail-overtime',duration(stats.overtime));text('calendar-detail-hourly',stats.hourly===null?'—':`${money(stats.hourly)} / 小时`);
  text('calendar-detail-actual',duration(stats.actual));text('calendar-detail-secondly',stats.secondly===null?'—':`${money(stats.secondly)} / 秒${state.display!=='hidden'&&stats.secondly>0&&stats.secondly<0.01?'（实际速率低于 ¥0.01/秒）':''}`);
  $('calendar-rework').hidden=isAbsent(info.policy)||!!activeShift(state,now())||latestSummary()?.date!==key;
  text('calendar-detail-snapshot',(day?.automaticAttendance?'含按排班自动生成的记录，请按实际情况核对。':'')+(isAbsent(info.policy)?'原始时段与加班费记录保留，当前按休息 / 请假 / 调休处理。':`该日排班 ${stats.settings.start}–${stats.settings.end}。修改上下班或单日类型前先预览影响。`));
}
function moveCalendar(delta) { const date = new Date(`${calendarMonth}-01T00:00:00`); date.setMonth(date.getMonth() + delta); if (date.getFullYear() < 1000 || date.getFullYear() > 9999) return; calendarMonth = dateKey(date).slice(0, 7); renderCalendar(); }
function showMonthlyReport(report) {
  const hours = ms => `${(ms / 3600000).toFixed(2)} 小时`;
  const weekly=report.period==='week',scope=weekly?'本周':'本月';$('report-title').textContent=`窝囊费${weekly?'周报':'月报'}`;$('report-period').value=weekly?'week':'month';$('report-month-label').hidden=weekly;$('report-week-label').hidden=!weekly;$('report-week').max=dateKey(new Date(now()));if(weekly)$('report-week').value=report.from;for(const [id,label]of [['report-earned-label',`${scope}总收入`],['report-daily-label',`${scope}净平均日薪`],['report-hourly-label',`${scope}净平均时薪`],['report-secondly-label',`${scope}净平均秒薪`]])text(id,label);
  $('report-month').value = report.month??dateKey(new Date(now())).slice(0,7); $('report-month').max = dateKey(new Date(now())).slice(0, 7);
  text('report-status', report.provisional ? '阶段回顾 · 进行中' : weekly?'已结束周次':'已结束月份');
  text('report-cutoff', `统计截至 ${new Date(report.asOf).toLocaleString('zh-CN', { hour12: false })} · 按现有记录汇总${report.recalculatedAt ? ' · 已按修正记录重算' : ''}`);
  text('report-wages',money(report.wageEarned??report.earned-(report.extraIncome??0)));text('report-extra',money(report.extraIncome??0));
  text('report-earned', money(report.earned)); text('report-costs', money(report.costs)); text('report-net', money(report.net));
  text('report-cost-detail', `临时花销 ${money(report.expenses)} + 固定分摊 ${money(report.fixed)}`);
  text('report-worked', hours(report.worked)); text('report-actual', hours(report.actual)); text('report-hourly', report.hourly === null ? '—' : `${money(report.hourly)} / 小时`);
  text('report-daily',report.averageDaily==null?'—':`${money(report.averageDaily)} / 天`);text('report-secondly',report.secondly==null?'—':`${money(report.secondly)} / 秒${state.display!=='hidden'&&report.secondly!==0&&Math.abs(report.secondly)<0.01?(report.secondly<0?'（净亏低于 ¥0.01/秒）':'（实际速率低于 ¥0.01/秒）'):''}`);
  text('report-ontime', `准时下班 ${report.ontimeDays} 天`); text('report-late', `加班下班 ${report.lateDays} 天`); text('report-early', `提前下班 ${report.earlyDays} 天`);
  text('report-overtime', `共加班 ${hours(report.overtime)}。`);
  const fishReport = report.fishEarned === undefined ? (weekly ? weeklyReport(state, report.from, report.asOf) : monthlyReport(state, report.month, report.asOf)) : report;
  text('report-fish-recap', fishRecap(scope, fishReport.fish, fishReport.fishEarned, money));
  text('report-fish-note', fishEarningsNote);
  text('report-absence', `请假 ${report.leaveDays ?? 0} 天 · 调休 ${report.swapDays ?? 0} 天；不计实际工作工时。均薪用净收入计算。`);
  text('report-active', report.activeDays ? `已记录 ${report.recorded} 天，另有 ${report.activeDays} 个班次尚未下班；进行中的班次未算入已下班天数。` : `已记录 ${report.recorded} 天。未记录的日期留白，不替你补满勤。`);
  const c=report.comparison;for(const [field,label]of [['averageDaily','日薪'],['hourly','时薪'],['secondly','秒薪']]){if(c)paintChange($(`report-compare-${field}`),[{label,before:c.baseline[field],after:c.actual[field]}],{state:()=>state,money});else text(`report-compare-${field}`,'无数据');}
  const tones=c?['averageDaily','hourly','secondly'].map(field=>changeMeaning(c.baseline[field],c.actual[field],{hidden:state.display==='hidden'}).tone):['unknown'];const movements=new Set(tones.filter(t=>t==='improved'||t==='worsened'));document.querySelector('.report-overtime-comparison').dataset.changeTone=state.display==='hidden'?'hidden':movements.size>1?'mixed':movements.size?[...movements][0]:tones.every(t=>t==='same')?'same':'unknown';
  text('report-compare-note',c?`同一期间，假设没有加班 → 实际。去掉 ${hours(report.overtime)} 加班及对应加班费 ${money(report.overtimePay)}，其余收入、成本相同。${report.fish>0?'摸鱼按正常／加班工时比例分配，仅用于此对比。':''}`:'');
  text('report-compare-range',weekly?`${report.from} — ${report.through}`:report.month);
  if (!$('monthly-dialog').open) $('monthly-dialog').showModal();
}
function openWeeklyReport(key){try{showMonthlyReport(weeklyReport(state,key,now()));}catch(error){toast(error.message);}}
function openMonthlyReport(month) { try { if (month > dateKey(new Date(now())).slice(0, 7)) throw Error('这个月还没到，先把今天过完。'); const report = monthlyReport(state, month, now()); saveMonthlyReview(state, report); persist(); showMonthlyReport(report); } catch (error) { toast(error.message); } }
function openExpense(category) {
  if (!requireSetup()) return;
  $('expense-form').reset(); $('expense-category').value = category; $('expense-name').value = category === '自定义' ? '' : category;
  $('expense-date').value = dateKey(new Date(now())); $('expense-date').max = dateKey(new Date(now())); $('expense-date').min = recordingStart(state);
  $('expense-month').value = dateKey(new Date(now())).slice(0, 7); $('expense-month').max = dateKey(new Date(now())).slice(0, 7); $('expense-month').min = recordingStart(state).slice(0, 7); syncExpenseScope(); text('expense-error', ''); $('expense-dialog').showModal(); $('expense-amount').focus();
}
function syncExpenseScope() {
  const custom = $('expense-category').value === '自定义'; $('expense-scope-label').hidden = !custom;
  const commute = $('expense-category').value === '通勤';
  $('expense-amount-help').hidden = !commute;
  text('expense-amount-help', commute ? '临时通勤填这次的花费。每天来回费用固定，可设为每日重复，例如一天合计 ¥8.00。' : '');
  if (!custom) $('expense-scope').value = 'day';
  const monthly = custom && $('expense-scope').value === 'month';
  $('expense-date-label').hidden = monthly; $('expense-date').required = !monthly; $('expense-month-label').hidden = !monthly; $('expense-month').required = monthly; $('expense-scope-note').hidden = !monthly;
  if (monthly && $('expense-month').value) { const dates = datesInMonth(`${$('expense-month').value}-01`).filter(key => isWorkday(key, state.settings)); const amount = Number($('expense-amount').value); text('expense-scope-note', `${dates.length} 个考勤工作日${amount > 0 ? `，每日 ${money(dates.length ? amount / dates.length : 0)}` : ''}。整月计划含已过去日期，只累计已过工作日；保存后冻结考勤，不延续下个月。${dates.length ? '' : '当前没有工作日，无法保存整月分摊。'}`); }
}
async function toggleMini() {
  try { mini = !mini; if (!api) throw Error('迷你窗口需要桌面版'); const result = await api.windowMode(mini); mini = result.mini; document.body.classList.toggle('mini-mode', mini); syncLive(); }
  catch (e) { mini = document.body.classList.contains('mini-mode'); toast(e.message); }
}
async function togglePin() {
  try { if (!api) throw Error('置顶需要桌面版'); pinned = await api.pin(!pinned); for (const id of ['pin', 'mini-pin']) $(id).setAttribute('aria-pressed', String(pinned)); }
  catch (e) { toast(e.message); }
}
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
document.querySelectorAll('[data-expense]').forEach(b => b.addEventListener('click', () => openExpense(b.dataset.expense)));
const calendarContext = { state:()=>state, now, money, duration, toast, ask, editDailyCosts:key=>dailyFixedEditor.open(key), editArrangement:key=>calendarEditor.open(key),commit:async(next,baseline)=>{
  await saveTail.catch(()=>{}); if(JSON.stringify(state)!==baseline)throw Error('记录已变化，请重新预览后保存');
  const revision=++saveRevision;text('save-status','正在保存…');let failure;
  saveTail=saveTail.catch(()=>{}).then(async()=>{if(!api)throw Error('本地保存不可用');await api.save(next);state=next;if(revision===saveRevision)text('save-status','已保存在本机');return true;}).catch(error=>{failure=error;text('save-status',`保存失败：${error.message}`);return false;});
  if(!await saveTail)throw failure;calendarSignature=null;render();renderLists();
}};
calendarEditor=createCalendarEditor(calendarContext);timeEditor=createTimeEditor(calendarContext);dailyFixedEditor=createDailyFixedEditor(calendarContext);extraIncomeUI=createExtraIncomeUI({...calendarContext,workDate:()=>workContextKey(now())});
salaryEditor=createSalaryEditor({...calendarContext,clockInEnabled:()=>$('clock-in-reminder-enabled').checked,automaticEnabled:()=>$('automatic-attendance-enabled').checked,saved:message=>{populateSettings();text('settings-feedback',message);toast(message);void maybeAutomaticAttendance();}});
$('salary-date-edit').addEventListener('click',()=>{try{if(!$('settings-form').reportValidity())return;salaryEditor.open(readSettingsForm(),$('reminder-enabled').checked);}catch(error){text('settings-feedback',error.message);}});
$('salary-date-undo').addEventListener('click',()=>salaryEditor.open(state.settings,state.reminder.enabled,true));
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => $(b.dataset.close).close()));
$('confirm-cancel').addEventListener('click', () => { $('confirm-dialog').close(); confirmAction = null; });
$('confirm-ok').addEventListener('click', () => { const fn = confirmAction; confirmAction = null; $('confirm-dialog').close(); fn?.(); });
for (const id of ['display-mode', 'mini-display']) $(id).addEventListener('change', e => mutate(() => { state.display = e.target.value; }));
for (const id of ['work-toggle', 'mini-work']) $(id).addEventListener('click', event => { if (event.detail < 2) workAction(); });
$('overtime-free').addEventListener('click', () => settlePendingOvertime('free', 0));
$('overtime-paid').addEventListener('click', () => { $('overtime-choice').hidden = true; $('overtime-fee-form').hidden = false; $('overtime-fee-amount').focus(); });
$('overtime-fee-form').addEventListener('submit', event => { event.preventDefault(); settlePendingOvertime('paid', Number($('overtime-fee-amount').value)); });
$('overtime-fee-dialog').addEventListener('close', () => { pendingClockOut = null; });
for (const id of ['fish-toggle', 'mini-fish']) $(id).addEventListener('click', openBreak);
$('view-breaks').addEventListener('click', () => { renderBreakList(); $('break-list-dialog').showModal(); });
$('show-summary').addEventListener('click', () => showSummary(latestSummary()));
$('correct-start').addEventListener('click', () => openStartCorrection(workContextKey(now())));
$('calendar-edit-day').addEventListener('click', () => {if(calendarInfo(state,calendarDetailKey,now()).recorded)timeEditor.open(calendarDetailKey,{details:true});else{$('calendar-detail-dialog').close();calendarEditor.open(calendarDetailKey);}});
document.querySelectorAll('[data-extra-income]').forEach(button=>button.addEventListener('click',()=>{if(requireSetup())extraIncomeUI.open(undefined,undefined,button.dataset.extraIncome);}));$('view-extra-income').addEventListener('click',()=>extraIncomeUI.openList());$('calendar-view-extra-income').addEventListener('click',()=>{$('calendar-detail-dialog').close();extraIncomeUI.openList(calendarDetailKey);});
$('calendar-detail-daily-fixed').addEventListener('click',()=>{$('calendar-detail-dialog').close();dailyFixedEditor.open(calendarDetailKey);});
$('calendar-rework').addEventListener('click', () => { try { resumeWork(state, calendarDetailKey, now()); persist(); $('calendar-detail-dialog').close(); $('calendar-dialog').close(); render(); } catch (error) { toast(error.message); } });
$('collapse-to-tray').addEventListener('click', async () => { if (!requireSetup()) return; try { await saveTail; await api.collapseToTray(structuredClone(state)); } catch (error) { toast(error.message); } });
$('tray-expense').addEventListener('click', () => openExpense('自定义'));
api?.onPresentation(mode => { const compact = mode === 'tray'; mini = compact; document.body.classList.toggle('mini-mode', compact); document.body.classList.toggle('tray-detail-mode', compact); render(); });
api?.onAction(action => { if ($('correction-dialog').open || pendingClockOut) { toast('请先完成或取消当前操作。'); return; } if (action === 'expense') openExpense('自定义'); else if (action === 'break') openBreak(); else if (action === 'clockout') { if (activeShift(state, now())) workAction(); else showSummary(latestSummary()); } });
$('open-calendar').addEventListener('click', () => { renderCalendar(); $('calendar-dialog').showModal(); });
$('calendar-prev').addEventListener('click', () => moveCalendar(-1)); $('calendar-next').addEventListener('click', () => moveCalendar(1));
$('calendar-report').addEventListener('click', () => openMonthlyReport(calendarMonth));
$('report-period').addEventListener('change',e=>{if(e.target.value==='week')openWeeklyReport(dateKey(new Date(now())));else openMonthlyReport($('report-month').value);});
$('report-week').addEventListener('change',e=>{if(e.target.value)openWeeklyReport(e.target.value);});
$('report-month').addEventListener('change', e => { if (e.target.value) openMonthlyReport(e.target.value); });
$('break-kind').addEventListener('change', e => { const custom = e.target.value === '自定义'; $('break-custom-label').hidden = !custom; $('break-custom').required = custom; });
$('break-form').addEventListener('submit', e => { e.preventDefault(); try { const f = new FormData(e.currentTarget); addCurrentBreak(state, { minutes: Number(f.get('minutes')), name: f.get('kind') === '自定义' ? f.get('custom') : f.get('kind') }, now()); persist(); $('break-dialog').close(); render(); renderLists(); toast('摸鱼时间已记下，工资照常增长'); } catch (error) { text('break-error', error.message); updateBreakCapacity(); } });
for (const id of ['mini', 'expand']) $(id).addEventListener('click', toggleMini);
for (const id of ['pin', 'mini-pin']) $(id).addEventListener('click', togglePin);
for (const p of ['day', 'month']) $(`period-${p}`).addEventListener('click', () => { period = p; render(); });
$('purchase-amount').addEventListener('input', render);
$('expense-category').addEventListener('change', e => { $('expense-name').value = e.target.value === '自定义' ? '' : e.target.value; syncExpenseScope(); });
$('expense-scope').addEventListener('change', syncExpenseScope); $('expense-month').addEventListener('change', syncExpenseScope); $('expense-amount').addEventListener('input', syncExpenseScope);
$('expense-form').addEventListener('submit', e => { e.preventDefault(); try { const f = new FormData(e.currentTarget), scope = f.get('scope') === 'month' && f.get('category') === '自定义' ? 'month' : 'day'; addExpense(state, { name: f.get('name'), amount: Number(f.get('amount')), date: scope === 'month' ? `${f.get('month')}-01` : f.get('date'), month: scope === 'month' ? f.get('month') : undefined, scope, category: f.get('category') }); persist(); $('expense-dialog').close(); render(); renderLists(); toast('已记下这笔花销'); } catch (error) { text('expense-error', error.message); } });
function updateFixedForm() {
  const daily=$('fixed-period').value==='day';
  $('fixed-repeat-label').hidden=!daily;$('fixed-repeat').disabled=!daily;$('fixed-from-label').hidden=!daily;$('fixed-from').required=daily;
  text('fixed-amount-label',daily?'每天金额（元）':`${{month:'每月',quarter:'每季度',year:'每年'}[$('fixed-period').value]}金额（元）`);
  text('fixed-note',daily?($('fixed-repeat').value==='daily'?'从所选日期起每天自动记，包含休息日。':'从所选日期起，上班、补班和休息日加班计入；休息、请假、调休跳过。')+' 某天不同，可到小月历单独改。':{month:'从保存日起，把每月总额分到当月工作日。',quarter:'季度总额先除以 3 得到月均，再分到当月工作日。',year:'全年总额先除以 12 得到月均，再分到当月工作日。'}[$('fixed-period').value]);
  const commute=$('fixed-type').value==='固定通勤',period=$('fixed-period').value;
  const examples={month:'填整个月的总金额，例如每月房租 ¥2100.00。',quarter:'填整个季度的总金额，例如 ¥6300.00，相当于每月 ¥2100.00。',year:'填全年的总金额，例如 ¥25200.00，相当于每月 ¥2100.00。'};
  text('fixed-amount-help',daily?(commute?'填一天来回合计，例如去程 ¥4.00 + 回程 ¥4.00 = ¥8.00。':'填一天合计金额，例如每天餐费 ¥30.00；若掌握的是月总额，请选每月金额。'):commute?`填${{month:'整个月',quarter:'整个季度',year:'全年'}[period]}的通勤合计；每天花费固定，可选每日金额，按一天来回合计填写，例如 ¥8.00。`:examples[period]);
  $('fixed-amount').placeholder=`例如 ${daily?(commute?'8.00':'30.00'):{month:'2100.00',quarter:'6300.00',year:'25200.00'}[period]}`;
}
function openFixed() { if (!requireSetup()) return; $('fixed-form').reset();const today=dateKey(new Date(now()));$('fixed-from').value=today;$('fixed-from').min=today;updateFixedForm();text('fixed-error', ''); $('fixed-dialog').showModal(); }
$('fixed-period').addEventListener('change',updateFixedForm);$('fixed-repeat').addEventListener('change',updateFixedForm);
for (const id of ['add-fixed', 'quick-add-fixed']) $(id).addEventListener('click', openFixed);
$('fixed-type').addEventListener('change', e => { $('fixed-name').value = e.target.value === '自定义' ? '' : e.target.value; updateFixedForm(); });
$('fixed-form').addEventListener('submit',async e=>{
  e.preventDefault();if($('fixed-save').disabled)return;$('fixed-save').disabled=true;
  try {const f=new FormData(e.currentTarget),daily=f.get('period')==='day',key=daily?f.get('from'):dateKey(new Date(now()));if(daily&&key<dateKey(new Date(now())))throw Error('开始日期请选择今天或之后');
    const next=structuredClone(state),baseline=JSON.stringify(state);addFixed(next,{name:f.get('name'),amount:Number(f.get('amount')),period:f.get('period'),allocation:'workday',...(daily?{repeat:f.get('repeat')}:{})},key,now());settleGoal(next,now());validateState(next);await calendarContext.commit(next,baseline);$('fixed-dialog').close();toast(daily?'每日重复费用已保存':'固定负担已开始分摊');
  }catch(error){text('fixed-error',error.message);}finally{$('fixed-save').disabled=false;}
});
$('edit-goal').addEventListener('click', openGoalEditor);
$('goal-new').addEventListener('click', () => { $('goal-complete-dialog').close(); openGoalEditor(); });
document.querySelectorAll('input[name=amount],input[name=salary],#purchase-amount').forEach(input => input.addEventListener('blur', () => { if (input.value !== '' && Number.isFinite(Number(input.value))) input.value = Number(input.value).toFixed(2); }));
$('goal-form').addEventListener('submit', e => { e.preventDefault(); try { const f = new FormData(e.currentTarget); saveGoal(state, { name: f.get('name').trim(), amount: Number(f.get('amount')) }, now()); persist(); $('goal-dialog').close(); render(); toast('目标记好了，每天净赚都往里攒'); } catch (error) { text('goal-error', error.message); } });
$('settings-form').elements.lunch.addEventListener('change', updateLunchFields);
$('automatic-attendance-enabled').addEventListener('change',renderAutomaticAttendanceStatus);
$('settings-form').addEventListener('change', event => { if (['weekday', 'weekdayB', 'anchorWeek', 'anchorKind', 'payDaysMode'].includes(event.target.name)) syncPayDaysForm(); });
for (const name of ['salary', 'payDays']) $('settings-form').elements[name].addEventListener('input', syncPayDaysForm);
$('schedule-mode').addEventListener('change', () => {
  const form = $('settings-form'), mode = $('schedule-mode').value;
  document.querySelectorAll('#weekdays input').forEach(input => { input.checked = mode === 'everyday' || Number(input.value) >= 1 && Number(input.value) <= (['single', '996'].includes(mode) ? 6 : 5); });
  if (mode === '996') { form.elements.start.value = '09:00'; form.elements.end.value = '21:00'; }
  if (mode === 'alternating' && state.settings.scheduleMode !== 'alternating') form.elements.anchorKind.value = '';
  updateScheduleFields();
});
$('settings-form').addEventListener('submit',async event=>{event.preventDefault();try{
  const settings=readSettingsForm(),first=!state.onboarded,stamp=now(),today=dateKey(new Date(stamp)),enabled=$('reminder-enabled').checked;
  if(settings.payDaysMode==='auto')settings.payDays=plannedPayDays(today,settings);
  if(!first&&settings.salary!==salaryForDate(state,today)){salaryEditor.open(settings,enabled);return;}
  const next=structuredClone(state),baseline=JSON.stringify(state),result=saveSettings(next,settings,'today',stamp);
  next.onboarded=true;next.reminder??={enabled:false,enabledAt:null,delivered:{}};if(enabled&&!next.reminder.enabled)next.reminder.enabledAt=stamp;next.reminder.enabled=enabled;configureClockInReminder(next,$('clock-in-reminder-enabled').checked,stamp);configureAutomaticAttendance(next,$('automatic-attendance-enabled').checked,stamp);
  await calendarContext.commit(next,baseline);await maybeAutomaticAttendance();populateSettings();text('settings-feedback',first?`已保存，首次工资从 ${result.effectiveDate} 生效。`:'设置已保存。');
  if(first){showView('dashboard');toast('考勤和到手工资记好了，开始上班吧。');}
}catch(error){text('settings-feedback',error.message);}});
const aboutUI=createAboutUI({api,toast});
aboutUI.initialize();
$('export-data').addEventListener('click', async () => { try { await saveTail; const result = await api.exportData(structuredClone(state)); if (!result.canceled) toast('备份已保存到选择的位置'); } catch (e) { toast(e.message); } });
async function bootstrap() {
  try {
    const loaded = api ? await api.load() : { state: null };
    $('collapse-to-tray').hidden = loaded.platform !== 'darwin';
    if (!nativeVisibilityObserved) nativeVisible = loaded.nativeVisible !== false;
    state = loaded.state ?? emptyState();
    if (loaded.legacyModeRetired) toast('已返回个人记录，旧体验档案原样保留。');
    state.onboarded ??= Object.keys(state.days).length > 0;
    state.reminder ??= { enabled: false, enabledAt: null, delivered: {} };
    if (loaded.error) toast(`${loaded.error}，原文件已保留，当前更改无法覆盖它。`);
    const initial = JSON.stringify(state); const upgradedPayDays = migratePayDays(state, now()); migrateOvertimeExclusions(state,now()); settle(state, now());
    const upgradedGoal = migrateGoal(state, now());
    if (upgradedGoal) toast('目标已升级：保留名称和金额，从今天的净收入开始积累。');
    else if (upgradedPayDays) toast('计薪天数已按当月考勤计算，已记录日期保持原口径。');
    if (JSON.stringify(state) !== initial) persist();
    if (loaded.storage) text('storage-note', loaded.storage);
    populateSettings(); renderLists(); render();
    if (!state.onboarded) showView('settings');
    await maybeAutomaticAttendance();
    document.documentElement.dataset.ready = 'true';
    async function tick() {
      if(tickRunning)return;tickRunning=true;
      try {
      await maybeAutomaticAttendance();
      const before = JSON.stringify(state.days); settle(state, now());
      if (before !== JSON.stringify(state.days)) persist();
      if (isVisible()) render();
      await maybeClockInReminder();await maybeRemind();await maybeGoalCompletion();await maybeMonthlyReview();
      const nextKey = dateKey(new Date(now()));
      if (document.documentElement.dataset.day !== nextKey) { document.documentElement.dataset.day = nextKey; renderLists(); }
      if (currentView === 'settings' && payDaysFormMonth !== monthKey(nextKey)) syncPayDaysForm();
      } finally {tickRunning=false;housekeeper=setTimeout(tick,state.automaticAttendance?.enabled&&state.automaticAttendance.nextDate<dateKey(new Date(now()))?100:isVisible()?1000:30000);}
    }
    tickHousekeeper = tick;
    reducedMotion.addEventListener('change', () => { render(); syncLive(); });
    housekeeper = setTimeout(tick, isVisible() ? 1000 : 30000);
  } catch (error) { text('mode-copy', `无法打开本地记录：${error.message}`); }
  finally { $('loading-screen').hidden = true; document.body.classList.remove('is-loading'); }
}
bootstrap();
