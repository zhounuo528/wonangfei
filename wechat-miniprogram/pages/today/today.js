import { getState, apply, reconcileAttendance } from '../../store/index.js';
import {
    dateKey,
    dayStats,
    monthStats,
    goalStats,
    settingsForDay,
    calendarPolicy,
    activeShift,
    attendanceStatus,
    startWork,
    clockOut,
    needsOvertimeDecision,
    addCurrentBreak,
    addExpense,
    settleGoal,
    dueReminder,
    markReminderDelivered,
} from '../../core/model.js';
import { shiftClock } from '../../core/shift-clock.js';
import { formatAmount, formatCurrency, belowCentPerSecond } from '../../core/money.js';
import { duration, timeText, weekdayLabel, todayKey } from '../../utils/format.js';

const QUICK_CATEGORIES = ['早餐', '午餐', '晚餐', '通勤', '咖啡'];
const FISH_KINDS = ['抽一根', '喝点水', '上个厕所', '假装很忙', '自定义'];

const DISPLAY_OPTIONS = [
    { key: 'today', label: '今日已赚' },
    { key: 'month', label: '本月累计' },
    { key: 'goal', label: '目标进度' },
    { key: 'hidden', label: '隐藏金额' },
];

Page({
    data: {
        ready: false,
        dateLabel: '',
        weekday: '',
        statusLabel: '尚未开始',
        statusTone: '',
        displayIndex: 0,
        displayOptions: DISPLAY_OPTIONS,
        displayLabel: '今日已赚',
        heroAmount: '0.00',
        heroCaption: '每一秒的努力，都看得见。',
        heroNegative: false,
        hidden: false,
        secondRate: '—',
        hourRate: '—',
        workedText: '00:00:00',
        shiftLabel: '距离上班',
        shiftEnd: '--:--',
        countdown: '--:--:--',
        progressPercent: 0,
        shiftSummary: '',
        startedText: '今日上班 · 尚未记录',
        workButtonText: '开始上班',
        earnedText: '0.00',
        expenseText: '0.00',
        fixedText: '0.00',
        netText: '0.00',
        netNegative: false,
        wageText: '0.00',
        overtimePayText: '0.00',
        extraText: '0.00',
        fishText: '00:00:00',
        fishCaption: '今天还没有摸鱼',
        actualText: '00:00:00',
        effectiveHourText: '—',
        quickCategories: QUICK_CATEGORIES,
        goalName: '还没有目标',
        goalAmounts: '设一个目标，让努力有盼头',
        goalPercent: 0,
        goalPercentText: '0%',
        showExpenseSheet: false,
        expenseCategory: '早餐',
        expenseAmount: '',
        expenseError: '',
        showFishSheet: false,
        fishMinutes: '15',
        fishKind: '抽一根',
        fishKinds: FISH_KINDS,
        fishCustom: '',
        fishError: '',
        showOvertimeSheet: false,
        overtimeAmount: '',
        overtimeError: '',
        showSummary: false,
        summary: null,
        toast: '',
    },

    onLoad() {
        this.timer = null;
        this.refresh();
    },

    onShow() {
        const sync = reconcileAttendance();
        this.refresh();
        if (sync && !sync.skipped && (sync.created.length > 0 || sync.closed.length > 0 || sync.released.length > 0)) {
            wx.showToast({ title: '已按排班补记自动考勤', icon: 'none' });
            this.refresh();
        }
    },

    onHide() {
        this.stopTicker();
    },

    onUnload() {
        this.stopTicker();
    },

    startTicker() {
        if (this.timer) {
            return;
        }
        this.timer = setInterval(() => {
            this.refresh(true);
        }, 1000);
    },

    stopTicker() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    },

    refresh(silent) {
        const state = getState();
        const now = Date.now();
        const key = dateKey(new Date(now));
        const stats = dayStats(state, key, now);
        const month = monthStats(state, key, now);
        const goal = goalStats(state, now);
        const clock = shiftClock(state, now);
        const shift = activeShift(state, now);
        const hidden = state.display === 'hidden';

        const money = value => (hidden ? '••••' : formatAmount(value));
        const rate = value => {
            if (!Number.isFinite(value)) {
                return '—';
            }
            if (hidden) {
                return '••••';
            }
            return belowCentPerSecond(value) ? '<¥0.01' : formatCurrency(value);
        };

        const displayKey = DISPLAY_OPTIONS.some(option => option.key === state.display) ? state.display : 'today';
        const displayIndex = DISPLAY_OPTIONS.findIndex(option => option.key === displayKey);
        const displayLabel = displayKey === 'today'
            ? (stats.net < 0 ? '今日还欠' : '今日已赚')
            : DISPLAY_OPTIONS[displayIndex].label;

        let heroValue = stats.net;
        let heroCaption = '每一秒的努力，都看得见。';
        if (displayKey === 'month') {
            heroValue = month.earned;
            heroCaption = '本月累计毛收入，含加班费与意外之财。';
        } else if (displayKey === 'goal') {
            heroValue = goal.pool;
            heroCaption = state.goal ? '攒到这个数，就奖励自己。' : '还没有设置目标。';
        } else if (displayKey === 'hidden') {
            heroValue = 0;
            heroCaption = '金额已隐藏，数字仍在记录。';
        } else if (stats.net < 0) {
            heroCaption = '今天的班，先替房东上了。';
        } else if (stats.worked > 0) {
            heroCaption = '成本下班了，终于轮到你赚钱。';
        }

        const status = attendanceStatus(state, key, now);
        const statusTone = !status
            ? ''
            : status.status === 'working'
                ? 'pill-working'
                : status.status === 'late'
                    ? 'pill-late'
                    : status.status === 'leave' || status.status === 'swap' || status.status === 'rest'
                        ? 'pill-absent'
                        : '';

        const settings = state.days[key]?.settings ?? settingsForDay(state, key);
        const day = state.days[key];
        const startRecord = day && day.sessions.length ? timeText(day.sessions[0].start) : null;
        const lunchMinutes = settings.lunch
            ? Math.max(0, Math.round((new Date(key + 'T' + settings.lunchEnd + ':00').getTime() - new Date(key + 'T' + settings.lunchStart + ':00').getTime()) / 60000))
            : 0;

        const progress = stats.planned > 0
            ? Math.min(100, Math.round((stats.elapsed / stats.planned) * 100))
            : 0;

        const goalProgress = state.goal ? Math.min(100, Math.round(goal.progress * 100)) : 0;
        const next = {
            ready: true,
            dateLabel: key.slice(5).replace('-', ' / '),
            weekday: weekdayLabel(key),
            statusLabel: status ? status.label : '尚未开始',
            statusTone,
            displayIndex: displayIndex < 0 ? 0 : displayIndex,
            displayLabel,
            hidden,
            heroAmount: hidden ? '••••' : formatAmount(heroValue),
            heroCaption,
            heroNegative: !hidden && heroValue < 0,
            secondRate: rate(stats.secondly),
            hourRate: rate(stats.hourly),
            workedText: duration(stats.worked),
            shiftLabel: clock.label,
            shiftEnd: settings.end,
            countdown: typeof clock.milliseconds === 'number' ? duration(clock.milliseconds) : '--:--:--',
            progressPercent: progress,
            shiftSummary: '上班 ' + settings.start + ' · ' + (settings.lunch ? '午休 ' + lunchMinutes + ' 分钟' : '无午休'),
            startedText: startRecord ? '今日上班 · ' + startRecord : '今日上班 · 尚未记录',
            workButtonText: shift ? '下班结算' : (clock.mode === 'due' ? '开始上班（已到点）' : '开始上班'),
            earnedText: money(stats.earned),
            expenseText: money(stats.expenses),
            fixedText: money(stats.fixed),
            netText: money(stats.net),
            netNegative: !hidden && stats.net < 0,
            wageText: money(stats.wageEarned),
            overtimePayText: money(stats.overtimePay),
            extraText: money(stats.extraIncome),
            fishText: duration(stats.fish),
            fishCaption: stats.fish > 0 ? '今日摸鱼 · 工资照常上涨' : '今天还没有摸鱼',
            actualText: duration(stats.actual),
            effectiveHourText: stats.actual > 0 ? rate(stats.earned / stats.actual * 3600000) : '—',
            goalName: state.goal ? state.goal.name : '还没有目标',
            goalAmounts: state.goal
                ? money(goal.pool) + ' / ' + money(state.goal.amount)
                : '设一个目标，让努力有盼头',
            goalPercent: goalProgress,
            goalPercentText: goalProgress + '%',
        };

        this.setData(next);

        const running = !!shift || clock.mode === 'upcoming' || clock.mode === 'due';
        if (running) {
            this.startTicker();
        } else {
            this.stopTicker();
        }

        this.checkEndReminder();
    },

    // 网页版靠页面可见时弹提醒；小程序同理，只在没有其它弹层时提醒一次。
    checkEndReminder() {
        if (this.data.showExpenseSheet || this.data.showFishSheet || this.data.showOvertimeSheet || this.data.showSummary) {
            return;
        }
        const state = getState();
        const due = dueReminder(state, Date.now());
        if (!due) {
            return;
        }
        const applied = apply(current => markReminderDelivered(current, due, Date.now()));
        if (!applied.ok) {
            return;
        }
        wx.showModal({
            title: '下班啦，不然就更窝囊了',
            content: '今天的努力到这里，剩下的时间留给自己。',
            showCancel: false,
            confirmText: '收到，准备收工',
        });
    },

    handleDisplayChange(event) {
        const index = Number(event.detail.value) || 0;
        const option = DISPLAY_OPTIONS[index];
        if (!option) {
            return;
        }
        const result = apply(state => {
            state.display = option.key;
            return true;
        });
        if (!result.ok) {
            wx.showToast({ title: result.error, icon: 'none' });
            return;
        }
        this.refresh();
    },

    handleWorkToggle() {
        const state = getState();
        const now = Date.now();
        const shift = activeShift(state, now);

        if (!shift) {
            const result = apply(current => {
                startWork(current, Date.now());
                settleGoal(current, Date.now());
                return true;
            });
            if (!result.ok) {
                wx.showToast({ title: result.error, icon: 'none' });
                return;
            }
            wx.showToast({ title: '开始计薪', icon: 'none' });
            this.refresh();
            return;
        }

        if (needsOvertimeDecision(state, now)) {
            this.setData({ showOvertimeSheet: true, overtimeAmount: '', overtimeError: '' });
            return;
        }
        this.finishShift(null);
    },

    finishShift(decision) {
        const result = apply(state => {
            const now = Date.now();
            const summary = clockOut(state, now, decision || undefined);
            settleGoal(state, now);
            return summary;
        });

        if (!result.ok) {
            this.setData({ overtimeError: result.error, showOvertimeSheet: true });
            return;
        }

        const summary = result.result;
        this.setData({
            showOvertimeSheet: false,
            showSummary: true,
            summary: {
                date: summary.date,
                earned: formatCurrency(summary.earned),
                wage: formatCurrency(summary.wageEarned),
                extra: formatCurrency(summary.extraIncome),
                overtimePay: formatCurrency(summary.overtimePay),
                fish: duration(summary.fish),
                overtime: duration(summary.overtime),
                actual: duration(summary.actual),
                costs: formatCurrency(summary.expenses + summary.fixed),
                net: formatCurrency(summary.net),
                hourly: summary.hourly ? formatCurrency(summary.hourly) : '不可计算',
                netNegative: summary.net < 0,
            },
        });
        this.refresh();
    },

    handleOvertimeFree() {
        this.finishShift({ kind: 'free', amount: 0 });
    },

    handleOvertimeAmount(event) {
        this.setData({ overtimeAmount: event.detail.value, overtimeError: '' });
    },

    handleOvertimePaid() {
        const amount = Number(this.data.overtimeAmount);
        if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) {
            this.setData({ overtimeError: '请填写大于 0、至多 10 亿的加班费' });
            return;
        }
        this.finishShift({ kind: 'paid', amount });
    },

    closeSummary() {
        this.setData({ showSummary: false, summary: null });
    },

    openExpenseSheet(event) {
        const category = event.currentTarget.dataset.name || '早餐';
        this.setData({
            showExpenseSheet: true,
            expenseCategory: category,
            expenseAmount: '',
            expenseError: '',
        });
    },

    closeExpenseSheet() {
        this.setData({ showExpenseSheet: false, expenseError: '' });
    },

    handleExpenseAmount(event) {
        this.setData({ expenseAmount: event.detail.value, expenseError: '' });
    },

    saveExpense() {
        const amount = Number(this.data.expenseAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
            this.setData({ expenseError: '请填写大于 0 的金额' });
            return;
        }
        const category = this.data.expenseCategory;
        const result = apply(state => {
            const now = Date.now();
            addExpense(state, {
                category,
                name: category,
                amount: Math.round(amount * 100) / 100,
                date: dateKey(new Date(now)),
                scope: 'day',
            }, now);
            return true;
        });
        if (!result.ok) {
            this.setData({ expenseError: result.error });
            return;
        }
        this.setData({ showExpenseSheet: false });
        wx.showToast({ title: '已记 ' + category, icon: 'none' });
        this.refresh();
    },

    openFishSheet() {
        this.setData({ showFishSheet: true, fishMinutes: '15', fishKind: '抽一根', fishCustom: '', fishError: '' });
    },

    closeFishSheet() {
        this.setData({ showFishSheet: false, fishError: '' });
    },

    handleFishMinutes(event) {
        this.setData({ fishMinutes: event.detail.value, fishError: '' });
    },

    handleFishKind(event) {
        this.setData({ fishKind: event.currentTarget.dataset.kind, fishError: '' });
    },

    handleFishCustom(event) {
        this.setData({ fishCustom: event.detail.value, fishError: '' });
    },

    saveFish() {
        const minutes = Number(this.data.fishMinutes);
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
            this.setData({ fishError: '请输入 1 到 1440 之间的整数分钟' });
            return;
        }
        const kind = this.data.fishKind;
        const name = kind === '自定义' ? String(this.data.fishCustom || '').trim() : kind;
        if (name === '') {
            this.setData({ fishError: '请填写摸鱼事项' });
            return;
        }

        const result = apply(state => {
            const now = Date.now();
            addCurrentBreak(state, { minutes, name }, now);
            return true;
        });
        if (!result.ok) {
            this.setData({ fishError: result.error });
            return;
        }
        this.setData({ showFishSheet: false });
        wx.showToast({ title: '已记 ' + minutes + ' 分钟', icon: 'none' });
        this.refresh();
    },

    goGoal() {
        wx.navigateTo({ url: '/pages/goal/goal' });
    },

    goSettings() {
        wx.switchTab({
            url: '/pages/mine/mine',
        });
    },

    noop() {
        return null;
    },
});
