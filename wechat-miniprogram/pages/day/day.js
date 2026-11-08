import { getState, apply } from '../../store/index.js';
import {
    calendarInfo,
    editCalendarDay,
    fixedBurdenQuote,
    undoableCalendarChange,
    undoCalendarChange,
} from '../../core/calendar.js';
import { dateKey, isWorkday } from '../../core/model.js';
import { formatCurrency } from '../../core/money.js';
import { dateText, weekdayLabel, todayKey } from '../../utils/format.js';

const KINDS = [
    { key: 'work', label: '上班', hint: '普通工作日，或临时补一天班' },
    { key: 'overtime', label: '休息日加班', hint: '基础收入不增长，加班费在下班时另记' },
    { key: 'leave', label: '请假', hint: '当天不计出勤，工资可单独处理' },
    { key: 'swap', label: '调休', hint: '当天不计出勤，工资可单独处理' },
    { key: 'rest', label: '休息', hint: '不记录基础工资' },
];

const STANDARD_MODES = [
    { key: 'standard', label: '按标准日工资' },
    { key: 'unpaid', label: '不计薪' },
    { key: 'custom', label: '自定补薪' },
];

Page({
    data: {
        date: '',
        dateLabel: '',
        weekday: '',
        future: false,
        isToday: false,
        hasRecord: false,
        baseWorkday: true,
        kinds: KINDS,
        kind: 'work',
        kindHint: '',
        payModes: STANDARD_MODES,
        payMode: 'standard',
        amount: '',
        includeOvertimePay: true,
        hasOvertimePay: false,
        overtimeText: '',
        showFixed: false,
        fixedEnabled: true,
        fixedItems: [],
        fixedAmountText: '0.00',
        fixedSourceText: '',
        fixedUnallocatable: false,
        needBackfillConfirm: false,
        backfillConfirmed: false,
        canUndo: false,
        error: '',
    },

    onLoad(options) {
        const date = options && options.date ? options.date : todayKey();
        this.setData({ date });
    },

    onShow() {
        this.load();
    },

    load() {
        const state = getState();
        const now = Date.now();
        const key = this.data.date;
        const today = todayKey();
        const info = calendarInfo(state, key, now);
        const policy = info.policy;
        const hasRecord = !!(state.days[key] && state.days[key].sessions && state.days[key].sessions.length);
        const day = state.days[key];

        const kind = info.kind;
        const payMode = policy && policy.payMode
            ? policy.payMode
            : (kind === 'rest' || kind === 'overtime' ? 'unpaid' : 'standard');

        const overtimeTotal = ((day && day.overtimeDecisions) || []).reduce((sum, entry) => sum + entry.amount, 0);
        const quote = fixedBurdenQuote(state, key, now);
        const savedBurden = day && day.fixedBurden;
        const showFixed = !info.future && !!day && !quote.unallocatable ? true : (!info.future && !!day);
        const undo = undoableCalendarChange(state, key);

        this.setData({
            dateLabel: dateText(key),
            weekday: weekdayLabel(key),
            future: info.future,
            isToday: key === today,
            hasRecord,
            baseWorkday: info.baseWorkday,
            kind,
            kindHint: (KINDS.find(item => item.key === kind) || KINDS[0]).hint,
            payModes: this.payModesFor(kind),
            payMode,
            amount: policy && policy.amount ? String(policy.amount) : '',
            includeOvertimePay: !policy || policy.includeOvertimePay !== false,
            hasOvertimePay: overtimeTotal > 0,
            overtimeText: formatCurrency(overtimeTotal),
            showFixed,
            fixedEnabled: savedBurden ? savedBurden.enabled : true,
            fixedItems: quote.items.map(item => ({ id: item.id, name: item.name, amountText: formatCurrency(item.amount) })),
            fixedAmountText: formatCurrency(quote.amount),
            fixedSourceText: quote.source === 'saved'
                ? '沿用此前保存的当日快照'
                : quote.source === 'historical'
                    ? '按当天原有的分摊计算'
                    : '按当前固定项目补计此日',
            fixedUnallocatable: !!quote.unallocatable,
            needBackfillConfirm: !hasRecord && key < today,
            canUndo: !!undo,
            error: '',
        });
    },

    payModesFor(kind) {
        if (kind === 'rest') {
            return [{ key: 'unpaid', label: '不计薪' }];
        }
        if (kind === 'overtime') {
            return [{ key: 'unpaid', label: '不计薪（加班费另记）' }];
        }
        return STANDARD_MODES;
    },

    handleKind(event) {
        const kind = event.currentTarget.dataset.key;
        const payModes = this.payModesFor(kind);
        const allowed = payModes.some(mode => mode.key === this.data.payMode);
        const nextPayMode = allowed ? this.data.payMode : payModes[0].key;
        this.setData({
            kind,
            kindHint: (KINDS.find(item => item.key === kind) || KINDS[0]).hint,
            payModes,
            payMode: nextPayMode,
            error: '',
        });
    },

    handlePayMode(event) {
        this.setData({ payMode: event.currentTarget.dataset.key, error: '' });
    },

    handleAmount(event) {
        this.setData({ amount: event.detail.value, error: '' });
    },

    handleOvertimePay(event) {
        this.setData({ includeOvertimePay: event.detail.value, error: '' });
    },

    handleFixed(event) {
        this.setData({ fixedEnabled: event.detail.value, error: '' });
    },

    handleBackfillConfirm(event) {
        this.setData({ backfillConfirmed: event.detail.value, error: '' });
    },

    save() {
        const key = this.data.date;
        const input = {
            date: key,
            kind: this.data.kind,
            payMode: this.data.payMode,
            includeOvertimePay: this.data.includeOvertimePay,
        };

        if (this.data.payMode === 'custom') {
            const amount = Number(this.data.amount);
            if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) {
                this.setData({ error: '自定补薪须大于 0、至多 10 亿' });
                return;
            }
            input.amount = Math.round(amount * 100) / 100;
        }

        if (this.data.needBackfillConfirm) {
            if (!this.data.backfillConfirmed) {
                this.setData({ error: '这天是空白的历史日期，请先勾选下方的补录确认' });
                return;
            }
            input.confirmedBackfill = true;
        }

        if (this.data.showFixed) {
            input.fixedBurden = { enabled: this.data.fixedEnabled };
        }

        const result = apply(state => editCalendarDay(state, input, Date.now()));
        if (!result.ok) {
            this.setData({ error: result.error });
            return;
        }
        if (!result.result.changed) {
            wx.showToast({ title: '没有变化', icon: 'none' });
            return;
        }

        wx.showToast({ title: '已更新这一天', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 400);
    },

    clearPlan() {
        wx.showModal({
            title: '清除这天的计划',
            content: '只删除这天的计划安排，不影响其他日期。',
            confirmText: '清除',
            confirmColor: '#d4380d',
            success: modal => {
                if (!modal.confirm) {
                    return;
                }
                const result = apply(state => editCalendarDay(state, { date: this.data.date, reset: true }, Date.now()));
                if (!result.ok) {
                    this.setData({ error: result.error });
                    return;
                }
                wx.showToast({ title: '已清除', icon: 'none' });
                setTimeout(() => wx.navigateBack(), 400);
            },
        });
    },

    undo() {
        const result = apply(state => undoCalendarChange(state, this.data.date, Date.now()));
        if (!result.ok) {
            this.setData({ error: result.error });
            return;
        }
        wx.showToast({ title: '已撤销上一次修改', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 400);
    },

    goCalendar() {
        wx.navigateBack();
    },
});
