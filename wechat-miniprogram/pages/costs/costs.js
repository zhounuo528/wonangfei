import { getState, apply } from '../../store/index.js';
import {
    addExpense,
    addFixed,
    stopFixed,
    saveExtraIncome,
    setExtraIncomeVoided,
    EXTRA_INCOME_CATEGORIES,
    dateKey,
    monthKey,
    recordingStart,
} from '../../core/model.js';
import { formatCurrency, formatAmount } from '../../core/money.js';
import { dateText, monthText, todayKey } from '../../utils/format.js';

const EXPENSE_CATEGORIES = ['早餐', '午餐', '晚餐', '通勤', '咖啡', '房租', '自定义'];
const FIXED_PERIODS = [
    { key: 'month', label: '每月' },
    { key: 'quarter', label: '每季度' },
    { key: 'year', label: '每年' },
    { key: 'day', label: '每日' },
];
const FIXED_REPEATS = [
    { key: 'workday', label: '每个工作日' },
    { key: 'daily', label: '每天（含休息日）' },
];

Page({
    data: {
        tab: 'expenses',
        tabs: [
            { key: 'expenses', label: '花销' },
            { key: 'fixed', label: '固定负担' },
            { key: 'income', label: '意外之财' },
        ],
        expenseList: [],
        fixedList: [],
        incomeList: [],
        todayText: '',

        showExpenseForm: false,
        expenseCategory: '午餐',
        expenseName: '',
        expenseAmount: '',
        expenseScope: 'day',
        expenseMonth: '',
        expenseError: '',

        showFixedForm: false,
        fixedName: '',
        fixedPeriod: 'month',
        fixedAmount: '',
        fixedRepeat: 'workday',
        fixedPeriods: FIXED_PERIODS,
        fixedRepeats: FIXED_REPEATS,
        fixedError: '',

        showIncomeForm: false,
        incomeCategory: '红包',
        incomeAmount: '',
        incomeDate: '',
        incomeNote: '',
        incomeCategories: EXTRA_INCOME_CATEGORIES,
        incomeError: '',

        expenseCategories: EXPENSE_CATEGORIES,
    },

    onShow() {
        this.render();
    },

    render() {
        const state = getState();
        const today = todayKey();

        const expenseList = state.expenses
            .slice()
            .sort((left, right) => String(right.date).localeCompare(String(left.date)) || right.amount - left.amount)
            .slice(0, 80)
            .map(expense => ({
                id: expense.id,
                name: expense.name,
                category: expense.category || '自定义',
                amountText: formatCurrency(expense.amount),
                dateLabel: expense.scope === 'month'
                    ? monthText(expense.month) + ' 整月分摊'
                    : dateText(expense.date),
                scope: expense.scope || 'day',
            }));

        const fixedList = state.fixed.map(item => ({
            id: item.id,
            name: item.name,
            amountText: formatCurrency(item.amount),
            periodLabel: item.period === 'day'
                ? '每日 · ' + (item.repeat === 'daily' ? '每天' : '工作日')
                : (FIXED_PERIODS.find(period => period.key === item.period) || { label: item.period }).label + ' · 按工作日分摊',
            fromLabel: '自 ' + dateText(item.from) + ' 起',
            active: !item.until,
        }));

        const incomeList = (state.extraIncomes || [])
            .slice()
            .sort((left, right) => String(right.date).localeCompare(String(left.date)))
            .slice(0, 80)
            .map(income => ({
                id: income.id,
                category: income.category,
                amountText: formatCurrency(income.amount),
                dateLabel: dateText(income.date),
                note: income.note || '',
                voided: income.voidedAt !== null && income.voidedAt !== undefined,
            }));

        this.setData({
            expenseList,
            fixedList,
            incomeList,
            todayText: dateText(today),
            todayKey: today,
            expenseMonth: this.data.expenseMonth || monthKey(today),
            incomeDate: this.data.incomeDate || today,
        });
    },

    handleTab(event) {
        this.setData({ tab: event.currentTarget.dataset.key });
    },

    openExpenseForm() {
        this.setData({
            showExpenseForm: true,
            expenseCategory: '午餐',
            expenseName: '午餐',
            expenseAmount: '',
            expenseScope: 'day',
            expenseError: '',
        });
    },

    closeExpenseForm() {
        this.setData({ showExpenseForm: false, expenseError: '' });
    },

    handleExpenseCategory(event) {
        const category = event.currentTarget.dataset.name;
        this.setData({
            expenseCategory: category,
            expenseName: category === '自定义' ? '' : category,
            expenseError: '',
        });
    },

    handleExpenseName(event) {
        this.setData({ expenseName: event.detail.value, expenseError: '' });
    },

    handleExpenseAmount(event) {
        this.setData({ expenseAmount: event.detail.value, expenseError: '' });
    },

    handleExpenseScope(event) {
        this.setData({ expenseScope: event.currentTarget.dataset.scope, expenseError: '' });
    },

    handleExpenseMonth(event) {
        this.setData({ expenseMonth: event.detail.value, expenseError: '' });
    },

    saveExpense() {
        const amount = Number(this.data.expenseAmount);
        const name = String(this.data.expenseName || '').trim();
        if (!Number.isFinite(amount) || amount <= 0) {
            this.setData({ expenseError: '请填写大于 0 的金额' });
            return;
        }
        if (name === '') {
            this.setData({ expenseError: '请填写花销名称' });
            return;
        }

        const scope = this.data.expenseScope;
        const state = getState();
        const today = todayKey();

        const result = apply(current => {
            const now = Date.now();
            if (scope === 'month') {
                addExpense(current, {
                    category: '自定义',
                    name,
                    amount: Math.round(amount * 100) / 100,
                    date: this.data.expenseMonth + '-01',
                    scope: 'month',
                    month: this.data.expenseMonth,
                }, now);
            } else {
                addExpense(current, {
                    category: this.data.expenseCategory,
                    name,
                    amount: Math.round(amount * 100) / 100,
                    date: today,
                    scope: 'day',
                }, now);
            }
            return true;
        });

        if (!result.ok) {
            this.setData({ expenseError: result.error });
            return;
        }
        this.setData({ showExpenseForm: false });
        wx.showToast({ title: '已记录', icon: 'none' });
        this.render();
    },

    openFixedForm() {
        this.setData({
            showFixedForm: true,
            fixedName: '',
            fixedPeriod: 'month',
            fixedAmount: '',
            fixedRepeat: 'workday',
            fixedError: '',
        });
    },

    closeFixedForm() {
        this.setData({ showFixedForm: false, fixedError: '' });
    },

    handleFixedName(event) {
        this.setData({ fixedName: event.detail.value, fixedError: '' });
    },

    handleFixedAmount(event) {
        this.setData({ fixedAmount: event.detail.value, fixedError: '' });
    },

    handleFixedPeriod(event) {
        this.setData({ fixedPeriod: event.currentTarget.dataset.key, fixedError: '' });
    },

    handleFixedRepeat(event) {
        this.setData({ fixedRepeat: event.currentTarget.dataset.key, fixedError: '' });
    },

    saveFixed() {
        const amount = Number(this.data.fixedAmount);
        const name = String(this.data.fixedName || '').trim();
        if (name === '') {
            this.setData({ fixedError: '请填写费用名称' });
            return;
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            this.setData({ fixedError: '请填写大于 0 的金额' });
            return;
        }

        const period = this.data.fixedPeriod;
        const payload = {
            name,
            amount: Math.round(amount * 100) / 100,
            period,
            allocation: 'workday',
        };
        if (period === 'day') {
            payload.repeat = this.data.fixedRepeat;
        }

        const result = apply(current => {
            addFixed(current, payload, todayKey(), Date.now());
            return true;
        });

        if (!result.ok) {
            this.setData({ fixedError: result.error });
            return;
        }
        this.setData({ showFixedForm: false });
        wx.showToast({ title: '已添加固定负担', icon: 'none' });
        this.render();
    },

    handleStopFixed(event) {
        const id = event.currentTarget.dataset.id;
        wx.showModal({
            title: '停止这项固定费用',
            content: '从今天起不再计入，之前的日期保留原样。',
            confirmText: '停止',
            confirmColor: '#d4380d',
            success: modal => {
                if (!modal.confirm) {
                    return;
                }
                const result = apply(current => {
                    stopFixed(current, id, todayKey(), Date.now());
                    return true;
                });
                if (!result.ok) {
                    wx.showToast({ title: result.error, icon: 'none' });
                    return;
                }
                this.render();
            },
        });
    },

    openIncomeForm() {
        this.setData({
            showIncomeForm: true,
            incomeCategory: '红包',
            incomeAmount: '',
            incomeDate: todayKey(),
            incomeNote: '',
            incomeError: '',
        });
    },

    closeIncomeForm() {
        this.setData({ showIncomeForm: false, incomeError: '' });
    },

    handleIncomeCategory(event) {
        this.setData({ incomeCategory: event.currentTarget.dataset.name, incomeError: '' });
    },

    handleIncomeAmount(event) {
        this.setData({ incomeAmount: event.detail.value, incomeError: '' });
    },

    handleIncomeDate(event) {
        this.setData({ incomeDate: event.detail.value, incomeError: '' });
    },

    handleIncomeNote(event) {
        this.setData({ incomeNote: event.detail.value, incomeError: '' });
    },

    saveIncome() {
        const amount = Number(this.data.incomeAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
            this.setData({ incomeError: '请填写大于 0 的金额' });
            return;
        }
        const result = apply(current => {
            saveExtraIncome(current, {
                category: this.data.incomeCategory,
                amount: Math.round(amount * 100) / 100,
                date: this.data.incomeDate,
                note: this.data.incomeNote,
            }, Date.now());
            return true;
        });
        if (!result.ok) {
            this.setData({ incomeError: result.error });
            return;
        }
        this.setData({ showIncomeForm: false });
        wx.showToast({ title: '已记录收入', icon: 'none' });
        this.render();
    },

    toggleIncome(event) {
        const id = event.currentTarget.dataset.id;
        const voided = event.currentTarget.dataset.voided === true || event.currentTarget.dataset.voided === 'true';
        const result = apply(current => {
            setExtraIncomeVoided(current, id, !voided, Date.now());
            return true;
        });
        if (!result.ok) {
            wx.showToast({ title: result.error, icon: 'none' });
            return;
        }
        this.render();
    },

    goSettings() {
        wx.navigateTo({ url: '/pages/settings/settings' });
    },
});
