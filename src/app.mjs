import { dateKey, at, emptyState, clockNow, getDay, activeSession, activeShift, settle, startWork, resumeWork, needsOvertimeDecision, clockOut, correctStartTime, breakDate, addCurrentBreak, deleteBreak, dueReminder, markReminderDelivered, attendanceStatus, datesInMonth, dayStats, monthStats, monthlyReport, dueMonthlyReview, saveMonthlyReview, migrateGoal, saveGoal, goalStats, settleGoal, dueGoalNotice, markGoalNotified, fixedItemForDate, addExpense, addFixed, convertLegacyFixed, expenseForDate, validateSettings, validateState, windows, ratePerMs, isWorkday, paidIntervals } from './model.mjs';
import { createTimestampTicker } from './live.mjs';
import { formatAmount, formatCurrency, belowCentPerSecond, roundedMoney } from './money.mjs';
import { formatWorkEquivalent } from './work-equivalent.mjs';
import { createHoldStepper } from './hold-stepper.mjs';
import { monthKey, plannedPayDays, payDaysModeForDate, migratePayDays, saveSettings, salaryForDate } from './model.mjs';

const $ = id => document.getElementById(id);
const api = window.workday;
let state, period = 'day', currentView = 'dashboard', mini = false, pinned = false, confirmAction, toastTimer;
let saveTail = Promise.resolve(), saveRevision = 0, liveSnapshot, housekeeper, nativeVisible = true, nativeVisibilityObserved = false, tickHousekeeper;
let checkingReminder = false, reminderRetryAfter = 0;
let calendarMonth, calendarDetailKey, calendarSignature;
let checkingMonthlyReview = false, monthlyRetryAfter = 0, queuedReminder, queuedMonthlyReview;
let correctionKey, correctionSaving = false, workActionBusy = false, pendingClockOut;
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
  const earned = paid.reduce((total, [a, b]) => total + b - a, 0) * rate + liveSnapshot.overtimePay;
  const monthEarned = monthBeforeToday + earned;
  const net = earned - costs;
  paintCharacter(net, false, liveSnapshot.overtime);
  const pool = goalBase + (goalIncludesDay ? earned : 0);
  const goal = goalPresentation(pool, goalStatus);
  const primary = state.display === 'goal' ? goal.value : number(state.display === 'month' ? monthEarned : net);
  amountText('hero-amount', primary);
  amountText('mini-amount', state.display === 'goal' ? primary : `¥${primary}`);
  text('sum-earned', money(period === 'day' ? earned : monthEarned));
  text('sum-net', money(period === 'day' ? net : monthEarned - monthCosts));
  text('tray-gross', money(earned)); text('tray-net', money(net));
  const current = dayStats(state, key, stamp), workedDays = liveSnapshot.monthWorkedDaysBefore + (current.worked > 0 ? 1 : 0);
  paintAverages(current, { earned: monthEarned, actual: liveSnapshot.monthActualBefore + current.actual, averageDaily: workedDays ? (monthEarned - monthCosts) / workedDays : null });
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
  const active = visible && !reducedMotion.matches && (mini || currentView === 'dashboard') && state.display !== 'hidden' && !!activeSession(state, key, stamp) && ratePerMs(key, s) > 0 && windows(key, s).some(([a, b]) => stamp >= a && stamp < b);
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
function ask(title, copy, action) { text('confirm-title', title); text('confirm-copy', copy); confirmAction = action; $('confirm-dialog').showModal(); }
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
  for (const name of ['dashboard', 'expenses', 'settings']) $(`${name}-view`).hidden = name !== view;
  document.querySelectorAll('nav [data-view]').forEach(button => { button.classList.toggle('active', button.dataset.view === view); if (button.dataset.view === view) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
  text('page-title', { dashboard: '上班不一定快乐，数字至少要动。', expenses: '花得明白，班才不白上。', settings: '先谈钱，再谈理想。' }[view]);
  if (view === 'settings') populateSettings();
  renderLists();
  syncLive();
  if ($('calendar-dialog').open) renderCalendar();
  if ($('calendar-detail-dialog').open) renderCalendarDetail(calendarDetailKey);
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
  form.elements.salaryFrom.value = salaryForDate(state, key) !== state.settings.salary ? 'tomorrow' : 'today';
  text('salary-effective-note', salaryForDate(state, key) !== state.settings.salary ? `已安排下次生效工资 ${money(state.settings.salary)}；今天仍按 ${money(salaryForDate(state, key))}。` : '今天生效会重算今天工资；明天生效保留今天记录。');
  payDaysFormMonth = monthKey(key);
  form.elements.payDaysMode.value = payDaysModeForDate(key, state.settings) === 'manual' ? 'manual' : 'auto';
  updateScheduleFields();
  updateLunchFields();
  $('reminder-enabled').checked = !!state.reminder?.enabled;
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
    text('pay-days-note', planned === 0 ? '本月没有计划工作日，请先勾选工作日。' : !Number.isFinite(days) || days <= 0 || days > 31 ? '手动计薪天数须大于 0 且不超过 31。' : `本月计划 ${planned} 个工作日 · 日薪 ${money(settings.salary / days)}。${automatic ? '按所选考勤逐月重算。' : '手动调整仅用于本月，下月恢复自动。'}`);
  } catch (error) {
    if (automatic) form.elements.payDays.value = '';
    text('pay-days-note', error.message);
  }
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
  return { value: `${(progress * 100).toFixed(1)}%`, progress, remaining, caption: done ? `目标已完成 · 余款池 ${money(pool)}` : `${state.goal.name} · 剩余 ${money(remaining)}` };
}
function paintGoal(pool, status) {
  const goal = goalPresentation(pool, status), hidden = state.display === 'hidden', done = status === 'done';
  text('goal-name', state.goal?.name ?? '给努力一个盼头');
  text('edit-goal', done ? '建立下个目标 ↗' : state.goal ? '修改目标 ↗' : '设置目标 ↗');
  text('goal-amounts', hidden ? '积累池金额已隐藏' : !state.goal ? '每天净赚，一点一点攒。' : done ? `余款池 ${yuan(pool)} · 已完成 ${yuan(state.goal.amount)}` : `积累池 ${yuan(pool)} / ${yuan(state.goal.amount)}`);
  text('goal-percent', hidden || !state.goal ? '—' : done ? '已完成' : `${(goal.progress * 100).toFixed(1)}%`);
  $('goal-progress').value = hidden ? 0 : Math.max(0, goal.progress * 100);
  text('goal-eta', hidden ? '每天净收入持续积累。' : !state.goal ? '不限时，工资减去成本；亏了也一起算。' : done ? '本目标金额已从池中扣除，余款留给下一个。' : `从 ${state.goalPool.from} 开始 · ${pool < 0 ? '亏空也得靠上班填。' : '不限时，慢慢攒。'}还差 ${yuan(goal.remaining)}。`);
}
function openGoalEditor() {
  const active = state.goal && state.goal.completedAt === null;
  $('goal-form').elements.amount.type = state.display === 'hidden' ? 'password' : 'number';
  $('goal-form').elements.name.value = active ? state.goal.name : '';
  $('goal-form').elements.amount.value = active ? state.goal.amount.toFixed(2) : '';
  text('goal-form-title', active ? '修改赚钱目标' : '给努力一个新目标');
  const stats = goalStats(state, now());
  text('goal-form-pool', state.goalPool ? `当前积累池 ${money(stats.pool)}，继续留给这个目标。` : '从设定当天开始，工资扣掉成本的净收入都放进池里。');
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
  const seconds = actual > 0 ? stats.earned / actual * 1000 : null, hourly = actual > 0 ? stats.earned / actual * 3600000 : null;
  text('hero-avg-second', seconds === null ? '—' : money(seconds)); text('hero-avg-hour', hourly === null ? '—' : money(hourly));
  $('hero-avg-day-group').hidden = state.display !== 'month';
  text('hero-avg-day', month.averageDaily === null ? '—' : money(month.averageDaily));
  text('hero-rate-note', state.display !== 'hidden' && belowCentPerSecond(seconds) ? '实际秒薪低于 ¥0.01' : '');
}
function render() {
  const stamp = now(), time = new Date(stamp), todayKey = dateKey(time), shift = activeShift(state, stamp), key = workContextKey(stamp), day = getDay(state, key), d = dayStats(state, key, stamp), m = monthStats(state, todayKey, stamp), g = goalStats(state, stamp);
  const running = !!shift, overtime = running && stamp >= at(key, d.settings.end), inPaid = windows(key, d.settings).some(([a, b]) => stamp >= a && stamp < b), isLunch = running && !inPaid && stamp >= at(key, d.settings.start) && !overtime;
  const status = running ? (overtime ? '加班中 · 工资已封顶' : isLunch ? '午休中 · 暂停计薪' : stamp < at(key, d.settings.start) ? '等待上班时间' : '正在上班') : day?.summary ? '已下班 · 辛苦了' : stamp >= at(key, d.settings.end) ? '今日排班已结束' : '尚未开始';
  const finished = !running && !!day?.summary, finishedOvertime = finished && d.overtime > 0;
  const countdown = overtime || finishedOvertime ? d.overtime : finished ? 0 : isWorkday(key, d.settings) ? Math.max(0, at(key, d.settings.end) - stamp) : 0;
  const hidden = state.display === 'hidden';
  paintCharacter(d.net, hidden, overtime);
  const goalIncludesDay = !!state.goalPool && key >= state.goalPool.from;
  liveSnapshot = { key, monthBeforeToday: m.earned - d.earned, rate: ratePerMs(key, d.settings), costs: d.expenses + d.fixed, monthCosts: m.expenses + m.fixed, goalBase: g.pool - (goalIncludesDay ? d.earned : 0), goalIncludesDay, goalStatus: g.status, overtimePay: d.overtimePay, overtime, monthActualBefore: m.actual - (key.slice(0,7) === todayKey.slice(0,7) ? d.actual : 0), monthWorkedDaysBefore: m.days.filter((day,index) => m.dates[index] !== key && day.worked > 0).length };
  document.body.classList.toggle('amounts-hidden', hidden);
  document.body.classList.toggle('net-uncovered', !hidden && state.display === 'today' && d.net < 0);
  $('display-mode').value = state.display; $('mini-display').value = state.display;
  const goalMode = state.display === 'goal';
  text('hero-prefix', hidden ? '' : goalMode ? '' : '¥');
  amountText('hero-amount', hidden ? '••••••' : goalMode ? goalPresentation(g.pool, g.status).value : number(state.display === 'month' ? m.earned : d.net));
  document.querySelector('.hero').classList.toggle('uncovered', !hidden && state.display === 'today' && d.net < 0);
  text('hero-caption', hidden ? '安心专注，金额已隐藏。' : goalMode ? goalPresentation(g.pool, g.status).caption : state.display === 'month' ? `本月工资毛收入 · ${m.workedDays} 个有工时日；净赚见明细。` : '已扣除今日花销与固定负担。');
  text('work-status', status); paintAverages(d, m);
  text('shift-label-text', overtime ? '已加班' : finishedOvertime ? '加班已结束' : finished ? '已下班' : '距离下班'); text('shift-end', isWorkday(key, d.settings) ? d.settings.end : '休息日'); text('countdown', duration(countdown));
  text('shift-percent', `${Math.min(100, d.elapsed / d.planned * 100).toFixed(1)}%`); $('shift-progress').value = Math.min(100, d.elapsed / d.planned * 100);
  text('shift-summary', overtime ? '加班这么久，领导肯定很器重你吧。' : `上班 ${d.settings.start} · ${d.settings.lunch ? `午休 ${d.settings.lunchStart}–${d.settings.lunchEnd}` : '不扣午休'}`);
  const afterShift = !!day?.sessions.length && stamp >= at(key, d.settings.end);
  const workLabel = running ? '下班，看看今天  ✓' : day?.sessions.length ? '起来加班  →' : '开始上班  →';
  text('work-toggle', workLabel); $('show-summary').hidden = !day?.summary;
  const firstStart = day?.sessions.length ? Math.min(...day.sessions.map(session => session.start)) : null;
  text('recorded-start', firstStart === null ? '今日上班 · 尚未记录' : `${key === todayKey ? '今日上班' : `${key.slice(5).replace('-', '/')} 上班`} ${timeText(firstStart)}`);
  $('correct-start').hidden = firstStart === null;
  const summary = period === 'day' ? d : m;
  text('sum-earned', money(summary.earned)); text('sum-expenses', money(summary.expenses)); text('sum-fixed', money(summary.fixed)); text('sum-net', money(summary.net));
  text('quick-total', money(d.expenses)); text('fixed-total', money(d.fixed));
  text('period-caption', period === 'day' ? key === todayKey ? '今日' : '本班次' : '本月');
  text('ledger-note', period === 'day' ? '固定负担为当日分摊；净赚 = 工资 − 花销 − 固定负担。' : `本月已记录 ${m.recorded} 天工资。固定负担累计至今日，无打卡日也按规则分摊。`);
  for (const p of ['day', 'month']) { $(`period-${p}`).classList.toggle('active', period === p); $(`period-${p}`).setAttribute('aria-pressed', String(period === p)); }
  const breakStats = period === 'day' ? d : m;
  text('fish-time', duration(breakStats.fish)); text('actual-time', duration(breakStats.actual)); text('fish-caption', `${period === 'day' ? '今日' : '本月'}已记录摸鱼 · 工资照常增长`);
  text('effective-hour', breakStats.hourly === null ? '—' : money(breakStats.hourly)); text('effective-second', breakStats.secondly === null ? '—' : money(breakStats.secondly));
  text('effective-rate-note', !hidden && belowCentPerSecond(breakStats.secondly) ? '实际有效秒薪低于 ¥0.01/秒；显示为 ¥0.00，内部仍保留精度。' : '');
  paintGoal(g.pool, g.status);
  const price = Number($('purchase-amount').value), rate = ratePerMs(key, d.settings);
  text('purchase-time', hidden ? '已隐藏' : formatWorkEquivalent(price, rate, d.planned));
  // Price itself is a money value and is concealed in privacy mode too.
  $('purchase-amount').type = hidden ? 'password' : 'number';
  amountText('mini-amount', hidden ? '••••••' : goalMode ? goalPresentation(g.pool, g.status).value : `¥${number(state.display === 'month' ? m.earned : d.net)}`);
  text('mini-time-label', overtime ? '已加班' : finishedOvertime ? '加班已结束' : finished ? '已下班' : '距下班'); text('mini-time-value', duration(countdown)); text('mini-time-status', status); $('mini-progress').value = d.elapsed / d.planned * 100;
  document.body.classList.toggle('overtime-mode', overtime); document.body.classList.toggle('overtime-ended', finishedOvertime);
  text('mini-work', running ? '下班' : day?.sessions.length ? '起来加班' : '开始上班');
  text('tray-gross', money(d.earned)); text('tray-costs', money(d.fixed + d.expenses)); text('tray-net', money(d.net));
  text('date-label', `${time.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })} · 本机时间`);
  $('mode-notice').hidden = !!state.onboarded;
  text('mode-copy', !state.onboarded ? '第一次见，先选考勤，输入到手工资。' : '按你的考勤和记录计算，班不能白上。');
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
  for (const item of active.slice(0, 3)) { const row = document.createElement('div'), name = document.createElement('span'), value = document.createElement('b'); row.className = 'overview-cost-row'; name.textContent = item.name; value.textContent = money(fixedItemForDate(item, key, item.settings)); row.append(name, value); $('fixed-overview-list').append(row); }
  if (!active.length) placeholder($('fixed-overview-list'), '添加一笔固定负担');
  for (const f of active) $('fixed-list').append(makeRow(f.name, `${{ month: '每月', quarter: '每季度', year: '每年' }[f.period]} ${state.display === 'hidden' ? '••••' : yuan(f.amount)} · ${f.allocation === 'calendar' ? '旧方案，保存考勤后从当日起切换' : '考勤工作日分摊'} · 今日 ${money(fixedItemForDate(f, key, f.settings))}`, f.amount, '停止', () => ask('停止分摊这项负担？', `「${f.name}」从今天起停止分摊，已经过日期的历史负担保留。`, () => mutate(() => { f.until = key; }))));
  if (!active.length) placeholder($('fixed-list'), '添加房租、房贷或车贷，把每日负担看清楚。');
  renderBreakList();
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
    const day = state.days[key], records = [...(day.breaks ?? [])].reverse();
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
  text('summary-title', { early: '今天提前下班。', ontime: '准时下班，刚刚好。', late: '加班啦，今天辛苦了。' }[summary.status]);
  text('summary-date', `${summary.date} 班次 · ${new Date(summary.clockOutAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })} 下班`);
  text('summary-earned', money(summary.earned)); text('summary-fish', duration(summary.fish)); text('summary-actual', duration(summary.actual));
  text('summary-overtime', duration(summary.overtime ?? 0)); text('summary-overtime-pay', money(summary.overtimePay ?? 0));
  text('summary-hourly', summary.hourly === null ? '不可计算' : `${money(summary.hourly)} / 小时`);
  text('summary-costs', money(summary.expenses + summary.fixed)); text('summary-net', money(summary.net));
  text('summary-note', `${summary.recalculatedAt ? '已按修正记录重算。' : ''}工资自动计到 ${summary.scheduledEnd}，加班费按下班记录另计；加班工时计入有效工时分母。`);
  $('summary-dialog').showModal();
}
async function finishClockOut(stamp, decision) {
  if (workActionBusy) return; workActionBusy = true;
  try { const summary = clockOut(state, stamp, decision); const saved = await persist(); render(); if (saved) showSummary(summary); else toast('下班记录保存失败，请保持窗口打开并重试保存。'); }
  catch (error) { toast(error.message); }
  finally { workActionBusy = false; }
}
async function workAction() {
  if (workActionBusy || pendingClockOut || !requireSetup()) return;
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
function correctionDraft() {
  return { date: correctionKey, sessionIndex: Number($('correction-session').value), start: at(dateKey(new Date(state.days[correctionKey].sessions[Number($('correction-session').value)].start)), $('correction-time').value) };
}
function previewCorrection() {
  text('correction-error', ''); $('correction-save').disabled = true; $('correction-preview').hidden = true;
  try {
    const preview = correctStartTime(structuredClone(state), correctionDraft(), now());
    for (const [id, stats] of [['before', preview.before], ['after', preview.after]]) {
      text(`correction-${id}-earned`, money(stats.earned)); text(`correction-${id}-worked`, duration(stats.worked));
    }
    const delta = preview.after.earned - preview.before.earned;
    text('correction-delta', state.display === 'hidden' ? '工资变化已隐藏' : `工资${delta < 0 ? '减少' : '增加'} ${yuan(Math.abs(delta))}`);
    $('correction-preview').hidden = false; $('correction-save').disabled = correctionSaving;
  } catch (error) { text('correction-error', error.message); }
}
function selectCorrectionSession() {
  const day = state.days[correctionKey], index = Number($('correction-session').value), session = day.sessions[index];
  const planned = at(correctionKey, day.settings.start);
  $('correction-time').value = timeText(index === 0 && session.start > planned ? planned : session.start);
  text('correction-original', `${dateKey(new Date(session.start))} 原记录 ${timeText(session.start)} → ${session.end === null ? '还在上班' : new Date(session.end).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}`);
  previewCorrection();
}
function openStartCorrection(key) {
  const day = state.days[key]; if (!day?.sessions.length) { toast('先有上班记录，才能修正时间。'); return; }
  correctionKey = key; $('correction-session').replaceChildren();
  for (const [index, session] of day.sessions.entries()) {
    const option = document.createElement('option'); option.value = index;
    option.textContent = `第 ${index + 1} 段 · ${timeText(session.start)} 起${session.end === null ? ' · 进行中' : ''}`; $('correction-session').append(option);
  }
  text('correction-date', `${key} 的上班记录`);
  text('correction-schedule', `当天排班 ${day.settings.start}–${day.settings.end}${day.settings.lunch ? `，午休 ${day.settings.lunchStart}–${day.settings.lunchEnd}` : '，不扣午休'}。`);
  const latest = day.startCorrections?.at(-1);
  text('correction-history', latest ? `上次修正：第 ${latest.sessionIndex + 1} 段 ${timeText(latest.from)} → ${timeText(latest.to)}。原时间保留在本地修正记录中。` : '忘了打卡，努力也不能白算。');
  selectCorrectionSession(); $('correction-dialog').showModal(); $('correction-time').focus();
}
async function submitStartCorrection(event) {
  event.preventDefault(); if (correctionSaving) return;
  let failureMessage;
  correctionSaving = true; $('correction-save').disabled = true;
  for (const id of ['correction-close', 'correction-cancel', 'correction-session', 'correction-time']) $(id).disabled = true;
  try {
    await saveTail.catch(() => {});
    const next = structuredClone(state), result = correctStartTime(next, correctionDraft(), now());
    settleGoal(next, now());
    if (!result.changed) { $('correction-dialog').close(); toast('上班时间没有变化'); return; }
    // The dialog is modal: commit the candidate only after its queued disk write succeeds.
    const revision = ++saveRevision; text('save-status', '正在保存…');
    let saveError;
    saveTail = saveTail.catch(() => {}).then(async () => {
      if (!api) throw Error('请通过桌面应用运行，以便保存数据');
      await api.save(next);
      state = next; if (revision === saveRevision) text('save-status', '已保存在本机'); return true;
    }).catch(error => { text('save-status', `保存失败：${error.message}`); saveError = error; return false; });
    if (!await saveTail) throw saveError;
    calendarSignature = null; $('correction-dialog').close(); render(); renderLists();
    toast('上班时间已修正，工资和工时重新算好了');
  } catch (error) { failureMessage = `修正未保存完成：${error.message}。请保持窗口打开并重试。`; }
  finally {
    correctionSaving = false;
    for (const id of ['correction-close', 'correction-cancel', 'correction-session', 'correction-time']) $(id).disabled = false;
    if ($('correction-dialog').open) previewCorrection();
    else $('correction-save').disabled = false;
    if (failureMessage) text('correction-error', failureMessage);
  }
}
function renderCalendar() {
  calendarMonth ??= dateKey(new Date(now())).slice(0, 7);
  const [year, month] = calendarMonth.split('-').map(Number); text('calendar-month', `${year} 年 ${month} 月`);
  const signature = `${calendarMonth}:${JSON.stringify(datesInMonth(`${calendarMonth}-01`).map(key => attendanceStatus(state, key, now())))}`;
  if (signature === calendarSignature) return;
  calendarSignature = signature;
  $('calendar-grid').replaceChildren();
  const dates = datesInMonth(`${calendarMonth}-01`), padding = (new Date(`${calendarMonth}-01T00:00:00`).getDay() + 6) % 7;
  for (let i = 0; i < padding; i++) { const blank = document.createElement('span'); blank.className = 'calendar-blank'; $('calendar-grid').append(blank); }
  for (const key of dates) {
    const status = attendanceStatus(state, key, now()), button = document.createElement('button'), num = document.createElement('span'), label = document.createElement('small');
    button.className = `calendar-day ${status?.status ?? 'empty'}`; button.dataset.calendarDate = key; num.textContent = String(Number(key.slice(-2))); label.textContent = status?.label ?? ''; button.append(num, label);
    button.disabled = !status; button.setAttribute('aria-label', `${key} ${status?.label ?? '没有上班记录'}`);
    if (status) button.addEventListener('click', () => { calendarDetailKey = key; renderCalendarDetail(key); $('calendar-detail-dialog').showModal(); });
    $('calendar-grid').append(button);
  }
}
function renderCalendarDetail(key) {
  const day = state.days[key]; if (!day?.sessions.length) return;
  const stats = dayStats(state, key, now()), status = attendanceStatus(state, key, now());
  const start = Math.min(...day.sessions.map(session => session.start)), open = !!activeSession(state, key, now()), end = Math.max(...day.sessions.map(session => session.end ?? session.start));
  const format = stamp => new Date(stamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  text('calendar-detail-title', `${key} 的一天`); text('calendar-detail-status', status.label);
  text('calendar-detail-start', format(start)); text('calendar-detail-end', open ? '尚未点击下班' : format(end));
  for (const field of ['earned', 'expenses', 'fixed', 'net']) text(`calendar-detail-${field}`, money(stats[field]));
  text('calendar-detail-overtime-pay', money(stats.overtimePay));
  $('calendar-rework').hidden = !!activeShift(state, now()) || latestSummary()?.date !== key;
  text('calendar-detail-fish', duration(stats.fish)); text('calendar-detail-overtime', duration(stats.overtime)); text('calendar-detail-hourly', stats.hourly === null ? '不可计算' : `${money(stats.hourly)} / 小时`);
  text('calendar-detail-snapshot', day.summary ? `${day.summary.recalculatedAt ? '修正后重算的下班净额' : '下班时保存的净额快照'}：${money(day.summary.net)}。当天排班 ${day.settings.start}–${day.settings.end}。` : `该日没有保存下班总结快照。当天排班 ${day.settings.start}–${day.settings.end}。`);
}
function moveCalendar(delta) { const date = new Date(`${calendarMonth}-01T00:00:00`); date.setMonth(date.getMonth() + delta); if (date.getFullYear() < 1000 || date.getFullYear() > 9999) return; calendarMonth = dateKey(date).slice(0, 7); renderCalendar(); }
function showMonthlyReport(report) {
  const hours = ms => `${(ms / 3600000).toFixed(2)} 小时`;
  $('report-month').value = report.month; $('report-month').max = dateKey(new Date(now())).slice(0, 7);
  text('report-status', report.provisional ? '阶段回顾 · 进行中' : '已结束月份');
  text('report-cutoff', `统计截至 ${new Date(report.asOf).toLocaleString('zh-CN', { hour12: false })} · 按现有记录汇总${report.recalculatedAt ? ' · 已按修正记录重算' : ''}`);
  text('report-earned', money(report.earned)); text('report-costs', money(report.costs)); text('report-net', money(report.net));
  text('report-cost-detail', `临时花销 ${money(report.expenses)} + 固定分摊 ${money(report.fixed)}`);
  text('report-worked', hours(report.worked)); text('report-actual', hours(report.actual)); text('report-hourly', report.hourly === null ? '不可计算' : `${money(report.hourly)} / 小时`);
  text('report-ontime', `准时下班 ${report.ontimeDays} 天`); text('report-late', `加班下班 ${report.lateDays} 天`); text('report-early', `提前下班 ${report.earlyDays} 天`);
  text('report-overtime', `共加班 ${hours(report.overtime)}，摸鱼 ${hours(report.fish)}。`);
  text('report-active', report.activeDays ? `已记录 ${report.recorded} 天，另有 ${report.activeDays} 个班次尚未下班；进行中的班次未算入已下班天数。` : `已记录 ${report.recorded} 天。未记录的日期留白，不替你补满勤。`);
  if (!$('monthly-dialog').open) $('monthly-dialog').showModal();
}
function openMonthlyReport(month) { try { if (month > dateKey(new Date(now())).slice(0, 7)) throw Error('这个月还没到，先把今天过完。'); const report = monthlyReport(state, month, now()); saveMonthlyReview(state, report); persist(); showMonthlyReport(report); } catch (error) { toast(error.message); } }
function openExpense(category) {
  if (!requireSetup()) return;
  $('expense-form').reset(); $('expense-category').value = category; $('expense-name').value = category === '自定义' ? '' : category;
  $('expense-date').value = dateKey(new Date(now())); $('expense-date').max = dateKey(new Date(now())); $('expense-date').min = state.trackingStart;
  $('expense-month').value = dateKey(new Date(now())).slice(0, 7); $('expense-month').max = dateKey(new Date(now())).slice(0, 7); $('expense-month').min = state.trackingStart.slice(0, 7); syncExpenseScope(); text('expense-error', ''); $('expense-dialog').showModal(); $('expense-amount').focus();
}
function syncExpenseScope() {
  const custom = $('expense-category').value === '自定义'; $('expense-scope-label').hidden = !custom;
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
$('calendar-correct-start').addEventListener('click', () => openStartCorrection(calendarDetailKey));
$('calendar-rework').addEventListener('click', () => { try { resumeWork(state, calendarDetailKey, now()); persist(); $('calendar-detail-dialog').close(); $('calendar-dialog').close(); render(); } catch (error) { toast(error.message); } });
$('correction-session').addEventListener('change', selectCorrectionSession);
$('correction-time').addEventListener('input', previewCorrection);
$('correction-form').addEventListener('submit', submitStartCorrection);
$('correction-dialog').addEventListener('cancel', event => { if (correctionSaving) event.preventDefault(); });
$('collapse-to-tray').addEventListener('click', async () => { if (!requireSetup()) return; try { await saveTail; await api.collapseToTray(structuredClone(state)); } catch (error) { toast(error.message); } });
$('tray-expense').addEventListener('click', () => openExpense('自定义'));
api?.onPresentation(mode => { const compact = mode === 'tray'; mini = compact; document.body.classList.toggle('mini-mode', compact); document.body.classList.toggle('tray-detail-mode', compact); render(); });
api?.onAction(action => { if (correctionSaving || pendingClockOut) { toast('请先完成或取消当前操作。'); return; } if (action === 'expense') openExpense('自定义'); else if (action === 'break') openBreak(); else if (action === 'clockout') { if (activeShift(state, now())) workAction(); else showSummary(latestSummary()); } });
$('open-calendar').addEventListener('click', () => { renderCalendar(); $('calendar-dialog').showModal(); });
$('calendar-prev').addEventListener('click', () => moveCalendar(-1)); $('calendar-next').addEventListener('click', () => moveCalendar(1));
$('calendar-report').addEventListener('click', () => openMonthlyReport(calendarMonth));
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
function openFixed() { if (!requireSetup()) return; $('fixed-form').reset(); text('fixed-error', ''); $('fixed-dialog').showModal(); }
for (const id of ['add-fixed', 'quick-add-fixed']) $(id).addEventListener('click', openFixed);
$('fixed-type').addEventListener('change', e => { $('fixed-name').value = e.target.value === '自定义' ? '' : e.target.value; });
$('fixed-form').addEventListener('submit', e => { e.preventDefault(); try { const f = new FormData(e.currentTarget); addFixed(state, { name: f.get('name'), amount: Number(f.get('amount')), period: f.get('period'), allocation: f.get('allocation') }, dateKey(new Date(now()))); persist(); $('fixed-dialog').close(); render(); renderLists(); toast('固定负担已开始分摊'); } catch (error) { text('fixed-error', error.message); } });
$('edit-goal').addEventListener('click', openGoalEditor);
$('goal-new').addEventListener('click', () => { $('goal-complete-dialog').close(); openGoalEditor(); });
document.querySelectorAll('input[name=amount],input[name=salary],#purchase-amount').forEach(input => input.addEventListener('blur', () => { if (input.value !== '' && Number.isFinite(Number(input.value))) input.value = Number(input.value).toFixed(2); }));
$('goal-form').addEventListener('submit', e => { e.preventDefault(); try { const f = new FormData(e.currentTarget); saveGoal(state, { name: f.get('name').trim(), amount: Number(f.get('amount')) }, now()); persist(); $('goal-dialog').close(); render(); toast('目标记好了，每天净赚都往里攒'); } catch (error) { text('goal-error', error.message); } });
$('settings-form').elements.lunch.addEventListener('change', updateLunchFields);
$('settings-form').addEventListener('change', event => { if (['weekday', 'weekdayB', 'anchorWeek', 'anchorKind', 'payDaysMode'].includes(event.target.name)) syncPayDaysForm(); });
for (const name of ['salary', 'payDays']) $('settings-form').elements[name].addEventListener('input', syncPayDaysForm);
$('schedule-mode').addEventListener('change', () => {
  const form = $('settings-form'), mode = $('schedule-mode').value;
  document.querySelectorAll('#weekdays input').forEach(input => { input.checked = mode === 'everyday' || Number(input.value) >= 1 && Number(input.value) <= (['single', '996'].includes(mode) ? 6 : 5); });
  if (mode === '996') { form.elements.start.value = '09:00'; form.elements.end.value = '21:00'; }
  if (mode === 'alternating' && state.settings.scheduleMode !== 'alternating') form.elements.anchorKind.value = '';
  updateScheduleFields();
});
$('settings-form').addEventListener('submit', async e => { e.preventDefault(); try {
  const f = new FormData(e.currentTarget), s = readSettingsForm(), first = !state.onboarded;
  if (s.payDaysMode === 'auto') s.payDays = plannedPayDays(dateKey(new Date(now())), s);
  const result = saveSettings(state, s, f.get('salaryFrom'), now());
  state.onboarded = true; state.reminder ??= { enabled: false, enabledAt: null, delivered: {} };
  const enabled = f.get('reminder') === 'on'; if (enabled && !state.reminder.enabled) state.reminder.enabledAt = now(); state.reminder.enabled = enabled;
  if (!await persist()) throw Error('保存未完成，请保持窗口打开并重试');
  render(); renderLists(); syncPayDaysForm();
  text('salary-effective-note', salaryForDate(state, dateKey(new Date(now()))) !== state.settings.salary ? `已安排下次生效工资 ${money(state.settings.salary)}；今天仍按 ${money(salaryForDate(state, dateKey(new Date(now()))))}。` : '今天生效会重算今天工资；明天生效保留今天记录。');
  text('settings-feedback', result.changed ? `已保存，工资从 ${result.effectiveDate} 生效。${result.recalculated ? '今天工资、净额及目标池已重算。' : f.get('salaryFrom') === 'today' ? '今天尚无上班记录，新记录按此工资计算。' : '今天保持原工资，明天新记录生效。'}` : '设置已保存。');
  if (first) { showView('dashboard'); toast('考勤和到手工资记好了，开始上班吧。'); }
} catch (error) { text('settings-feedback', error.message); } });
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
    const initial = JSON.stringify(state); const upgradedPayDays = migratePayDays(state, now()); settle(state, now());
    const upgradedGoal = migrateGoal(state, now());
    if (upgradedGoal) toast('目标已升级：保留名称和金额，从今天的净收入开始积累。');
    else if (upgradedPayDays) toast('计薪天数已按当月考勤计算，已记录日期保持原口径。');
    if (JSON.stringify(state) !== initial) persist();
    if (loaded.storage) text('storage-note', loaded.storage);
    populateSettings(); renderLists(); render();
    if (!state.onboarded) showView('settings');
    document.documentElement.dataset.ready = 'true';
    function tick() {
      const before = JSON.stringify(state.days); settle(state, now());
      if (before !== JSON.stringify(state.days)) persist();
      if (isVisible()) render();
      maybeRemind().then(maybeGoalCompletion).then(maybeMonthlyReview);
      const nextKey = dateKey(new Date(now()));
      if (document.documentElement.dataset.day !== nextKey) { document.documentElement.dataset.day = nextKey; renderLists(); }
      if (currentView === 'settings' && payDaysFormMonth !== monthKey(nextKey)) syncPayDaysForm();
      housekeeper = setTimeout(tick, isVisible() ? 1000 : 30000);
    }
    tickHousekeeper = tick;
    reducedMotion.addEventListener('change', () => { render(); syncLive(); });
    housekeeper = setTimeout(tick, isVisible() ? 1000 : 30000);
  } catch (error) { text('mode-copy', `无法打开本地记录：${error.message}`); }
  finally { $('loading-screen').hidden = true; document.body.classList.remove('is-loading'); }
}
bootstrap();
