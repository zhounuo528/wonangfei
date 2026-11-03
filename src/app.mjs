import { dateKey, at, emptyState, demoState, clockNow, getDay, activeSession, activeShift, settle, startWork, clockOut, addBreak, deleteBreak, dueReminder, markReminderDelivered, attendanceStatus, datesInMonth, dayStats, monthStats, monthlyReport, dueMonthlyReview, saveMonthlyReview, goalStats, fixedItemForDate, addExpense, addFixed, convertLegacyFixed, expenseForDate, validateSettings, validateState, windows, ratePerMs, isWorkday, paidIntervals } from './model.mjs';
import { createTimestampTicker } from './live.mjs';
import { formatAmount, formatCurrency, belowCentPerSecond, roundedMoney } from './money.mjs';
import { formatWorkEquivalent } from './work-equivalent.mjs';

const $ = id => document.getElementById(id);
const api = window.workday;
let state, period = 'day', currentView = 'dashboard', mini = false, pinned = false, confirmAction, toastTimer;
let saveTail = Promise.resolve(), saveRevision = 0, liveSnapshot, housekeeper, nativeVisible = true, nativeVisibilityObserved = false, tickHousekeeper;
let checkingReminder = false, reminderRetryAfter = 0;
let calendarMonth, calendarDetailKey, calendarSignature;
let checkingMonthlyReview = false, monthlyRetryAfter = 0, queuedReminder, queuedMonthlyReview;
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
function paintCharacter(net, hidden) {
  // Privacy always uses the same cheerful face, independent of the concealed balance.
  const mood = hidden ? 'private' : net < 0 ? 'anxious' : 'happy';
  const source = mood === 'anxious' ? 'mascot-anxious.png' : 'mascot-happy.png';
  for (const image of document.querySelectorAll('.state-mascot')) {
    if (image.dataset.mood === mood) continue;
    image.dataset.mood = mood;
    if (image.getAttribute('src') !== source) image.src = source;
  }
}
function paintLive(stamp) {
  if (!liveSnapshot || state.display === 'hidden') return;
  const { key, monthBeforeToday, rate, costs, monthCosts, goalEta } = liveSnapshot;
  if (dateKey(new Date(stamp)) !== key) return;
  const paid = paidIntervals(state.days[key], key, stamp);
  const earned = paid.reduce((total, [a, b]) => total + b - a, 0) * rate;
  const monthEarned = monthBeforeToday + earned;
  const net = earned - costs;
  paintCharacter(net, false);
  const goalEarned = state.goal.period === 'day' ? earned : monthEarned;
  const progress = Math.min(1, goalEarned / state.goal.amount);
  const primary = state.display === 'goal' ? `${(progress * 100).toFixed(3)}%` : number(state.display === 'month' ? monthEarned : net);
  amountText('hero-amount', primary);
  amountText('mini-amount', state.display === 'goal' ? primary : `¥${primary}`);
  // Related balances share this exact timestamp, including cent-boundary frames.
  text('sum-earned', money(period === 'day' ? earned : monthEarned));
  text('sum-net', money(period === 'day' ? net : monthEarned - monthCosts));
  text('tray-gross', money(earned)); text('tray-net', money(net));
  const remaining = Math.max(0, state.goal.amount - goalEarned);
  text('goal-amounts', `${state.goal.period === 'day' ? '今日' : '本月'} ${yuan(goalEarned)} / ${yuan(state.goal.amount)}`);
  text('goal-percent', `${(progress * 100).toFixed(1)}%`); $('goal-progress').value = progress * 100;
  text('goal-eta', remaining ? `${goalEta} 剩余 ${yuan(remaining)}。` : '目标已达成，奖励一下自己。');
  if (state.display === 'goal') text('hero-caption', `${state.goal.name} · 剩余 ${yuan(Math.max(0, state.goal.amount - goalEarned))}`);
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
    else form.elements[key].value = key === 'salary' ? Number(value).toFixed(2) : value;
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
  updateScheduleFields();
  updateLunchFields();
  $('reminder-enabled').checked = !!state.reminder?.enabled;
  $('legacy-allocation-note').hidden = !state.fixed.some(item => item.allocation === 'calendar' && !item.until);
}
function updateScheduleFields() {
  const form = $('settings-form'), alternating = form.elements.scheduleMode.value === 'alternating';
  $('alternating-settings').hidden = !alternating; $('alternate-weekdays-field').hidden = !alternating;
  form.elements.anchorWeek.required = alternating; form.elements.anchorKind.required = alternating;
  text('weekday-legend', alternating ? '大小周：双休周的工作日（可调整）' : '工作日（可调整）');
  text('schedule-note', alternating ? '双休周默认周一至周五，单休周默认周一至周六；按基准周交替，不随月份重置。节假日及调休需自行设置。' : form.elements.scheduleMode.value === 'single' ? '单休默认周一至周六工作，可调整。节假日及调休需自行设置。' : '双休默认周一至周五工作，可调整。节假日及调休需自行设置。');
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
function etaText(g) {
  if (g.status === 'done') return '目标已达成，奖励一下自己。';
  if (g.status === 'unreachable') return `${state.goal.period === 'day' ? '今日' : '本月'}剩余排班内预计不可达；可调整目标或周期。`;
  return `预计 ${new Date(g.eta).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })} 达成 · 假设后续排班全部出勤。`;
}
function render() {
  const stamp = now(), time = new Date(stamp), todayKey = dateKey(time), shift = activeShift(state, stamp), key = shift?.key ?? todayKey, day = getDay(state, key), d = dayStats(state, key, stamp), m = monthStats(state, todayKey, stamp), g = goalStats(state, stamp);
  const running = !!shift, overtime = running && stamp >= at(key, d.settings.end), inPaid = windows(key, d.settings).some(([a, b]) => stamp >= a && stamp < b), isLunch = running && !inPaid && stamp >= at(key, d.settings.start) && !overtime;
  const status = running ? (overtime ? '加班中 · 工资已封顶' : isLunch ? '午休中 · 暂停计薪' : stamp < at(key, d.settings.start) ? '等待上班时间' : '正在上班') : stamp >= at(key, d.settings.end) ? '今日排班已结束' : day?.summary ? '已下班 · 辛苦了' : '尚未开始';
  const countdown = overtime ? d.overtime : isWorkday(key, d.settings) ? Math.max(0, at(key, d.settings.end) - stamp) : 0;
  const hidden = state.display === 'hidden';
  paintCharacter(d.net, hidden);
  liveSnapshot = { key, monthBeforeToday: m.earned - d.earned, rate: ratePerMs(key, d.settings), costs: d.expenses + d.fixed, monthCosts: m.expenses + m.fixed, goalEta: etaText(g) };
  document.body.classList.toggle('amounts-hidden', hidden);
  document.body.classList.toggle('net-uncovered', !hidden && state.display === 'today' && d.net < 0);
  $('display-mode').value = state.display; $('mini-display').value = state.display;
  const goalMode = state.display === 'goal';
  text('hero-prefix', hidden ? '' : goalMode ? '' : '¥');
  amountText('hero-amount', hidden ? '••••••' : goalMode ? `${(g.progress * 100).toFixed(1)}%` : number(state.display === 'month' ? m.earned : d.net));
  document.querySelector('.hero').classList.toggle('uncovered', !hidden && state.display === 'today' && d.net < 0);
  text('hero-caption', hidden ? '安心专注，金额已隐藏。' : goalMode ? `${state.goal.name} · 剩余 ${yuan(g.remaining)}` : state.display === 'month' ? `本月工资毛收入 · 已记录 ${m.recorded} 天；净赚见下方明细。` : '已扣除今日花销与固定负担。');
  const standardSecond = ratePerMs(key, d.settings) * 1000;
  text('work-status', status); text('salary-rate', hidden ? '标准秒薪已隐藏' : `标准秒薪 ${yuan(standardSecond)}${belowCentPerSecond(standardSecond) ? ' · 实际低于 ¥0.01/秒' : ''}`);
  text('shift-label-text', overtime ? '已加班' : '距离下班'); text('shift-end', isWorkday(key, d.settings) ? d.settings.end : '休息日'); text('countdown', duration(countdown));
  text('shift-percent', `${Math.min(100, d.elapsed / d.planned * 100).toFixed(1)}%`); $('shift-progress').value = Math.min(100, d.elapsed / d.planned * 100);
  text('shift-summary', overtime ? '加班这么久，领导肯定很器重你吧。' : `上班 ${d.settings.start} · ${d.settings.lunch ? `午休 ${d.settings.lunchStart}–${d.settings.lunchEnd}` : '不扣午休'}`);
  const afterShift = !!day?.sessions.length && stamp >= at(key, d.settings.end);
  const workLabel = running ? '下班，看看今天  ✓' : afterShift ? '下班 · 查看总结' : day?.sessions.length ? '继续上班  →' : '开始上班  →';
  text('work-toggle', workLabel); $('show-summary').hidden = !day?.summary;
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
  text('goal-name', state.goal.name); text('goal-amounts', hidden ? '金额已隐藏' : `${state.goal.period === 'day' ? '今日' : '本月'} ${yuan(g.earned)} / ${yuan(state.goal.amount)}`); text('goal-percent', `${(g.progress * 100).toFixed(1)}%`); $('goal-progress').value = g.progress * 100;
  text('goal-eta', hidden ? '目标金额与预计达成时间已隐藏。' : `${etaText(g)}${g.remaining ? ` 剩余 ${yuan(g.remaining)}。` : ''}`);
  const price = Number($('purchase-amount').value), rate = ratePerMs(key, d.settings);
  text('purchase-time', hidden ? '已隐藏' : formatWorkEquivalent(price, rate, d.planned));
  // Price itself is a money value and is concealed in privacy mode too.
  $('purchase-amount').type = hidden ? 'password' : 'number';
  amountText('mini-amount', hidden ? '••••••' : goalMode ? `${(g.progress * 100).toFixed(3)}%` : `¥${number(state.display === 'month' ? m.earned : d.net)}`);
  text('mini-time-label', overtime ? '已加班' : '距下班'); text('mini-time-value', duration(countdown)); text('mini-time-status', status); $('mini-progress').value = d.elapsed / d.planned * 100;
  document.body.classList.toggle('overtime-mode', overtime);
  text('mini-work', running ? '下班' : afterShift ? '下班总结' : day?.sessions.length ? '继续上班' : '开始上班');
  text('tray-gross', money(d.earned)); text('tray-costs', money(d.fixed + d.expenses)); text('tray-net', money(d.net));
  text('date-label', `${time.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })} · ${state.demo ? '虚拟演示时钟' : '本机时间'}`);
  $('mode-notice').classList.toggle('demo', !!state.demo); $('exit-demo').hidden = !state.demo;
  text('mode-copy', state.demo ? '演示模式 · 全部为虚拟数据，时间为模拟时钟。' : !state.onboarded ? '第一次见，先把考勤和工资说清楚。初始金额是示例，请按需要修改。' : '按你的考勤和记录计算，班不能白上。');
  text('mini-notice', state.demo ? '虚拟数据演示 · 时间为模拟时钟' : overtime ? '加班这么久，领导肯定很器重你吧。' : '今天的班，也得上出点数字。');
  paintLive(stamp);
  if (state.display === 'today') updateNetTitle(d.net);
  const previousSummary = latestSummary();
  $('show-summary').hidden = !previousSummary;
  text('show-summary', previousSummary?.date === todayKey ? '查看下班总结 ↗' : '查看上次下班总结 ↗');
  syncLive();
  if ($('calendar-dialog').open) renderCalendar();
  if ($('calendar-detail-dialog').open) renderCalendarDetail(calendarDetailKey);
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
  const d = dayStats(state, $('break-date').value, now());
  text('break-capacity', `班次累计工时 ${duration(d.worked)}（含无薪加班），已记摸鱼 ${duration(d.fish)}；可添加 ${duration(Math.max(0, d.worked - d.fish))}。超出不保存。`);
}
function openBreak() {
  if (!requireSetup()) return;
  $('break-form').reset(); $('break-kind').value = '喝点水'; $('break-custom-label').hidden = true; $('break-custom').required = false;
  $('break-date').value = activeShift(state, now())?.key ?? dateKey(new Date(now())); $('break-date').min = state.trackingStart; $('break-date').max = dateKey(new Date(now())); text('break-error', ''); updateBreakCapacity(); $('break-dialog').showModal();
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
  text('summary-overtime', duration(summary.overtime ?? 0));
  text('summary-hourly', summary.hourly === null ? '不可计算' : `${money(summary.hourly)} / 小时`);
  text('summary-costs', money(summary.expenses + summary.fixed)); text('summary-net', money(summary.net));
  text('summary-note', `工资计到 ${summary.scheduledEnd}。之后只加班，不加钱；时间计入有效工时，平均时薪跟着往下走。`);
  $('summary-dialog').showModal();
}
function workAction() {
  if (!requireSetup()) return;
  try {
    const stamp = now(), key = dateKey(new Date(stamp)), day = state.days[key];
    if (activeShift(state, stamp) || (day?.sessions.length && stamp >= at(key, day.settings.end))) {
      const summary = clockOut(state, stamp); persist(); render(); showSummary(summary);
    } else mutate(() => startWork(state, stamp));
  } catch (error) { toast(error.message); }
}
function latestSummary() { return Object.values(state.days).map(day => day.summary).filter(Boolean).sort((a, b) => b.clockOutAt - a.clockOutAt)[0]; }
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
  text('calendar-detail-fish', duration(stats.fish)); text('calendar-detail-overtime', duration(stats.overtime)); text('calendar-detail-hourly', stats.hourly === null ? '不可计算' : `${money(stats.hourly)} / 小时`);
  text('calendar-detail-snapshot', day.summary ? `下班时保存的净额快照：${money(day.summary.net)}。当天排班 ${day.settings.start}–${day.settings.end}。` : `该日没有保存下班总结快照。当天排班 ${day.settings.start}–${day.settings.end}。`);
}
function moveCalendar(delta) { const date = new Date(`${calendarMonth}-01T00:00:00`); date.setMonth(date.getMonth() + delta); if (date.getFullYear() < 1000 || date.getFullYear() > 9999) return; calendarMonth = dateKey(date).slice(0, 7); renderCalendar(); }
function showMonthlyReport(report) {
  const hours = ms => `${(ms / 3600000).toFixed(2)} 小时`;
  $('report-month').value = report.month; $('report-month').max = dateKey(new Date(now())).slice(0, 7);
  text('report-status', report.provisional ? '阶段回顾 · 进行中' : '已结束月份');
  text('report-cutoff', `统计截至 ${new Date(report.asOf).toLocaleString('zh-CN', { hour12: false })} · 按现有记录汇总`);
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
for (const id of ['work-toggle', 'mini-work']) $(id).addEventListener('click', workAction);
for (const id of ['fish-toggle', 'mini-fish']) $(id).addEventListener('click', openBreak);
$('view-breaks').addEventListener('click', () => { renderBreakList(); $('break-list-dialog').showModal(); });
$('show-summary').addEventListener('click', () => showSummary(latestSummary()));
$('collapse-to-tray').addEventListener('click', async () => { if (!requireSetup()) return; try { await saveTail; await api.collapseToTray(structuredClone(state)); } catch (error) { toast(error.message); } });
$('tray-expense').addEventListener('click', () => openExpense('自定义'));
api?.onPresentation(mode => { const compact = mode === 'tray'; mini = compact; document.body.classList.toggle('mini-mode', compact); document.body.classList.toggle('tray-detail-mode', compact); render(); });
api?.onAction(action => { if (action === 'expense') openExpense('自定义'); else if (action === 'break') openBreak(); else if (action === 'clockout') workAction(); });
$('open-calendar').addEventListener('click', () => { renderCalendar(); $('calendar-dialog').showModal(); });
$('calendar-prev').addEventListener('click', () => moveCalendar(-1)); $('calendar-next').addEventListener('click', () => moveCalendar(1));
$('calendar-report').addEventListener('click', () => openMonthlyReport(calendarMonth));
$('report-month').addEventListener('change', e => { if (e.target.value) openMonthlyReport(e.target.value); });
$('break-kind').addEventListener('change', e => { const custom = e.target.value === '自定义'; $('break-custom-label').hidden = !custom; $('break-custom').required = custom; });
$('break-date').addEventListener('change', () => { if ($('break-date').value) updateBreakCapacity(); });
$('break-form').addEventListener('submit', e => { e.preventDefault(); try { const f = new FormData(e.currentTarget); addBreak(state, { date: f.get('date'), minutes: Number(f.get('minutes')), name: f.get('kind') === '自定义' ? f.get('custom') : f.get('kind') }, now()); persist(); $('break-dialog').close(); render(); renderLists(); toast('摸鱼时间已记下，工资照常增长'); } catch (error) { text('break-error', error.message); } });
for (const id of ['mini', 'expand']) $(id).addEventListener('click', toggleMini);
for (const id of ['pin', 'mini-pin']) $(id).addEventListener('click', togglePin);
for (const p of ['day', 'month']) $(`period-${p}`).addEventListener('click', () => { period = p; render(); });
$('purchase-amount').addEventListener('input', render);
$('expense-category').addEventListener('change', e => { $('expense-name').value = e.target.value === '自定义' ? '' : e.target.value; syncExpenseScope(); });
$('expense-scope').addEventListener('change', syncExpenseScope); $('expense-month').addEventListener('change', syncExpenseScope); $('expense-amount').addEventListener('input', syncExpenseScope);
$('expense-form').addEventListener('submit', e => { e.preventDefault(); try { const f = new FormData(e.currentTarget), scope = f.get('scope') === 'month' && f.get('category') === '自定义' ? 'month' : 'day'; addExpense(state, { name: f.get('name'), amount: Number(f.get('amount')), date: scope === 'month' ? `${f.get('month')}-01` : f.get('date'), month: scope === 'month' ? f.get('month') : undefined, scope, category: f.get('category') }); persist(); $('expense-dialog').close(); render(); renderLists(); toast('已记下这笔花销'); } catch (error) { text('expense-error', error.message); } });
$('add-fixed').addEventListener('click', () => { if (!requireSetup()) return; $('fixed-form').reset(); text('fixed-error', ''); $('fixed-dialog').showModal(); });
$('fixed-type').addEventListener('change', e => { $('fixed-name').value = e.target.value === '自定义' ? '' : e.target.value; });
$('fixed-form').addEventListener('submit', e => { e.preventDefault(); try { const f = new FormData(e.currentTarget); addFixed(state, { name: f.get('name'), amount: Number(f.get('amount')), period: f.get('period'), allocation: f.get('allocation') }, dateKey(new Date(now()))); persist(); $('fixed-dialog').close(); render(); renderLists(); toast('固定负担已开始分摊'); } catch (error) { text('fixed-error', error.message); } });
$('edit-goal').addEventListener('click', () => { for (const [key, value] of Object.entries(state.goal)) $('goal-form').elements[key].value = key === 'amount' ? Number(value).toFixed(2) : value; text('goal-error', ''); $('goal-dialog').showModal(); });
document.querySelectorAll('input[name=amount],input[name=salary],#purchase-amount').forEach(input => input.addEventListener('blur', () => { if (input.value !== '' && Number.isFinite(Number(input.value))) input.value = Number(input.value).toFixed(2); }));
$('goal-form').addEventListener('submit', e => { e.preventDefault(); try { const f = new FormData(e.currentTarget), goal = { name: f.get('name').trim(), amount: Number(f.get('amount')), period: f.get('period') }; validateState({ ...state, goal }); state.goal = goal; persist(); $('goal-dialog').close(); render(); toast('目标已更新，继续慢慢靠近'); } catch (error) { text('goal-error', error.message); } });
$('settings-form').elements.lunch.addEventListener('change', updateLunchFields);
$('schedule-mode').addEventListener('change', () => { const mode = $('schedule-mode').value; document.querySelectorAll('#weekdays input').forEach(input => { input.checked = Number(input.value) >= 1 && Number(input.value) <= (mode === 'single' ? 6 : 5); }); if (mode === 'alternating' && state.settings.scheduleMode !== 'alternating') $('settings-form').elements.anchorKind.value = ''; updateScheduleFields(); });
$('settings-form').addEventListener('submit', e => { e.preventDefault(); try { const f = new FormData(e.currentTarget), s = { salary: Number(f.get('salary')), payDays: Number(f.get('payDays')), scheduleMode: f.get('scheduleMode'), weekdays: f.getAll('weekday').map(Number), alternateWeekdays: f.getAll('weekdayB').map(Number), anchorWeek: f.get('anchorWeek'), anchorKind: f.get('anchorKind'), start: f.get('start'), end: f.get('end'), lunch: f.get('lunch') === 'on', lunchStart: e.currentTarget.elements.lunchStart.value, lunchEnd: e.currentTarget.elements.lunchEnd.value }; validateSettings(s); const previous = state.settings, first = !state.onboarded; state.settings = s; let converted; try { converted = convertLegacyFixed(state, dateKey(new Date(now()))); } catch (error) { state.settings = previous; throw error; } state.onboarded = true; state.reminder ??= { enabled: false, enabledAt: null, delivered: {} }; const enabled = f.get('reminder') === 'on'; if (enabled && !state.reminder.enabled) state.reminder.enabledAt = now(); state.reminder.enabled = enabled; persist(); render(); text('settings-feedback', `已保存，已有日期和已保存分摊表保持原口径。${converted ? `${converted} 笔旧账单从今天起切到考勤工作日，之前历史保留。` : ''}`); if (first) { showView('dashboard'); toast('考勤和工资记好了，开始上班吧。'); } } catch (error) { text('settings-feedback', error.message); } });
$('load-demo').addEventListener('click', () => {
  const action = () => mutate(() => { state = demoState(); populateSettings(); });
  if (state.demo) { toast('当前已经是虚拟演示模式'); return; }
  // Desktop keeps a separate real-data file; entering demo never replaces it.
  action(); showView('dashboard');
});
$('exit-demo').addEventListener('click', async () => {
  try { await saveTail; const loaded = await api.loadReal(); state = loaded.state ?? emptyState(); if (loaded.error) throw Error(loaded.error); settle(state, now()); persist(); populateSettings(); renderLists(); render(); if (!state.onboarded) showView('settings'); toast('已返回本地记录；演示数据另存'); } catch (error) { toast(error.message); }
});
$('export-data').addEventListener('click', async () => { try { await saveTail; const result = await api.exportData(structuredClone(state)); if (!result.canceled) toast('备份已保存到选择的位置'); } catch (e) { toast(e.message); } });
async function bootstrap() {
  try {
    const loaded = api ? await api.load() : { state: null };
    $('collapse-to-tray').hidden = loaded.platform !== 'darwin';
    if (!nativeVisibilityObserved) nativeVisible = loaded.nativeVisible !== false;
    state = loaded.state ?? emptyState();
    state.onboarded ??= Object.keys(state.days).length > 0;
    state.reminder ??= { enabled: false, enabledAt: null, delivered: {} };
    if (loaded.error) toast(`${loaded.error}，原文件已保留，当前更改无法覆盖它。`);
    const initial = JSON.stringify(state); settle(state, now());
    if (JSON.stringify(state) !== initial) persist();
    if (loaded.storage) text('storage-note', loaded.storage);
    populateSettings(); renderLists(); render();
    if (!state.onboarded) showView('settings');
    document.documentElement.dataset.ready = 'true';
    function tick() {
      const before = JSON.stringify(state.days); settle(state, now());
      if (before !== JSON.stringify(state.days)) persist();
      if (isVisible()) render();
      maybeRemind().then(maybeMonthlyReview);
      const nextKey = dateKey(new Date(now()));
      if (document.documentElement.dataset.day !== nextKey) { document.documentElement.dataset.day = nextKey; renderLists(); }
      housekeeper = setTimeout(tick, isVisible() ? 1000 : 30000);
    }
    tickHousekeeper = tick;
    reducedMotion.addEventListener('change', () => { render(); syncLive(); });
    housekeeper = setTimeout(tick, isVisible() ? 1000 : 30000);
  } catch (error) { text('mode-copy', `无法打开本地记录：${error.message}`); }
}
bootstrap();
