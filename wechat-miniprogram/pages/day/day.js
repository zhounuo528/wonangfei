import { getState, apply } from '../../store/index.js';
import {
    calendarInfo,
    editCalendarDay,
    fixedBurdenQuote,
    undoableCalendarChange,
    undoCalendarChange,
} from '../../core/calendar.js';
import { dateKey, monthKey } from '../../core/model.js';
import { formatCurrency } from '../../core/money.js';
import { dateText, weekdayLabel, todayKey, timeText } from '../../utils/format.js';

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
        hasDayEntry: false,
        canEditExpenses: false,
        expenseRows: [],
        expenseTotalText: '0.00',
        monthItems: [],
        sessionRows: [],
        canAddSession: false,
        newStart: '',
        newEnd: '',
        showOvertimeSheet: false,
        overtimeAmount: '',
        overtimeError: '',
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

        const dayExpenses = state.expenses.filter(expense => expense.scope !== 'month' && expense.date === key);
        const month = monthKey(key);
        const monthExpenses = state.expenses.filter(expense => expense.scope === 'month' && expense.month === month);
        const expenseTotal = dayExpenses.reduce((sum, expense) => sum + expense.amount, 0);

        const sessions = (day && day.sessions) || [];
        const sessionRows = sessions.map((session, index) => {
            const startDay = dateKey(new Date(session.start));
            const endDay = session.end === null ? null : dateKey(new Date(session.end));
            const crossDay = endDay !== null && endDay !== key;
            return {
                index,
                origStart: session.start,
                origEnd: session.end,
                // 用「显示值」判断是否被改动：原始时间带秒和毫秒，直接比时间戳会把每一段都当成改过，
                // 既会在请假时报错，也会静默把未编辑时段的秒抹成 0。
                origStartText: timeText(session.start),
                origEndText: session.end === null ? '' : timeText(session.end),
                startTime: timeText(session.start),
                endTime: session.end === null ? '' : timeText(session.end),
                open: session.end === null,
                crossDay,
                editable: !crossDay && startDay === key,
            };
        });

        if (!this.defaultsApplied) {
            this.defaultsApplied = true;
            this.setData({
                newStart: info.settings.start,
                newEnd: key === today ? timeText(now) : info.settings.end,
            });
        }

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
            hasDayEntry: !!day,
            canEditExpenses: !!day && !info.future,
            expenseRows: dayExpenses.map(expense => ({
                rowKey: expense.id,
                id: expense.id,
                name: expense.name,
                amount: String(expense.amount),
            })),
            expenseTotalText: formatCurrency(expenseTotal),
            monthItems: monthExpenses.map(expense => ({
                id: expense.id,
                name: expense.name,
                amountText: formatCurrency(expense.amount),
            })),
            sessionRows,
            canAddSession: !info.future && sessionRows.length === 0,
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

    handleExpenseName(event) {
        const index = Number(event.currentTarget.dataset.index);
        const patch = { error: '' };
        patch['expenseRows[' + index + '].name'] = event.detail.value;
        this.setData(patch);
    },

    handleExpenseAmount(event) {
        const index = Number(event.currentTarget.dataset.index);
        const patch = { error: '' };
        patch['expenseRows[' + index + '].amount'] = event.detail.value;
        this.setData(patch);
    },

    addExpenseRow() {
        const rows = this.data.expenseRows.concat([{
            rowKey: 'new-' + String(Date.now()) + '-' + String(this.data.expenseRows.length),
            id: '',
            name: '',
            amount: '',
        }]);
        this.setData({ expenseRows: rows, error: '' });
    },

    removeExpenseRow(event) {
        const index = Number(event.currentTarget.dataset.index);
        const rows = this.data.expenseRows.slice();
        rows.splice(index, 1);
        this.setData({ expenseRows: rows, error: '' });
    },

    handleSessionTime(event) {
        const index = Number(event.currentTarget.dataset.index);
        const field = event.currentTarget.dataset.field;
        const value = event.detail.value;
        const patch = { error: '' };
        patch['sessionRows[' + index + '].' + field + 'Time'] = value;
        if (field === 'end') {
            patch['sessionRows[' + index + '].open'] = value === '';
        }
        this.setData(patch);
    },

    handleNewStart(event) {
        this.setData({ newStart: event.detail.value, error: '' });
    },

    handleNewEnd(event) {
        this.setData({ newEnd: event.detail.value, error: '' });
    },

    stampOf(time) {
        if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
            return null;
        }
        return new Date(this.data.date + 'T' + time + ':00').getTime();
    },

    // 只提交真正改动过的时段；未改的段原样保留，避免无意义重算。
    buildRecords() {
        const records = [];
        const rows = this.data.sessionRows || [];
        for (let i = 0; i < rows.length; i += 1) {
            const row = rows[i];
            if (!row.editable) {
                continue;
            }
            const start = this.stampOf(row.startTime);
            if (start === null) {
                this.setData({ error: '第 ' + (i + 1) + ' 段的上班时间格式不对' });
                return null;
            }
            let end = null;
            if (row.endTime !== '') {
                end = this.stampOf(row.endTime);
                if (end === null) {
                    this.setData({ error: '第 ' + (i + 1) + ' 段的下班时间格式不对' });
                    return null;
                }
                if (end <= start) {
                    this.setData({ error: '第 ' + (i + 1) + ' 段的下班时间要晚于上班时间' });
                    return null;
                }
            } else if (!row.open) {
                this.setData({ error: '第 ' + (i + 1) + ' 段缺下班时间' });
                return null;
            }
            const sameStart = row.startTime === row.origStartText;
            const sameEnd = row.open ? row.endTime === '' : row.endTime === row.origEndText;
            if (sameStart && sameEnd) {
                continue;
            }
            records.push({ sessionIndex: row.index, start, end });
        }

        if (this.data.canAddSession && this.data.newStart !== '' && this.data.newEnd !== '') {
            const start = this.stampOf(this.data.newStart);
            const end = this.stampOf(this.data.newEnd);
            if (start === null || end === null) {
                this.setData({ error: '补记的时间格式不对' });
                return null;
            }
            if (end <= start) {
                this.setData({ error: '补记的下班时间要晚于上班时间' });
                return null;
            }
            records.push({ sessionIndex: 'new', start, end });
        }

        return records;
    },

    save() {
        const input = this.buildInput();
        if (!input) {
            return;
        }
        this.commit(input);
    },

    buildInput() {
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
                return null;
            }
            input.amount = Math.round(amount * 100) / 100;
        }

        if (this.data.needBackfillConfirm) {
            if (!this.data.backfillConfirmed) {
                this.setData({ error: '这天是空白的历史日期，请先勾选下方的补录确认' });
                return null;
            }
            input.confirmedBackfill = true;
        }

        if (this.data.showFixed) {
            input.fixedBurden = { enabled: this.data.fixedEnabled };
        }

        if (this.data.canEditExpenses) {
            const rows = this.data.expenseRows;
            const expenses = [];
            for (let i = 0; i < rows.length; i += 1) {
                const name = String(rows[i].name || '').trim();
                const amountText = String(rows[i].amount || '').trim();
                if (name === '' && amountText === '') {
                    continue;
                }
                if (name === '') {
                    this.setData({ error: '第 ' + (i + 1) + ' 笔花销还差个名称' });
                    return null;
                }
                const amount = Number(amountText);
                if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) {
                    this.setData({ error: '第 ' + (i + 1) + ' 笔花销金额需大于 0、至多 10 亿' });
                    return null;
                }
                const row = { name, amount: Math.round(amount * 100) / 100 };
                if (rows[i].id) {
                    row.id = rows[i].id;
                }
                expenses.push(row);
            }
            input.expenses = expenses;
        }

        const records = this.buildRecords();
        if (records === null) {
            return null;
        }
        if (records.length > 0) {
            input.records = records;
        }

        return input;
    },

    commit(input) {
        const now = Date.now();
        let result = apply(state => editCalendarDay(state, input, now));

        // 空白日期还没有当天记录，花销需要先建立记录再写入：自动补一步，用户只点一次保存。
        if (!result.ok && result.error.indexOf('请先补记当日考勤') !== -1 && input.confirmedBackfill === true) {
            const bootstrap = {
                date: input.date,
                kind: input.kind,
                payMode: input.payMode,
                includeOvertimePay: input.includeOvertimePay,
                confirmedBackfill: true,
            };
            const created = apply(state => editCalendarDay(state, bootstrap, now));
            if (!created.ok) {
                this.setData({ error: created.error });
                return;
            }
            result = apply(state => editCalendarDay(state, input, now));
        }

        if (!result.ok) {
            if (result.error.indexOf('本次实际下班后累计加班超过两小时') !== -1) {
                this.pendingPayload = input;
                this.setData({ showOvertimeSheet: true, overtimeAmount: '', overtimeError: '', error: '' });
                return;
            }
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

    handleOvertimeAmount(event) {
        this.setData({ overtimeAmount: event.detail.value, overtimeError: '' });
    },

    applyDecision(decision) {
        const payload = this.pendingPayload;
        if (!payload) {
            return;
        }
        const result = apply(state => editCalendarDay(state, { ...payload, closeDecision: decision }, Date.now()));
        if (!result.ok) {
            this.setData({ overtimeError: result.error });
            return;
        }
        this.pendingPayload = null;
        this.setData({ showOvertimeSheet: false });
        wx.showToast({ title: '已更新这一天', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 400);
    },

    handleOvertimeFree() {
        this.applyDecision({ kind: 'free', amount: 0 });
    },

    handleOvertimePaid() {
        const amount = Number(this.data.overtimeAmount);
        if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) {
            this.setData({ overtimeError: '请填写大于 0、至多 10 亿的加班费' });
            return;
        }
        this.applyDecision({ kind: 'paid', amount });
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
